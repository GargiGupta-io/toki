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

test("single-hand tracking survives a plausible fast move after a short detector gap", () => {
  const first = track(
    createInitialHandTrackingState(),
    [rawHand({ handedness: "right", centerX: 0.18, frameId: 1 })],
    1,
    0,
  );
  const originalId = first.frame.hands[0].trackId;
  const missing = track(first.state, [], 2, 120);
  const recovered = track(
    missing.state,
    [rawHand({ handedness: "right", centerX: 0.67, frameId: 3 })],
    3,
    240,
  );

  assert.equal(recovered.frame.hands[0].trackId, originalId);
});

test("single-hand reacquisition does not steal an incompatible or stale identity", () => {
  const first = track(
    createInitialHandTrackingState(),
    [rawHand({ handedness: "right", centerX: 0.18, frameId: 1 })],
    1,
    0,
  );
  const originalId = first.frame.hands[0].trackId;
  const wrongHand = track(
    first.state,
    [rawHand({ handedness: "left", centerX: 0.67, frameId: 2 })],
    2,
    200,
  );
  const stale = track(first.state, [], 2, 500);
  const returnedLate = track(
    stale.state,
    [rawHand({ handedness: "right", centerX: 0.67, frameId: 3 })],
    3,
    510,
  );

  assert.notEqual(wrongHand.frame.hands[0].trackId, originalId);
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

test("two hands must join before separating can split the blob", () => {
  const pointerWide = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    centerX: 0.22,
  });
  const controlWide = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.78,
  });
  const farWithoutJoin = advanceCreatureSplit({
    previousState: createInitialCreatureSplitState(),
    pointerHand: pointerWide,
    controlHand: controlWide,
    nowMs: 0,
  });
  const stillMerged = advanceCreatureSplit({
    previousState: farWithoutJoin,
    pointerHand: pointerWide,
    controlHand: controlWide,
    nowMs: creatureSplitPolicy.splitHoldMs + 500,
  });
  const pointerJoined = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    centerX: 0.46,
  });
  const controlJoined = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.54,
  });
  const joining = advanceCreatureSplit({
    previousState: stillMerged,
    pointerHand: pointerJoined,
    controlHand: controlJoined,
    nowMs: 1_000,
  });
  const armed = advanceCreatureSplit({
    previousState: joining,
    pointerHand: pointerJoined,
    controlHand: controlJoined,
    nowMs: 1_000 + creatureSplitPolicy.joinHoldMs,
  });
  const splitting = advanceCreatureSplit({
    previousState: armed,
    pointerHand: pointerWide,
    controlHand: controlWide,
    nowMs: 1_400,
  });
  const split = advanceCreatureSplit({
    previousState: splitting,
    pointerHand: pointerWide,
    controlHand: controlWide,
    nowMs: 1_400 + creatureSplitPolicy.splitHoldMs,
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
    nowMs: 1_800,
  });
  const recovering = advanceCreatureSplit({
    previousState: hysteresis,
    pointerHand: pointerJitter,
    controlHand: null,
    nowMs: 1_900,
  });
  const merging = advanceCreatureSplit({
    previousState: recovering,
    pointerHand: pointerJitter,
    controlHand: null,
    nowMs: 1_800 + creatureSplitPolicy.visualRecoveryMs + 1,
  });
  const merged = advanceCreatureSplit({
    previousState: merging,
    pointerHand: pointerJitter,
    controlHand: null,
    nowMs:
      1_800 +
      creatureSplitPolicy.visualRecoveryMs +
      1 +
      creatureSplitPolicy.mergeHoldMs,
  });

  assert.equal(farWithoutJoin.phase, "merged");
  assert.equal(stillMerged.phase, "merged");
  assert.equal(joining.phase, "joining");
  assert.equal(armed.phase, "armed");
  assert.equal(splitting.phase, "splitting");
  assert.equal(split.phase, "split");
  assert.ok(hysteresis.normalizedSeparation < creatureSplitPolicy.splitSeparation);
  assert.ok(hysteresis.normalizedSeparation > creatureSplitPolicy.mergeSeparation);
  assert.equal(hysteresis.phase, "split");
  assert.equal(recovering.phase, "recovering");
  assert.equal(merging.phase, "merging");
  assert.equal(merged.phase, "merged");
});

