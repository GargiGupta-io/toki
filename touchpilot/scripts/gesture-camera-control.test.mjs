import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  advanceCameraShutdownGesture,
  cameraShutdownGesturePolicy,
  classifyCameraGestureVoiceCommand,
  classifyClosedFist,
  createInitialCameraShutdownGestureState,
  getCameraShutdownSecondsLeft,
  reconcileCameraGestureRuntimeState,
  setCameraGestureRuntimeEnabled,
} from "../apps/desktop/src/gestureCameraControl.ts";
import { createSyntheticTrackedHand } from "../apps/desktop/src/gestureFixtures.ts";
import {
  getPassiveTopUtilityMode,
  isTransientVoiceTopStatus,
  settleTransientVoiceTopStatus,
  TOP_UTILITY_RESULT_NOTICE_MS,
} from "../apps/desktop/src/topUtility.ts";

const appSource = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);
const topUtilitySource = readFileSync(
  new URL("../apps/desktop/src/TokiTopUtilitySurface.tsx", import.meta.url),
  "utf8",
);
const topUtilityStyles = readFileSync(
  new URL("../apps/desktop/src/TokiTopUtilitySurface.css", import.meta.url),
  "utf8",
);
const nativeSource = readFileSync(
  new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url),
  "utf8",
);
const macosOverlaySource = readFileSync(
  new URL("../apps/desktop/src-tauri/src/macos_overlay.rs", import.meta.url),
  "utf8",
);
const debugStart = appSource.indexOf("function DebugWindowApp()");
const debugEnd = appSource.indexOf("function App()", debugStart);
const debugSource = appSource.slice(debugStart, debugEnd);

function createRuntimeState() {
  return {
    enabled: false,
    camera: {
      enabled: false,
      permission: "unknown",
      status: "disabled",
      devices: [],
    },
    thresholds: {
      minDetectionConfidence: 0.6,
      pinchHoldMs: 180,
      openPalmHoldMs: 220,
      cooldownMs: 700,
      maxHands: 2,
    },
    currentGesture: {
      label: "open_palm",
      phase: "recognized",
      confidence: 0.95,
      holdMs: 400,
      cooldownRemainingMs: 0,
    },
  };
}

test("camera and gestures transition atomically", () => {
  const enabled = setCameraGestureRuntimeEnabled(createRuntimeState(), true);
  assert.equal(enabled.camera.enabled, true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.camera.status, "idle");

  const disabled = setCameraGestureRuntimeEnabled(
    {
      ...enabled,
      camera: { ...enabled.camera, status: "active", permission: "granted" },
    },
    false,
  );
  assert.equal(disabled.camera.enabled, false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.camera.status, "disabled");
  assert.equal(disabled.camera.permission, "unknown");
  assert.equal(disabled.currentGesture.phase, "inactive");
});

test("camera startup reconciliation cannot disable gestures by itself", () => {
  const requested = setCameraGestureRuntimeEnabled(createRuntimeState(), true);
  const transientDisabled = reconcileCameraGestureRuntimeState(requested, {
    ...requested.camera,
    enabled: true,
    status: "disabled",
  });

  assert.equal(transientDisabled.camera.enabled, true);
  assert.equal(transientDisabled.enabled, true);
  assert.equal(transientDisabled.currentGesture.phase, "inactive");

  const active = reconcileCameraGestureRuntimeState(transientDisabled, {
    ...transientDisabled.camera,
    enabled: true,
    permission: "granted",
    status: "active",
  });

  assert.equal(active.camera.enabled, true);
  assert.equal(active.enabled, true);
});

test("explicit voice-on commands are recognized locally", () => {
  const commands = [
    "Turn the camera on.",
    "Please enable camera and gestures",
    "Start hand tracking",
    "Activate gesture controls",
    "Camera on",
  ];

  for (const command of commands) {
    assert.equal(
      classifyCameraGestureVoiceCommand(command)?.type,
      "enable_camera_gestures",
      command,
    );
  }
});

