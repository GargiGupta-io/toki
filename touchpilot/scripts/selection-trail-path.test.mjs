import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  placeStrokePoint,
  trailBounds,
} from "../apps/desktop/src/selectionTrailPath.ts";
import { fluidTrailPolicy } from "../apps/desktop/src/fluidTrail.ts";

/*
 * What is left of the trail's geometry.
 *
 * There used to be smoothing, trimming, a time window and a fade built from
 * overlapping curves, because the trail was a drawn line. It is now a fluid:
 * disturbed at a position, and then behaving on its own.
 *
 * That machinery is not missed. Its last act was to take the whole overlay
 * down -- the drawn list and the recorded list were deliberately different
 * lengths, one was indexed with the other's index, and reading a property of
 * undefined threw during render, so React tore out the creature, the panel and
 * the gesture in progress.
 */

const viewport = { width: 1440, height: 900, scaleFactor: 2 };

function loop({ degrees = 200, radius = 60, nowMs = 100_000 } = {}) {
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

test("a sample is placed where the blob would be, not where the cursor is", () => {
  // The creature floats beside the fingertip rather than sitting on it, so a
  // trail measured from the raw pointer ran parallel to the blob instead of
  // out of it, and the two read as separate things.
  const placed = placeStrokePoint({ x: 700, y: 400, atMs: 5 }, viewport);

  assert.ok(Number.isFinite(placed.x) && Number.isFinite(placed.y));
  assert.equal(placed.atMs, 5, "the sample keeps its own time");
  assert.notDeepEqual([placed.x, placed.y], [700, 400], "offset from the cursor");
});

test("placement is stable, so the wake does not jitter", () => {
  const once = placeStrokePoint({ x: 512, y: 333, atMs: 0 }, viewport);
  const twice = placeStrokePoint({ x: 512, y: 333, atMs: 0 }, viewport);

  assert.deepEqual(once, twice);
});

test("the region covers every point that was circled", () => {
  // The box is not decoration. It is Toki stating which region it took.
  const placed = loop({ degrees: 360 }).map((point) =>
    placeStrokePoint(point, viewport),
  );
  const bounds = trailBounds(placed);

  for (const point of placed) {
    assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX);
    assert.ok(point.y >= bounds.minY && point.y <= bounds.maxY);
  }

  assert.ok(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY);
});

test("nothing circled is no region, rather than a region of nothing", () => {
  // A zero-sized box would be sent on as a target and pointed at.
  assert.equal(trailBounds([]), null);
});

test("the fluid is focused rather than splashy", () => {
  // The reference throws paint across the screen, which over somebody's actual
  // work obscures what they are doing and reads as decoration.
  assert.ok(fluidTrailPolicy.splatRadius <= 0.08);
  assert.ok(fluidTrailPolicy.splatForce <= 2_500);
  assert.ok(fluidTrailPolicy.curl <= 2);
  // Measured against a real loop rather than guessed; see the table in
  // fluidTrailPolicy. Too slow and the dye accumulates until alpha saturates,
  // and a saturated ribbon is a shape again.
  assert.ok(fluidTrailPolicy.densityDissipation >= 2, "it does not linger");
  assert.ok(fluidTrailPolicy.velocityDissipation >= 2.5, "and it does not drift");
});

test("the simulation is sized for a laptop doing something else", () => {
  // A full-screen fluid at display resolution would be spending somebody's
  // battery on detail the physics never produces.
  assert.ok(fluidTrailPolicy.simResolution <= 160);
  assert.ok(fluidTrailPolicy.dyeResolution <= 1_024);
  assert.ok(fluidTrailPolicy.dyeResolution > fluidTrailPolicy.simResolution);
});

