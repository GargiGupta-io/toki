// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { displayRectToScreenshotRect } from "./coordinateTransforms";
import type { CoordinateRect, CoordinateSize } from "./coordinateTransforms";

/**
 * Noticing that the step was done.
 *
 * Toki shows one step and then waits. Until now it waited forever: the only
 * thing that moved a session on was a button in the debug window, so somebody
 * would click exactly what they were told to click and nothing would happen.
 *
 * The obvious trigger -- has the screen changed -- is the one that cannot work.
 * The existing check compares a signature of the whole display, and on a screen
 * with a video playing, or a clock in the menu bar, that differs every frame. It
 * would advance instantly and forever, whether or not anybody had done anything.
 *
 * So this looks only at the part of the screen the step was about. A control
 * that has been clicked almost always changes: it highlights, it opens a menu
 * over itself, it becomes a field with a cursor in it, the view behind it
 * changes. A music video three hundred pixels away does not touch those pixels.
 *
 * What this deliberately is not is a click detector. Watching the mouse would be
 * more direct, and it would mean asking for permission to observe every click
 * the person makes anywhere -- in a product whose whole claim is that it points
 * without touching. Reading a few thousand pixels of a screenshot Toki already
 * has permission to take costs nothing extra and asks for nothing new.
 */

export const stepAdvancePolicy = Object.freeze({
  /**
   * How often to look.
   *
   * Fast enough that following an instruction and being given the next one
   * feels like one movement, slow enough that this is not doing continuous work
   * over somebody's screen. Each check is a screenshot Toki already knows how
   * to take, so the cost is real but bounded, and it only runs while a step is
   * actually on screen waiting to be done.
   */
  pollIntervalMs: 900,

  /**
   * How much of the region has to differ.
   *
   * Not zero. Anti-aliasing, a caret blinking, a hover highlight following the
   * pointer across a row, and video compression noise all move a few pixels
   * without anything having happened. Requiring a real fraction of the region
   * to change means a control that lit up or a menu that opened counts, and a
   * cursor drifting past does not.
   */
  changedFraction: 0.06,

  /**
   * How different one pixel has to be before it counts as changed.
   *
   * Below this is the same colour rendered slightly differently -- subpixel
   * text, a gradient dithered another way, JPEG noise.
   */
  channelTolerance: 24,

  /**
   * Grown a little beyond the control itself.
   *
   * Menus and popovers open next to what opened them rather than on top of it,
   * and a target box drawn tightly around an icon would miss that entirely.
   */
  regionPaddingPx: 24,

  /**
   * Give up watching after this long.
   *
   * If the step has not been done in a couple of minutes, either it was not
   * understood or the person went to do something else. Continuing to screenshot
   * their display on the chance they come back is not something to do quietly.
   */
  timeoutMs: 120_000,
});

export type RegionFingerprint = {
  width: number;
  height: number;
  /**
   * The size of the region this was taken from.
   *
   * Recorded because the grid is normalised: every region becomes the same
   * small number of samples whatever its real size, so without this a region
   * that changed shape between two looks would compare as though it had not.
   * A shape change means the display or the window moved under us, which is
   * not somebody completing a step.
   */
  sourceWidth: number;
  sourceHeight: number;
  /** One byte per sampled pixel per channel, already downsampled. */
  samples: Uint8ClampedArray;
};

/**
 * Reduce a region to something two of which can be compared.
 *
 * Downsampled hard -- a grid of at most this many samples per side. The
 * question is "did this part of the screen become a different thing", not "is
 * it identical", and a small grid answers the first while being immune to the
 * one-pixel noise that makes the second useless.
 */
export const fingerprintGridSize = 24;

