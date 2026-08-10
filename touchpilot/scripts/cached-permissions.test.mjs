import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  decideCachedPermissionAction as decide,
  describeCachedPermissionAction as describe,
  isProcessCachedPermission,
  livePermissionState,
  processCachedPermissions,
  restartNoticeMs,
} from "../apps/desktop/src/cachedPermissions.ts";

const seeScreen = {
  need: "I need to see your screen.",
  todo: "So I can find what you ask about and point at it.",
};

/*
 * The permission Toki cannot work without, and the one macOS makes hardest to
 * get. Three separate behaviours compound into a loop somebody cannot escape:
 * the answer is cached per process, the prompt only ever appears once, and
 * flipping the switch in Settings for a running app raises an alert telling
 * them to quit an application that has no window.
 */

test("the system prompt is offered before the Settings list, always", () => {
  // Sending somebody to the list is what causes the "Toki may not be able to
  // record until it is quit" alert -- that alert only appears when a switch is
  // flipped for an application already running. HeyClicky never showed it,
  // because it raised the prompt in place and you pressed Allow on that.
  assert.equal(
    decide({ live: "denied", promptSpent: false }),
    "prompt",
  );
});

test("once the prompt is spent, Settings is the only honest offer", () => {
  // macOS shows it once per install. After that CGRequestScreenCaptureAccess
  // returns false without displaying anything, so the Allow button does
  // literally nothing -- forever, with no hint that Settings exists.
  assert.equal(
    decide({ live: "denied", promptSpent: true }),
    "settings",
  );
});

test("a grant this process cannot see becomes a restart, not another ask", () => {
  // This is the loop. macOS answers the screen-recording question once per
  // process and never revises it, so a Toki refused at launch is handed the
  // same stale no forever. It concluded nothing had happened and asked again --
  // while the switch sat plainly on in the list, still counting one of five.
  assert.equal(
    decide({ live: "pending_restart", promptSpent: true }),
    "restart",
  );
  assert.equal(
    decide({ live: "pending_restart", promptSpent: false }),
    "restart",
    "how the grant arrived does not change what has to happen next",
  );
});

test("a permission already held asks for nothing", () => {
  assert.equal(
    decide({ live: "granted", promptSpent: true }),
    "continue",
  );
});

test("the restart is described as Toki's doing, not as a chore", () => {
  // The old wording asked somebody to quit and reopen the app themselves,
  // which is a strange thing to ask of something with no window and no Dock
  // icon -- and it lands immediately after they did what was asked, so it
  // reads as their action not having worked.
  const restart = describe("restart", seeScreen);

  assert.match(restart.need, /moment/iu);
  assert.doesNotMatch(`${restart.need} ${restart.todo}`, /quit|reopen|relaunch/iu);
  assert.equal(restart.button, "", "there is nothing to press");
});

test("the Settings wording says why the button changed", () => {
  // Without this the person has pressed Allow, watched nothing happen, and is
  // now being shown a different button for no stated reason.
  const settings = describe("settings", seeScreen);

  assert.match(settings.todo, /only asks once/iu);
  assert.equal(settings.button, "Open");
});

test("the notice is visible long enough to read and short enough not to worry", () => {
  // Restarting on the same frame the grant lands reads as a crash, and a crash
  // at the exact moment somebody granted screen recording is the worst
  // possible thing to look like.
  assert.ok(restartNoticeMs >= 500 && restartNoticeMs <= 2_000, `${restartNoticeMs}ms`);
});

// --- The parts that live in Rust ------------------------------------------

const lib = readFileSync(
  new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url),
  "utf8",
);

test("the probe answers before any window exists", () => {
  // It runs as a second copy of Toki. If it reached the Tauri builder it would
  // put an overlay, a tray icon and a settings panel on screen every time the
  // permission was checked.
  const run = lib.slice(lib.indexOf("pub fn run()"));
  const flagAt = run.indexOf("PERMISSION_PROBE_FLAG");
  const builderAt = run.indexOf("tauri::Builder::default()");

  assert.ok(flagAt > 0 && builderAt > 0);
  assert.ok(flagAt < builderAt, "the probe must return before Tauri starts");
});

test("the probe is Toki itself, so macOS answers about Toki", () => {
  // Permissions are attributed to the responsible process. A different binary
  // would be asking about itself, and would get a different answer.
  const probe = lib.slice(
    lib.indexOf("fn probe_permissions_in_child"),
    lib.indexOf("\n}", lib.indexOf("fn probe_permissions_in_child")),
  );

  assert.match(probe, /current_exe\(\)/u);
  assert.match(probe, /PERMISSION_PROBE_FLAG/u);
});

test("a probe that cannot run is reported as denied, not as needing a restart", () => {
  // Claiming a restart would fix it, when nothing was actually checked, sends
  // somebody through a restart that changes nothing and then asks again.
  assert.equal(livePermissionState("not_determined", undefined), "denied");
  assert.equal(livePermissionState("not_determined", "granted"), "pending_restart");
  assert.equal(livePermissionState("granted", undefined), "granted");
});

test("every permission macOS caches per process is covered, not just one", () => {
  // Screen recording was fixed alone, which was too narrow: the very next step
  // in the flow -- input monitoring -- goes through the same CGPreflight family
  // and was left with an identically dead button. Eight seconds of a greyed-out
  // Allow, polling an answer that could never change.
  assert.deepEqual([...processCachedPermissions].sort(), [
    "accessibility",
    "input_monitoring",
    "screen_recording",
  ]);

  // Not the camera or the microphone. Those report honestly on every read, and
  // starting a process to ask them would be work for nothing.
  assert.equal(isProcessCachedPermission("camera"), false);
  assert.equal(isProcessCachedPermission("microphone"), false);
});

test("the wording stays in the voice of the permission being asked for", () => {
  // A generalised flow that says "I need to see your screen" while asking about
  // the keyboard is worse than a specific one.
  const keyboard = { need: "I need to notice the shortcut.", todo: "So holding the key works from any app." };

  assert.equal(describe("settings", keyboard).need, keyboard.need);
  assert.equal(describe("prompt", keyboard).todo, keyboard.todo);
});
