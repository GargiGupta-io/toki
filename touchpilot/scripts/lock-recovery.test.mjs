import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * What has to be true after Toki gives up on a locked point.
 *
 * Three separate faults met here and produced one dead application. A spoken
 * command asked for a developer CLI no user has, the refusal told the user to
 * lock the control again, and the lock it was refusing was still held -- and an
 * ordinary pinch is only eligible while no lock is held. So the instruction on
 * screen was the one thing that could not be carried out, and nothing short of
 * restarting Toki recovered it.
 */

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopSource = path.join(scriptsDirectory, "..", "apps", "desktop", "src");

const appSource = readFileSync(path.join(desktopSource, "App.tsx"), "utf8");
const libSource = readFileSync(
  path.join(scriptsDirectory, "..", "apps", "desktop", "src-tauri", "src", "lib.rs"),
  "utf8",
);

test("a refused explanation releases the lock it is refusing", () => {
  const refuse = appSource.slice(
    appSource.indexOf("const refuse = ("),
    appSource.indexOf("try {", appSource.indexOf("const refuse = (")),
  );
  assert.notEqual(refuse.length, 0, "the refusal helper must exist");

  assert.match(
    refuse,
    /releasePointerLock\("explanation_refused"\)/u,
    "refusing must release the lock, or the advice to lock again is impossible",
  );
  // The card is the only account of what went wrong and must outlive the lock.
  assert.doesNotMatch(refuse, /setPointerExplanation\(null\)/u);
});

test("eligibility for a fresh pinch really does depend on the lock being gone", () => {
  // Without this the test above is arbitrary. The release matters precisely
  // because this gate exists.
  assert.match(
    appSource,
    /ordinaryVoiceCanStart:\s*\n?\s*gesturePointerLock == null/u,
    "an ordinary pinch must require no held lock",
  );
});