test("negative, off, ambiguous, and unrelated voice commands are not enabled", () => {
  const commands = [
    "Turn the camera off",
    "Don't turn the camera on",
    "Never enable gestures",
    "Turn the camera",
    "Where is the camera setting?",
    "Explain this icon",
  ];

  for (const command of commands) {
    assert.equal(classifyCameraGestureVoiceCommand(command), null, command);
  }
});

test("closed-fist classification does not collide with point or open palm", () => {
  const fist = createSyntheticTrackedHand({ pose: "closed_fist" });
  const point = createSyntheticTrackedHand({ pose: "point" });
  const openPalm = createSyntheticTrackedHand({ pose: "open_palm" });

  assert.equal(classifyClosedFist(fist).isClosedFist, true);
  assert.equal(classifyClosedFist(point).isClosedFist, false);
  assert.equal(classifyClosedFist(openPalm).isClosedFist, false);
});

test("two closed fists must remain held for two seconds and fire once", () => {
  const hands = [
    createSyntheticTrackedHand({ trackId: "left", handedness: "left", pose: "closed_fist" }),
    createSyntheticTrackedHand({ trackId: "right", handedness: "right", pose: "closed_fist" }),
  ];
  let state = advanceCameraShutdownGesture({
    previousState: createInitialCameraShutdownGestureState(),
    hands,
    nowMs: 0,
  });
  assert.equal(state.phase, "holding");

  state = advanceCameraShutdownGesture({
    previousState: state,
    hands,
    nowMs: cameraShutdownGesturePolicy.holdMs - 1,
  });
  assert.equal(state.lastEvent, null);

  state = advanceCameraShutdownGesture({
    previousState: state,
    hands,
    nowMs: cameraShutdownGesturePolicy.holdMs,
  });
  assert.equal(state.phase, "recognized");
  assert.equal(state.lastEvent?.type, "disable_camera_gestures");
  const eventId = state.lastEvent?.id;

  state = advanceCameraShutdownGesture({
    previousState: state,
    hands,
    nowMs: cameraShutdownGesturePolicy.holdMs + 500,
  });
  assert.equal(state.lastEvent?.id, eventId);
  assert.equal(state.eventSequence, 1);
});

test("one fist cannot shut the camera down and a brief miss preserves the hold", () => {
  const left = createSyntheticTrackedHand({
    trackId: "left",
    handedness: "left",
    pose: "closed_fist",
  });
  const right = createSyntheticTrackedHand({
    trackId: "right",
    handedness: "right",
    pose: "closed_fist",
  });
  assert.equal(
    advanceCameraShutdownGesture({
      previousState: createInitialCameraShutdownGestureState(),
      hands: [left],
      nowMs: 0,
    }).phase,
    "idle",
  );

  const holding = advanceCameraShutdownGesture({
    previousState: createInitialCameraShutdownGestureState(),
    hands: [left, right],
    nowMs: 0,
  });
  const briefMiss = advanceCameraShutdownGesture({
    previousState: holding,
    hands: [],
    nowMs: cameraShutdownGesturePolicy.interruptionGraceMs,
  });
  assert.equal(briefMiss.phase, "holding");
  assert.equal(briefMiss.candidateSinceMs, 0);

  const expiredMiss = advanceCameraShutdownGesture({
    previousState: briefMiss,
    hands: [],
    nowMs: cameraShutdownGesturePolicy.interruptionGraceMs + 1,
  });
  assert.equal(expiredMiss.phase, "idle");
});

test("the top Controls tab owns one combined switch and Debug is diagnostic-only", () => {
  assert.match(topUtilitySource, /Camera \+ gestures/);
  assert.match(topUtilitySource, /onCameraGesturesToggle/);
  assert.match(appSource, /set-camera-gestures-enabled/);
  assert.match(appSource, /classifyCameraGestureVoiceCommand\(command\.text\)/);
  assert.doesNotMatch(appSource, /set-camera-enabled/);
  assert.doesNotMatch(appSource, /set-gestures-enabled/);
  assert.doesNotMatch(debugSource, /set-camera-gestures-enabled/);
  assert.match(debugSource, /Use the top Controls tab to change this setting/);
  assert.doesNotMatch(appSource, /runtimeUnavailable \? false : currentState\.enabled/);
});

