import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  advanceHandTracking,
  createInitialHandTrackingState,
  getRetainedHandTrackIds,
} from "../apps/desktop/src/gestureHandTracking.ts";
import {
  advanceCreatureSplit,
  advanceGestureHandRoles,
  createCreatureSplitVisualState,
  createInitialCreatureSplitState,
  createInitialGestureHandRoleState,
  creatureSplitPolicy,
} from "../apps/desktop/src/gestureTwoHand.ts";
import {
  createSyntheticMultiHandFrame,
  createSyntheticTrackedHand,
} from "../apps/desktop/src/gestureFixtures.ts";
import { defaultGesturePointerCalibration } from "../apps/desktop/src/gesturePointing.ts";

const handLandmarkerSource = readFileSync(
  new URL("../apps/desktop/src/handLandmarker.ts", import.meta.url),
  "utf8",
);
const twoHandSource = readFileSync(
  new URL("../apps/desktop/src/gestureTwoHand.ts", import.meta.url),
  "utf8",
);

test("the local landmark provider requests at most two hands", () => {
  assert.match(handLandmarkerSource, /numHands:\s*2/);
  assert.match(handLandmarkerSource, /result\.landmarks\.slice\(0, 2\)/);
});

test("tracking identities survive detector array reordering and hand crossing", () => {
  let state = createInitialHandTrackingState();
  const first = track(state, [
    rawHand({ handedness: "left", centerX: 0.28, frameId: 1 }),
    rawHand({ handedness: "right", centerX: 0.72, frameId: 1 }),
  ], 1, 0);
  state = first.state;
  const leftId = first.frame.hands.find((hand) => hand.handedness === "left").trackId;
  const rightId = first.frame.hands.find((hand) => hand.handedness === "right").trackId;
  const second = track(state, [
    rawHand({ handedness: "right", centerX: 0.58, frameId: 2 }),
    rawHand({ handedness: "left", centerX: 0.42, frameId: 2 }),
  ], 2, 67);
  state = second.state;
  const crossed = track(state, [
    rawHand({ handedness: "right", centerX: 0.44, frameId: 3 }),
    rawHand({ handedness: "left", centerX: 0.56, frameId: 3 }),
  ], 3, 134);

  assert.equal(
    crossed.frame.hands.find((hand) => hand.handedness === "left").trackId,
    leftId,
  );
  assert.equal(
    crossed.frame.hands.find((hand) => hand.handedness === "right").trackId,
    rightId,
  );
  assert.deepEqual(
    crossed.frame.hands.map((hand) => hand.trackId),
    crossed.frame.hands.map((hand) => hand.trackId).toSorted(),
  );
});

test("tracking keeps a hand identity through the two-second recovery grace", () => {
  const first = track(
    createInitialHandTrackingState(),
    [rawHand({ handedness: "right", centerX: 0.5, frameId: 1 })],
    1,
    0,
  );
  const originalId = first.frame.hands[0].trackId;
  const missing = track(first.state, [], 2, 1_000);
  const recovered = track(
    missing.state,
    [rawHand({ handedness: "right", centerX: 0.51, frameId: 3 })],
    3,
    1_900,
  );
  const expired = track(recovered.state, [], 4, 4_001);
  const returnedLate = track(
    expired.state,
    [rawHand({ handedness: "right", centerX: 0.51, frameId: 5 })],
    5,
    4_002,
  );

  assert.equal(recovered.frame.hands[0].trackId, originalId);
  assert.notEqual(returnedLate.frame.hands[0].trackId, originalId);
});

test("pointer and control roles stay stable and the control hand is never promoted during grace", () => {
  const pointer = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    handedness: "right",
    pose: "point",
    centerX: 0.3,
  });
  const control = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    pose: "pinch",
    centerX: 0.7,
  });
  const initial = advanceGestureHandRoles({
    previousState: createInitialGestureHandRoleState(),
    frame: createSyntheticMultiHandFrame({ hands: [control, pointer] }),
    retainedTrackIds: ["pointer-hand", "control-hand"],
    preferredPointerHand: "right",
    minDetectionConfidence: 0.6,
  });
  const pointerMissing = advanceGestureHandRoles({
    previousState: initial.state,
    frame: createSyntheticMultiHandFrame({ frameId: 2, hands: [control] }),
    retainedTrackIds: ["pointer-hand", "control-hand"],
    preferredPointerHand: "right",
    minDetectionConfidence: 0.6,
  });

  assert.deepEqual(initial.roles, {
    "control-hand": "control",
    "pointer-hand": "pointer",
  });
  assert.equal(pointerMissing.state.pointerTrackId, "pointer-hand");
  assert.equal(pointerMissing.pointerHand, null);
  assert.equal(pointerMissing.controlHand.trackId, "control-hand");
});

