import assert from "node:assert/strict";
import test from "node:test";

import {
  countGranted,
  findStep,
  getStepState,
  forgetHandledPermissions,
  hasRequiredPermissions,
  isFullyGranted,
  nextPendingStep,
  permissionSteps,
  readHandledPermissions,
  shouldRunOnboarding,
  writeHandledPermissions,
} from "../apps/desktop/src/permissionOnboarding.ts";

function snapshot(overrides = {}) {
  return {
    microphone: "not_determined",
    screen_recording: "not_determined",
    camera: "not_determined",
    accessibility: "not_determined",
    input_monitoring: "not_determined",
    ...overrides,
  };
}

const allGranted = snapshot({
  microphone: "granted",
  screen_recording: "granted",
  camera: "granted",
  accessibility: "granted",
  input_monitoring: "granted",
});

test("a refused permission is not offered as askable", () => {
  // macOS prompts once. Offering "Allow" again does nothing at all, which reads
  // as the button being broken -- the only way through is System Settings.
  assert.equal(getStepState("denied"), "needs_settings");
  assert.equal(getStepState("not_determined"), "askable");
  assert.equal(getStepState("granted"), "granted");
});

test("voice and screen are the only two Toki cannot work without", () => {
  // Demanding all five before somebody has seen the app do anything turns a
  // first run into a form. These two are the entire product: say something,
  // have Toki look and point.
  const required = permissionSteps.filter((step) => step.required).map((s) => s.kind);

  assert.deepEqual(required, ["microphone", "screen_recording"]);
});

test("the required two are asked first", () => {
  const order = permissionSteps.map((step) => step.kind);

  assert.deepEqual(order.slice(0, 2), ["microphone", "screen_recording"]);
  assert.ok(
    order.indexOf("camera") > order.indexOf("screen_recording"),
    "gestures are the part that has to be taught; teach them once the rest works",
  );
});

test("every permission macOS caches per process needs a relaunch", () => {
  // These report refused until the app restarts, however plainly the Settings
  // list shows them as allowed -- so the panel keeps asking, and Allow does
  // nothing. Screen recording was marked alone, which left input monitoring
  // with exactly the same dead button one step later.
  const relaunching = permissionSteps
    .filter((step) => step.requiresRelaunch)
    .map((step) => step.kind)
    .sort();

  assert.deepEqual(relaunching, [
    "accessibility",
    "input_monitoring",
    "screen_recording",
  ]);

  // The camera and microphone report honestly on every read.
  assert.equal(findStep("camera").requiresRelaunch, false);
  assert.equal(findStep("microphone").requiresRelaunch, false);
});

test("onboarding runs until every permission has been answered", () => {
  assert.equal(shouldRunOnboarding(snapshot()), true);
  assert.equal(shouldRunOnboarding(allGranted), false);
});

test("the flow does not stop at the two Toki cannot work without", () => {
  // This is the bug. It stopped the moment the microphone and the screen were
  // granted, so the camera, accessibility and input monitoring were never
  // asked for at all -- including the one the talk shortcut needs, which meant
  // holding the key would simply do nothing.
  //
  // Invisible while a first run started from nothing, because the steps got
  // walked in order anyway. It appeared the moment the flow was interrupted:
  // screen recording ends in a restart, the panel came back, saw its two
  // required permissions held, and concluded there was nothing left to do.
  const afterRestart = snapshot({
    microphone: "granted",
    screen_recording: "granted",
  });

  assert.equal(shouldRunOnboarding(afterRestart), true);
  assert.equal(nextPendingStep(afterRestart)?.kind, "camera");
});

test("a declined permission does not reopen the flow every launch", () => {
  // Declining is an answer. Re-presenting it until somebody gives in is
  // nagging, not onboarding -- so the flow ends when every step has been
  // answered, whether that answer was yes or no.
  const declined = snapshot({
    microphone: "granted",
    screen_recording: "granted",
    camera: "denied",
  });

  assert.equal(
    shouldRunOnboarding(declined, ["camera", "accessibility", "input_monitoring"]),
    false,
  );
  assert.equal(hasRequiredPermissions(declined), true);
  assert.equal(isFullyGranted(declined), false);
});

test("what was answered is remembered across a restart", () => {
  // The flow does not survive its own process. Screen recording ends in a
  // restart -- sometimes Toki's own, sometimes macOS asking somebody to quit
  // and reopen -- and the panel used to come back knowing nothing about how far
  // it had got.
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };

  writeHandledPermissions(["camera"], storage);
  assert.deepEqual(readHandledPermissions(storage), ["camera"]);

  forgetHandledPermissions(storage);
  assert.deepEqual(readHandledPermissions(storage), []);
});

test("a corrupt or foreign stored value is ignored, not trusted", () => {
  const bad = (value) => ({ getItem: () => value });

  assert.deepEqual(readHandledPermissions(bad("not json")), []);
  assert.deepEqual(readHandledPermissions(bad('{"camera":true}')), []);
  assert.deepEqual(
    readHandledPermissions(bad('["camera","something-else"]')),
    ["camera"],
    "only permissions this build knows about survive",
  );
});

