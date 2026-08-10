// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * Laying dye by distance travelled, not by frames elapsed.
 *
 * The trail came out as two different things in one stroke. Where the hand
 * moved quickly it was a clean bright ribbon; where it slowed -- the start, the
 * end, the top of a curve where the wrist turns -- it swelled into a soft blob
 * two or three times as wide. The same gesture, drawn by the same code, looking
 * like two unrelated effects.
 *
 * The cause was a `Math.max(1, ...)` in the splat count. Every frame emitted at
 * least one full splat, whether or not the pointer had moved. Sixty frames a
 * second onto one spot is sixty doses of colour into a patch a few pixels wide,
 * and the fluid does exactly what it is told: it saturates and spreads. Moving
 * fast spread those same doses over a few hundred pixels, which is the ribbon.
 *
 * So the trail was, precisely, a picture of how fast the hand was going -- and
 * a wake should be a picture of *where the hand went*.
 *
 * The fix is to spend colour per pixel of path rather than per frame. Distance
 * accumulates across calls, a splat is emitted every stride, and a frame where
 * nothing moved emits nothing and simply banks the zero. What is left over at
 * the end of one segment carries into the next, so a curve drawn as a hundred
 * tiny segments is dotted at the same spacing as one drawn in three large ones.
 *
 * Kept apart from the simulation itself because that needs a WebGL context, and
 * this is arithmetic -- the part that was wrong, and the part worth checking.
 */

export const fluidTrailSpacingPolicy = Object.freeze({
  /**
   * Pixels of path between one splat and the next.
   *
   * Closer together is fill rate spent on colour landing on top of colour --
   * which is what the old behaviour did accidentally, and what it looked like.
   * Further apart and a fast stroke becomes visibly dotted.
   */
  stridePx: 7,

  /**
   * The most splats one segment may emit.
   *
   * A guard against a single enormous jump -- a display waking, a window
   * moving, a pointer teleporting across two monitors -- turning into thousands
   * of draws in one frame. The trail is a wake, and there is no wake between
   * two points nothing travelled between.
   */
  maximumPerSegment: 48,
});

export type SplatPlan = {
  /**
   * Where along this segment to place each splat, as a fraction from 0 to 1.
   *
   * Empty when the pointer has not yet travelled a full stride, which is the
   * case that used to produce a blob.
   */
  offsets: number[];
  /** Distance banked towards the next splat, to be passed back in. */
  remainder: number;
};

/**
 * Decide where the splats go for one movement of the pointer.
 *
 * `remainder` is whatever came back from the previous call. Callers hold it and
 * hand it straight back; it is the only state, and it is what makes the spacing
 * independent of how the path happens to be chopped into segments.
 */
export function planSplats(
  distance: number,
  remainder: number,
  policy = fluidTrailSpacingPolicy,
): SplatPlan {
  const { stridePx, maximumPerSegment } = policy;

  if (!Number.isFinite(distance) || distance <= 0 || stridePx <= 0) {
    // Nothing travelled. Not a splat, not a partial one -- the accumulated
    // distance is unchanged and the fluid is left to settle.
    return { offsets: [], remainder: Math.max(0, remainder) };
  }

  const banked = Math.max(0, remainder);
  const offsets: number[] = [];

  // How far into this segment the first splat falls: the rest of the stride
  // that the previous movement did not finish.
  let travelled = stridePx - banked;

  while (travelled <= distance && offsets.length < maximumPerSegment) {
    offsets.push(travelled / distance);
    travelled += stridePx;
  }

  return {
    offsets,
    // What is left over, so the next segment starts where this one stopped.
    // Modulo rather than subtraction, so a jump larger than the cap does not
    // bank an enormous debt that silently skips the following segments.
    remainder: (banked + distance) % stridePx,
  };
}
