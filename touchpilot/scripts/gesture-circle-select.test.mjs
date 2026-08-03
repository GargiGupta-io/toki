import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceCircleStroke,
  circleSelectPolicy,
  createCircleStroke,
  strokeBounds,
} from "../apps/desktop/src/gestureCircleSelect.ts";

/**
 * Circling a thing to select it.
 *
 * Detection accumulates turning angle rather than matching a shape, because a
 * hand drawing in the air produces an oval that wobbles and does not close.
 * These tests are about the properties that follow from that choice: direction
 * must not matter, doubling back must cancel rather than accumulate, and a
 * tracking dropout must not be paid out as rotation nobody performed.
 */

const FRAME_MS = 16;

/** Points along an arc, as a hand would produce them frame by frame. */
function arc({
  centre = { x: 500, y: 500 },
  radius = 120,
  fromDegrees = 0,
  degrees = 360,
  steps = 72,
} = {}) {
  const points = [];
  for (let index = 1; index <= steps; index += 1) {
    const at = fromDegrees + (degrees * index) / steps;
    const radians = (at * Math.PI) / 180;
    points.push({
      x: centre.x + radius * Math.cos(radians),
      y: centre.y + radius * Math.sin(radians),
    });
  }
  return points;
}

/** Feed a path in, one frame apart, starting after the settle window. */
function draw(points, { startAtMs = circleSelectPolicy.settleMs + FRAME_MS } = {}) {
  let state = createCircleStroke(0);
  let nowMs = startAtMs;

  for (const point of points) {
    state = advanceCircleStroke({ previous: state, point, nowMs });
    nowMs += FRAME_MS;
  }

  return { state, nowMs };
}

test("two laps complete the selection, and one does not", () => {
  const one = draw(arc({ degrees: 360 }));
  assert.equal(one.state.phase, "drawing", "one lap is a motion people make idly");

  const two = draw(arc({ degrees: 720, steps: 144 }));
  assert.equal(two.state.phase, "complete");
  assert.ok(two.state.progress >= 1);
});

test("direction does not matter", () => {
  const clockwise = draw(arc({ degrees: 720, steps: 144 }));
  const anticlockwise = draw(arc({ degrees: -720, steps: 144 }));

  assert.equal(clockwise.state.phase, "complete");
  assert.equal(anticlockwise.state.phase, "complete");
  // Signed, so the two disagree about direction while agreeing about distance.
  assert.ok(clockwise.state.turnedDegrees > 0);
  assert.ok(anticlockwise.state.turnedDegrees < 0);
});

test("a wobbly oval still counts", () => {
  // Nobody draws a circle in the air. Radius varies, and the loop is not round.
  const points = arc({ degrees: 720, steps: 144 }).map((point, index) => ({
    x: 500 + (point.x - 500) * 1.6 + Math.sin(index) * 6,
    y: 500 + (point.y - 500) * 0.7 + Math.cos(index * 1.3) * 6,
  }));

  assert.equal(draw(points).state.phase, "complete");
});

test("doubling back cancels instead of accumulating", () => {
  // A hand sweeping one way and back has gone nowhere. Summing magnitudes would
  // call that a lap, which is how an idle gesture becomes an accidental select.
  const there = arc({ degrees: 300, steps: 60 });
  const back = arc({ fromDegrees: 300, degrees: -300, steps: 60 });

  const { state } = draw([...there, ...back]);
  assert.equal(state.phase, "drawing");
  assert.ok(
    Math.abs(state.turnedDegrees) < 90,
    `expected roughly no net rotation, got ${state.turnedDegrees}`,
  );
});

test("the untwist does not count towards the first lap", () => {
  // The hand swings through a real arc while the wrist untwists. Counting it
  // would complete the first circle before anything was drawn.
  let state = createCircleStroke(0);
  let nowMs = 0;

  for (const point of arc({ degrees: 350, steps: 12 })) {
    // All inside the settle window.
    state = advanceCircleStroke({ previous: state, point, nowMs });
    nowMs += 8;
  }

  assert.ok(nowMs < circleSelectPolicy.settleMs);
  assert.equal(state.turnedDegrees, 0);
  assert.equal(state.phase, "settling");
});

