import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPuckSpring,
  puckSpringIsAtRest,
  puckSpringPolicy,
  stepPuckSpring,
} from "../apps/desktop/src/puckSpring.ts";

/**
 * How the blob moves.
 *
 * It used to slide -- `transition: left 90ms linear` -- which travels at one
 * speed and then stops. Nothing that arrives that way looks like it meant to.
 * The overshoot is the whole point, so these tests assert it exists rather than
 * merely that the position converges.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.join(here, "..", "apps", "desktop", "src");

function settle(goal, { from = { x: 0, y: 0 }, limit = 600 } = {}) {
  let state = createPuckSpring(from);
  let overshoot = 0;
  let frames = 0;

  while (!puckSpringIsAtRest(state, goal) && frames < limit) {
    state = stepPuckSpring(state, goal);
    overshoot = Math.max(overshoot, state.position.x - goal.x);
    frames += 1;
  }

  return { state, overshoot, frames };
}

test("the blob overshoots and comes back", () => {
  const { overshoot, state } = settle({ x: 300, y: 0 });

  // Under-damped on purpose: remove the overshoot and the liveliness goes with
  // it, leaving the linear slide this replaced. But a fifth of the distance --
  // what the landing page's constants gave -- flung the blob far enough past
  // its target on a fast movement to look like it was escaping.
  const share = overshoot / 300;
  assert.ok(share > 0.03, `expected a visible overshoot, got ${(share * 100).toFixed(1)}%`);
  assert.ok(share < 0.15, `expected a wobble, not a catapult: ${(share * 100).toFixed(1)}%`);
  assert.ok(Math.abs(state.position.x - 300) < 1);
});

test("the blob keeps up with the pointer", () => {
  // Measured against a target moving at 600 px/s. The spring is not the only
  // smoothing in the path -- BlobCursor lerps again on top -- so a soft spring
  // here reads as the blob trailing the cursor rather than following it.
  let state = createPuckSpring({ x: 0, y: 0 });
  let target = 0;
  for (let frame = 0; frame < 400; frame += 1) {
    target += 10;
    state = stepPuckSpring(state, { x: target, y: 0 });
  }

  const lag = target - state.position.x;
  // Not lower, and deliberately: lag and overshoot trade off against each
  // other at every setting, so buying the last few pixels here costs a jump
  // that catapults. This is a quarter of what it was.
  assert.ok(lag < 12, `${lag.toFixed(1)}px behind the pointer reads as sluggish`);
});

test("it settles rather than ringing forever", () => {
  // A spring with no rest test keeps changing by fractions of a pixel and pins
  // a repaint every frame for something nobody can see moving.
  const { frames } = settle({ x: 100, y: 0 });
  assert.ok(frames < 200, `took ${frames} frames to settle`);
});

test("the overshoot cannot put the blob off the screen", () => {
  // Overshoot is the point of a spring and also the one way it reaches
  // somewhere the placement code never would. The goal is already inside the
  // viewport; the wobble around it has to be too.
  const app = readFileSync(path.join(desktop, "App.tsx"), "utf8");
  assert.match(app, /maxX: Math\.max\(0, viewport\.width - pointerShadowGeometry\.width\)/u);

  const spring = readFileSync(path.join(desktop, "puckSpring.ts"), "utf8");
  assert.match(spring, /Math\.min\(Math\.max\(next\.position\.x, 0\), limits\.maxX\)/u);
});

test("a still hand costs no frames", () => {
  const goal = { x: 40, y: 40 };
  const { state } = settle(goal, { from: goal });
  assert.ok(puckSpringIsAtRest(state, goal));
});

test("nothing else animates the blob's position", () => {
  // A transition on top of a spring re-eases every frame the spring produces,
  // flattening the overshoot back into the slide it replaced.
  const css = readFileSync(path.join(desktop, "BlobPuck.css"), "utf8");
  const start = css.indexOf("transition:");
  const transition = css.slice(start, css.indexOf(";", start));
  assert.doesNotMatch(transition, /\bleft\b|\btop\b/u);
});

test("the wake comes off the blob, not off the newest sample", () => {
  // The samples record raw pointer positions; the blob lags them because it
  // springs. Pushing the fluid only at recorded positions left the wake running
  // beside the creature rather than out of it, on exactly the fast movement
  // where the gap is most visible.
  const trail = readFileSync(path.join(desktop, "TokiSelectionTrail.tsx"), "utf8");
  const fromHead = trail.slice(trail.indexOf("The wake comes off the creature"));
  assert.match(fromHead.slice(0, 900), /trail\.pushSegment\(previous, head\)/u);

  const app = readFileSync(path.join(desktop, "App.tsx"), "utf8");
  // One spring, shared. Two components each running their own would drift.
  assert.equal((app.match(/usePuckSpring\(/gu) ?? []).length, 1);
  assert.match(app, /head=\{sprungPointerShadow\}/u);
  assert.match(app, /pointerShadow=\{sprungPointerShadow \?\? pointerShadow\}/u);

  // Whichever pointer is driving, not only the hand. Springing the gesture
  // position alone meant that the moment no hand was tracked -- which is most
  // of the time -- the blob fell back to the raw cursor and the change was
  // invisible.
  assert.match(app, /usePuckSpring\([\s\S]{0,40}gesturePointerShadow \?\? pointerShadow/u);
});

// --- What the spring cost the existing liquid effect ----------------------

/**
 * BlobCursor has carried a liquid renderer all along: velocity-driven stretch,
 * organic border-radius morphing, a trailing blob offset along the direction of
 * travel. It read as a rigid dot for two reasons that had nothing to do with
 * how much deformation was configured.
 */