test("the top utility is a top-attached interactive fullscreen auxiliary panel", () => {
  assert.match(nativeSource, /let top_gap = 0;/);
  assert.match(nativeSource, /prepare_macos_top_utility_on_main_thread/);
  assert.match(nativeSource, /prepare_auxiliary\(&utility, ignores_mouse_events\)/);
  assert.match(macosOverlaySource, /FULLSCREEN_AUXILIARY/);
  assert.match(macosOverlaySource, /ignores_mouse_events == expected_ignores_mouse_events/);
  assert.match(topUtilitySource, /toki-top-utility__identity/);
  assert.match(topUtilityStyles, /border-radius:\s*0 0 14px 14px/);
  assert.match(topUtilityStyles, /background:\s*#000/);
  assert.match(topUtilityStyles, /min-height:\s*56px/);
  assert.match(nativeSource, /TOP_UTILITY_EXPANDED_WIDTH: f64 = 400\.0/);
  assert.match(nativeSource, /TOP_UTILITY_EXPANDED_HEIGHT: f64 = 218\.0/);
});

test("completed voice notices expire back to a hidden inactive notch", () => {
  assert.equal(getPassiveTopUtilityMode(null), "hidden");
  assert.equal(TOP_UTILITY_RESULT_NOTICE_MS, 3_000);
  assert.equal(isTransientVoiceTopStatus("no_speech"), true);
  assert.equal(isTransientVoiceTopStatus("command_ready"), true);
  assert.equal(isTransientVoiceTopStatus("listening"), false);
  assert.equal(isTransientVoiceTopStatus("error"), false);

  const noSpeech = {
    enabled: false,
    permission: "granted",
    status: "no_speech",
    activationSource: "gesture",
    error: "Try again",
  };
  const settled = settleTransientVoiceTopStatus(noSpeech, "no_speech");

  assert.equal(settled.status, "idle");
  assert.equal(settled.error, undefined);
  assert.equal(settled.activationSource, undefined);
  assert.equal(
    settleTransientVoiceTopStatus(noSpeech, "command_ready"),
    noSpeech,
  );
  assert.match(appSource, /TOP_UTILITY_RESULT_NOTICE_MS/);
  assert.match(appSource, /settleTransientVoiceTopStatus/);
});

test("the camera-off countdown is visible and changes at most once a second", () => {
  const { holdMs } = cameraShutdownGesturePolicy;

  assert.equal(getCameraShutdownSecondsLeft(0), 2);
  assert.equal(getCameraShutdownSecondsLeft(holdMs), 0);
  assert.equal(getCameraShutdownSecondsLeft(holdMs + 500), 0);

  // The hold advances every inference frame. The countdown must not, or the
  // published status would be rewritten 24 times a second.
  const framesPerSecond = 24;
  const seen = [];
  for (let frame = 0; frame * (1_000 / framesPerSecond) <= holdMs; frame += 1) {
    const secondsLeft = getCameraShutdownSecondsLeft(
      frame * (1_000 / framesPerSecond),
    );
    if (seen.at(-1) !== secondsLeft) {
      seen.push(secondsLeft);
    }
  }

  assert.deepEqual(seen, [2, 1, 0]);
  assert.ok(seen.length <= holdMs / 1_000 + 1);
});

test("the camera-off hold reports progress the whole way through", () => {
  const hands = [
    createSyntheticTrackedHand({
      trackId: "left",
      handedness: "left",
      pose: "closed_fist",
    }),
    createSyntheticTrackedHand({
      trackId: "right",
      handedness: "right",
      pose: "closed_fist",
    }),
  ];
  let state = createInitialCameraShutdownGestureState();
  const progress = [];

  for (let elapsed = 0; elapsed <= cameraShutdownGesturePolicy.holdMs; elapsed += 250) {
    state = advanceCameraShutdownGesture({
      previousState: state,
      hands,
      nowMs: elapsed,
    });
    if (state.phase === "holding") {
      progress.push(state.holdMs);
    }
  }

  assert.ok(progress.length > 1, "the hold never reported intermediate progress");
  assert.deepEqual(progress, [...progress].sort((left, right) => left - right));
  assert.ok(progress.at(-1) > 0);
});