test("a brief tracking loss is bridged without paying out rotation", () => {
  let state = createCircleStroke(0);
  let nowMs = circleSelectPolicy.settleMs + FRAME_MS;

  for (const point of arc({ degrees: 300, steps: 60 })) {
    state = advanceCircleStroke({ previous: state, point, nowMs });
    nowMs += FRAME_MS;
  }
  const beforeGap = state.turnedDegrees;

  // Hand missing for four frames, then back on the far side of the circle. The
  // angle across the gap is unknown, so it must not be counted as travelled.
  nowMs += circleSelectPolicy.bridgeGapMs + FRAME_MS;
  state = advanceCircleStroke({
    previous: state,
    point: { x: 500 - 120, y: 500 },
    nowMs,
  });

  assert.equal(state.phase, "drawing", "a brief loss must not abandon the stroke");
  assert.equal(
    state.turnedDegrees,
    beforeGap,
    "rotation across an unobserved gap is not rotation the person performed",
  );
});

test("a stroke that never starts is given up on", () => {
  // Armed, then the hand never travels. The arming is spent rather than left
  // waiting forever for a circle that is not coming.
  let state = createCircleStroke(0);
  let nowMs = circleSelectPolicy.settleMs + FRAME_MS;

  while (nowMs < circleSelectPolicy.beginMs + 100) {
    state = advanceCircleStroke({
      previous: state,
      point: { x: 500, y: 500 },
      nowMs,
    });
    nowMs += FRAME_MS;
  }

  assert.equal(state.phase, "abandoned");
});

test("a stroke that stalls midway is given up on sooner", () => {
  let state = createCircleStroke(0);
  let nowMs = circleSelectPolicy.settleMs + FRAME_MS;

  for (const point of arc({ degrees: 200, steps: 40 })) {
    state = advanceCircleStroke({ previous: state, point, nowMs });
    nowMs += FRAME_MS;
  }
  assert.equal(state.phase, "drawing");

  // Hand parked. Holding still is not progress, so the stall clock runs.
  const parked = state.points[state.points.length - 1];
  nowMs += circleSelectPolicy.stallMs + FRAME_MS;
  state = advanceCircleStroke({
    previous: state,
    point: { x: parked.x, y: parked.y },
    nowMs,
  });

  assert.equal(state.phase, "abandoned");
});

test("the stroke starts where the hand settled, not where it armed", () => {
  // Otherwise every circle carries a tail from wherever the twist happened,
  // and the region is stretched towards it.
  let state = createCircleStroke(0);
  let nowMs = circleSelectPolicy.settleMs + FRAME_MS;

  // A long travel from the arming position to the thing being circled.
  for (const x of [100, 200, 300, 400]) {
    state = advanceCircleStroke({ previous: state, point: { x, y: 500 }, nowMs });
    nowMs += FRAME_MS;
  }

  for (const point of arc({ degrees: 720, steps: 144 })) {
    state = advanceCircleStroke({ previous: state, point, nowMs });
    nowMs += FRAME_MS;
  }

  const bounds = strokeBounds(state);
  assert.ok(bounds.x > 300, `region dragged back to the arming point: ${bounds.x}`);
});

test("the bounds are the circled area", () => {
  const { state } = draw(arc({ centre: { x: 400, y: 300 }, radius: 80, degrees: 720, steps: 144 }));
  const bounds = strokeBounds(state);

  // Within a few pixels of the drawn circle, which is what gets cropped and
  // sent. A region that does not match what was drawn is the whole failure.
  assert.ok(Math.abs(bounds.x - 320) < 8, `x was ${bounds.x}`);
  assert.ok(Math.abs(bounds.y - 220) < 8, `y was ${bounds.y}`);
  assert.ok(Math.abs(bounds.width - 160) < 12, `width was ${bounds.width}`);
  assert.ok(Math.abs(bounds.height - 160) < 12, `height was ${bounds.height}`);
});

test("a completed stroke stops advancing", () => {
  const { state, nowMs } = draw(arc({ degrees: 720, steps: 144 }));
  assert.equal(state.phase, "complete");

  const after = advanceCircleStroke({
    previous: state,
    point: { x: 0, y: 0 },
    nowMs: nowMs + FRAME_MS,
  });

  assert.equal(after, state, "the caller reads the region; nothing may move it");
});

// --- Wiring ----------------------------------------------------------------
//
// The wrist roll fires 220ms into the twist, so the twist *is* the lock rather
// than a preamble to one -- there is nowhere inside it to put a circle. Instead
// of rebuilding a working state machine, the point it produces is treated as a
// provisional answer and circling refines it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = readFileSync(
  path.join(here, "..", "apps", "desktop", "src", "gestureRuntime.ts"),
  "utf8",
);

