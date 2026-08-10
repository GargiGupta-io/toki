import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  compareRegionFingerprints,
  fingerprintRegion,
  getWatchedRegion,
  hasRegionChanged,
  stepAdvancePolicy,
} from "../apps/desktop/src/guidanceStepAdvance.ts";

/** A region of one flat colour, as RGBA. */
function solid(width, height, [red, green, blue]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = red;
    pixels[index * 4 + 1] = green;
    pixels[index * 4 + 2] = blue;
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}

function withNoise(pixels, amplitude) {
  const copy = new Uint8ClampedArray(pixels);
  for (let index = 0; index < copy.length; index += 4) {
    // Deterministic rather than random: a test that fails one run in twenty
    // teaches people to re-run it instead of reading it.
    const wobble = ((index / 4) % 2 === 0 ? 1 : -1) * amplitude;
    copy[index] += wobble;
    copy[index + 1] += wobble;
    copy[index + 2] += wobble;
  }
  return copy;
}

function patch(pixels, width, rect, [red, green, blue]) {
  const copy = new Uint8ClampedArray(pixels);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (y * width + x) * 4;
      copy[offset] = red;
      copy[offset + 1] = green;
      copy[offset + 2] = blue;
    }
  }
  return copy;
}

test("an unchanged region does not advance the step", () => {
  const before = fingerprintRegion(solid(120, 80, [30, 30, 34]), 120, 80);
  const after = fingerprintRegion(solid(120, 80, [30, 30, 34]), 120, 80);

  assert.equal(hasRegionChanged(before, after), false);
});

test("noise and anti-aliasing do not advance the step", () => {
  // A caret blinking, a gradient dithered differently, JPEG artefacts. None of
  // these mean the person did the thing they were asked to do.
  const base = solid(120, 80, [30, 30, 34]);
  const before = fingerprintRegion(base, 120, 80);
  const after = fingerprintRegion(
    withNoise(base, stepAdvancePolicy.channelTolerance - 2),
    120,
    80,
  );

  assert.equal(hasRegionChanged(before, after), false);
});

test("a menu opening over the control advances the step", () => {
  const base = solid(120, 80, [30, 30, 34]);
  const before = fingerprintRegion(base, 120, 80);
  const opened = patch(base, 120, { x: 0, y: 0, width: 120, height: 60 }, [
    240, 240, 245,
  ]);

  assert.equal(hasRegionChanged(before, fingerprintRegion(opened, 120, 80)), true);
});

test("a control that only highlights still advances the step", () => {
  // Clicking often just lights something up. That is still the step being done,
  // so the threshold has to be low enough to catch it.
  const base = solid(120, 80, [30, 30, 34]);
  const before = fingerprintRegion(base, 120, 80);
  const highlighted = patch(
    base,
    120,
    { x: 10, y: 10, width: 100, height: 60 },
    [70, 130, 200],
  );

  assert.equal(
    hasRegionChanged(before, fingerprintRegion(highlighted, 120, 80)),
    true,
  );
});

test("a change smaller than the threshold is reported but does not advance", () => {
  const base = solid(200, 200, [30, 30, 34]);
  const before = fingerprintRegion(base, 200, 200);
  // One row of the 24-row grid: 4.2% of samples, under the 6% threshold.
  const nudged = patch(base, 200, { x: 0, y: 0, width: 200, height: 9 }, [
    240, 240, 245,
  ]);
  const after = fingerprintRegion(nudged, 200, 200);
  const { changedFraction, comparable } = compareRegionFingerprints(before, after);

  assert.equal(comparable, true);
  assert.ok(changedFraction > 0, "the difference is measured, not discarded");
  assert.ok(changedFraction < stepAdvancePolicy.changedFraction);
  assert.equal(hasRegionChanged(before, after), false);
});

test("a resized screenshot is refused rather than read as a completed step", () => {
  // Different geometry means the display changed under us, not that anybody
  // clicked anything.
  const before = fingerprintRegion(solid(120, 80, [30, 30, 34]), 120, 80);
  const after = fingerprintRegion(solid(60, 40, [30, 30, 34]), 60, 40);

  assert.equal(compareRegionFingerprints(before, after).comparable, false);
  assert.equal(hasRegionChanged(before, after), false);
});

