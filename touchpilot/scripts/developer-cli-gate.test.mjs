import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDirectory, "..");
const libPath = path.join(
  workspaceRoot,
  "apps",
  "desktop",
  "src-tauri",
  "src",
  "lib.rs",
);

function sliceRustFunction(source, name) {
  const start = source.indexOf(`fn ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in lib.rs`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `${name} must be a closed function`);
  return source.slice(start, end);
}

const source = readFileSync(libPath, "utf8");
// Both helper binaries resolve through one shared function, so there is a
// single implementation to get right rather than two that can drift.
const resolver = sliceRustFunction(source, "resolve_operator_binary");

test("Toki never searches a directory for a binary to execute", () => {
  // macOS attributes permissions to the responsible process, so anything Toki
  // launches runs inside its camera, microphone, and screen-recording grants.
  // Several of the directories this used to search are writable without sudo,
  // which let any program running as the user get its code executed with
  // privileges it could never have obtained on its own.
  //
  // Searching is the vulnerability. Renaming the binary does not fix it, and
  // validating whatever a search turned up would only move the problem.
  for (const searched of [
    ".local/bin",
    ".npm-global/bin",
    "Library/pnpm",
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ]) {
    assert.ok(
      !resolver.includes(searched),
      `${searched} must not be searched for an executable`,
    );
  }
});

test("PATH is never consulted to locate an executable", () => {
  // `which` resolves through PATH, the least trustworthy source available.
  assert.doesNotMatch(resolver, /Command::new\("which"\)/u);
  assert.doesNotMatch(source, /\.arg\("codex"\)/u);
});