test("a lock arms a circle, and a new lock discards the old one", () => {
  assert.match(runtime, /circleStrokeRef\.current = createCircleStroke\(now\)/u);
  // Half a circle drawn round the previous target says nothing about this one.
  const armed = runtime.slice(
    runtime.indexOf("if (result.lockRequest != null)"),
    runtime.indexOf("if (result.unlockRequest != null)"),
  );
  assert.match(armed, /setRegionLockRequest\(null\)/u);
});

test("not circling costs nothing", () => {
  // Abandonment is the ordinary case: most locks are points and always will
  // be. It must leave the point lock exactly as the wrist roll produced it.
  const abandoned = runtime.slice(
    runtime.indexOf('if (advanced.phase === "abandoned")'),
    runtime.indexOf('} else if (advanced.phase === "complete")'),
  );
  assert.doesNotMatch(abandoned, /setLockRequest|setRegionLockRequest/u);
});

test("the region reports its centre as the point", () => {
  // Every existing check -- screen unchanged, inside the active window, not
  // stale -- is written against a point. A region that could not answer those
  // would need all of them rewritten.
  const complete = runtime.slice(
    runtime.indexOf('} else if (advanced.phase === "complete")'),
    runtime.indexOf("}, [cameraStatus, gesturesEnabled, wristRollPoseClassification]);"),
  );
  assert.match(complete, /x: region\.x \+ region\.width \/ 2/u);
  assert.match(complete, /y: region\.y \+ region\.height \/ 2/u);
});

test("the frame reads its clock once", () => {
  // Two reads let the stroke and the lock disagree about when now was, which
  // surfaces as a stroke timing out a frame early.
  const effect = runtime.slice(
    runtime.indexOf("const now = Date.now();"),
    runtime.indexOf("}, [cameraStatus, gesturesEnabled, wristRollPoseClassification]);"),
  );
  assert.equal((effect.match(/Date\.now\(\)/gu) ?? []).length, 1);
});

// --- The trail -------------------------------------------------------------
//
// Two laps is a long time to spend with no sign that Toki is watching. The
// trail is the only feedback the gesture has: there is no click, no sound, and
// the panel is elsewhere.

const trail = readFileSync(
  path.join(here, "..", "apps", "desktop", "src", "TokiSelectionTrail.tsx"),
  "utf8",
);
const trailCss = readFileSync(
  path.join(here, "..", "apps", "desktop", "src", "TokiSelectionTrail.css"),
  "utf8",
);

test("the trail never intercepts what it is drawn over", () => {
  // It annotates somebody else's screen. A record of a gesture that swallowed
  // clicks would break the application underneath it.
  assert.match(trailCss, /pointer-events: none/u);
});

test("the trail fades along its length rather than as a whole", () => {
  // Drawn per segment: a single path cannot be fainter at the tail than at the
  // head, and without that the trail reads as a shape rather than a direction.
  assert.match(trail, /segments\.map/u);
  assert.match(trail, /opacity: 0\.12 \+ age \* 0\.68/u);
});

test("progress is carried by brightness, not by a number", () => {
  // A count on screen would be read instead of the thing being circled.
  assert.match(trail, /"--trail-progress": stroke\.progress/u);
  assert.match(trailCss, /var\(--trail-progress, 0\)/u);
});

test("completing the circle is visible", () => {
  // The gesture has no other ending. Without this, "two laps was enough" looks
  // exactly like tracking having failed.
  assert.match(trail, /data-complete=\{complete\}/u);
  assert.match(trailCss, /\[data-complete="true"\]/u);
});

test("an abandoned stroke leaves nothing on screen", () => {
  assert.match(trail, /stroke\.phase === "abandoned"/u);
});

test("reduced motion keeps the path and drops the movement", () => {
  // The path is the information; the animation is not.
  const reduced = trailCss.slice(trailCss.indexOf("prefers-reduced-motion"));
  assert.match(reduced, /animation: none/u);
  assert.doesNotMatch(reduced, /display: none|visibility: hidden/u);
});

