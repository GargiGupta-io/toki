// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * Selecting a region by circling it in the air.
 *
 * The wrist-roll lock names a point. A point is enough for a button and not
 * enough for a shape: on a diagram, "here" is ambiguous between the muscle, its
 * neighbour, and the boundary. A circle says what was meant, and it lands
 * directly in the focus region the explanation already crops before asking.
 *
 * Detection accumulates **turning angle** rather than matching a shape. Shape
 * matching asks "is this a circle", which has no good answer for a hand drawing
 * in the air: it will be an oval, it will wobble, and it will not close cleanly.
 * Turning angle asks "how far around has this gone", which is answerable every
 * frame, is indifferent to direction and to how round the loop is, and yields a
 * progress value the trail can show. Two laps is 720 degrees.
 *
 * The angle measured is the **heading of the path**, not the bearing from some
 * centre. Using a centre requires knowing where it is, and the centroid of a
 * half-drawn arc sits on the arc rather than inside it -- so the bearing is
 * meaningless for exactly the first lap, which is the part that has to work.
 * How much the direction of travel has turned needs no centre at all, and comes
 * out at 360 degrees per lap around any closed loop, however lopsided.
 *
 * Nothing here draws or knows about the lock machine. It takes points and time
 * and reports how far around they have gone, so it can be tested without a
 * camera, a hand, or a screen.
 */

export type StrokePoint = {
  x: number;
  y: number;
  atMs: number;
};

export type CircleStrokePhase =
  /** Armed, but the untwist is still moving the hand. Nothing counts yet. */
  | "settling"
  /** Ready, waiting for the hand to travel far enough to mean it. */
  | "waiting"
  /** Circling. `turnedDegrees` is climbing. */
  | "drawing"
  /** Two laps reached. The caller reads `bounds` and stops feeding this. */
  | "complete"
  /** Gave up, lost, or stalled. */
  | "abandoned";

export type CircleStrokeState = {
  phase: CircleStrokePhase;
  points: StrokePoint[];
  /** Signed, so circling one way then back cancels rather than accumulating. */
  turnedDegrees: number;
  /** 0 to 1, for the trail to brighten towards the second lap. */
  progress: number;
  armedAtMs: number;
  /** When the hand first travelled far enough to count. */
  startedAtMs: number | null;
  lastProgressAtMs: number;
  /** Direction of travel at the last accepted segment, in degrees. */
  lastHeadingDegrees: number | null;
  /** The last point a heading was taken from, which is not every sample. */
  lastHeadingPoint: StrokePoint | null;
  /** When real curvature began, so the approach is not part of the region. */
  loopStartedAtMs: number | null;
};

export const circleSelectPolicy = Object.freeze({
  /**
   * Two full laps, less what cannot be measured.
   *
   * One lap is a motion people make by accident -- a hand circling while
   * thinking, a wrist returning to rest. Two is deliberate and still quick.
   *
   * Not 720. Turning is the change between one heading and the next, so the
   * first segment of any stroke has nothing to turn from and contributes
   * nothing: a path drawn exactly twice round measures a segment or two short.
   * Demanding the full 720 would mean demanding slightly more than two laps,
   * and a gesture that refuses after you did what you were told is worse than
   * one that fires a few degrees early. Nobody counts the last two degrees.
   */
  requiredDegrees: 700,

  /**
   * Dead time immediately after arming.
   *
   * The hand travels while the wrist untwists, and the fingertip swings through
   * a real arc doing it. Counting that arc would contribute most of a lap for
   * free and complete the first circle early, which reads as Toki firing before
   * the person had drawn anything.
   */
  settleMs: 250,

  /**
   * How long the armed state waits for circling to begin.
   *
   * Longer than the wrist-roll sequence grace, because this is a journey rather
   * than a second pose: arm, relax the wrist, move to the thing, start drawing.
   */
  beginMs: 3_000,

  /**
   * Stall while circling.
   *
   * Shorter than `beginMs`: by this point intent is established, and a
   * half-drawn loop left on screen is worse than one that quietly clears.
   */
  stallMs: 2_000,

  /** Travel needed before a stroke is considered started, in display pixels. */
  startRadiusPx: 24,

  /**
   * How far the hand must travel before a new heading is taken.
   *
   * Heading over a one pixel step is almost entirely tremor, and at sixty
   * frames a second that noise would swamp the real curve. Points closer than
   * this join the path and wait; the heading is measured across the gap once
   * there is enough movement to have a direction.
   */
  minimumSegmentPx: 7,

  /**
   * Rotation needed before the region is considered to have begun.
   *
   * Walking the hand across to the thing is a straight line, which turns
   * nothing -- but it does stretch the bounding box back towards wherever the
   * wrist was twisted. The region is measured from the first real curve.
   */
  loopStartDegrees: 30,

  /**
   * A larger jump than this in one frame is not a hand.
   *
   * It is a tracking glitch or the centroid moving under the stroke, and
   * accumulating it would hand out a lap the person never drew.
   */
  maximumFrameDegrees: 150,

  /**
   * A gap longer than this breaks continuity.
   *
   * The stroke survives -- brief losses are normal -- but the angle across the
   * gap is discarded rather than treated as rotation that happened.
   */
  bridgeGapMs: 200,

  /** How much stroke is kept, which is also how long the trail can be. */
  historyMs: 4_000,
});

export function createCircleStroke(armedAtMs: number): CircleStrokeState {
  return {
    phase: "settling",
    points: [],
    turnedDegrees: 0,
    progress: 0,
    armedAtMs,
    startedAtMs: null,
    lastProgressAtMs: armedAtMs,
    lastHeadingDegrees: null,
    lastHeadingPoint: null,
    loopStartedAtMs: null,
  };
}

