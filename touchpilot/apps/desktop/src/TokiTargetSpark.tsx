// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { useEffect, useState } from "react";
import "./TokiTargetSpark.css";

/**
 * The burst where the blob lands.
 *
 * Dimming the screen tells somebody where to look, but it arrives everywhere at
 * once and the eye has no reason to travel to the lit part first. A burst has a
 * centre: it starts at a point and moves outward, so it says *here* before it
 * says anything else, and it does it in the way peripheral vision is best at
 * noticing -- sudden radial motion.
 *
 * Drawn once per target, not repeated. A pulse that keeps firing stops being an
 * announcement and becomes decoration, and the screen it is drawn over belongs
 * to somebody who is trying to work.
 */

export const sparkPolicy = Object.freeze({
  /**
   * Rays.
   *
   * Eight reads as a burst from any angle. Four reads as a cross, which points
   * in four particular directions and is wrong for a thing that is simply
   * arriving.
   */
  rayCount: 8,

  /** How far the rays travel from the centre, in overlay pixels. */
  radiusPx: 26,

  /** How long the burst lasts. Long enough to catch, short enough not to nag. */
  durationMs: 420,

  /**
   * The dimming waits for the burst to be seen.
   *
   * Arriving together, the scrim is the larger change and takes the attention;
   * the burst is then something that already happened. This is most of the
   * sequence working.
   */
  scrimDelayMs: 260,
});

export function TokiTargetSpark({
  at,
  /** Changes whenever a new target is announced, restarting the burst. */
  sparkKey,
}: {
  at: { x: number; y: number } | null;
  sparkKey: string | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sparkKey == null || at == null) {
      setVisible(false);
      return;
    }

    setVisible(true);
    // Removed rather than left at zero opacity, so nothing is animating over
    // somebody's screen once the announcement is over.
    const timer = setTimeout(
      () => setVisible(false),
      sparkPolicy.durationMs + 60,
    );
    return () => clearTimeout(timer);
  }, [sparkKey, at?.x, at?.y]);

  if (!visible || at == null) {
    return null;
  }

  const { rayCount, radiusPx } = sparkPolicy;

  return (
    <svg
      className="toki-spark"
      // Keyed so a second target restarts the animation rather than leaving the
      // element mounted and finished.
      key={sparkKey ?? "spark"}
      aria-hidden="true"
      focusable="false"
    >
      {/*
        Position and scale are separate groups on purpose.
        
        With both on one element the burst grows away from where it is supposed
        to be: an SVG element's transform origin defaults to the viewBox corner,
        so scaling drags the whole group across the screen. Rendered, it started
        up and to the left of the target and slid down-right as it expanded.
        The outer group places it; the inner one grows about its own centre.
      */}
      <g transform={`translate(${at.x} ${at.y})`}>
        <g className="toki-spark__burst">
          {Array.from({ length: rayCount }, (_, index) => (
            <line
              key={index}
              className="toki-spark__ray"
              x1="0"
              y1={-radiusPx * 0.42}
              x2="0"
              y2={-radiusPx}
              transform={`rotate(${(360 / rayCount) * index})`}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