export function fingerprintRegion(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  gridSize = fingerprintGridSize,
): RegionFingerprint {
  const columns = Math.max(1, Math.min(gridSize, width));
  const rows = Math.max(1, Math.min(gridSize, height));
  const samples = new Uint8ClampedArray(columns * rows * 3);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      // Sample the middle of each cell rather than its corner, so a one-pixel
      // shift of the whole region does not change every sample.
      const sourceX = Math.min(
        width - 1,
        Math.floor(((column + 0.5) * width) / columns),
      );
      const sourceY = Math.min(
        height - 1,
        Math.floor(((row + 0.5) * height) / rows),
      );
      const source = (sourceY * width + sourceX) * 4;
      const destination = (row * columns + column) * 3;

      samples[destination] = pixels[source] ?? 0;
      samples[destination + 1] = pixels[source + 1] ?? 0;
      samples[destination + 2] = pixels[source + 2] ?? 0;
    }
  }

  return { width: columns, height: rows, sourceWidth: width, sourceHeight: height, samples };
}

/**
 * Whether the region became a different thing.
 *
 * Returns the fraction of samples that moved, so a caller can log what it saw
 * rather than only whether a threshold was crossed -- when this fires wrongly,
 * the number is the first thing worth knowing.
 */
export function compareRegionFingerprints(
  before: RegionFingerprint,
  after: RegionFingerprint,
  channelTolerance = stepAdvancePolicy.channelTolerance,
): { changedFraction: number; comparable: boolean } {
  if (
    before.width !== after.width ||
    before.height !== after.height ||
    before.sourceWidth !== after.sourceWidth ||
    before.sourceHeight !== after.sourceHeight ||
    before.samples.length !== after.samples.length
  ) {
    // A different shape means the screenshot geometry changed under us -- a
    // display change, or a resize. Not something to read as a completed step.
    return { changedFraction: 0, comparable: false };
  }

  const sampleCount = before.samples.length / 3;
  let changed = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const offset = index * 3;
    const deltaRed = Math.abs(before.samples[offset] - after.samples[offset]);
    const deltaGreen = Math.abs(
      before.samples[offset + 1] - after.samples[offset + 1],
    );
    const deltaBlue = Math.abs(
      before.samples[offset + 2] - after.samples[offset + 2],
    );

    if (
      deltaRed > channelTolerance ||
      deltaGreen > channelTolerance ||
      deltaBlue > channelTolerance
    ) {
      changed += 1;
    }
  }

  return {
    changedFraction: sampleCount === 0 ? 0 : changed / sampleCount,
    comparable: true,
  };
}

export function hasRegionChanged(
  before: RegionFingerprint,
  after: RegionFingerprint,
  policy = stepAdvancePolicy,
): boolean {
  const { changedFraction, comparable } = compareRegionFingerprints(
    before,
    after,
    policy.channelTolerance,
  );

  return comparable && changedFraction >= policy.changedFraction;
}

/**
 * The part of the screenshot to watch, in screenshot pixels.
 *
 * Padded, and clamped to the image: a control at the very edge of the screen
 * would otherwise ask for pixels that are not there.
 */
export function getWatchedRegion(
  target: CoordinateRect,
  display: CoordinateSize,
  screenshot: CoordinateSize,
  paddingPx = stepAdvancePolicy.regionPaddingPx,
): CoordinateRect | null {
  if (
    display.width <= 0 ||
    display.height <= 0 ||
    screenshot.width <= 0 ||
    screenshot.height <= 0 ||
    target.width <= 0 ||
    target.height <= 0
  ) {
    return null;
  }

  const padded = {
    x: target.x - paddingPx,
    y: target.y - paddingPx,
    width: target.width + paddingPx * 2,
    height: target.height + paddingPx * 2,
  };
  const mapped = displayRectToScreenshotRect(padded, display, screenshot);
  const x = Math.max(0, Math.floor(mapped.x));
  const y = Math.max(0, Math.floor(mapped.y));
  const right = Math.min(screenshot.width, Math.ceil(mapped.x + mapped.width));
  const bottom = Math.min(screenshot.height, Math.ceil(mapped.y + mapped.height));

  if (right - x < 2 || bottom - y < 2) {
    return null;
  }

  return { x, y, width: right - x, height: bottom - y };
}
