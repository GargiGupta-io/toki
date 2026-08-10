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
    /const WHISPER_BIN_ENV: &str = "WHISPER_CPP_BIN"/u,
  );
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

// --- The CLI is gone, and stays gone ---------------------------------------

test("guidance never spawns a command-line tool", () => {
  // Vision used to start a coding agent per question: it read the screenshot
  // off disk, cost six or seven seconds, had to be installed before Toki could
  // see anything, and ran inside Toki's screen-recording grant because macOS
  // attributes permissions to the process that launched it. Something other
  // than Toki was holding Toki's most sensitive permission.
  //
  // Gemini replaced it: one HTTPS request, a schema the API enforces, and no
  // second process. These assertions exist so it cannot come back by accident.
  for (const gone of [
    "find_developer_cli_binary",
    "TOKI_DEVELOPER_CLI_BIN",
    "run_command_with_timeout",
    "--allowedTools",
    "--permission-mode",
    "--strict-mcp-config",
  ]) {
    assert.ok(!source.includes(gone), `${gone} belongs to the removed CLI path`);
  }

  // Nothing is spawned to answer a question about the screen. What remains is
  // the Swift helpers that read it, each at an absolute system path, and one
  // copy of Toki itself started to ask macOS a permission question a running
  // process is not allowed to ask twice.
  const spawned = [...source.matchAll(/Command::new\(([^)]*)\)/gu)].map((m) =>
    m[1].trim(),
  );

  assert.deepEqual(
    [...new Set(spawned)].sort(),
    ['"/usr/bin/swift"', "&whisper_bin", "executable"].sort(),
    "something new is being executed; say why here before allowing it",
  );

  // The one that is Toki: started only to ask, and it exits before any window
  // is created.
  const probe = source.slice(
    source.indexOf("fn probe_permissions_in_child"),
    source.indexOf("\n}", source.indexOf("fn probe_permissions_in_child")),
  );
  assert.match(probe, /current_exe\(\)/u);
  assert.match(probe, /PERMISSION_PROBE_FLAG/u);
});

test("the vision request goes out over HTTPS, with the key in a header", () => {
  const runner = sliceRustFunction(source, "run_gemini_vision_request");

  assert.match(runner, /x-goog-api-key/u);
  // A key in a query string ends up in server logs, in proxies, and in
  // anything that records where a request went.
  assert.doesNotMatch(runner, /\?key=/u);
  assert.match(runner, /generativelanguage\.googleapis\.com|GEMINI_ENDPOINT/u);
});

test("the key is read from the Keychain, not from the environment alone", () => {
  // The trap this codebase has fallen into twice: an app launched from Finder
  // inherits no shell environment, so a variable that works from a terminal is
  // absent for every ordinary user.
  const resolver = sliceRustFunction(source, "resolve_gemini_api_key");

  assert.match(resolver, /read_stored_gemini_api_key\(\)/u);
  assert.ok(
    resolver.indexOf("read_stored_gemini_api_key") <
      resolver.indexOf("std::env::var"),
    "the Keychain must be consulted before the environment",
  );

  // The whole reason for choosing this provider is that a key costs nothing,
  // so the error says where to get one rather than just reporting its absence.
  assert.match(resolver, /aistudio\.google\.com/u);
});

// Choosing a transcription backend from the environment repeated the root
// cause this codebase had already fixed for the API key: a GUI application
// launched from Finder inherits no shell environment, so the variable is
// absent for every ordinary user. It defaulted to local Whisper, which meant
// the OpenAI branch was unreachable no matter what was saved in settings --
// while the Speech tab offered a key field and described the two as
// alternatives.
const transcriptionSelection = sliceRustFunction(
  source,
  "transcribe_voice_capture",
);

test("an ordinary launch picks a transcription backend from what is configured", () => {
  // The variable may remain as a developer override, but it must not be what
  // an unset environment falls back on.
  assert.match(
    transcriptionSelection,
    /configured_transcription_provider\(\)/u,
    "provider selection must consult stored settings",
  );
  assert.doesNotMatch(
    transcriptionSelection,
    /TOKI_TRANSCRIPTION_PROVIDER[\s\S]*?unwrap_or_else\(\|_\|\s*"local-whisper"/u,
    "an absent environment variable must not silently pin one backend",
  );
});

test("a saved OpenAI key is reachable without a terminal", () => {
  const resolver = sliceRustFunction(source, "configured_transcription_provider");

  // Local first: it runs on this Mac and sends no audio anywhere, which is the
  // whole argument the product rests on.
  assert.ok(
    resolver.indexOf("local-whisper") < resolver.indexOf("openai"),
    "local Whisper must be preferred when both are configured",
  );
  assert.match(resolver, /read_stored_openai_api_key\(\)/u);
});

test("nothing configured is reported as its own condition", () => {
  // Naming only Whisper here sends someone to build a C++ project when saving
  // a key would also have worked.
  assert.match(transcriptionSelection, /Voice has no way to transcribe yet/u);
  assert.match(transcriptionSelection, /OpenAI API key/u);
});
