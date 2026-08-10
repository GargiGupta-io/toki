// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { useEffect, useRef, useState } from "react";

/**
 * How the blob moves.
 *
 * It used to slide: `transition: left 90ms linear`. A linear ease has no
 * arrival -- it travels at one speed and then stops -- which is why the thing
 * read as a marker being repositioned rather than as something following you.
 *
 * A spring arrives. It accelerates towards where it is going, overshoots a
 * little, and settles, and those three behaviours together are most of what
 * makes a shape look like it has intentions.
 *
 * The shape of the model comes from Toki's own landing page, where the same
 * creature already behaves this way. The numbers do not; see below.
 *
 * Per frame rather than per second, matching the reference. That ties the feel
 * to the frame rate, which is a trade the reference already made.
 */

export const puckSpringPolicy = Object.freeze({
  /**
   * Far stiffer than the landing page's 0.055, because this one is not alone.
   *
   * Measured against a target moving at 600 px/s, a spring at 0.075 sat 37px
   * behind it -- and BlobCursor lerps again on top, so the blob was smoothed
   * twice and visibly trailed the cursor. At 0.40 the same chase settles about
   * 10px behind, which reads as attached.
   */
  stiffness: 0.4,

  /**
   * Velocity kept per frame -- so *lower* is more damped, despite the name.
   *
   * This is the counterweight to the stiffness above, and the two trade off
   * against each other everywhere: anything that closes the gap faster also
   * carries more speed into the target and overshoots further. Measured across
   * a grid, 0.40/0.55 is the corner where the lag is a quarter of what it was
   * and a 300px jump still only overshoots about 13%.
   *
   * The reference pair, 0.055/0.82, sat at 37px of lag and a 21% overshoot --
   * worse on both counts, because it was built to chase a cursor that
   * teleports and then holds still rather than one that moves continuously.
   */
  damping: 0.55,

  /**
   * Below this the spring is considered arrived, in pixels per frame.
   *
   * Without it the position keeps changing by fractions forever, which pins a
   * repaint every frame for something nobody can see moving.
   */
  restVelocity: 0.02,
});

export type SpringPoint = { x: number; y: number };

export type PuckSpringState = {
  position: SpringPoint;
  velocity: SpringPoint;
};

export function createPuckSpring(at: SpringPoint): PuckSpringState {
  return { position: { ...at }, velocity: { x: 0, y: 0 } };
}

/**
 * One frame of spring.
 *
 * Pure, so the feel can be asserted -- that it overshoots, that it settles,
 * that it does not oscillate forever -- without a browser.
 */
export function stepPuckSpring(
  state: PuckSpringState,
  goal: SpringPoint,
): PuckSpringState {
  const { stiffness, damping } = puckSpringPolicy;

  const velocity = {
    x: (state.velocity.x + (goal.x - state.position.x) * stiffness) * damping,
    y: (state.velocity.y + (goal.y - state.position.y) * stiffness) * damping,
  };

  return {
    position: {
      x: state.position.x + velocity.x,
      y: state.position.y + velocity.y,
    },
    velocity,
  };
}

export function puckSpringIsAtRest(
  state: PuckSpringState,
  goal: SpringPoint,
): boolean {
  const { restVelocity } = puckSpringPolicy;
  return (
    Math.abs(state.velocity.x) < restVelocity &&
    Math.abs(state.velocity.y) < restVelocity &&
    Math.abs(goal.x - state.position.x) < restVelocity &&
    Math.abs(goal.y - state.position.y) < restVelocity
  );
}

/**
 * Follow a moving goal, springing.
 *
 * Returns null while there is nothing to follow, so callers can keep their
 * existing "no pointer, draw nothing" branch unchanged.
 *
 * The loop stops once the spring is at rest and restarts when the goal moves,
 * so a still hand costs nothing. An overlay that repaints sixty times a second
 * while nothing happens is a battery complaint waiting to be filed against an
 * app that is supposed to sit there quietly all day.
 */
export function usePuckSpring(
  goal: SpringPoint | null,
  /**
   * Where the spring may not go.
   *
   * Overshoot is the point of a spring and also the one way it can put the
   * blob somewhere the placement code never would -- past the edge of the
   * screen, on a fast movement towards it. The goal is already kept inside the
   * viewport; this keeps the overshoot inside it too.
   */
  bounds?: { maxX: number; maxY: number } | null,
): SpringPoint | null {
  const stateRef = useRef<PuckSpringState | null>(null);
  const goalRef = useRef<SpringPoint | null>(goal);
  const boundsRef = useRef(bounds ?? null);
  const frameRef = useRef<number | null>(null);
  const [position, setPosition] = useState<SpringPoint | null>(null);

  goalRef.current = goal;
  boundsRef.current = bounds ?? null;

  useEffect(() => {
    if (goal == null) {
      // Nothing to follow. Forget where it was, so the next appearance starts
      // there rather than flying in from the last place it was seen.
      stateRef.current = null;
      setPosition(null);
      return;
    }

    if (stateRef.current == null) {
      stateRef.current = createPuckSpring(goal);
      setPosition({ ...goal });
    }

    if (frameRef.current != null) {
      return;
    }

    const run = () => {
      frameRef.current = null;
      const current = stateRef.current;
      const target = goalRef.current;
      if (current == null || target == null) {
        return;
      }

      const next = stepPuckSpring(current, target);
      stateRef.current = next;
      const limits = boundsRef.current;
      setPosition(
        limits == null
          ? { ...next.position }
          : {
              x: Math.min(Math.max(next.position.x, 0), limits.maxX),
              y: Math.min(Math.max(next.position.y, 0), limits.maxY),
            },
      );

      if (!puckSpringIsAtRest(next, target)) {
        frameRef.current = requestAnimationFrame(run);
      }
    };

    frameRef.current = requestAnimationFrame(run);

    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [goal?.x, goal?.y, goal == null]);

  return position;
}
