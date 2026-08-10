// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * Standing beside the thing, rather than on top of it.
 *
 * The blob used to travel to the centre of the target and stop there. On a
 * button that is forty pixels wide it therefore covered the button completely:
 * Toki said "click this" and then hid the thing it meant, so the one question
 * left -- *which* pixel do I click -- was the one question the answer obscured.
 *
 * It sits outside the box now, in the gap next to it, with the box left clear.
 *
 * Which side is not a fixed choice. A control against the left edge of the
 * screen has no room on its left, and a blob clamped into the last few pixels
 * reads as being stuck rather than as pointing. Every side is measured and the
 * first one that genuinely fits wins.
 *
 * The order is left, right, above, below. Left first because a control's label
 * usually runs to its right -- a row in a list, a menu item, a labelled field --
 * so the left gutter is the side most likely to be empty, and putting the marker
 * in the empty side is the whole point.
 */

export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnchorSide = "left" | "right" | "above" | "below" | "inside";

export type AnchorPlacement = {
  /** Top-left of the blob, in display pixels. */
  x: number;
  y: number;
  side: AnchorSide;
};

export const anchorPlacementPolicy = Object.freeze({
  /**
   * Clear air between the blob and the edge of the box.
   *
   * Enough that the two read as two things -- a marker beside a region -- and
   * not so much that it becomes ambiguous which of several nearby controls is
   * being pointed at. It is measured from the drawn box, which is already
   * padded out from the control itself.
   */
  gapPx: 16,

  /** How close to the edge of the screen the blob may sit. */
  edgeMarginPx: 10,

  /**
   * When nothing fits, how far inside the box to sit.
   *
   * A target that fills the display -- a whole document, a full-screen video --
   * leaves no outside to stand in. Rather than clamping into a corner of the
   * screen, which points at nothing, the blob tucks just inside the box's
   * leading edge: still not over the middle, still clearly attached to the
   * region.
   */
  insetPx: 12,
});

function clamp(value: number, low: number, high: number): number {
  // A viewport smaller than the blob makes low exceed high, and Math.min then
  // wins over Math.max and returns something outside both. Order matters.
  return Math.max(low, Math.min(value, high));
}

/**
 * Where the blob should wait while this target is on screen.
 *
 * Returns the top-left corner, plus which side it chose -- the caller wants
 * that for the diagnostics record, and a test wants it to assert intent rather
 * than arithmetic.
 */
export function placeGuidanceAnchor(
  target: AnchorRect,
  blob: { width: number; height: number },
  viewport: { width: number; height: number },
  policy = anchorPlacementPolicy,
): AnchorPlacement {
  const { gapPx, edgeMarginPx, insetPx } = policy;

  const minX = edgeMarginPx;
  const maxX = Math.max(edgeMarginPx, viewport.width - blob.width - edgeMarginPx);
  const minY = edgeMarginPx;
  const maxY = Math.max(edgeMarginPx, viewport.height - blob.height - edgeMarginPx);

  // Centred on the target along the axis it is not offset on, so the blob reads
  // as belonging to that row or that column.
  const centredY = clamp(
    target.y + target.height / 2 - blob.height / 2,
    minY,
    maxY,
  );
  const centredX = clamp(
    target.x + target.width / 2 - blob.width / 2,
    minX,
    maxX,
  );

  const left = target.x - gapPx - blob.width;
  const right = target.x + target.width + gapPx;
  const above = target.y - gapPx - blob.height;
  const below = target.y + target.height + gapPx;

  if (left >= minX) {
    return { x: left, y: centredY, side: "left" };
  }

  if (right <= maxX) {
    return { x: right, y: centredY, side: "right" };
  }

  if (above >= minY) {
    return { x: centredX, y: above, side: "above" };
  }

  if (below <= maxY) {
    return { x: centredX, y: below, side: "below" };
  }

  // Nowhere outside it to stand. Tuck inside the leading edge rather than over
  // the middle, so whatever the box contains stays as readable as it can be.
  return {
    x: clamp(target.x + insetPx, minX, maxX),
    y: clamp(target.y + insetPx, minY, maxY),
    side: "inside",
  };
}