test("live guidance goes through the service, not a developer CLI", () => {
  // codex-subscription routes straight to a binary on the machine, skipping
  // both the free local pass and the hosted service. It stayed on the live
  // paths after the service shipped, so every spoken command asked for a tool
  // no user has installed.
  const voiceCall = appSource.slice(
    appSource.indexOf('source: "voice"') - 800,
    appSource.indexOf('source: "voice"'),
  );
  assert.match(voiceCall, /refreshCaptureMetadata\(command\.text, "real"/u);

  // The deliberate Codex tester in the debug window is allowed to keep it, as
  // is the check for which modes count as live. Comments are stripped first:
  // the explanation of this very change names the mode it removed.
  const code = appSource
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  const remaining = code.split('"codex-subscription"').length - 1;
  assert.equal(
    remaining,
    2,
    "only the debug tester and the live-mode check may name codex-subscription",
  );
});

test("a missing helper path is not blamed on a field that does not exist", () => {
  // The shared resolver named the Speech tab, which is right for the Whisper
  // paths and wrong for the developer CLI -- that one has no field anywhere.
  const resolver = libSource.slice(
    libSource.indexOf("fn resolve_operator_binary"),
    libSource.indexOf("\n}", libSource.indexOf("fn resolve_operator_binary")),
  );
  assert.doesNotMatch(resolver, /choose Speech/u);

  // The callers that do have a route still name it.
  assert.match(libSource, /fn find_local_whisper_binary[\s\S]{0,400}choose Speech/u);
});

test("closing a secondary window hides it instead of destroying it", () => {
  // Both are reopened by label, so a destroyed window makes the gear a dead
  // button for the rest of the session. Toki has no Dock icon to reopen from.
  assert.match(libSource, /CloseRequested \{ api, \.\. \}/u);
  assert.match(libSource, /"preferences" \| "debug"/u);
  assert.match(libSource, /api\.prevent_close\(\)/u);
});

const runtimeSource = readFileSync(
  path.join(desktopSource, "gestureRuntime.ts"),
  "utf8",
);

// Two halves hold a lock. App.tsx holds the snapshot the interface reasons
// about; the wrist-roll controller inside the gesture runtime holds the state
// that decides whether a *new* lock may be offered. Clearing only the first
// leaves the second convinced it is still locked, and it then refuses to emit
// another lock request -- the pointer keeps moving while every gesture is
// ignored, with no way back but restarting Toki.
test("giving up a lock tells the gesture runtime too", () => {
  const helper = appSource.slice(
    appSource.indexOf("function releasePointerLock("),
    appSource.indexOf("\n  }", appSource.indexOf("function releasePointerLock(")),
  );
  assert.notEqual(helper.length, 0, "the release helper must exist");
  assert.match(helper, /setGesturePointerLock\(null\)/u);
  assert.match(helper, /setLockReleaseToken/u);

  // Every abandonment goes through the helper. A direct clear is the bug.
  const directClears = appSource.split("setGesturePointerLock(null)").length - 1;
  assert.equal(
    directClears,
    2,
    "only the helper and the runtime's own unlock request may clear directly",
  );

  assert.match(runtimeSource, /lockReleaseToken/u);
  assert.match(
    runtimeSource,
    /useEffect\(\(\) => \{[\s\S]{0,400}?resetWristRollLockController\([\s\S]{0,200}?\}, \[lockReleaseToken\]\)/u,
    "the runtime must reset its controller when the token changes",
  );
});

test("a 401 keeps the reason the service gave", () => {
  const hosted = readFileSync(
    path.join(desktopSource, "hostedVisionProvider.ts"),
    "utf8",
  );
  // The service separates missing, unreadable, wrong-signature, expired and
  // unsupported-algorithm. Only one of those is cured by signing in again, so
  // collapsing them all into "your sign-in has expired" sends a signed-in user
  // to repeat the one action that cannot help.
  const branch = hosted.slice(
    hosted.indexOf("if (status === 401)"),
    hosted.indexOf("if (status === 402"),
  );
  assert.match(branch, /body\.error/u);
  assert.doesNotMatch(branch, /Your sign-in has expired\."/u);
});

/**
 * How many Keychain dialogs a launch costs.
 *
 * macOS asks the person for permission **per item, per application**, and a
 * rebuilt binary is a different application -- so the number of items is the
 * number of dialogs, and "Always Allow" on one says nothing about the next.
 *
 * The prompt-free route was measured and rejected: the data protection keychain
 * raises no dialogs, but its access-group entitlement needs a team identifier,
 * and signed with a self-made certificate the process is killed on launch.
 * Until there is a Developer ID, fewer items is the only lever.
 */
test("everything Toki stores lives in one Keychain item", () => {
  // Each extra account is another dialog on every rebuild.
  const accounts = libSource.match(/passwords::(get|set|delete)_generic_password\(\s*\n\s*OPENAI_KEYCHAIN_SERVICE,\s*\n\s*(\w+)/gu) ?? [];
  for (const use of accounts) {
    assert.ok(
      /VAULT_ACCOUNT|\baccount\b/u.test(use),
      `only the vault, and the one-time migration, may address the Keychain: ${use.replace(/\s+/gu, " ")}`,
    );
  }

  // The migration reads the old accounts once so nothing has to be typed again,
  // and only deletes them after the replacement exists.
  const load = libSource.slice(
    libSource.indexOf("fn load_vault"),
    libSource.indexOf("fn save_vault"),
  );
  assert.match(load, /MIGRATED_ACCOUNTS/u);
  assert.ok(
    load.indexOf("save_vault(&migrated)") < load.indexOf("delete_generic_password"),
    "deleting before the new item exists would lose everything",
  );
});

test("readers and writers all go through the vault", () => {
  for (const reader of [
    "fn read_stored_setting",
    "fn read_stored_openai_api_key",
    "fn read_auth_session",
  ]) {
    const body = libSource.slice(
      libSource.indexOf(reader),
      libSource.indexOf("\n}", libSource.indexOf(reader)),
    );
    assert.match(body, /cached_keychain_read\(/u, `${reader} must use the vault`);
  }

  for (const writer of [
    "fn set_operator_setting",
    "fn set_openai_api_key",
    "fn clear_openai_api_key",
    "fn store_auth_session",
    "fn clear_auth_session",
  ]) {
    const body = libSource.slice(
      libSource.indexOf(writer),
      libSource.indexOf("\n}", libSource.indexOf(writer)),
    );
    assert.match(body, /cached_keychain_write\(/u, `${writer} must use the vault`);
  }
});
