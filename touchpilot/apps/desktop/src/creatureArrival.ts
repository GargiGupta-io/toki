// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * "Give me a home."
 *
 * The last line of the introduction is a request, and until now pressing it
 * swapped one card for another. Nothing arrived, nothing moved, and the creature
 * somebody had just chosen a colour for was never seen to take up residence --
 * so the sentence was a caption rather than a thing that happened.
 *
 * What should happen: the creature appears in the middle of the screen, large
 * enough to be unmistakably the thing that was just introduced, and then travels
 * up to the notch and settles there. After that it is simply where it lives.
 *
 * The path is not a straight line and not a curve chosen for prettiness. It is
 * the same spring the creature moves with every other second of its life, given
 * a start and a destination -- because an arrival animated by different rules
 * than the thing it introduces is introducing something that does not exist.
 * The only thing added is scale: it begins oversized and settles to its normal
 * size on the way, which is what makes it read as approaching rather than as
 * sliding.
 */

export type ArrivalPhase =
  /** Nothing to draw. */
  | "idle"
  /** Sitting in the middle, oversized, being looked at. */
  | "appearing"
  /** On its way to the notch. */
  | "travelling"
  /** Arrived. One beat of stillness before the panel moves on. */
  | "settled";

export type ArrivalState = {
  phase: ArrivalPhase;
  /** 0 to 1 along the journey. Drives position and scale together. */
  progress: number;
};

export const idleArrival: ArrivalState = Object.freeze({
  phase: "idle",
  progress: 0,
});

export const arrivalPolicy = Object.freeze({
  /**
   * How long the creature sits in the middle before setting off.
   *
   * Long enough to be seen as having appeared. Travelling immediately reads as
   * something flying past rather than as something arriving, and this is the
   * first time the live creature is ever on screen.
   */
  appearMs: 700,

  /**
   * The journey itself.
   *
   * Slower than the creature's ordinary movement, deliberately. It is crossing
   * most of a display, and matching its usual speed over that distance would be
   * a blur.
   */
  travelMs: 950,

  /**
   * Stillness at the notch before the panel moves on to permissions.
   *
   * Without it the next card appears on the same frame the creature lands, and
   * the arrival is over before it has been understood.
   */
  settleMs: 450,

  /** How much larger it starts. */
  startScale: 2.6,
});

export function arrivalDurationMs(): number {
  return (
    arrivalPolicy.appearMs + arrivalPolicy.travelMs + arrivalPolicy.settleMs
  );
}

/**
 * Where the creature is, given how long it has been arriving.
 *
 * A function of elapsed time rather than a counter advanced per frame, so a
 * dropped frame loses nothing and the arrival always takes exactly as long as
 * it says it does.
 */
export function arrivalAt(elapsedMs: number): ArrivalState {
  if (elapsedMs < 0) {
    return idleArrival;
  }

  if (elapsedMs < arrivalPolicy.appearMs) {
    return { phase: "appearing", progress: 0 };
  }

  const travelled = elapsedMs - arrivalPolicy.appearMs;

  if (travelled < arrivalPolicy.travelMs) {
    return {
      phase: "travelling",
      progress: easeInOut(travelled / arrivalPolicy.travelMs),
    };
  }

  return elapsedMs < arrivalDurationMs()
    ? { phase: "settled", progress: 1 }
    : idleArrival;
}

/**
 * Slow at both ends.
 *
 * A linear journey starts and stops abruptly, which reads as a thing being
 * moved rather than a thing moving. The creature has weight everywhere else it
 * goes; it should have weight here.
 */
function easeInOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));

  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - (-2 * clamped + 2) ** 3 / 2;
}

/**
 * Where on screen the creature should be drawn, and how big.
 *
 * The destination is the notch, which is where the panel hangs from and where
 * the creature lives from then on.
 */
export function arrivalPlacement(
  state: ArrivalState,
  viewport: { width: number; height: number },
  destination: { x: number; y: number },
): { x: number; y: number; scale: number } {
  const from = { x: viewport.width / 2, y: viewport.height / 2 };
  const t = state.phase === "appearing" ? 0 : state.progress;

  return {
    x: from.x + (destination.x - from.x) * t,
    y: from.y + (destination.y - from.y) * t,
    scale: arrivalPolicy.startScale + (1 - arrivalPolicy.startScale) * t,
  };
}
