// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import type { StrokePoint } from "./gestureCircleSelect";
import {
  getDetachedGesturePointerShadowPosition,
  pointerShadowGeometry,
} from "./overlayGeometry";
import type { ViewportMetrics } from "./overlayGeometry";

/**
 * Where a recorded sample belongs on screen.
 *
 * All that is left of the path arithmetic. There used to be smoothing,
 * trimming, a time window and a fade built from overlapping curves, because the
 * trail was a drawn line; it is now a fluid, which is disturbed at a position
 * and then behaves on its own.
 *
 * That machinery is not missed. Its last act was to take the whole overlay
 * down: the drawn list and the recorded list were deliberately different
 * lengths, one was indexed with the other's index, and reading a property of
 * undefined threw during render -- so React tore out the creature, the panel
 * and the gesture in progress. Less code that only has to answer one question.
 */

export type PlacedPoint = { x: number; y: number; atMs: number };

const puckCentreOffset = {
  x: pointerShadowGeometry.width / 2,
  y: pointerShadowGeometry.height / 2,
};

/**
 * Placed exactly where the blob is placed, through the same function.
 *
 * The creature floats beside the fingertip rather than sitting on it, so a
 * trail measured from the raw pointer ran parallel to the blob instead of out
 * of it, and the two read as separate things.
 */
export function placeStrokePoint(
  point: StrokePoint,
  viewport: ViewportMetrics,
): PlacedPoint {
  const at = getDetachedGesturePointerShadowPosition(point.x, point.y, viewport);

  return {
    x: at.x + puckCentreOffset.x,
    y: at.y + puckCentreOffset.y,
    atMs: point.atMs,
  };
}

/** The smallest box containing a placed path. Null when there is nothing. */
export function trailBounds(
  placed: readonly PlacedPoint[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (placed.length === 0) {
    return null;
  }

  return placed.reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      minY: Math.min(box.minY, point.y),
      maxX: Math.max(box.maxX, point.x),
      maxY: Math.max(box.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}