test("the watched region is padded, because menus open beside a control", () => {
  // A target box drawn tightly around a 20px icon would miss the popover that
  // opens next to it entirely.
  const region = getWatchedRegion(
    { x: 100, y: 100, width: 20, height: 20 },
    { width: 1440, height: 900 },
    { width: 1440, height: 900 },
  );

  assert.ok(region);
  assert.equal(region.width, 20 + stepAdvancePolicy.regionPaddingPx * 2);
  assert.equal(region.x, 100 - stepAdvancePolicy.regionPaddingPx);
});

test("the watched region scales to the screenshot, not the display", () => {
  // The display is in CSS pixels and the screenshot is retina. Reading the
  // target's numbers straight out of one into the other watches the wrong
  // quarter of the screen.
  const region = getWatchedRegion(
    { x: 100, y: 50, width: 40, height: 40 },
    { width: 1440, height: 900 },
    { width: 2880, height: 1800 },
    0,
  );

  assert.deepEqual(region, { x: 200, y: 100, width: 80, height: 80 });
});

test("a target at the screen edge is clamped into the image", () => {
  const region = getWatchedRegion(
    { x: 0, y: 0, width: 30, height: 30 },
    { width: 1440, height: 900 },
    { width: 1440, height: 900 },
  );

  assert.ok(region);
  assert.equal(region.x, 0, "never asks for pixels left of the image");
  assert.equal(region.y, 0);
});

test("a degenerate target is refused rather than watched", () => {
  assert.equal(
    getWatchedRegion(
      { x: 0, y: 0, width: 0, height: 0 },
      { width: 1440, height: 900 },
      { width: 1440, height: 900 },
    ),
    null,
  );
});

test("watching stops rather than screenshotting indefinitely", () => {
  // If the step has not been done in a couple of minutes, either it was not
  // understood or the person went elsewhere. Continuing to capture their
  // display on the chance they come back is not something to do quietly.
  assert.ok(stepAdvancePolicy.timeoutMs >= 30_000);
  assert.ok(stepAdvancePolicy.timeoutMs <= 300_000);
});

test("looking often is bounded by one capture at a time, not by the clock", () => {
  /*
   * This asserted `pollIntervalMs >= 500` and called it "not a busy loop".
   *
   * The interval was the only thing standing between Toki and a queue of
   * overlapping screenshots, so it had to be slow -- and being slow was the
   * whole complaint: two intervals had to pass before a completed step could
   * be noticed, because the first look only records what the region looked
   * like. A click took seconds to acknowledge on a task whose steps were
   * already known.
   *
   * The guard is structural now. One capture is in flight at a time, so ticks
   * that arrive during a capture are dropped and the real rate is however fast
   * the display can be photographed. That holds at any interval, which is why
   * the interval itself may be short.
   */
  assert.ok(stepAdvancePolicy.pollIntervalMs >= 200, "still not a busy loop");
  assert.ok(stepAdvancePolicy.pollIntervalMs <= 400, "and no longer a stall");

  // Long enough for the blob to arrive and the dimming to come up -- both are
  // changes to the very region being watched, and photographing mid-animation
  // reads as a completed step every time.
  assert.ok(stepAdvancePolicy.settleBeforeBaselineMs >= 500);
  assert.ok(stepAdvancePolicy.settleBeforeBaselineMs <= 900);

  const app = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    app,
    /if \(cancelled \|\| inFlight\)/u,
    "the watcher must refuse to start a capture while one is running",
  );
});

test("the watcher only looks while the step's own application is in front", () => {
  // A step takes seconds to answer, which is long enough to decide it has not
  // worked and go and look at something else. Without this the region changes
  // because another window now covers it, the session continues, and a
  // screenshot of whatever is in front is sent as evidence for a task about a
  // different application -- answered, correctly, with "this is a terminal,
  // there is no playlist control here", which then reads as weak vision.
  const app = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /const sessionApp =\s*\n?\s*guidanceSession\?\.lastScreenshot\?\.activeWindow\?\.appName/u);
  assert.match(app, /const frontApp = screenshot\.activeWindow\?\.appName/u);
  assert.match(app, /sessionApp !== frontApp/u);
});

test("switching away pauses the watch rather than ending the session", () => {
  // Skipping the poll keeps the baseline, so a click made just before looking
  // elsewhere is still noticed on returning. Resetting it would lose that.
  const app = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );
  const guard = app.slice(
    app.indexOf("const sessionApp ="),
    app.indexOf("const region = getWatchedRegion("),
  );

  assert.match(guard, /return;/u, "the poll is skipped");
  assert.doesNotMatch(guard, /baseline = null/u, "the baseline is kept");
  assert.doesNotMatch(guard, /cancelled = true/u, "the watch is not ended");
});
