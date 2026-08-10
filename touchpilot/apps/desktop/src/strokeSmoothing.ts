// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * Turning a record of where a hand was into a line worth looking at.
 *
 * The trail used to draw every sample it received, joined by straight segments,
 * each with its own opacity. That draws the *input*: a hand tracked at camera
 * frame rate wobbles by a pixel or two constantly, and every wobble became a
 * visible kink. Against a competitor's clean annotation it read as unfinished,
 * which it was.
 *
 * Three passes fix it, in this order and for different reasons:
 *
 *   1. Simplify -- drop samples that say nothing the line does not already say.
 *      This is what removes jitter, because jitter is by definition a point
 *      that deviates from its neighbours by less than the eye should care about.
 *   2. Smooth -- round off the corners that remain.
 *   3. Curve -- emit one path of cubic segments rather than many line segments.
 *
 * Order matters. Smoothing first would average the noise into the shape and
 * make it permanent; simplifying first throws it away.
 */

export type StrokePoint = { x: number; y: number };

export const smoothingPolicy = Object.freeze({
  /**
   * How far a point may sit from the line between its neighbours before it is
   * considered to be saying something.
   *
   * Measured in overlay pixels against real hand tracking: below about 1.5 the
   * wobble survives, and above about 4 deliberate corners start rounding off.
   */
  simplifyTolerancePx: 2.4,

  /**
   * How many times to round the corners.
   *
   * Each pass replaces every corner with two points a quarter of the way in
   * from it, so the line converges on a curve. Two passes is where it stops
   * looking hand-drawn; more only costs points.
   */
  smoothingPasses: 2,

  /**
   * How much of the distance to a neighbour a control point reaches.
   *
   * The classic Catmull-Rom value. Higher bulges the curve outside the points
   * it is meant to pass through, which on a loop drawn round an object means
   * the line creeping over the thing being circled.
   */
  curveTension: 1 / 6,
});

/**
 * Ramer-Douglas-Peucker.
 *
 * Keeps the two ends and, recursively, whichever point between them sits
 * furthest from the straight line joining them -- provided it sits far enough
 * to matter. Everything else is noise or redundancy.
 */
export function simplifyStroke(
  points: readonly StrokePoint[],
  tolerancePx: number = smoothingPolicy.simplifyTolerancePx,
): StrokePoint[] {
  if (points.length <= 2) {
    return [...points];
  }

  const first = points[0];
  const last = points[points.length - 1];
  let furthestIndex = 0;
  let furthestDistance = -1;

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], first, last);
    if (distance > furthestDistance) {
      furthestDistance = distance;
      furthestIndex = index;
    }
  }

  if (furthestDistance <= tolerancePx) {
    return [first, last];
  }

  const left = simplifyStroke(points.slice(0, furthestIndex + 1), tolerancePx);
  const right = simplifyStroke(points.slice(furthestIndex), tolerancePx);

  // The split point is in both halves; keep it once.
  return [...left.slice(0, -1), ...right];
}

function perpendicularDistance(
  point: StrokePoint,
  from: StrokePoint,
  to: StrokePoint,
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }

  // Where along the segment the closest point lies, clamped so a point beyond
  // either end measures to that end rather than to an imaginary extension.
  const t = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
  );

  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/**
 * Chaikin corner cutting.
 *
 * Both ends are kept exactly where they are. The head of this line is attached
 * to the blob and the tail is where the gesture began; moving either would
 * detach the drawing from the thing that drew it.
 */
export function smoothStroke(
  points: readonly StrokePoint[],
  passes: number = smoothingPolicy.smoothingPasses,
): StrokePoint[] {
  let current = [...points];

  for (let pass = 0; pass < passes; pass += 1) {
    if (current.length < 3) {
      return current;
    }

    const next: StrokePoint[] = [current[0]];

    for (let index = 0; index < current.length - 1; index += 1) {
      const a = current[index];
      const b = current[index + 1];
      next.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
      );
    }

    next.push(current[current.length - 1]);
    current = next;
  }

  return current;
}

/**
 * One `d` string of cubic segments passing through every point.
 *
 * A Catmull-Rom spline converted to beziers, so the curve goes *through* the
 * samples rather than being pulled towards them. On a line drawn around an
 * object that is the difference between circling it and clipping it.
 */
export function toCurvedPathData(
  points: readonly StrokePoint[],
  tension: number = smoothingPolicy.curveTension,
): string {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${round(points[0].x)} ${round(points[0].y)}`;
  }

  if (points.length === 2) {
    return `M ${round(points[0].x)} ${round(points[0].y)} L ${round(points[1].x)} ${round(points[1].y)}`;
  }

  let data = `M ${round(points[0].x)} ${round(points[0].y)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    // The ends have no outer neighbour, so they stand in for their own -- which
    // makes the curve leave and arrive along the line of its first and last
    // segment rather than flicking off in an invented direction.
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] ?? next;

    const control1 = {
      x: current.x + (next.x - previous.x) * tension,
      y: current.y + (next.y - previous.y) * tension,
    };
    const control2 = {
      x: next.x - (after.x - current.x) * tension,
      y: next.y - (after.y - current.y) * tension,
    };

    data += ` C ${round(control1.x)} ${round(control1.y)}, ${round(control2.x)} ${round(control2.y)}, ${round(next.x)} ${round(next.y)}`;
  }

  return data;
}

function round(value: number): number {
  // Two decimals is finer than a retina pixel and keeps the attribute short --
  // this string is rebuilt every frame while somebody is drawing.
  return Math.round(value * 100) / 100;
}

/** Simplify, smooth, curve. The whole pipeline, in the order that matters. */
export function createStrokePathData(
  points: readonly StrokePoint[],
  policy = smoothingPolicy,
): string {
  if (points.length < 2) {
    return "";
  }

  return toCurvedPathData(
    smoothStroke(
      simplifyStroke(points, policy.simplifyTolerancePx),
      policy.smoothingPasses,
    ),
    policy.curveTension,
  );
}

/**
 * Walk the path dropping a point every so many pixels.
 *
 * Spacing by distance rather than by sample. Samples arrive at a fixed rate, so
 * spacing by sample bunches them up when the hand is slow and spreads them out
 * when it is fast -- which thins the trail exactly when there is most movement
 * to show.
 */
export function resampleStroke(
  points: readonly StrokePoint[],
  spacingPx: number,
): { point: StrokePoint; distance: number; total: number }[] {
  if (points.length < 2 || spacingPx <= 0) {
    return [];
  }

  const out: { point: StrokePoint; distance: number; total: number }[] = [];
  let carried = 0;
  let travelled = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);

    if (length === 0) {
      continue;
    }

    let offset = spacingPx - carried;

    while (offset <= length) {
      const t = offset / length;
      out.push({
        point: {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        },
        distance: travelled + offset,
        total: 0,
      });
      offset += spacingPx;
    }

    carried = (carried + length) % spacingPx;
    travelled += length;
  }

  // Filled once the whole length is known, so a caller can say how far along
  // the path each grain sits without measuring it again.
  for (const entry of out) {
    entry.total = travelled;
  }

  return out;
}