/** The smallest box containing the stroke. Null until there is one to bound. */
export function strokeBounds(
  state: CircleStrokeState,
): { x: number; y: number; width: number; height: number } | null {
  // Only the loop, not the walk to it. Reaching across the screen turns
  // nothing, so it never affects the count -- but it would drag the box back
  // towards wherever the wrist was twisted, and the region is supposed to be
  // what was circled.
  const loopStartedAtMs = state.loopStartedAtMs;
  const points =
    loopStartedAtMs == null
      ? state.points
      : state.points.filter((point) => point.atMs >= loopStartedAtMs);

  if (points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The shortest way round, so 350 to 10 is +20 and not -340. */
function shortestAngleDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Advance the stroke by one pointer sample, or by none when tracking is lost.
 *
 * `point` is null on a frame with no hand. That is not an abandonment -- brief
 * losses are ordinary -- but it does break angular continuity, handled through
 * the bridge gap below.
 */
/**
 * The thresholds a stroke is judged by.
 *
 * Widened to `number` deliberately. Frozen object literals infer their literal
 * values, so the inferred type would say `requiredDegrees: 700` -- and then the
 * only policy assignable to it is the one it came from, which defeats the point
 * of passing one in.
 */
export type CircleSelectPolicy = {
  readonly [Key in keyof typeof circleSelectPolicy]: number;
};

export function advanceCircleStroke({
  previous,
  point,
  nowMs,
  /*
   * Which thresholds to judge this stroke by.
   *
   * A hand in the air and a finger on a trackpad are not the same instrument.
   * The hand needs two laps because one is a motion people make by accident
   * while thinking; a trackpad is precise, deliberate, and already gated behind
   * a held key, so demanding two laps of it is just work. Same detector, same
   * geometry -- only the numbers differ.
   */
  policy = circleSelectPolicy,
}: {
  previous: CircleStrokeState;
  point: { x: number; y: number } | null;
  nowMs: number;
  policy?: CircleSelectPolicy;
}): CircleStrokeState {
  if (previous.phase === "complete" || previous.phase === "abandoned") {
    return previous;
  }

  const settled = nowMs - previous.armedAtMs >= policy.settleMs;

  // Time out first, so a stalled stroke is abandoned even on a frame with no
  // hand in it -- which is exactly the frame a stall tends to arrive on.
  const idleFor = nowMs - previous.lastProgressAtMs;
  const limit =
    previous.startedAtMs == null
      ? policy.beginMs
      : policy.stallMs;
  if (idleFor >= limit) {
    return { ...previous, phase: "abandoned" };
  }

  if (point == null) {
    return previous;
  }

  const sample: StrokePoint = { x: point.x, y: point.y, atMs: nowMs };
  const kept = [...previous.points, sample].filter(
    (entry) => nowMs - entry.atMs <= policy.historyMs,
  );

  // The untwist is still swinging the hand. Keep the path so the trail can be
  // drawn from the moment of arming, but let none of it count as rotation.
  if (!settled) {
    return {
      ...previous,
      points: kept,
      lastHeadingDegrees: null,
      lastHeadingPoint: null,
    };
  }

  // Turning is measured from the first sample after settling, not from the
  // moment the stroke is declared started. Waiting costs several segments of
  // real rotation at exactly the point the count begins -- a stroke drawn
  // twice round would measure short of two laps and refuse to complete.
  //
  // `startedAtMs` still exists, but only to choose which timeout applies. The
  // walk to the target is kept out of the *region* by `loopStartedAtMs`, which
  // is a question about extent rather than about rotation.
  const anchor = previous.points[0] ?? sample;
  const started =
    previous.startedAtMs ??
    (distance(anchor, sample) >= policy.startRadiusPx ? nowMs : null);

  const from = previous.lastHeadingPoint ?? anchor;
  // Wait for enough travel to have a direction at all. Heading over a one pixel
  // step is tremor, and sixty of those a second would drown the real curve.
  if (distance(from, sample) < policy.minimumSegmentPx) {
    return { ...previous, points: kept, startedAtMs: started };
  }

  const heading =
    (Math.atan2(sample.y - from.y, sample.x - from.x) * 180) / Math.PI;
  const gapMs = nowMs - from.atMs;

  if (
    previous.lastHeadingDegrees == null ||
    gapMs > policy.bridgeGapMs
  ) {
    // Nothing to measure against: either this is the first segment, or the hand
    // was missing long enough that whatever it did is unknown. Resume from here
    // rather than inventing the turn.
    return {
      ...previous,
      points: kept,
      startedAtMs: started,
      lastHeadingDegrees: heading,
      lastHeadingPoint: sample,
      lastProgressAtMs: nowMs,
    };
  }

  const delta = shortestAngleDelta(previous.lastHeadingDegrees, heading);
  const usable =
    Math.abs(delta) <= policy.maximumFrameDegrees ? delta : 0;
  const turnedDegrees = previous.turnedDegrees + usable;
  const progress = Math.min(
    1,
    Math.abs(turnedDegrees) / policy.requiredDegrees,
  );

  return {
    ...previous,
    phase:
      Math.abs(turnedDegrees) >= policy.requiredDegrees
        ? "complete"
        : started == null
          ? "waiting"
          : "drawing",
    points: kept,
    startedAtMs: started,
    turnedDegrees,
    progress,
    lastHeadingDegrees: heading,
    lastHeadingPoint: sample,
    loopStartedAtMs:
      previous.loopStartedAtMs ??
      (Math.abs(turnedDegrees) >= policy.loopStartDegrees
        ? from.atMs
        : null),
    // Only turning counts as progress. A hand travelling in a dead straight
    // line, or held still, must still be able to stall out.
    lastProgressAtMs: usable === 0 ? previous.lastProgressAtMs : nowMs,
  };
}