test("the path must be named explicitly by an operator", () => {
  // The only source of a path is an environment variable the operator sets.
  assert.match(resolver, /std::env::var\(env_name\)/u);
  assert.match(
    source,
    /const DEVELOPER_CLI_BIN_ENV: &str = "TOKI_DEVELOPER_CLI_BIN"/u,
  );
  assert.match(
    sliceRustFunction(source, "find_developer_cli_binary"),
    /resolve_operator_binary\(DEVELOPER_CLI_BIN_ENV/u,
  );

  // An environment variable, not a stored setting: a Finder-launched app
  // inherits no environment, so this is unreachable for an ordinary user by
  // construction, and there is no UI anyone could be talked into enabling.
  assert.doesNotMatch(source, /developer_cli.*keychain/iu);
});

test("a stored setting works without an environment variable", () => {
  // Requiring the environment alone broke local transcription: a Finder-
  // launched app inherits none, so a value that worked from a terminal was
  // absent for every ordinary launch, and voice failed at the last step after
  // the pinch and the recording had already succeeded. This is the same trap
  // the OPENAI_API_KEY lookup fell into, repeated one fix later.
  assert.match(resolver, /read_stored_setting\(env_name\)/u);

  const storedAt = resolver.indexOf("read_stored_setting");
  const envAt = resolver.indexOf("std::env::var(env_name)");
  assert.ok(
    storedAt !== -1 && envAt !== -1 && storedAt < envAt,
    "the stored setting must be consulted before the environment",
  );

  // The security property is unchanged: a path exists because someone entered
  // it, never because a directory was scanned.
  assert.doesNotMatch(resolver, /read_dir|glob|Command::new/u);
});

test("a relative path is refused", () => {
  // A relative path resolves against Toki's working directory, which
  // reintroduces the ambiguity the explicit path exists to remove.
  assert.match(resolver, /!candidate\.is_absolute\(\)/u);
  assert.match(resolver, /must be an absolute path/u);
});

test("the old unguarded resolver is gone", () => {
  assert.doesNotMatch(source, /fn find_codex_binary/u);
  assert.doesNotMatch(source, /TOKI_CODEX_BIN/u);
});

test("the Whisper binary is resolved the same way, not searched for", () => {
  // The same vulnerability existed twice. This one searched
  // ~/tools/whisper.cpp/build/bin and then PATH for three different names,
  // and was easy to miss because it sits far from the guidance code.
  const whisper = sliceRustFunction(source, "find_local_whisper_binary");

  assert.match(whisper, /resolve_operator_binary/u);
  assert.ok(!whisper.includes("tools"), "must not search ~/tools");
  assert.doesNotMatch(whisper, /Command::new\("which"\)/u);
  assert.doesNotMatch(whisper, /whisper-cpp/u);
});

test("no helper path is guessed from a writable directory", () => {
  // The model file is lower stakes than the binary — it is data handed to a
  // program the operator already chose. It is resolved the same way anyway:
  // half a feature configured explicitly and half guessed is the asymmetry
  // that invites the searching back in.
  const model = sliceRustFunction(source, "local_whisper_model_path");
  assert.match(model, /resolve_operator_binary\(WHISPER_MODEL_ENV/u);

  // No shipping code should join a path onto $HOME to find a helper.
  assert.ok(
    !source.includes('.join("tools")'),
    "no helper is located relative to the home directory",
  );
});

test("nothing anywhere resolves an executable through PATH", () => {
  // The sweep that found the second instance, kept as a standing check.
  // Command::new with a bare name (no slash) resolves through PATH; every
  // legitimate call site uses an absolute system path such as /usr/bin/swift.
  const bareNameInvocations = [
    ...source.matchAll(/Command::new\("([^"]*)"\)/gu),
  ]
    .map((match) => match[1])
    .filter((name) => !name.startsWith("/"));

  assert.deepEqual(
    bareNameInvocations,
    [],
    `these resolve through PATH: ${bareNameInvocations.join(", ")}`,
  );
});

// --- The shape of the command that is actually run --------------------------

test("the CLI is invoked in an order that does not swallow the prompt", () => {
  // `--allowedTools` and `--add-dir` each take a list, so they keep consuming
  // arguments until one begins with a dash. Leaving either last eats the
  // prompt as another value, and the CLI exits saying no prompt was given --
  // which reads as an empty prompt rather than as an ordering problem. Proven
  // against the real CLI before this test was written.
  const rust = readFileSync(
    path.join(workspaceRoot, "apps", "desktop", "src-tauri", "src", "lib.rs"),
    "utf8",
  );

  const listFlags = ['"--allowedTools"', '"--add-dir"'];
  const promptAt = rust.indexOf('.arg("--print").arg(prompt)');
  assert.ok(promptAt > 0, "the prompt is no longer the trailing argument");

  for (const flag of listFlags) {
    const flagAt = rust.indexOf(flag);
    assert.ok(flagAt > 0, `${flag} is not passed`);
    assert.ok(
      flagAt < promptAt,
      `${flag} takes a list and must not be the last flag before the prompt`,
    );
  }
});

test("standard input is closed rather than inherited", () => {
  // A CLI handed an open pipe waits to be given a prompt on it -- three
  // seconds, on every single guidance request, before giving up. Nothing is
  // ever sent that way; the prompt is an argument.
  const rust = readFileSync(
    path.join(workspaceRoot, "apps", "desktop", "src-tauri", "src", "lib.rs"),
    "utf8",
  );
  assert.match(rust, /\.stdin\(Stdio::null\(\)\)/);
});

test("the CLI is given reading and nothing else", () => {
  // It runs inside Toki's screen-recording and camera grants, because macOS
  // attaches permissions to the process that launched it. Anything beyond
  // opening the one screenshot would be lending those out.
  const rust = readFileSync(
    path.join(workspaceRoot, "apps", "desktop", "src-tauri", "src", "lib.rs"),
    "utf8",
  );
  assert.match(rust, /\.arg\("--allowedTools"\)\s*\n\s*\.arg\("Read"\)/);
  assert.match(rust, /\.arg\("--permission-mode"\)\s*\n\s*\.arg\("dontAsk"\)/);
});
