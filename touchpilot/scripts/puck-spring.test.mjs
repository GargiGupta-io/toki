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
  const { overshoot, state } = settle({ x: 100, y: 0 });

  // Under-damped on purpose. Damp it enough to remove this and the liveliness
  // goes with it -- the result is the linear slide this replaced.
  assert.ok(overshoot > 5, `expected a visible overshoot, got ${overshoot}`);
  assert.ok(overshoot < 40, `expected a wobble, not a catapult: ${overshoot}`);
  assert.ok(Math.abs(state.position.x - 100) < 1);
});

test("it settles rather than ringing forever", () => {
  // A spring with no rest test keeps changing by fractions of a pixel and pins
  // a repaint every frame for something nobody can see moving.
  const { frames } = settle({ x: 100, y: 0 });
  assert.ok(frames < 200, `took ${frames} frames to settle`);
});

test("it matches the creature on the landing page", () => {
  // Someone who tries the website and then the app should meet the same
  // animal. These are the site's own constants.
  assert.equal(puckSpringPolicy.stiffness, 0.055);
  assert.equal(puckSpringPolicy.damping, 0.82);
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

test("the trail ends at the blob, not at the newest sample", () => {
  // The path records raw positions; the blob lags them because it springs.
  // Ending the line at the sample rather than the blob reopens the gap between
  // them on exactly the fast movement where it is most visible.
  const trail = readFileSync(path.join(desktop, "TokiSelectionTrail.tsx"), "utf8");
  assert.match(trail, /points\[points\.length - 1\] = \{/u);

  const app = readFileSync(path.join(desktop, "App.tsx"), "utf8");
  // One spring, shared. Two components each running their own would drift.
  assert.equal((app.match(/usePuckSpring\(/gu) ?? []).length, 1);
  assert.match(app, /head=\{sprungPointerShadow\}/u);
  assert.match(app, /pointerShadow=\{sprungPointerShadow \?\? pointerShadow\}/u);

  // Whichever pointer is driving, not only the hand. Springing the gesture
  // position alone meant that the moment no hand was tracked -- which is most
  // of the time -- the blob fell back to the raw cursor and the change was
  // invisible.
  assert.match(
    app,
    /usePuckSpring\(\s*\n?\s*gesturePointerShadow \?\? pointerShadow,?\s*\n?\s*\)/u,
  );
});
