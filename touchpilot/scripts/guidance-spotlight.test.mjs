import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Showing somebody where to go.
 *
 * A ring around a control answers "which one" and stops there. On a dense
 * screen the ring is one more small thing among small things, and the eye has
 * to find it before it can be told anything.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.join(here, "..", "apps", "desktop", "src");
const source = readFileSync(path.join(desktop, "TokiGuidanceSpotlight.tsx"), "utf8");
const css = readFileSync(path.join(desktop, "TokiGuidanceSpotlight.css"), "utf8");
const app = readFileSync(path.join(desktop, "App.tsx"), "utf8");

/**
 * Read a policy number out of the source rather than importing it.
 *
 * Importing the component pulls in its stylesheet, which Node cannot parse.
 * Every other suite here reads source as text for the same reason.
 */
function policyNumber(name) {
  const match = source.match(new RegExp(`${name}: ([0-9.]+)`, "u"));
  assert.notEqual(match, null, `${name} must exist in spotlightPolicy`);
  return Number(match[1]);
}

const spotlightPolicy = {
  scrimOpacity: policyNumber("scrimOpacity"),
  minimumArrowPx: policyNumber("minimumArrowPx"),
};

test("the guidance layer cannot take a click", () => {
  // It covers the whole screen, and Toki's entire claim is that it points
  // without touching. One swallowed click breaks the app underneath and the
  // promise at the same time.
  assert.match(css, /pointer-events: none/u);
});

test("the dim is cut as one shape, not assembled from four", () => {
  // Four rectangles around the target leave seams at the corners and have to
  // be recomputed against every screen edge. A mask cannot develop a gap.
  assert.match(source, /<mask id="toki-spotlight-hole">/u);
  assert.match(source, /mask="url\(#toki-spotlight-hole\)"/u);
});

test("the surroundings dim without becoming unreadable", () => {
  // Knowing *where* you are being pointed depends on the context around it.
  // This is guidance laid over someone's work, not a modal.
  assert.ok(spotlightPolicy.scrimOpacity > 0.25, "too faint to single anything out");
  assert.ok(spotlightPolicy.scrimOpacity < 0.6, "dark enough to hide the context");
});

