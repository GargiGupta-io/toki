import assert from "node:assert/strict";
import test from "node:test";

import {
  createIdleGestureInteractionState,
  createPointerLockSnapshot,
  defaultGestureTimingPolicy,
  gestureContractVersion,
} from "../apps/desktop/src/gestureContracts.ts";
import {
  createSyntheticAdaptiveProfile,
  createSyntheticMultiHandFrame,
  createSyntheticTrackedHand,
} from "../apps/desktop/src/gestureFixtures.ts";
import { cameraShutdownGesturePolicy } from "../apps/desktop/src/gestureCameraControl.ts";
import { controlPinchPolicy } from "../apps/desktop/src/gestureControlVoice.ts";
import { gestureDiagnosticPublishIntervalMs } from "../apps/desktop/src/gestureDiagnostics.ts";
import { gestureVideoFramePolicy } from "../apps/desktop/src/gestureFrameFreshness.ts";
import { handTrackingPolicy } from "../apps/desktop/src/gestureHandTracking.ts";
import { gestureIntentArbiterPolicy } from "../apps/desktop/src/gestureIntentArbiter.ts";
import {
  defaultGesturePointerCalibration,
  pointerVisualRecoveryGraceMs,
} from "../apps/desktop/src/gesturePointing.ts";
import {
  gestureInferenceFramesPerSecond,
  gestureInferenceToleranceMs,
} from "../apps/desktop/src/gestureRuntime.ts";
import { gestureCandidateLossGraceMs } from "../apps/desktop/src/gestureSmoothing.ts";
import { wristRollLockPolicy } from "../apps/desktop/src/gestureTargetLock.ts";
import { creatureSplitPolicy } from "../apps/desktop/src/gestureTwoHand.ts";

test("gesture state starts idle without inventing a hand, pointer, or lock", () => {
  const state = createIdleGestureInteractionState({
    now: "2026-07-15T00:00:00.000Z",
  });

  assert.equal(state.version, gestureContractVersion);
  assert.equal(state.mode, "idle");
  assert.deepEqual(state.handRoles, {});
  assert.equal(state.pointer, null);
  assert.equal(state.lock, null);
  assert.equal(state.tap.phase, "idle");
});

test("human timing contract preserves two seconds of recovery grace", () => {
  assert.deepEqual(defaultGestureTimingPolicy, {
    humanGraceMs: 2_000,
    doubleTapMaxGapMs: 2_000,
    trackingLossGraceMs: 2_000,
    lockFreshnessMaxAgeMs: 5_000,
  });
});

test("every gesture cadence and grace period is pinned in one place", () => {
  assert.equal(gestureInferenceFramesPerSecond, 30);
  assert.equal(gestureDiagnosticPublishIntervalMs, 250);
  assert.equal(pointerVisualRecoveryGraceMs, 500);
  assert.equal(gestureCandidateLossGraceMs, 120);
  assert.equal(defaultGesturePointerCalibration.pointHoldMs, 140);
  assert.equal(defaultGesturePointerCalibration.trackingLossGraceMs, 2_000);

  assert.deepEqual({ ...handTrackingPolicy }, {
    maximumAssignmentDistance: 0.36,
    handednessMismatchPenalty: 0.12,
    singleHandReacquisitionDistance: 0.62,
    singleHandReacquisitionGraceMs: 450,
  });
  assert.deepEqual({ ...wristRollLockPolicy }, {
    rollStartDegrees: 70,
    rollResetDegrees: 30,
    rollHoldMs: 220,
    untwistHoldMs: 220,
    rollInterruptionGraceMs: 450,
    rollSequenceGraceMs: 2_000,
    cooldownMs: 350,
    minimumRolledIndexExtensionRatio: 1.45,
    requiredFoldedFingerCount: 2,
  });
  assert.deepEqual({ ...gestureIntentArbiterPolicy }, { ownerLeaseMs: 250 });
  assert.deepEqual({ ...gestureVideoFramePolicy }, {
    staleAfterMs: 350,
    progressEpsilon: 0.0001,
  });
  assert.equal(cameraShutdownGesturePolicy.holdMs, 2_000);
  assert.equal(cameraShutdownGesturePolicy.interruptionGraceMs, 250);
  assert.equal(cameraShutdownGesturePolicy.releaseHoldMs, 500);
  assert.equal(controlPinchPolicy.pressInterruptionGraceMs, 240);
  assert.equal(controlPinchPolicy.releaseHoldMs, 180);
  assert.equal(controlPinchPolicy.releaseInterruptionGraceMs, 160);
  assert.equal(creatureSplitPolicy.visualRecoveryMs, 500);
});

