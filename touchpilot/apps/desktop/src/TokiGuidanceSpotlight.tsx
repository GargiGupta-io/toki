// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import type { TargetBox } from "@toki/shared";
import type { ViewportMetrics } from "./overlayGeometry";
import "./TokiGuidanceSpotlight.css";

/**
 * Showing somebody where to go, rather than marking where it is.
 *
 * A ring around a control answers "which one" and nothing else. On a dense
 * screen -- a mixer, a timeline, a settings pane with forty rows -- the ring is
 * one more small thing among the small things, and the eye has to find it
 * before it can be told anything. Three additions do the rest of the work:
 *
 *   - Everything except the target dims, so there is one lit thing on screen.
 *   - The blob travels there, so the answer includes the journey and not only
 *     the destination.
 *
 * What it deliberately does not do is write the target's name beside it. The
 * name is already in the notch, and drawn here it landed on top of the blob
 * that had just arrived -- two things saying the same sentence, one of them
 * covering the other.
 *
 * Drawn, never clicked. Toki points; the whole product rests on that, so this
 * layer takes no pointer events and covers a screen it must not interfere with.
 */

export type GuidanceSpotlightTarget = TargetBox & { instruction?: string };

export const spotlightPolicy = Object.freeze({
  /**
   * How dark the rest of the screen goes.
   *
   * Enough to make one thing obviously lit, not so much that the surrounding
   * context -- which is how somebody knows *where* they are being pointed --
   * becomes unreadable. This is guidance laid over the person's own work, not
   * a modal.
   */
  scrimOpacity: 0.44,

  /** Breathing room around the target, so the hole does not clip its edges. */
  paddingPx: 8,

  cornerRadiusPx: 10,

  /**
   * The pointer has to be at least this far away before a line is drawn.
   *
   * A line between two things a few pixels apart is a smudge, and it says
   * nothing anyway: if the pointer is already on the target, the journey is
   * over.
   */
  minimumArrowPx: 70,
});

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * Where the line should stop.
 *
 * At the edge of the target rather than at its middle: a line driven into the
 * centre of a control covers the thing it is pointing at, which is the one part
 * that has to stay legible.
 */
function edgeOfTarget(
  from: { x: number; y: number },
  centre: { x: number; y: number },
  halfWidth: number,
  halfHeight: number,
): { x: number; y: number } {
  const dx = centre.x - from.x;
  const dy = centre.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return centre;
  }

  // How far along the line the target's edge sits, taking whichever axis the
  // ray leaves through first.
  const scaleX = Math.abs(dx) < 0.001 ? Infinity : halfWidth / Math.abs(dx);
  const scaleY = Math.abs(dy) < 0.001 ? Infinity : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: centre.x - dx * scale,
    y: centre.y - dy * scale,
  };
}

export function TokiGuidanceSpotlight({
  target,
  pointer,
  viewport,
}: {
  target: GuidanceSpotlightTarget | null;
  /** Where the person's attention currently is, or null if unknown. */
  pointer: { x: number; y: number } | null;
  viewport: ViewportMetrics;
}) {
  if (target == null || target.width <= 0 || target.height <= 0) {
    return null;
  }

  const { paddingPx, cornerRadiusPx, minimumArrowPx } = spotlightPolicy;

  const hole = {
    x: clamp(target.x - paddingPx, 0, viewport.width),
    y: clamp(target.y - paddingPx, 0, viewport.height),
    width: Math.min(target.width + paddingPx * 2, viewport.width),
    height: Math.min(target.height + paddingPx * 2, viewport.height),
  };
  const centre = {
    x: hole.x + hole.width / 2,
    y: hole.y + hole.height / 2,
  };

  const distance =
    pointer == null ? 0 : Math.hypot(centre.x - pointer.x, centre.y - pointer.y);
  const arrowTo =
    pointer != null && distance >= minimumArrowPx
      ? edgeOfTarget(pointer, centre, hole.width / 2, hole.height / 2)
      : null;

  return (
    <svg
      className="toki-spotlight"
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      width={viewport.width}
      height={viewport.height}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/*
         * A hole, cut rather than drawn.
         *
         * Four rectangles around the target would leave seams at the corners
         * and have to be recomputed against every edge of the screen. A mask
         * is one shape with one piece removed, and it cannot develop a gap.
         */}
        <mask id="toki-spotlight-hole">
          <rect
            x="0"
            y="0"
            width={viewport.width}
            height={viewport.height}
            fill="white"
          />
          <rect
            x={hole.x}
            y={hole.y}
            width={hole.width}
            height={hole.height}
            rx={cornerRadiusPx}
            fill="black"
          />
        </mask>
      </defs>

      <rect
        className="toki-spotlight__scrim"
        x="0"
        y="0"
        width={viewport.width}
        height={viewport.height}
        mask="url(#toki-spotlight-hole)"
      />

      <rect
        className="toki-spotlight__ring"
        x={hole.x}
        y={hole.y}
        width={hole.width}
        height={hole.height}
        rx={cornerRadiusPx}
      />

      {arrowTo != null && pointer != null ? (
        <g className="toki-spotlight__arrow">
          <line x1={pointer.x} y1={pointer.y} x2={arrowTo.x} y2={arrowTo.y} />
          <polygon
            points="0,-6 12,0 0,6"
            transform={`translate(${arrowTo.x} ${arrowTo.y}) rotate(${
              (Math.atan2(arrowTo.y - pointer.y, arrowTo.x - pointer.x) * 180) /
              Math.PI
            })`}
          />
        </g>
      ) : null}
    </svg>
  );
}
