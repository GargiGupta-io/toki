import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceCircleStroke,
  circleSelectPolicy,
  createCircleStroke,
  strokeBounds,
} from "../apps/desktop/src/gestureCircleSelect.ts";
import {
  placeStrokePoint,
  trailBounds,
} from "../apps/desktop/src/selectionTrailPath.ts";
import { fluidTrailPolicy } from "../apps/desktop/src/fluidTrail.ts";

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

// The component and the geometry it draws, read as one thing. The arithmetic
// moved into its own module after a length mismatch between the drawn points
// and the recorded ones threw during render and tore down the whole overlay --
// a component that imports a stylesheet cannot be tested without a browser, and
// that bug deserved a test that runs.
const trailViewport = { width: 1440, height: 900, scaleFactor: 2 };

/** A loop sampled at the rate the cursor actually is: every 50ms. */
function trailLoop({ degrees = 200, radius = 60, nowMs = 100_000 } = {}) {
  const steps = Math.round(degrees / 10);

  return Array.from({ length: steps }, (_, i) => {
    const angle = ((degrees / steps) * i * Math.PI) / 180;
    return {
      x: 700 + Math.cos(angle) * radius,
      y: 400 + Math.sin(angle) * radius,
      atMs: nowMs - (steps - i) * 50,
    };
  });
}

const trail = [
  readFileSync(
    path.join(here, "..", "apps", "desktop", "src", "TokiSelectionTrail.tsx"),
    "utf8",
  ),
  readFileSync(
    path.join(here, "..", "apps", "desktop", "src", "selectionTrailPath.ts"),
    "utf8",
  ),
].join("\n");
const trailCss = readFileSync(
  path.join(here, "..", "apps", "desktop", "src", "TokiSelectionTrail.css"),
  "utf8",
);





test("the trail is a fluid being disturbed, not a shape being drawn", () => {
  // Four attempts drew a path -- sample, smooth, stroke, fade -- and every one
  // read as an object being dragged, because that is what it was. Smoothing it
  // more only changed how the object looked.
  //
  // Nothing is stroked now. Colour and momentum go into a fluid where the
  // pointer went, and the fluid behaves; the curl and the settling are not
  // animated, they fall out of the simulation.
  assert.doesNotMatch(trail, /createStrokePathData/u);
  assert.doesNotMatch(trail, /toki-selection-trail__segment/u);
  assert.match(trail, /createFluidTrail/u);
});

test("the fluid is focused, not a splash", () => {
  // The reference throws paint across the screen. Over somebody's actual work
  // that obscures what they are doing and reads as decoration, so every number
  // is turned towards a tight ribbon that dies quickly.
  assert.ok(fluidTrailPolicy.splatRadius <= 0.08, "a ribbon, not a cloud");
  assert.ok(fluidTrailPolicy.splatForce <= 2_500, "pushed, not thrown");
  assert.ok(fluidTrailPolicy.curl <= 2, "alive, but it does not wander");
  // Fast enough that it is gone soon after it has been read. The exact rate
  // was measured against a real loop rather than guessed: see the table in
  // fluidTrailPolicy. Too slow and the dye accumulates until alpha saturates,
  // at which point the ribbon stops being fluid and becomes a shape again --
  // which is the failure this whole approach replaced.
  assert.ok(fluidTrailPolicy.densityDissipation >= 2, "it does not linger");
});

test("the simulation stops when the fluid has settled", () => {
  // Toki is open all day. A full-screen simulation stepping in the background
  // would spend battery drawing nothing.
  assert.match(trail, /if \(trail\.frame\(nowMs\)\)/u);
  assert.match(trail, /runningRef\.current = false/u);
  const fluid = readFileSync(
    path.join(here, "..", "apps", "desktop", "src", "fluidTrail.ts"),
    "utf8",
  );
  assert.match(fluid, /nowMs - lastPushMs < fluidTrailPolicy\.settleMs/u);
  // Long enough for the colour to actually vanish before the canvas is
  // cleared, and no longer -- see the fade arithmetic in fluidTrailPolicy.
  assert.ok(fluidTrailPolicy.settleMs <= 4_000);
});