test("the flow walks steps in order and stops when there is nothing left", () => {
  assert.equal(nextPendingStep(snapshot())?.kind, "microphone");
  assert.equal(
    nextPendingStep(snapshot({ microphone: "granted" }))?.kind,
    "screen_recording",
  );
  assert.equal(nextPendingStep(allGranted), null);
});

test("a step already dealt with is not shown again in the same run", () => {
  // Somebody who just refused the camera should move on, not be asked twice by
  // a flow that reads the same "not granted" and offers it again.
  const after = nextPendingStep(snapshot({ microphone: "granted", screen_recording: "granted" }), [
    "camera",
  ]);

  assert.equal(after?.kind, "accessibility");
});

test("progress counts what is actually granted", () => {
  assert.equal(countGranted(snapshot()), 0);
  assert.equal(countGranted(allGranted), permissionSteps.length);
  assert.equal(countGranted(snapshot({ microphone: "granted" })), 1);
});

test("every step says what it is for, in a sentence", () => {
  // A permission dialog that only names the permission is asking somebody to
  // decide with no information. The title is the benefit; the detail is the
  // limit on it.
  for (const step of permissionSteps) {
    assert.ok(step.title.length > 0 && step.title.length < 40, step.kind);
    assert.ok(step.detail.length > 20, `${step.kind} detail is too thin`);
    assert.match(step.settingsUrl, /^x-apple\.systempreferences:/u, step.kind);
  }
});

test("the microphone promise is specific about when it listens", () => {
  // The single most reasonable thing to be suspicious of in an always-running
  // assistant. Saying "only while you hold the shortcut" is the answer, and it
  // has to be true.
  assert.match(findStep("microphone").detail, /hold/i);
});

import { readFileSync } from "node:fs";

const notch = readFileSync(
  new URL("../apps/desktop/src/TokiPermissionNotch.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);

test("the ask happens in the notch, not in a window of its own", () => {
  // An application with no Dock icon should not grow a window for the one job
  // it should be least intrusive doing -- and macOS is already putting its own
  // dialog or Settings pane on screen at that moment, which is what somebody
  // should be reading.
  assert.match(app, /<TokiPermissionNotch onFinished=/u);
  assert.doesNotMatch(
    readFileSync(
      new URL("../apps/desktop/src/TokiSettingsWindow.tsx", import.meta.url),
      "utf8",
    ),
    /TokiPermissionOnboarding/u,
    "the preferences window no longer hosts it",
  );
});

test("Toki asks in its own voice", () => {
  // "I need to hear you", not "Microphone access required". The second is what
  // an installer says.
  assert.match(notch, /I need to hear you\./u);
  assert.match(notch, /I need to see your screen\./u);
});

test("the panel reopens for whatever is still unanswered", () => {
  // Both gates consult what has already been answered. Without that the panel
  // either drops the steps it had not reached, or reopens forever for ones
  // somebody declined.
  assert.match(app, /shouldRunOnboarding\(snapshot, readHandledPermissions\(\)\)/u);
  assert.match(app, /requestTopUtilityMode\("expanded", \{ focus: true \}\)/u);
});

test("a grant is confirmed with the system, not assumed from the prompt", () => {
  // Every permission failure this app has had looked, from the inside, like the
  // prompt having worked.
  assert.match(notch, /for \(let attempt = 0; attempt < 20/u);
  assert.match(notch, /next\[kind\] === "granted"/u);
});

test("a refused permission offers Settings, not another dead Allow", () => {
  assert.match(notch, /needs_settings" \? "Open" : "Allow"/u);
});

test("the flow ends however the last permission was answered", () => {
  // It used to be checked inside the "Next" handler and nowhere else, so
  // answering the last one with "Skip" ended the flow without telling anybody.
  // The component rendered nothing, the panel went on rendering its black box
  // around it, and what was left was an empty panel with the physical notch
  // covering the middle -- two slivers of black at the top of the display and
  // no way to make them go away.
  const notchSource = readFileSync(
    new URL("../apps/desktop/src/TokiPermissionNotch.tsx", import.meta.url),
    "utf8",
  );

  // Decided from the state, not from any one button. There are three ways to
  // finish a step and there will be more; none should have to remember.
  assert.match(notchSource, /if \(!loaded \|\| step != null \|\| finished\.current\)/u);
  assert.match(notchSource, /finished\.current = true;\s*\n\s*onFinished\(\);/u);

  const skip = notchSource.slice(notchSource.indexOf("toki-permission-notch__skip"));
  assert.doesNotMatch(
    skip.slice(0, 400),
    /onFinished\(\)/u,
    "no button decides this for itself",
  );
});

test("skipping is still recorded, so it is not asked again", () => {
  const notchSource = readFileSync(
    new URL("../apps/desktop/src/TokiPermissionNotch.tsx", import.meta.url),
    "utf8",
  );
  const skip = notchSource.slice(notchSource.indexOf("toki-permission-notch__skip"));

  assert.match(skip.slice(0, 400), /writeHandledPermissions\(next\)/u);
});