test("the fluid never takes a click, and clears to nothing", () => {
  // It is drawn over somebody else's screen. A transparent overlay that clears
  // to opaque black would black out the display.
  const css = readFileSync(
    new URL("../apps/desktop/src/TokiSelectionTrail.css", import.meta.url),
    "utf8",
  );
  const source = readFileSync(
    new URL("../apps/desktop/src/fluidTrail.ts", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.toki-selection-trail__fluid[\s\S]*?pointer-events:\s*none/u);
  assert.match(source, /clearColor\(0, 0, 0, 0\)/u);
  assert.doesNotMatch(source, /clearColor\(0(\.0)?, 0(\.0)?, 0(\.0)?, 1(\.0)?\)/u);
});

test("no WebGL is no trail, not a broken overlay", () => {
  // The region is shown either way, so the gesture still works.
  const source = readFileSync(
    new URL("../apps/desktop/src/fluidTrail.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /if \(gl == null\) \{[\s\S]*?return null;/u);
});

test("colour is laid continuously between samples, not as dots", () => {
  // The cursor is read every fifty milliseconds, which at any real speed is
  // tens of pixels apart. Pushing only at those positions left a row of
  // separate beads -- the fluid used to smear them together, but only because
  // it was being shoved hard enough to billow, which is what made it read as
  // wind rather than as a trail.
  const source = readFileSync(
    new URL("../apps/desktop/src/fluidTrail.ts", import.meta.url),
    "utf8",
  );
  const component = readFileSync(
    new URL("../apps/desktop/src/TokiSelectionTrail.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /pushSegment/u);
  // `previous, head` rather than `previous, at`: the samples are no longer fed
  // to the fluid directly. See "the fluid is fed from one path" below.
  assert.match(component, /trail\.pushSegment\(previous, head\)/u);

  /*
   * Both colour and momentum are spent per pixel of path.
   *
   * This used to assert that momentum was divided by the number of sub-pushes,
   * which made the fluid's shove proportional to the frame's displacement --
   * hard on a fast frame, almost nothing on a slow one. Since the shove is what
   * stretches dye into a ribbon instead of letting it sit and spread, a stroke
   * came out as two different effects: a clean ribbon where the hand moved
   * quickly, a soft blob two or three times as wide wherever it slowed.
   *
   * Both quantities now follow the same rule, which is why the trail cannot
   * come apart along its length again. The spacing arithmetic is checked
   * properly in fluid-trail-spacing.test.mjs; these two only pin the shape at
   * the call site.
   */
  const segment = source.slice(source.indexOf("pushSegment(from, to"));

  assert.match(
    segment.slice(0, 1800),
    /unitX \* kick/u,
    "momentum comes from the path direction, not the frame's displacement",
  );
  assert.match(segment.slice(0, 2400), /\n\s*strength,\s*\n/u, "colour is not divided");
  assert.match(
    segment.slice(0, 1200),
    /planSplats\(distance, splatRemainder\)/u,
    "splats are placed by distance travelled, not once per frame",
  );
});

test("the trail is a defined ribbon, not a billowing cloud", () => {
  // Velocity is what makes fluid spread. The reference injects a lot of it,
  // which is why it looks like weather; a trail that says "this is the area I
  // circled" has to stay where it was drawn.
  assert.ok(fluidTrailPolicy.splatForce <= 600, "nudged, not thrown");
  assert.ok(fluidTrailPolicy.velocityDissipation >= 5, "motion dies quickly");
  assert.ok(fluidTrailPolicy.curl <= 0.6, "it does not wander off the path");
});

test("nothing is left on screen once the trail is done", () => {
  // Stopping the loop stops *rendering*, which is not the same as leaving
  // nothing behind: the last frame drawn stays on the canvas until something
  // draws over it. A finished selection left a ghost of the fluid sitting over
  // somebody's work indefinitely.
  const source = readFileSync(
    new URL("../apps/desktop/src/fluidTrail.ts", import.meta.url),
    "utf8",
  );
  const frame = source.slice(source.indexOf("frame(nowMs) {"));

  assert.match(frame.slice(0, 1800), /clear\(gl\.COLOR_BUFFER_BIT\)/u);
  assert.match(frame.slice(0, 1800), /return false;/u);
});

test("the trail runs long enough for the colour to actually be gone", () => {
  // Not a taste decision: colour decays by 1/(1 + fade * dt) a step, so
  // reaching one part in 255 from full takes ln(255) / fade seconds. Stopping
  // before that is what left something visible to freeze.
  const fadeSeconds = Math.log(255) / fluidTrailPolicy.densityDissipation;

  assert.ok(
    fluidTrailPolicy.settleMs >= fadeSeconds * 1000,
    `${fluidTrailPolicy.settleMs}ms is shorter than the ${Math.round(fadeSeconds * 1000)}ms the dye takes to vanish`,
  );
});

test("the ribbon is the width of the creature that draws it", () => {
  // Measured on a straight stroke: 0.010 draws 24px, which is the creature's
  // diameter while it is listening or guiding -- the whole time this exists.
  // Any other width reads as arbitrary.
  assert.ok(fluidTrailPolicy.splatRadius <= 0.012);
  assert.ok(fluidTrailPolicy.splatRadius >= 0.008);
});

test("the fluid is fed from one path, and it is the creature's", () => {
  /*
   * The trail came out as a chain of bright lumps, and the spacing of the
   * splats was not why.
   *
   * Two effects fed the simulation and shared one "last fed from" mark: the raw
   * samples as they arrived, and the blob's own position every frame. Those are
   * different curves -- the blob is on a spring so it lags by tens of pixels,
   * and the two were also offset by half a blob because one was measured from a
   * corner and the other from a centre. The fluid was therefore driven forward
   * to the newest sample, back to the lagging blob, and forward again, twenty
   * times a second, laying colour over the same stretch two and three times in
   * alternating directions.
   *
   * No amount of spacing splats evenly could fix a path that goes back and
   * forth, which is why the first attempt at this changed nothing.
   */
  const component = readFileSync(
    new URL("../apps/desktop/src/TokiSelectionTrail.tsx", import.meta.url),
    "utf8",
  );

  const feeds = component.match(/trail\.pushSegment\(/gu) ?? [];
  assert.equal(
    feeds.length,
    1,
    `the fluid must have exactly one source; found ${feeds.length}`,
  );

  assert.match(
    component,
    /trail\.pushSegment\(previous, head\)/u,
    "and that source is the blob, so the wake comes out of the creature",
  );
});

test("the head is handed over as a centre, not a corner", () => {
  // Half a blob of offset between the feed and the thing drawing it puts the
  // whole wake up and to the left of the creature.
  const app = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );

  const head = app.slice(app.indexOf("head={"), app.indexOf("head={") + 400);
  assert.match(head, /pointerShadowGeometry\.width \/ 2/u);
  assert.match(head, /pointerShadowGeometry\.height \/ 2/u);
});
