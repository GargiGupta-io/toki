// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import {
  advanceCircleStroke,
  circleSelectPolicy,
  createCircleStroke,
  strokeBounds,
  type CircleSelectPolicy,
  type CircleStrokeState,
} from "./gestureCircleSelect";

/**
 * Circling something with the trackpad, while the talk key is held.
 *
 * Toki's premise is that you point with your hand, and that premise is worth
 * keeping -- but a hand needs a camera, decent light, and a gesture you have
 * been taught. On a first run none of those are reliable, and a person whose
 * first three attempts fail does not get to a fourth.
 *
 * So the same selection is available from the thing every laptop already has.
 * Hold the key you already hold to talk, draw a loop around something with the
 * trackpad, and say what you want. The words and the region arrive together,
 * which is a better sentence than either alone: "what is this?" means nothing
 * without the circle, and the circle means nothing without the question.
 *
 * The detector is the one the hand uses, unchanged. It takes points and has no
 * opinion about what moved them.
 */

/**
 * The same geometry, judged by different numbers.
 *
 * A trackpad is precise, deliberate, and already behind a held key, so the
 * accidental-motion problem the hand has does not exist here. Asking for two
 * laps of it would be asking somebody to do a thing twice for no reason.
 */
export const pointerCircleSelectPolicy: CircleSelectPolicy = Object.freeze({
  ...circleSelectPolicy,

  /**
   * One circle.
   *
   * Not 360, and the difference is the point. Turning is measured *between*
   * headings, so the first segment of any stroke has nothing to turn from and
   * contributes nothing: a loop drawn exactly once round measures a few degrees
   * short of a full turn. Demanding a literal 360 means demanding slightly more
   * than a circle, and refusing at the moment somebody has done what they were
   * told is worse than firing a couple of degrees early.
   *
   * This was two laps, which was compensating for a gesture that could start by
   * accident. It cannot now: it is behind two held keys.
   */
  requiredDegrees: 340,

  /**
   * No settling time.
   *
   * The hand needs it because the wrist untwists through a real arc on the way
   * out of the arming pose. Pressing a key moves nothing, so there is no
   * spurious motion to discard, and a dead quarter second at the start of a
   * deliberate gesture just loses the beginning of the loop.
   */
  settleMs: 0,

  /**
   * Smaller steps count.
   *
   * Seven pixels is a threshold for camera tremor. A trackpad has none, and
   * circling something small -- a toolbar icon, a single row -- produces short
   * segments that would otherwise never register a heading.
   */
  minimumSegmentPx: 3,

  /**
   * Less travel needed before the stroke counts as started.
   *
   * Same reason: the loop somebody draws around a 40px icon is small, and a
   * 24px arming radius would swallow most of it.
   */
  startRadiusPx: 12,
});

/**
 * Which instrument is drawing circles right now.
 *
 * One at a time. Both live would mean two loops on screen and two regions
 * arriving for one intent, with no sensible way to choose between them after
 * the fact.
 *
 * Decided by **how the gesture was started**, not by whether a camera happens
 * to be running. That was the old rule and it was wrong in the one way that
 * mattered: holding the keys on a machine with a working camera armed the hand
 * detector, which needs its own arming pose, so the trackpad loop never began
 * at all. Drawing a careful circle and watching nothing happen is what that
 * produced, and it looked like the feature being broken rather than like the
 * wrong instrument having been chosen.
 *
 * Holding two keys and moving the trackpad is unambiguous about which one was
 * meant.
 */
export type CircleInputSource = "hand" | "pointer";

export function selectCircleInput(
  startedBy: "keyboard" | "gesture",
): CircleInputSource {
  return startedBy === "gesture" ? "hand" : "pointer";
}

export type PointerCircleState = {
  /** Whether the talk key is currently down. */
  armed: boolean;
  stroke: CircleStrokeState | null;
  /** Set once, on the frame the loop closes. */
  region: { x: number; y: number; width: number; height: number } | null;
};

export const idlePointerCircle: PointerCircleState = Object.freeze({
  armed: false,
  stroke: null,
  region: null,
});

export function armPointerCircle(nowMs: number): PointerCircleState {
  return { armed: true, stroke: createCircleStroke(nowMs), region: null };
}

/**
 * Feed one cursor position in.
 *
 * Returns the state unchanged when nothing is armed, so the ordinary case --
 * somebody holding the key to talk and not moving the trackpad at all -- costs
 * a comparison and allocates nothing.
 */
export function advancePointerCircle(
  state: PointerCircleState,
  point: { x: number; y: number } | null,
  nowMs: number,
  policy: CircleSelectPolicy = pointerCircleSelectPolicy,
): PointerCircleState {
  if (!state.armed || state.stroke == null) {
    return state;
  }

  const stroke = advanceCircleStroke({
    previous: state.stroke,
    point,
    nowMs,
    policy,
  });

  if (stroke === state.stroke) {
    return state;
  }

  if (stroke.phase === "complete") {
    const bounds = strokeBounds(stroke);

    return {
      armed: state.armed,
      stroke,
      // Null when the loop somehow bounded nothing. A region of no size would
      // be sent on as a target and be pointed at, which is worse than a
      // gesture that quietly did not take.
      region:
        bounds != null && bounds.width > 0 && bounds.height > 0 ? bounds : null,
    };
  }

  return { armed: state.armed, stroke, region: null };
}

/**
 * The key came up.
 *
 * A loop still being drawn is dropped rather than completed. Letting go is how
 * somebody says "that is what I meant" about the *words*; treating it as
 * agreement about a half-drawn shape would select whatever the cursor happened
 * to have gone round.
 */
export function disarmPointerCircle(): PointerCircleState {
  return idlePointerCircle;
}

/** Whether the trail should draw this stroke. */
export function shouldDrawPointerStroke(state: PointerCircleState): boolean {
  return (
    state.stroke != null &&
    state.stroke.phase !== "abandoned" &&
    state.stroke.points.length > 1
  );
}
