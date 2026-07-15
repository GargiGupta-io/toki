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
  createSyntheticDoubleTapFrames,
  createSyntheticMultiHandFrame,
  createSyntheticTrackedHand,
} from "../apps/desktop/src/gestureFixtures.ts";

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

test("double-tap fixtures describe two complete flex-and-return cycles", () => {
  const frames = createSyntheticDoubleTapFrames();
  const indexTipY = frames.map(
    (frame) => frame.hands[0].landmarks.find((point) => point.name === "index_tip").y,
  );

  assert.equal(frames.length, 5);
  assert.ok(indexTipY[1] > indexTipY[0]);
  assert.ok(indexTipY[2] < indexTipY[1]);
  assert.ok(indexTipY[3] > indexTipY[2]);
  assert.ok(indexTipY[4] < indexTipY[3]);
  assert.ok(
    Date.parse(frames.at(-1).capturedAt) - Date.parse(frames[0].capturedAt) <=
      defaultGestureTimingPolicy.doubleTapMaxGapMs,
  );
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