test("the blob that deforms is the one you can see", () => {
  // Blobs paint in index order, so the trailing one was drawn over the lead --
  // and stretch, morph and the glint are all weighted towards the lead. The
  // liquid was happening underneath a larger, calmer circle.
  const puck = readFileSync(path.join(desktop, "BlobPuck.tsx"), "utf8");
  const sizes = [...puck.matchAll(/sizes: \[(\d+), (\d+)\]/gu)];
  assert.ok(sizes.length >= 6, "expected a size pair per mode");

  for (const [, lead, trail] of sizes) {
    assert.ok(
      Number(lead) > Number(trail),
      `lead ${lead} must be larger than trail ${trail}`,
    );
  }
});

test("the stretch signal survives the position being pre-smoothed", () => {
  // The divisor was calibrated against a 20Hz staircase from the cursor
  // sampler, where the lerp's catch-up peaked near twice the true speed. The
  // spring removed the staircase; 16 would have left the stretch permanently
  // near zero.
  const cursor = readFileSync(path.join(desktop, "BlobCursor.tsx"), "utf8");
  assert.match(cursor, /frame\.previousY\) \/ 9, 1\)/u);

  // The trail-direction gate was sized for the same staircase: at 1.25px it
  // went stale below roughly 75 px/s, pointing the wrong way during slow
  // deliberate movement.
  assert.match(cursor, /if \(distance > 0\.4\) \{/u);
});

// --- One creature, not two circles ------------------------------------------

/**
 * Toki's blob renderer is a fork of ReactBits' BlobCursor, whose whole effect
 * is a gooey SVG filter merging several lagging discs into one organic shape.
 * The fork had switched off or flattened every part of that: the filter was
 * disabled, and the lag between lead and trail had drifted from the reference's
 * 5:1 to about 1.1:1, so the two lobes moved as a rigid pair with nothing for a
 * merge to shape.
 */

test("the gooey merge is on", () => {
  const puck = readFileSync(path.join(desktop, "BlobPuck.tsx"), "utf8");
  assert.doesNotMatch(puck, /useFilter=\{false\}/u);
  assert.match(puck, /useFilter=\{true\}/u);
});

test("the blur is sized to the blob, not left at the reference's value", () => {
  // The filter's alpha row is "0 0 0 35 -10", so anything whose blurred alpha
  // falls below 10/35 is erased. The reference blurs by 30 because its discs
  // are 60-125px; at Toki's 14-22px the same sigma deletes the trailing blob
  // outright and leaves the lead barely present.
  const puck = readFileSync(path.join(desktop, "BlobPuck.tsx"), "utf8");
  const sigmas = [...puck.matchAll(/filterStdDeviation=\{(\d+)\}/gu)].map((m) =>
    Number(m[1]),
  );
  assert.ok(sigmas.length >= 1, "expected the filter to be configured");

  const largest = Math.max(
    ...[...puck.matchAll(/sizes: \[(\d+), (\d+)\]/gu)].flatMap((m) => [
      Number(m[1]),
      Number(m[2]),
    ]),
  );

  for (const sigma of sigmas) {
    // Peak blurred alpha of a disc is 1 - exp(-r^2 / 2*sigma^2). Keeping sigma
    // under about a third of the largest blob holds every lobe well clear of
    // the threshold.
    assert.ok(
      sigma <= largest / 3,
      `sigma ${sigma} is too wide for a ${largest}px blob; the small lobe disappears`,
    );
  }
});

test("the lead and the trail actually separate", () => {
  // Separation is what the merge shapes into a droplet. Without it the filter
  // has two concentric discs to work with and returns a circle -- which is the
  // complaint it was meant to fix.
  const puck = readFileSync(path.join(desktop, "BlobPuck.tsx"), "utf8");
  const pairs = [
    ...puck.matchAll(/fastDuration: ([0-9.]+),\s*\n\s*slowDuration: ([0-9.]+),/gu),
  ];
  assert.ok(pairs.length >= 6, "expected a timing pair per mode");

  // Bounded at both ends, because both ends fail.
  //
  // Too little and the lobes travel as a rigid pair, so the merge has two
  // concentric discs to work with and returns a circle. Too much and they pull
  // further apart than the blur can bridge, and it returns two circles -- which
  // is worse, because it happens exactly while the pointer is moving.
  //
  // Rendered at Toki's sizes with sigma 5, the join holds to about 20px of
  // separation and looks best near 16. This band keeps the worst case -- the
  // slowest mode at 600 px/s -- inside that.
  for (const [, fast, slow] of pairs) {
    const ratio = Number(slow) / Number(fast);
    assert.ok(
      ratio >= 1.7,
      `lead ${fast} vs trail ${slow} is only ${ratio.toFixed(1)}x -- they move as one`,
    );
    assert.ok(
      ratio <= 2.2,
      `lead ${fast} vs trail ${slow} is ${ratio.toFixed(1)}x -- they outrun the merge`,
    );
  }
});