test("the trail is placed exactly where the blob is placed", () => {
  // The blob does not sit on the fingertip -- it floats beside it by a fixed
  // offset with edge clamping. A trail measured from the raw pointer ran
  // parallel to the blob instead of out of it, so the two read as separate
  // objects and the line appeared to be drawn by nothing.
  assert.match(trail, /getDetachedGesturePointerShadowPosition\(/u);
  assert.match(trail, /puckCentreOffset/u);
});

test("the trail wears the blob's own colour, not one chosen to match", () => {
  // A nearby-but-different blue reads as a second object trailing the first.
  assert.match(trailCss, /var\(--toki-cyan/u);
  assert.doesNotMatch(trailCss, /#7cc6ff|#d8efff/u);
});

test("the blob follows the hand while a circle is being drawn", () => {
  // Otherwise it stays pinned to the locked point for the whole gesture while
  // the trail runs off across the screen.
  const placement = app.slice(
    app.indexOf("const gesturePointerShadow = useMemo("),
    app.indexOf("const gesturePuckPresentation"),
  );
  assert.match(placement, /circleStroke != null/u);
  assert.match(placement, /phase !== "abandoned"/u);
  assert.match(placement, /circling\s*\n?\s*\? \(alwaysOnGestureRuntime\.pointer/u);
});

// --- The region reaching the model -----------------------------------------

const app = readFileSync(
  path.join(here, "..", "apps", "desktop", "src", "App.tsx"),
  "utf8",
);

test("a circled region replaces the box invented around the point", () => {
  // The invented box is a guess about extent. A drawn one is not, and it is the
  // entire reason the gesture exists.
  assert.match(
    app,
    /const displayFocusRegion =\s*\n\s*gesturePointerRegion \?\?/u,
  );
});

test("a circle supersedes the lock rather than annotating it", () => {
  // Everything downstream validates a lock -- screen unchanged, inside the
  // active window. A lock left on the old spot would pass those checks about
  // the wrong place.
  const effect = app.slice(
    app.indexOf("const request = alwaysOnGestureRuntime.regionLockRequest;"),
    app.indexOf("}, [alwaysOnGestureRuntime.regionLockRequest"),
  );
  assert.match(effect, /setGesturePointerLock\(\s*\n?\s*createPointerLockSnapshot/u);
  assert.match(effect, /validation: "checking"/u, "a new lock is unvalidated");
});

test("a circle too small to mean anything is ignored", () => {
  // Cropping to a nervous twitch hands the model a few dozen pixels of nothing.
  assert.match(app, /MINIMUM_CIRCLED_REGION_PX = 48/u);
  assert.match(app, /request\.region\.width >= MINIMUM_CIRCLED_REGION_PX/u);
});

test("releasing a lock releases its region", () => {
  // A region outliving its lock would crop the next explanation to the last
  // thing circled.
  const release = app.slice(
    app.indexOf("function releasePointerLock("),
    app.indexOf("\n  }", app.indexOf("function releasePointerLock(")),
  );
  assert.match(release, /setGesturePointerRegion\(null\)/u);
});

test("nothing draws at the fingertip except Toki's own cursor", () => {
  // The blob is already there. A second marker at the leading end put two
  // things at one fingertip and made the trail look like something else was
  // drawing it.
  assert.doesNotMatch(trail, /<circle/u);
  assert.doesNotMatch(trailCss, /__head/u);
});

test("relaxing the wrist does not throw the lock away", () => {
  // The lock fires while the wrist is twisted; the hand then returns to rest,
  // which drops the rotation past the reset threshold. Diagnostics from a real
  // session show an unlock 0.9s to 1.3s after every lock -- the gesture
  // destroying its own result, since before circling existed.
  const unlock = runtime.slice(
    runtime.indexOf("if (result.unlockRequest != null)"),
    runtime.indexOf("const stroke = circleStrokeRef.current;"),
  );
  assert.notEqual(unlock.length, 0);

  // Guarded on the stroke being live, which is exactly the window in which an
  // untwist is part of the gesture rather than a request to end it.
  assert.match(unlock, /if \(circleStrokeRef\.current == null\) \{/u);
  const guarded = unlock.slice(unlock.indexOf("circleStrokeRef.current == null"));
  assert.match(guarded, /setUnlockRequest\(result\.unlockRequest\)/u);

  // And not by discarding the stroke, which would end the circle the untwist
  // was making room for.
  assert.doesNotMatch(unlock, /circleStrokeRef\.current = null/u);
});
