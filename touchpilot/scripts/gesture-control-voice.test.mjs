import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  advanceControlPinch,
  canStartGestureVoice,
  controlPinchPolicy,
  createGestureVoiceContext,
  createInitialControlPinchState,
} from "../apps/desktop/src/gestureControlVoice.ts";
import { createPointerLockSnapshot } from "../apps/desktop/src/gestureContracts.ts";
import { createSyntheticTrackedHand } from "../apps/desktop/src/gestureFixtures.ts";
import {
  createIdleVoiceHoldState,
  transitionVoiceHold,
} from "../apps/desktop/src/voiceHoldController.ts";

const thresholds = {
  minDetectionConfidence: 0.6,
  pinchHoldMs: 180,
  openPalmHoldMs: 220,
  cooldownMs: 700,
  maxHands: 2,
};
const pressThreshold = 0.34;

const source = readFileSync(
  new URL("../apps/desktop/src/gestureControlVoice.ts", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("../apps/desktop/src/gestureRuntime.ts", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);

test("the stable control-hand pinch emits one press and one hysteretic release", () => {
  let state = createInitialControlPinchState(pressThreshold);
  const pinched = handAtDistance("control-hand", 0.2, 1);
  const jitter = handAtDistance("control-hand", 0.4, 2);
  const open = handAtDistance("control-hand", 0.7, 3);

  state = advance(state, pinched, 0);
  assert.equal(state.phase, "pressing");
  state = advance(state, pinched, 179);
  assert.equal(state.lastEvent, null);
  state = advance(state, pinched, 180);
  assert.equal(state.phase, "held");
  assert.equal(state.lastEvent?.type, "press");
  const pressEventId = state.lastEvent?.id;

  state = advance(state, jitter, 250);
  assert.equal(state.phase, "held");
  assert.equal(state.lastEvent?.id, pressEventId);

  state = advance(state, open, 300);
  assert.equal(state.phase, "releasing");
  state = advance(state, open, 439);
  assert.equal(state.lastEvent?.id, pressEventId);
  state = advance(state, open, 440);
  assert.equal(state.phase, "idle");
  assert.equal(state.lastEvent?.type, "release");
  const releaseEventId = state.lastEvent?.id;

  state = advance(state, open, 600);
  assert.equal(state.lastEvent?.id, releaseEventId);
  assert.equal(state.eventSequence, 2);
});

test("gesture hold-to-talk requires a validated lock and an idle recorder", () => {
  const lock = pointerLock();

  assert.equal(
    canStartGestureVoice(null, "locked", "idle"),
    false,
  );
  assert.equal(
    canStartGestureVoice(lock, "checking", "idle"),
    false,
  );
  assert.equal(
    canStartGestureVoice(lock, "locked", "capturing"),
    false,
  );
  assert.equal(
    canStartGestureVoice(lock, "locked", "idle"),
    true,
  );
});

test("brief control-hand loss recovers without release or submission", () => {
  let state = heldState();
  const pressEventId = state.lastEvent?.id;

  state = advance(state, null, 500);
  assert.equal(state.phase, "recovering");
  state = advance(state, null, 2_499);
  assert.equal(state.phase, "recovering");
  assert.equal(state.lastEvent?.id, pressEventId);
  state = advance(state, handAtDistance("control-hand", 0.2, 4), 2_499);
  assert.equal(state.phase, "held");
  assert.equal(state.lastEvent?.id, pressEventId);
});

test("two seconds of loss cancels and never fabricates a release", () => {
  let state = heldState();
  state = advance(state, null, 500);
  state = advance(
    state,
    null,
    500 + controlPinchPolicy.trackingLossGraceMs,
  );

  assert.equal(state.phase, "idle");
  assert.equal(state.lastEvent?.type, "tracking_lost");
  assert.notEqual(state.lastEvent?.type, "release");
});

test("a different hand cannot hijack the active control hold", () => {
  let state = heldState();
  state = advance(state, handAtDistance("replacement-hand", 0.2, 5), 500);

  assert.equal(state.phase, "recovering");
  assert.equal(state.controlHandTrackId, "control-hand");
});

test("gesture voice context freezes the accepted lock receipt", () => {
  const pointer = pointerSample();
  const evidence = {
    snapshotId: "screen-1",
    capturedAt: "2026-07-16T00:00:00.000Z",
    activeWindowId: "spotify-window",
  };
  const lock = createPointerLockSnapshot({
    id: "lock-1",
    lockedAt: "2026-07-16T00:00:00.000Z",
    pointer,
    evidence,
    display: { id: "main", width: 1470, height: 956, scaleFactor: 2 },
  });
  const context = createGestureVoiceContext({
    sessionId: "gesture-session-1",
    controlHandTrackId: "control-hand",
    startedAt: "2026-07-16T00:00:01.000Z",
    lock,
  });

  pointer.display.x = 900;
  evidence.activeWindowId = "other-window";
  const replacement = createPointerLockSnapshot({
    id: "lock-2",
    lockedAt: "2026-07-16T00:00:02.000Z",
    pointer: pointerSample(),
    evidence: { ...evidence, snapshotId: "screen-2" },
    display: lock.display,
  });

  assert.equal(context.lock.id, "lock-1");
  assert.equal(context.lock.pointer.display.x, 420);
  assert.equal(context.lock.evidence.activeWindowId, "spotify-window");
  assert.equal(replacement.id, "lock-2");
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.lock));
  assert.ok(Object.isFrozen(context.lock.pointer.display));
});

