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
 * makes a shape look like it has intentions. The constants are the ones from
 * Toki's own landing page, where the same creature already behaves this way:
 * stiffness 0.055, damping 0.82. Under-damped on purpose -- damp it enough to
 * kill the overshoot and the liveliness goes with it.
 *
 * Per frame rather than per second, matching the reference. That ties the feel
 * to the frame rate, which is the trade the reference already made and which
 * matters less than the two implementations agreeing: a person who tries the
 * website and then the app should meet the same creature.
 */

export const puckSpringPolicy = Object.freeze({
  stiffness: 0.055,
  damping: 0.82,
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
export function usePuckSpring(goal: SpringPoint | null): SpringPoint | null {
  const stateRef = useRef<PuckSpringState | null>(null);
  const goalRef = useRef<SpringPoint | null>(goal);
  const frameRef = useRef<number | null>(null);
  const [position, setPosition] = useState<SpringPoint | null>(null);

  goalRef.current = goal;

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
      setPosition({ ...next.position });

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