test("nothing is drawn when there is no target", () => {
  assert.match(source, /if \(target == null \|\| target\.width <= 0/u);
  // And only while guidance has actually been accepted -- a target that has
  // not been agreed to must not dim the screen.
  assert.match(app, /target=\{hasAcceptedGuidance \? activeTarget : null\}/u);
  // The burst is keyed off arrival, which is itself only set while guidance
  // has been accepted -- so neither can appear without an agreed target.
  assert.match(app, /sparkKey=\{arrivedTargetKey\}/u);
  assert.match(
    app,
    /targetArrivalKey =\s*\n?\s*hasAcceptedGuidance && activeTarget != null/u,
  );
});

test("the burst waits for the blob to arrive", () => {
  // It used to fire when the target was accepted, which is when the blob sets
  // off. The spring takes a few hundred milliseconds to cross the screen, so
  // the burst had been and gone before anything landed -- it played at the
  // destination while the eye was still following the blob, and read as
  // nothing happening at all.
  assert.match(app, /remaining <= 6/u);
  // Latched per target, not recomputed from the distance every frame: the
  // blob settles with a small overshoot, and a bare distance test would cross
  // the threshold repeatedly and fire the burst more than once.
  assert.match(app, /arrivedTargetKey === targetArrivalKey/u);
});

test("the line stops at the target's edge, not its middle", () => {
  // Driven into the centre it covers the control it is pointing at, which is
  // the one part that has to stay legible.
  assert.match(source, /function edgeOfTarget\(/u);
  assert.match(source, /const scale = Math\.min\(scaleX, scaleY\)/u);
});

test("no line is drawn when the pointer is already there", () => {
  // A line between two things a few pixels apart is a smudge, and it has
  // nothing to say: the journey is over.
  assert.ok(spotlightPolicy.minimumArrowPx >= 40);
  assert.match(source, /distance >= minimumArrowPx/u);
});

test("the target is not named twice", () => {
  // The name is already in the notch. Drawn here as well it landed on top of
  // the blob that had just arrived: two things saying the same sentence, one
  // of them covering the other.
  assert.doesNotMatch(source, /\{target\.label\}/u);
  assert.doesNotMatch(css, /toki-spotlight__label/u);
});

test("the outline reads as an annotation, not as part of the app", () => {
  // A solid rounded rectangle around a control reads as a focus ring the
  // application drew itself. Dots read as something marked over the top of
  // somebody else's interface, which is what this is.
  const ring = css.slice(css.indexOf(".toki-spotlight__ring {"));
  assert.match(ring, /stroke-linecap: round/u);
  assert.match(ring, /stroke-dasharray: 0\.1 \d/u);
});

test("the arrow reads as a direction, not a connection", () => {
  // A solid line between two points says they are joined. A travelling dash
  // says to go one way along it.
  assert.match(css, /stroke-dasharray/u);
  assert.match(css, /animation: toki-spotlight-flow/u);

  const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
  // The line survives; only its travel stops. The line is the information.
  assert.match(reduced, /animation: none/u);
  assert.doesNotMatch(reduced, /display: none|opacity: 0/u);
});

// --- The step instruction ---------------------------------------------------

const progress = readFileSync(path.join(desktop, "TokiTaskProgress.tsx"), "utf8");
const progressCss = readFileSync(path.join(desktop, "TokiTaskProgress.css"), "utf8");

/**
 * One sentence, not a panel.
 *
 * This carried a title, a status word, a progress bar, "step 1 of 3", a step
 * title, the instruction and a history list -- seven lines over the very
 * application somebody was being guided through, of which one was the
 * instruction.
 */

test("only the instruction is shown", () => {
  assert.match(progress, /\{currentStep\.instruction\}/u);

  // Everything else is answerable elsewhere: the notch panel carries the goal
  // and run state, the spotlight names and rings the control.
  for (const gone of [
    "statusLabels",
    "toki-task-progress__bar",
    "toki-task-progress__history",
    "Step {Math.min",
  ]) {
    assert.ok(!progress.includes(gone), `${gone} should be gone from the overlay`);
  }
});

test("the step number survives for a screen reader", () => {
  // Removed from the screen because it was taking room, not because it is
  // worthless -- somebody who cannot see the spotlight still needs the count.
  assert.match(progress, /aria-label=\{`Step \$\{Math\.min\(/u);
});

test("it is a translucent pill in the blob's colour", () => {
  // What is underneath is the thing being pointed at. An opaque card hides a
  // piece of it and makes the guidance sit on the work rather than in it.
  assert.match(progressCss, /border-radius: 999px/u);
  assert.match(progressCss, /backdrop-filter: blur/u);
  assert.match(progressCss, /background: rgba\(18, 62, 82, 0\.5\)/u);

  // Sized to its text: a short instruction should be a short pill.
  assert.match(progressCss, /width: max-content/u);
});

test("only trouble gets its own colour", () => {
  // Running, planning and complete all mean "carry on", which the presence of
  // an instruction already says. Needing attention changes what to do.
  assert.match(progressCss, /\[data-status="blocked"\],\s*\n\.toki-task-progress\[data-status="error"\]/u);
  assert.doesNotMatch(progressCss, /data-status="active"|data-status="planning"/u);
});

// --- The arrival --------------------------------------------------------------

const spark = readFileSync(path.join(desktop, "TokiTargetSpark.tsx"), "utf8");
const sparkCss = readFileSync(path.join(desktop, "TokiTargetSpark.css"), "utf8");

/**
 * Dimming the screen tells somebody where to look, but it arrives everywhere at
 * once and gives the eye no reason to travel to the lit part first. The blob
 * moving there and bursting on landing has a centre: it says *here* before it
 * says anything else, using the sudden radial motion peripheral vision is best
 * at catching.
 */

test("the blob goes to the target while guidance is showing", () => {
  // Its job in that moment is to indicate a thing, not to mirror a hand -- and
  // a marker still chasing the cursor cannot also be pointing at something.
  assert.match(app, /const guidanceAnchor =/u);
  assert.match(app, /usePuckSpring\(\s*\n?\s*guidanceAnchor \?\? gesturePointerShadow \?\? pointerShadow/u);
});

test("the burst grows from the target, not away from it", () => {
  // An SVG element's transform origin is the viewBox corner by default, so a
  // group carrying both position and scale slides across the screen as it
  // grows. Rendered, it started up-left of the target and drifted down-right.
  assert.match(spark, /<g transform=\{`translate\(\$\{at\.x\} \$\{at\.y\}\)`\}>\s*\n\s*<g className="toki-spark__burst">/u);
  assert.match(sparkCss, /transform-box: fill-box/u);
  assert.match(sparkCss, /transform-origin: center/u);
});

test("the burst happens once per target and then leaves", () => {
  // A pulse that keeps firing stops being an announcement and becomes
  // decoration, on a screen belonging to somebody trying to work.
  assert.match(spark, /setVisible\(false\)/u);
  assert.match(spark, /sparkPolicy\.durationMs \+ 60/u);
  // Keyed, so a second target restarts it rather than leaving a finished
  // element mounted.
  assert.match(spark, /key=\{sparkKey \?\? "spark"\}/u);
});

test("the dimming waits for the burst to land", () => {
  // Arriving together, the scrim is the larger change and takes the attention,
  // leaving the burst as something that already happened.
  assert.match(css, /animation: toki-spotlight-settle 320ms ease-out 260ms both/u);
});

test("the arrow is gone now that the blob travels", () => {
  // Saying it twice -- once by moving, once by drawing a rule across somebody's
  // work -- is worse than saying it once by moving.
  assert.match(app, /pointer=\{null\}/u);
});

test("reduced motion still gets told where to look", () => {
  // The dimming alone arrives everywhere at once. The rays appear at full size
  // and fade rather than flying outward.
  const reduced = sparkCss.slice(sparkCss.indexOf("prefers-reduced-motion"));
  assert.match(reduced, /toki-spark-hold/u);
  assert.doesNotMatch(reduced, /animation: none|display: none/u);
});

test("the burst cannot take a click", () => {
  assert.match(sparkCss, /pointer-events: none/u);
});