test("the inference rate lands on the display refresh grid", () => {
  // Inference is driven by requestAnimationFrame, so the only achievable
  // cadences are whole multiples of a refresh tick. Asking for a rate that
  // falls between ticks does not slow down gracefully — the gate overshoots to
  // the next tick and the real rate drops to the slower neighbour. A 24 fps
  // target (41.7 ms) measured 49 ms in a live trace: 20 fps, not 24.
  const refreshHz = 60;
  const tickMs = 1_000 / refreshHz;
  const intervalMs = 1_000 / gestureInferenceFramesPerSecond;
  const ticksPerFrame = intervalMs / tickMs;

  assert.ok(
    Math.abs(ticksPerFrame - Math.round(ticksPerFrame)) < 0.01,
    `${gestureInferenceFramesPerSecond} fps needs ${ticksPerFrame.toFixed(2)} ticks per frame; only whole ticks exist`,
  );

  // The tolerance must cover rAF jitter without reaching back a whole tick,
  // which would let the gate fire twice on one tick.
  assert.ok(gestureInferenceToleranceMs > 0);
  assert.ok(gestureInferenceToleranceMs < tickMs);
  assert.ok(intervalMs - gestureInferenceToleranceMs < Math.round(ticksPerFrame) * tickMs);
});

test("cadence and grace periods stay consistent with the inference rate", () => {
  const frameIntervalMs = 1_000 / gestureInferenceFramesPerSecond;
  const trackingLossGraceMs = defaultGestureTimingPolicy.trackingLossGraceMs;

  // One dropped inference frame must never cancel a deliberate gesture.
  const interruptionGraces = [
    controlPinchPolicy.pressInterruptionGraceMs,
    controlPinchPolicy.releaseInterruptionGraceMs,
    wristRollLockPolicy.rollInterruptionGraceMs,
    cameraShutdownGesturePolicy.interruptionGraceMs,
    creatureSplitPolicy.joinInterruptionGraceMs,
    gestureCandidateLossGraceMs,
  ];
  for (const graceMs of interruptionGraces) {
    assert.ok(
      graceMs >= frameIntervalMs * 2,
      `${graceMs}ms grace is under two inference frames`,
    );
  }

  // An owner must survive a short burst of dropped frames, or the arbiter
  // would hand the same hand to a competing reading mid-gesture.
  assert.ok(gestureIntentArbiterPolicy.ownerLeaseMs >= frameIntervalMs * 4);

  // The trace must not publish on every inference frame.
  assert.ok(gestureDiagnosticPublishIntervalMs >= frameIntervalMs * 4);

  // A stalled video is noticed long before a hand identity is discarded.
  assert.ok(gestureVideoFramePolicy.staleAfterMs < trackingLossGraceMs);

  // Reacquisition is attempted before the track ages out, and is deliberately
  // more permissive than ordinary frame-to-frame assignment.
  assert.ok(
    handTrackingPolicy.singleHandReacquisitionGraceMs < trackingLossGraceMs,
  );
  assert.ok(
    handTrackingPolicy.singleHandReacquisitionDistance >
      handTrackingPolicy.maximumAssignmentDistance,
  );

  // Locking and releasing a target cost the same deliberate hold.
  assert.equal(
    wristRollLockPolicy.untwistHoldMs,
    wristRollLockPolicy.rollHoldMs,
  );
  assert.ok(wristRollLockPolicy.cooldownMs < wristRollLockPolicy.rollSequenceGraceMs);

  // Every visible recovery grace fades together, and always before identity is lost.
  assert.equal(pointerVisualRecoveryGraceMs, creatureSplitPolicy.visualRecoveryMs);
  assert.ok(pointerVisualRecoveryGraceMs < trackingLossGraceMs);

  // The hand model loses a visible hand in bursts. A live trace measured gaps of
  // 197, 365, and 365 ms; the visible pointer must outlast that envelope or it
  // is erased while the hand is still there and about to be re-detected.
  const observedModelDropoutMs = 365;
  assert.ok(
    pointerVisualRecoveryGraceMs > observedModelDropoutMs,
    `a ${pointerVisualRecoveryGraceMs}ms visual grace is inside the ${observedModelDropoutMs}ms model dropout envelope`,
  );

  // The camera-off hold is the longest deliberate gesture Toki accepts.
  const deliberateHolds = [
    controlPinchPolicy.releaseHoldMs,
    wristRollLockPolicy.rollHoldMs,
    creatureSplitPolicy.joinHoldMs,
    creatureSplitPolicy.splitHoldMs,
  ];
  for (const holdMs of deliberateHolds) {
    assert.ok(holdMs < cameraShutdownGesturePolicy.holdMs);
  }
});

