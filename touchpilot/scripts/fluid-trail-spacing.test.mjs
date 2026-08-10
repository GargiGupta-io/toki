import assert from "node:assert/strict";
import test from "node:test";

import {
  fluidTrailSpacingPolicy,
  planSplats,
} from "../apps/desktop/src/fluidTrailSpacing.ts";

/**
 * The trail has to be one thing along its whole length.
 *
 * It was two: a clean ribbon where the hand moved quickly, a soft blob two or
 * three times as wide wherever it slowed -- the start, the end, the top of a
 * curve where the wrist turns. The old code emitted at least one splat per
 * frame regardless of movement, so a stationary pointer received sixty doses of
 * colour a second into one spot, and the stroke ended up a picture of how fast
 * the hand was going rather than of where it went.
 */

const { stridePx, maximumPerSegment } = fluidTrailSpacingPolicy;

test("a pointer that has not moved lays down nothing", () => {
  // The whole bug, in one assertion.
  assert.deepEqual(planSplats(0, 0).offsets, []);
  assert.deepEqual(planSplats(0, 3).offsets, []);
});

test("standing still does not quietly bank distance either", () => {
  assert.equal(planSplats(0, 3).remainder, 3);
});

test("a movement shorter than one stride waits rather than splatting", () => {
  const plan = planSplats(stridePx - 1, 0);

  assert.deepEqual(plan.offsets, []);
  assert.equal(plan.remainder, stridePx - 1);
});

test("many small movements add up to the same spacing as one large one", () => {
  // The same path, sampled two ways. A curve arriving as a hundred tiny steps
  // must be dotted exactly as densely as one arriving as a single sweep.
  let remainder = 0;
  let small = 0;

  for (let step = 0; step < 100; step += 1) {
    const plan = planSplats(2, remainder);
    remainder = plan.remainder;
    small += plan.offsets.length;
  }

  const large = planSplats(200, 0).offsets.length;

  assert.equal(small, large, `${small} splats sampled finely, ${large} coarsely`);
});

test("colour is spent per pixel of path, whatever the speed", () => {
  // Ten frames of a fast hand and fifty of a slow one covering the same ground
  // must cost the same amount of dye. This is the property that makes the
  // trail look the same along its length.
  function splatsFor(frames, perFrame) {
    let remainder = 0;
    let total = 0;

    for (let frame = 0; frame < frames; frame += 1) {
      const plan = planSplats(perFrame, remainder);
      remainder = plan.remainder;
      total += plan.offsets.length;
    }

    return total;
  }

  assert.equal(splatsFor(10, 35), splatsFor(50, 7));
});

test("splats sit at even spacing along the segment", () => {
  const plan = planSplats(stridePx * 4, 0);

  assert.equal(plan.offsets.length, 4);

  for (let index = 0; index < plan.offsets.length; index += 1) {
    const expected = (stridePx * (index + 1)) / (stridePx * 4);
    assert.ok(Math.abs(plan.offsets[index] - expected) < 1e-9);
  }
});

test("every offset lands on the segment", () => {
  for (const distance of [1, 6.5, 7, 50, 999]) {
    for (const remainder of [0, 1, 6.9]) {
      for (const offset of planSplats(distance, remainder).offsets) {
        assert.ok(offset > 0 && offset <= 1, `${offset} for ${distance}`);
      }
    }
  }
});

test("an enormous jump is capped, and does not bank a debt afterwards", () => {
  // A display waking, a window moving, a pointer crossing two monitors. There
  // is no wake between two points nothing travelled between.
  const plan = planSplats(100_000, 0);

  assert.equal(plan.offsets.length, maximumPerSegment);

  // The cap must not leave the accumulator holding thousands of pixels, which
  // would silently swallow every splat in the segments that follow.
  assert.ok(plan.remainder < stridePx);

  const next = planSplats(stridePx * 3, plan.remainder);
  assert.ok(next.offsets.length >= 2, "the next stroke still draws");
});

test("nonsense distances are refused rather than propagated", () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
    const plan = planSplats(bad, 2);

    assert.deepEqual(plan.offsets, []);
    assert.equal(plan.remainder, 2);
  }
});