test("the wake comes off the creature, not off the raw sample", () => {
  // The blob lags the pointer on purpose -- it is on a spring -- so pushing at
  // recorded positions left the fluid running beside it rather than out of it.
  //
  // Anchored on the call rather than on the comment above it. This used to find
  // its way to the assertion by searching for a sentence in a comment, so
  // rewording the comment failed the test while the behaviour was untouched.
  const feeds = trail.match(/trail\.pushSegment\(/gu) ?? [];

  assert.equal(feeds.length, 1, "one source, or the two fight over the path");
  assert.match(trail, /trail\.pushSegment\(previous, head\)/u);
});

test("the trail is placed exactly where the blob is placed", () => {
  // The creature floats beside the fingertip rather than sitting on it, so a
  // trail measured from the raw pointer ran parallel to the blob instead of
  // out of it, and the two read as separate things.
  const placed = placeStrokePoint({ x: 700, y: 400, atMs: 0 }, trailViewport);

  assert.ok(Number.isFinite(placed.x) && Number.isFinite(placed.y));
  assert.match(trail, /placeStrokePoint/u);
  assert.match(
    readFileSync(
      path.join(here, "..", "apps", "desktop", "src", "selectionTrailPath.ts"),
      "utf8",
    ),
    /getDetachedGesturePointerShadowPosition/u,
  );
});

test("the region is still measured from what was circled", () => {
  // The box is not decoration. It is Toki stating which region it took, so it
  // has to be exactly what was taken.
  const placed = trailLoop({ degrees: 360 }).map((point) =>
    placeStrokePoint(point, trailViewport),
  );
  const bounds = trailBounds(placed);

  for (const point of placed) {
    assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX);
    assert.ok(point.y >= bounds.minY && point.y <= bounds.maxY);
  }

  assert.equal(trailBounds([]), null);
});

test("the trail never intercepts what it is drawn over", () => {
  // It annotates somebody else's screen. A record of a gesture that swallowed
  // clicks would break the application underneath it.
  assert.match(trailCss, /pointer-events: none/u);
});




test("progress is carried by the overlay, not by a number", () => {
  // A count on screen gets read instead of the thing being circled. The fluid
  // carries it inherently: more of the loop drawn is more dye pushed in, so it
  // brightens towards completion without anybody counting.
  //
  // This used to be a CSS variable driving opacity, which a stroked path needed
  // because a drawn line has one fixed brightness. A simulation does not.
  assert.doesNotMatch(trail, /toki-selection-trail__count|<text/u);
  assert.match(trail, /trail\.pushSegment\(/u);
});

test("completing the circle is visible", () => {
  // One lap is still long enough to wonder whether anything is happening. The
  // region appears only once the loop has actually closed, so its arrival is
  // the answer.
  assert.match(trail, /stroke\?\.phase === "complete"/u);
  assert.match(trail, /toki-selection-trail__region/u);
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
  // The blob is already there, and a second distinct marker at the leading end
  // put two things at one fingertip -- it made the trail look like something
  // else was drawing it.
  //
  // The grains are not that. They are all the same kind of mark, differing only
  // in how faded they are, so the newest is the near end of a trail rather than
  // a marker of its own. What must not come back is a dedicated head element.
  assert.doesNotMatch(trailCss, /__head/u);
  assert.doesNotMatch(trail, /__head/u);
  assert.doesNotMatch(trail, /<circle/u);
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

test("a finished loop resolves into the region Toki actually locked", () => {
  // The box is the claim about what was selected, so it is measured from the
  // circled points rather than from wherever the fluid happened to spread.
  assert.match(trail, /trailBounds\(stroke\.points\.map/u);
});

























test("a failure does not pin the click-taking bar across the screen", () => {
  // Any status at all keeps the top bar on screen, and that bar deliberately
  // takes clicks -- it exists to be clicked to open the panel. So an error that
  // never cleared left a click-eating strip over exactly where browser tabs and
  // menu bars live, until something else happened to replace it.
  //
  // It read as the overlay being broken. Nothing was wrong with the overlay:
  // the bar was still there, reporting something already read.
  const app = readFileSync(
    path.join(here, "..", "apps", "desktop", "src", "App.tsx"),
    "utf8",
  );

  assert.match(app, /GUIDANCE_FAILURE_VISIBLE_MS/u);
  assert.match(app, /failureShownAt == null \? null : rawGuidanceFailure/u);

  const window = Number(
    /const GUIDANCE_FAILURE_VISIBLE_MS = ([\d_]+)/u.exec(app)[1].replace(/_/gu, ""),
  );
  assert.ok(window >= 4_000, "long enough to read a sentence");
  assert.ok(window <= 20_000, "not the rest of the day");
});
