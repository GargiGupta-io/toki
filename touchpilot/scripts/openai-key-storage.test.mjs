import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  describeOpenAiKeyStatus,
  unknownOpenAiKeyStatus,
} from "../apps/desktop/src/openAiKey.ts";

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
const appPath = path.join(workspaceRoot, "apps", "desktop", "src", "App.tsx");

function sliceRustFunction(source, name) {
  const start = source.indexOf(`fn ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in lib.rs`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `${name} must be a closed function`);
  return source.slice(start, end);
}

test("no key stored says so plainly", () => {
  const message = describeOpenAiKeyStatus(unknownOpenAiKeyStatus);
  assert.match(message, /No key saved/u);
  assert.doesNotMatch(message, /OPENAI_API_KEY/u);
});

test("an environment key is reported as the trap it is", () => {
  // It works right now for whoever launched from a terminal and silently stops
  // working the moment the app is opened normally. Reporting it as simply
  // "available" would hide exactly the failure this phase exists to fix.
  const message = describeOpenAiKeyStatus({
    stored: false,
    available: true,
    source: "environment",
    hint: "…AB12",
  });
  assert.match(message, /launched from a terminal/u);
  assert.match(message, /save a key here/u);
});

test("a stored key reports ready and shows only the masked hint", () => {
  const message = describeOpenAiKeyStatus({
    stored: true,
    available: true,
    source: "keychain",
    hint: "…AB12",
  });
  assert.match(message, /Keychain/u);
  assert.match(message, /…AB12/u);
});

test("the status type cannot carry the key itself", () => {
  const source = readFileSync(
    path.join(workspaceRoot, "apps", "desktop", "src", "openAiKey.ts"),
    "utf8",
  );
  const type = source.slice(
    source.indexOf("export type OpenAiKeyStatus"),
    source.indexOf("};", source.indexOf("export type OpenAiKeyStatus")),
  );

  // Only a masked hint may cross the bridge. A full key returned here could
  // reach a log, an error string, or a diagnostics snapshot.
  assert.match(type, /hint: string \| null/u);
  assert.doesNotMatch(type, /\bkey: string/u);
});

test("Rust never returns the key to the front end", () => {
  const source = readFileSync(libPath, "utf8");
  const status = source.slice(
    source.indexOf("struct OpenAiKeyStatus"),
    source.indexOf("}", source.indexOf("struct OpenAiKeyStatus")),
  );

  assert.match(status, /hint: Option<String>/u);
  assert.doesNotMatch(
    status,
    /\bkey: String/u,
    "the status struct must not contain the key",
  );
});

test("the Keychain is preferred over the environment", () => {
  const resolve = sliceRustFunction(
    readFileSync(libPath, "utf8"),
    "resolve_openai_api_key",
  );

  // A double-clicked app inherits no shell environment, so the Keychain is the
  // only source an ordinary user can supply. The environment stays as a
  // fallback for terminal-launched development and the QA probes.
  const keychainAt = resolve.indexOf("read_stored_openai_api_key");
  const environmentAt = resolve.indexOf('env::var("OPENAI_API_KEY")');
  assert.ok(keychainAt !== -1 && environmentAt !== -1);
  assert.ok(
    keychainAt < environmentAt,
    "the Keychain must be consulted before the environment",
  );
});

test("key commands are registered and reachable from preferences", () => {
  const source = readFileSync(libPath, "utf8");
  for (const command of [
    "openai_api_key_status",
    "set_openai_api_key",
    "clear_openai_api_key",
  ]) {
    assert.match(source, new RegExp(`fn ${command}`, "u"));
    assert.match(source, new RegExp(`${command},`, "u"), `${command} registered`);
  }

  // The settings HUD is a compact status bar; a key field needs a real window,
  // reachable without the debug build.
  assert.match(source, /"open_preferences"/u);
  assert.match(source, /get_webview_window\("preferences"\)/u);
});

test("the pasted key is not left sitting in the DOM", () => {
  const app = readFileSync(appPath, "utf8");
  const saveKey = app.slice(
    app.indexOf("async function saveKey()"),
    app.indexOf("async function removeKey()"),
  );

  assert.match(saveKey, /setKeyDraft\(""\)/u);
  assert.match(app, /type="password"/u, "the field must be masked");
});