test("synthetic hand fixtures always provide the canonical 21 landmarks", () => {
  const hand = createSyntheticTrackedHand({ pose: "point" });

  assert.equal(hand.landmarks.length, 21);
  assert.equal(new Set(hand.landmarks.map((landmark) => landmark.index)).size, 21);
  assert.equal(new Set(hand.landmarks.map((landmark) => landmark.name)).size, 21);
  assert.equal(hand.landmarks[0].name, "wrist");
  assert.equal(hand.landmarks[20].name, "pinky_tip");
});

test("multi-hand fixtures preserve stable identities without merging hands", () => {
  const pointer = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    handedness: "right",
    centerX: 0.35,
  });
  const control = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    pose: "pinch",
    centerX: 0.7,
  });
  const frame = createSyntheticMultiHandFrame({ hands: [pointer, control] });

  assert.equal(frame.hands.length, 2);
  assert.deepEqual(
    frame.hands.map((hand) => hand.trackId),
    ["pointer-hand", "control-hand"],
  );
  assert.notEqual(frame.hands[0].landmarks, pointer.landmarks);
});

test("index-bend fixture is distinct from the extended pointing pose", () => {
  const point = createSyntheticTrackedHand({ pose: "point" });
  const bend = createSyntheticTrackedHand({ pose: "tap_flexed" });
  const pointTip = point.landmarks.find((landmark) => landmark.name === "index_tip");
  const bendTip = bend.landmarks.find((landmark) => landmark.name === "index_tip");

  assert.ok(bendTip.y > pointTip.y);
});

test("a pointer lock is an immutable copy of the chosen point and evidence", () => {
  const pointer = {
    handTrackId: "pointer-hand",
    phase: "active",
    normalized: { x: 0.42, y: 0.36 },
    display: { displayId: "main", x: 620, y: 344 },
    confidence: 0.94,
    sourceFrameId: 42,
    capturedAt: "2026-07-15T00:00:01.000Z",
  };
  const lock = createPointerLockSnapshot({
    id: "lock-1",
    lockedAt: "2026-07-15T00:00:01.100Z",
    pointer,
    evidence: {
      snapshotId: "snapshot-1",
      captureId: "capture-1",
      capturedAt: "2026-07-15T00:00:01.000Z",
      regionHash: "region-fixture",
    },
    display: { id: "main", width: 1470, height: 956, scaleFactor: 2 },
  });

  pointer.normalized.x = 0.9;
  pointer.display.x = 1_200;

  assert.equal(lock.pointer.normalized.x, 0.42);
  assert.equal(lock.pointer.display.x, 620);
  assert.equal(lock.status, "locked");
  assert.equal(Object.isFrozen(lock), true);
  assert.equal(Object.isFrozen(lock.pointer.normalized), true);
});

test("adaptive profile fixtures retain derived statistics but no raw camera frames", () => {
  const profile = createSyntheticAdaptiveProfile();

  assert.equal(profile.version, 1);
  assert.equal(profile.timing.humanGraceMs, 2_000);
  assert.equal(profile.tapFlexion.sampleCount, 10);
  assert.equal("rawFrames" in profile, false);
  assert.equal("landmarks" in profile, false);
});