test("join arming survives a brief occlusion but expires without separation", () => {
  const pointer = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    centerX: 0.46,
  });
  const control = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.54,
  });
  const joining = advanceCreatureSplit({
    previousState: createInitialCreatureSplitState(),
    pointerHand: pointer,
    controlHand: control,
    nowMs: 0,
  });
  const joiningThroughOcclusion = advanceCreatureSplit({
    previousState: joining,
    pointerHand: pointer,
    controlHand: null,
    nowMs: creatureSplitPolicy.joinInterruptionGraceMs - 1,
  });
  const armed = advanceCreatureSplit({
    previousState: joiningThroughOcclusion,
    pointerHand: pointer,
    controlHand: control,
    nowMs: creatureSplitPolicy.joinHoldMs + 50,
  });
  // Brief means brief. This previously asserted the arm survived a full
  // splitArmGraceMs (2 s) with the control hand absent, which let a hand raised
  // again far away split the creature with no join at all.
  const armedThroughOcclusion = advanceCreatureSplit({
    previousState: armed,
    pointerHand: pointer,
    controlHand: null,
    nowMs:
      armed.lastTwoHandsSeenAtMs + creatureSplitPolicy.joinInterruptionGraceMs - 1,
  });
  const expired = advanceCreatureSplit({
    previousState: armedThroughOcclusion,
    pointerHand: pointer,
    controlHand: null,
    nowMs:
      armed.lastTwoHandsSeenAtMs + creatureSplitPolicy.joinInterruptionGraceMs + 1,
  });

  assert.equal(joiningThroughOcclusion.phase, "joining");
  assert.equal(armed.phase, "armed");
  assert.equal(armedThroughOcclusion.phase, "armed");
  assert.notEqual(expired.phase, "armed");
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
  const pointerJoined = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    centerX: 0.46,
  });
  const controlJoined = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.54,
  });
  const joining = advanceCreatureSplit({
    previousState: createInitialCreatureSplitState(),
    pointerHand: pointerJoined,
    controlHand: controlJoined,
    nowMs: 0,
  });
  const armed = advanceCreatureSplit({
    previousState: joining,
    pointerHand: pointerJoined,
    controlHand: controlJoined,
    nowMs: creatureSplitPolicy.joinHoldMs,
  });
  const splitting = advanceCreatureSplit({
    previousState: armed,
    pointerHand: pointer,
    controlHand: control,
    nowMs: creatureSplitPolicy.joinHoldMs + 100,
  });
  const split = advanceCreatureSplit({
    previousState: splitting,
    pointerHand: pointer,
    controlHand: control,
    nowMs:
      creatureSplitPolicy.joinHoldMs +
      100 +
      creatureSplitPolicy.splitHoldMs,
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

test("a second hand appearing apart cannot split a creature that never joined", () => {
  const pointer = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    handedness: "right",
    centerX: 0.3,
  });
  const control = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.8,
  });

  // Hands close enough to arm, then held until the arm forms.
  const near = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.36,
  });
  let state = createInitialCreatureSplitState();
  for (const nowMs of [0, 120, 260]) {
    state = advanceCreatureSplit({
      previousState: state,
      pointerHand: pointer,
      controlHand: near,
      nowMs,
    });
  }
  assert.equal(state.phase, "armed", "the join never armed the creature");

  // The second hand leaves for longer than a brief interruption.
  const gone = advanceCreatureSplit({
    previousState: state,
    pointerHand: pointer,
    controlHand: null,
    nowMs: 260 + creatureSplitPolicy.joinInterruptionGraceMs + 1,
  });
  assert.notEqual(
    gone.phase,
    "armed",
    "the arm survived the second hand leaving the frame",
  );

  // Raising it again far away must not split: the join has to happen first.
  let after = gone;
  for (const step of [50, 100, 200, 400]) {
    after = advanceCreatureSplit({
      previousState: after,
      pointerHand: pointer,
      controlHand: control,
      nowMs: 260 + creatureSplitPolicy.joinInterruptionGraceMs + 1 + step,
    });
  }
  assert.ok(
    after.phase !== "split" && after.phase !== "splitting",
    `a hand raised apart split the creature (phase ${after.phase})`,
  );
});

test("a brief dropout mid-separation still keeps the creature armed", () => {
  const pointer = createSyntheticTrackedHand({
    trackId: "pointer-hand",
    handedness: "right",
    centerX: 0.3,
  });
  const near = createSyntheticTrackedHand({
    trackId: "control-hand",
    handedness: "left",
    centerX: 0.36,
  });

  let state = createInitialCreatureSplitState();
  for (const nowMs of [0, 120, 260]) {
    state = advanceCreatureSplit({
      previousState: state,
      pointerHand: pointer,
      controlHand: near,
      nowMs,
    });
  }
  assert.equal(state.phase, "armed");

  const blink = advanceCreatureSplit({
    previousState: state,
    pointerHand: pointer,
    controlHand: null,
    nowMs: 260 + 100,
  });
  assert.equal(blink.phase, "armed", "one dropped frame disarmed the creature");
});

test("a hand whose detection score dips still gets the pointer role", () => {
  const dipped = {
    ...createSyntheticTrackedHand({
      trackId: "pointer-hand",
      handedness: "right",
      pose: "point",
    }),
    confidence: 0.4,
  };
  const frame = createSyntheticMultiHandFrame({ hands: [dipped] });

  const result = advanceGestureHandRoles({
    previousState: createInitialGestureHandRoleState(),
    frame,
    retainedTrackIds: [],
    preferredPointerHand: "right",
    minDetectionConfidence: 0.6,
  });

  assert.notEqual(
    result.pointerHand,
    null,
    "a visible hand was left with no pointer role, starving the pointer",
  );
  assert.equal(result.pointerHand.trackId, "pointer-hand");
});