test("split and merge use hold thresholds, hysteresis, and hand-loss grace", () => {
  const pointerWide = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    centerX: 0.22,
  });
  const controlWide = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.78,
  });
  const splitting = advanceCreatureSplit({
    previousState: createInitialCreatureSplitState(),
    pointerHand: pointerWide,
    controlHand: controlWide,
    nowMs: 0,
  });
  const split = advanceCreatureSplit({
    previousState: splitting,
    pointerHand: pointerWide,
    controlHand: controlWide,
    nowMs: creatureSplitPolicy.splitHoldMs,
  });
  const pointerJitter = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    centerX: 0.35,
  });
  const controlJitter = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.65,
  });
  const hysteresis = advanceCreatureSplit({
    previousState: split,
    pointerHand: pointerJitter,
    controlHand: controlJitter,
    nowMs: 500,
  });
  const recovering = advanceCreatureSplit({
    previousState: hysteresis,
    pointerHand: pointerJitter,
    controlHand: null,
    nowMs: 2_000,
  });
  const merging = advanceCreatureSplit({
    previousState: recovering,
    pointerHand: pointerJitter,
    controlHand: null,
    nowMs: 2_600,
  });
  const merged = advanceCreatureSplit({
    previousState: merging,
    pointerHand: pointerJitter,
    controlHand: null,
    nowMs: 2_600 + creatureSplitPolicy.mergeHoldMs,
  });

  assert.equal(splitting.phase, "splitting");
  assert.equal(split.phase, "split");
  assert.ok(hysteresis.normalizedSeparation < creatureSplitPolicy.splitSeparation);
  assert.ok(hysteresis.normalizedSeparation > creatureSplitPolicy.mergeSeparation);
  assert.equal(hysteresis.phase, "split");
  assert.equal(recovering.phase, "recovering");
  assert.equal(merging.phase, "merging");
  assert.equal(merged.phase, "merged");
});

test("the split result is display-bounded visual state with no action side effects", () => {
  const pointer = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    centerX: 0.2,
  });
  const control = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.8,
  });
  const splitting = advanceCreatureSplit({
    previousState: createInitialCreatureSplitState(),
    pointerHand: pointer,
    controlHand: control,
    nowMs: 0,
  });
  const split = advanceCreatureSplit({
    previousState: splitting,
    pointerHand: pointer,
    controlHand: control,
    nowMs: creatureSplitPolicy.splitHoldMs,
  });
  const visual = createCreatureSplitVisualState({
    state: split,
    display: { id: "main", width: 1470, height: 956, scaleFactor: 2 },
    calibration: defaultGesturePointerCalibration,
  });

  assert.equal(visual.visualOnly, true);
  assert.equal(visual.primary.displayId, "main");
  assert.ok(visual.primary.x >= 0 && visual.primary.x < 1470);
  assert.ok(visual.secondary.y >= 0 && visual.secondary.y < 956);
  assert.doesNotMatch(twoHandSource, /activate_assistant|startNativeVoiceCapture|invoke\(|emitTo\(|\.click\(/);
});

function rawHand({ handedness, centerX, frameId }) {
  const hand = createSyntheticTrackedHand({
    trackId: "discarded-detector-id",
    handedness,
    centerX,
    frameId,
  });
  const {
    trackId: _trackId,
    sequence: _sequence,
    trackingConfidence: _trackingConfidence,
    lastSeenAt: _lastSeenAt,
    ...raw
  } = hand;
  return raw;
}

function track(previousState, detections, frameId, nowMs) {
  const capturedAt = new Date(Date.parse("2026-07-16T00:00:00.000Z") + nowMs)
    .toISOString();
  return advanceHandTracking({
    previousState,
    detections,
    frameId,
    capturedAt,
    sourceWidth: 1280,
    sourceHeight: 720,
    mirrored: true,
    nowMs,
  });
}