test("control events compose with the existing hold controller exactly once", () => {
  const pressed = transitionVoiceHold(createIdleVoiceHoldState(), "press");
  const capturing = transitionVoiceHold(pressed.state, "capture_started");
  const released = transitionVoiceHold(capturing.state, "release");
  const duplicateRelease = transitionVoiceHold(released.state, "release");
  const cancelled = transitionVoiceHold(capturing.state, "cancel");

  assert.equal(pressed.effect, "start_capture");
  assert.equal(released.effect, "submit_capture");
  assert.equal(duplicateRelease.effect, "none");
  assert.equal(cancelled.effect, "none");
  assert.deepEqual(cancelled.state, createIdleVoiceHoldState());
});

test("the control pinch detector is pure and owns no voice or click side effects", () => {
  assert.doesNotMatch(
    source,
    /startNativeVoiceCapture|stopNativeVoiceCapture|resetNativeVoiceCapture|emitTo\(|invoke\(|\.click\(|refreshCaptureMetadata/,
  );
});

test("runtime and overlay compose control events without feeding the legacy pointer classifiers", () => {
  assert.match(runtimeSource, /controlHand: roles\.controlHand/);
  assert.match(
    runtimeSource,
    /classifyPinchGesture\(\s*handLandmarkFrame,/,
  );
  assert.match(
    appSource,
    /event\.type === "release"[\s\S]*?type: "submit-voice-listening"/,
  );
  assert.match(
    appSource,
    /type: "stop-voice-listening"[\s\S]*?cancelVoiceRuntime/,
  );
  assert.match(appSource, /gestureContext: activeGestureContext/);
});

function heldState() {
  let state = createInitialControlPinchState(pressThreshold);
  const pinched = handAtDistance("control-hand", 0.2, 1);
  state = advance(state, pinched, 0);
  return advance(state, pinched, thresholds.pinchHoldMs);
}

function advance(previousState, controlHand, nowMs) {
  return advanceControlPinch({
    previousState,
    controlHand,
    thresholds,
    pressThreshold,
    nowMs,
  });
}

function handAtDistance(trackId, normalizedDistance, frameId) {
  const hand = createSyntheticTrackedHand({
    trackId,
    frameId,
    pose: "pinch",
  });
  const wrist = hand.landmarks.find((landmark) => landmark.name === "wrist");
  const middleMcp = hand.landmarks.find(
    (landmark) => landmark.name === "middle_mcp",
  );
  const thumbTip = hand.landmarks.find(
    (landmark) => landmark.name === "thumb_tip",
  );
  const indexTip = hand.landmarks.find(
    (landmark) => landmark.name === "index_tip",
  );
  const palmSize = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y);
  indexTip.x = thumbTip.x + normalizedDistance * palmSize;
  indexTip.y = thumbTip.y;
  return hand;
}

function pointerSample() {
  return {
    phase: "tracking",
    handTrackId: "pointer-hand",
    normalized: { x: 0.3, y: 0.4 },
    display: { displayId: "main", x: 420, y: 380 },
    confidence: 0.96,
    sourceFrameId: 42,
    capturedAt: "2026-07-16T00:00:00.000Z",
  };
}

function pointerLock() {
  return createPointerLockSnapshot({
    id: "lock-validated",
    lockedAt: "2026-07-16T00:00:00.000Z",
    pointer: pointerSample(),
    evidence: {
      snapshotId: "screen-validated",
      capturedAt: "2026-07-16T00:00:00.000Z",
      activeWindowId: "spotify-window",
    },
    display: { id: "main", width: 1470, height: 956, scaleFactor: 2 },
  });
}
