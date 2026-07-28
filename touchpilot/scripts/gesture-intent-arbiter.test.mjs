import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceGestureIntentArbiter,
  createInitialGestureIntentArbiterState,
  gestureIntentArbiterPolicy,
  isGestureIntentSelected,
} from "../apps/desktop/src/gestureIntentArbiter.ts";

function candidate(intent, trackId, options = {}) {
  return {
    intent,
    trackId,
    confidence: options.confidence ?? 0.9,
    lifecycle: options.lifecycle ?? "candidate",
    sourceFrameId: options.sourceFrameId ?? 1,
  };
}

test("point owns a hand instead of an overlapping open palm", () => {
  const result = advanceGestureIntentArbiter({
    previousState: createInitialGestureIntentArbiterState(),
    candidates: [
      candidate("open_palm", "hand-1", { confidence: 0.99 }),
      candidate("point", "hand-1", { confidence: 0.82 }),
    ],
    nowMs: 1_000,
  });

  assert.equal(isGestureIntentSelected(result.snapshot, "point", "hand-1"), true);
  assert.equal(
    isGestureIntentSelected(result.snapshot, "open_palm", "hand-1"),
    false,
  );
  assert.deepEqual(result.snapshot.suppressed, [
    {
      intent: "open_palm",
      trackId: "hand-1",
      reason: "higher_priority_intent",
      winner: "point",
      sourceFrameId: 1,
    },
  ]);
});

test("an active pinch owns its hand through noisy competing poses", () => {
  const result = advanceGestureIntentArbiter({
    previousState: createInitialGestureIntentArbiterState(),
    candidates: [
      candidate("point", "hand-1", { confidence: 0.99 }),
      candidate("wrist_roll", "hand-1", { confidence: 0.98 }),
      candidate("ordinary_pinch", "hand-1", {
        confidence: 0.72,
        lifecycle: "active",
      }),
    ],
    nowMs: 1_000,
  });

  assert.equal(
    isGestureIntentSelected(result.snapshot, "ordinary_pinch", "hand-1"),
    true,
  );
  assert.ok(
    result.snapshot.suppressed.every(
      (item) => item.reason === "active_owner_retained",
    ),
  );
});

test("a wrist roll prevents a new pinch or open palm on the same hand", () => {
  const result = advanceGestureIntentArbiter({
    previousState: createInitialGestureIntentArbiterState(),
    candidates: [
      candidate("ordinary_pinch", "hand-1", { confidence: 0.99 }),
      candidate("open_palm", "hand-1", { confidence: 0.99 }),
      candidate("wrist_roll", "hand-1", {
        confidence: 0.81,
        lifecycle: "active",
      }),
    ],
    nowMs: 1_000,
  });

  assert.equal(
    isGestureIntentSelected(result.snapshot, "wrist_roll", "hand-1"),
    true,
  );
  assert.equal(result.snapshot.suppressed.length, 2);
});

test("different hands can point and control-pinch at the same time", () => {
  const result = advanceGestureIntentArbiter({
    previousState: createInitialGestureIntentArbiterState(),
    candidates: [
      candidate("point", "pointer-hand"),
      candidate("control_pinch", "control-hand"),
    ],
    nowMs: 1_000,
  });

  assert.equal(
    isGestureIntentSelected(result.snapshot, "point", "pointer-hand"),
    true,
  );
  assert.equal(
    isGestureIntentSelected(
      result.snapshot,
      "control_pinch",
      "control-hand",
    ),
    true,
  );
  assert.equal(result.snapshot.suppressed.length, 0);
});

test("a short detection gap leases the prior owner without blocking a stronger intent", () => {
  const acquired = advanceGestureIntentArbiter({
    previousState: createInitialGestureIntentArbiterState(),
    candidates: [candidate("point", "hand-1")],
    nowMs: 1_000,
  });
  const leased = advanceGestureIntentArbiter({
    previousState: acquired.state,
    candidates: [],
    nowMs: 1_000 + gestureIntentArbiterPolicy.ownerLeaseMs - 1,
  });

  assert.equal(
    isGestureIntentSelected(leased.snapshot, "point", "hand-1"),
    true,
  );
  assert.equal(leased.snapshot.selected[0].lifecycle, "leased");

  const replaced = advanceGestureIntentArbiter({
    previousState: acquired.state,
    candidates: [candidate("ordinary_pinch", "hand-1")],
    nowMs: 1_050,
  });
  assert.equal(
    isGestureIntentSelected(
      replaced.snapshot,
      "ordinary_pinch",
      "hand-1",
    ),
    true,
  );
});

test("an owner disappears after its bounded lease expires", () => {
  const acquired = advanceGestureIntentArbiter({
    previousState: createInitialGestureIntentArbiterState(),
    candidates: [candidate("point", "hand-1")],
    nowMs: 1_000,
  });
  const expired = advanceGestureIntentArbiter({
    previousState: acquired.state,
    candidates: [],
    nowMs: 1_001 + gestureIntentArbiterPolicy.ownerLeaseMs,
  });

  assert.deepEqual(expired.snapshot.owners, []);
  assert.deepEqual(expired.snapshot.selected, []);
});

test("camera shutdown owns both participating hands", () => {
  const result = advanceGestureIntentArbiter({
    previousState: createInitialGestureIntentArbiterState(),
    candidates: [
      candidate("open_palm", "hand-1"),
      candidate("open_palm", "hand-2"),
      candidate("camera_shutdown", "hand-1", { lifecycle: "active" }),
      candidate("camera_shutdown", "hand-2", { lifecycle: "active" }),
    ],
    nowMs: 1_000,
  });

  assert.equal(
    isGestureIntentSelected(result.snapshot, "camera_shutdown", "hand-1"),
    true,
  );
  assert.equal(
    isGestureIntentSelected(result.snapshot, "camera_shutdown", "hand-2"),
    true,
  );
});
