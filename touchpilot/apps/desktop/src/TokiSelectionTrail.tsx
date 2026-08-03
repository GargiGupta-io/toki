// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import type { CircleStrokeState } from "./gestureCircleSelect";
import { circleSelectPolicy } from "./gestureCircleSelect";
import {
  getDetachedGesturePointerShadowPosition,
  pointerShadowGeometry,
} from "./overlayGeometry";
import type { ViewportMetrics } from "./overlayGeometry";
import "./TokiSelectionTrail.css";

/**
 * The path drawn while circling something.
 *
 * Two laps is a long time to spend with no idea whether Toki is watching. The
 * trail answers three questions continuously: that the gesture was recognised,
 * where the loop has been, and how much of it is left -- the last one by
 * brightening as the second lap closes, so nobody has to count.
 *
 * Only the path. There is no marker at the leading end, because Toki's own
 * cursor is already there: a second dot drawing the line put two things at one
 * fingertip and made the trail look like something else was doing it. The blob
 * draws; this is what it has drawn.
 *
 * Colour, in an interface that is otherwise black and white. That rule governs
 * *chrome*, where monochrome is what lets white mean "live". This is not
 * chrome: it is annotation drawn over somebody else's screen, and it has to
 * stay legible against a photograph, a white document, and a dark editor. A
 * grey line would disappear into two of those three.
 */
/**
 * The placement function returns a box corner; the trail wants its middle.
 */
const puckCentreOffset = {
  x: pointerShadowGeometry.width / 2,
  y: pointerShadowGeometry.height / 2,
};

export function TokiSelectionTrail({
  stroke,
  viewport,
  head,
}: {
  stroke: CircleStrokeState | null;
  viewport: ViewportMetrics;
  /**
   * Where the blob actually is, after its spring.
   *
   * The path is a record of raw sample positions; the blob lags them slightly
   * because it springs. Ending the line at the blob rather than at the newest
   * sample is what keeps the two joined while the hand is moving fast.
   */
  head: { x: number; y: number } | null;
}) {
  if (
    stroke == null ||
    stroke.phase === "abandoned" ||
    stroke.points.length < 2
  ) {
    return null;
  }

  // Placed exactly where the blob is placed, through the same function.
  //
  // The blob does not sit on the fingertip -- it floats beside it, by a fixed
  // offset with edge clamping. A trail measured from the raw pointer therefore
  // ran parallel to the blob rather than out of it, which is what made the two
  // look like separate things.
  const points = stroke.points.map((point) => {
    const placed = getDetachedGesturePointerShadowPosition(
      point.x,
      point.y,
      viewport,
    );
    return {
      x: placed.x + puckCentreOffset.x,
      y: placed.y + puckCentreOffset.y,
    };
  });

  // Drawn as segments rather than one polyline, because a single stroke cannot
  // fade along its length: the tail has to grow fainter than the head, and only
  // per-segment opacity can say that.
  const segments = points.slice(1).map((point, index) => {
    const from = points[index];
    // 0 at the oldest surviving point, 1 at the fingertip.
    const age = (index + 1) / (points.length - 1);
    return {
      key: `${index}`,
      d: `M ${from.x} ${from.y} L ${point.x} ${point.y}`,
      opacity: 0.12 + age * 0.68,
    };
  });

  if (head != null) {
    points[points.length - 1] = {
      x: head.x + puckCentreOffset.x,
      y: head.y + puckCentreOffset.y,
    };
  }

  const complete = stroke.phase === "complete";

  return (
    <svg
      className="toki-selection-trail"
      data-complete={complete}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      width={viewport.width}
      height={viewport.height}
      aria-hidden="true"
      focusable="false"
      style={
        {
          // Brightness carries progress. Two laps is far enough that "am I
          // nearly there" is a real question, and a number on screen would be
          // read instead of the thing being circled.
          "--trail-progress": stroke.progress.toFixed(3),
        } as React.CSSProperties
      }
    >
      {segments.map((segment) => (
        <path
          key={segment.key}
          className="toki-selection-trail__segment"
          d={segment.d}
          opacity={segment.opacity}
        />
      ))}
    </svg>
  );
}

/** Exported for the tests, which assert the trail cannot outlive its policy. */
export const trailHistoryMs = circleSelectPolicy.historyMs;
