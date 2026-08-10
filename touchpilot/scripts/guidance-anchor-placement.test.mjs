import assert from "node:assert/strict";
import test from "node:test";

import {
  anchorPlacementPolicy,
  placeGuidanceAnchor,
} from "../apps/desktop/src/guidanceAnchorPlacement.ts";

/**
 * The blob stands beside the target, not on it.
 *
 * The failure this exists to prevent is the one that shipped: the blob parked
 * at the centre of the box, covering a control small enough that the covering
 * was total. Every assertion below is "does it overlap the box", which is the
 * only question that matters, plus the edge cases where standing outside is
 * not possible.
 */

const blob = { width: 40, height: 40 };
const viewport = { width: 1440, height: 900 };

function overlaps(anchor, box, size) {
  return (
    anchor.x < box.x + box.width &&
    anchor.x + size.width > box.x &&
    anchor.y < box.y + box.height &&
    anchor.y + size.height > box.y
  );
}

test("a control in open space gets the blob on its left", () => {
  const box = { x: 600, y: 400, width: 120, height: 44 };
  const placed = placeGuidanceAnchor(box, blob, viewport);

  assert.equal(placed.side, "left");
  assert.equal(overlaps(placed, box, blob), false);
  assert.equal(placed.x + blob.width, box.x - anchorPlacementPolicy.gapPx);
});

test("the blob is centred on the row it points at", () => {
  const box = { x: 600, y: 400, width: 120, height: 44 };
  const placed = placeGuidanceAnchor(box, blob, viewport);

  assert.equal(placed.y + blob.height / 2, box.y + box.height / 2);
});

test("a control against the left edge pushes the blob to its right", () => {
  const box = { x: 8, y: 300, width: 120, height: 44 };
  const placed = placeGuidanceAnchor(box, blob, viewport);

  assert.equal(placed.side, "right");
  assert.equal(overlaps(placed, box, blob), false);
});

test("a full-width row with no side room goes above", () => {
  // The case from the report: a panel row spanning nearly the whole window.
  const box = { x: 20, y: 300, width: 1400, height: 90 };
  const placed = placeGuidanceAnchor(box, blob, viewport);

  assert.equal(placed.side, "above");
  assert.equal(overlaps(placed, box, blob), false);
});

test("a full-width row at the very top goes below instead", () => {
  const box = { x: 20, y: 4, width: 1400, height: 90 };
  const placed = placeGuidanceAnchor(box, blob, viewport);

  assert.equal(placed.side, "below");
  assert.equal(overlaps(placed, box, blob), false);
});

test("a target covering the display puts the blob inside, off-centre", () => {
  const box = { x: 0, y: 0, width: 1440, height: 900 };
  const placed = placeGuidanceAnchor(box, blob, viewport);

  assert.equal(placed.side, "inside");

  // Overlapping is unavoidable here; sitting over the middle is not.
  const centre = { x: viewport.width / 2, y: viewport.height / 2 };
  assert.ok(Math.hypot(placed.x - centre.x, placed.y - centre.y) > 400);
});

test("the blob never leaves the screen", () => {
  const boxes = [
    { x: 0, y: 0, width: 30, height: 30 },
    { x: 1410, y: 870, width: 30, height: 30 },
    { x: 1439, y: 0, width: 1, height: 900 },
    { x: -50, y: 400, width: 120, height: 44 },
  ];

  for (const box of boxes) {
    const placed = placeGuidanceAnchor(box, blob, viewport);

    assert.ok(placed.x >= 0, `x ${placed.x} for ${JSON.stringify(box)}`);
    assert.ok(placed.y >= 0, `y ${placed.y} for ${JSON.stringify(box)}`);
    assert.ok(placed.x + blob.width <= viewport.width);
    assert.ok(placed.y + blob.height <= viewport.height);
  }
});

test("a viewport smaller than the blob still returns a point on it", () => {
  // Not a real display, but clamping arithmetic that inverts its own bounds
  // returns NaN or a negative, and this is the cheapest place to catch it.
  const placed = placeGuidanceAnchor(
    { x: 5, y: 5, width: 10, height: 10 },
    blob,
    { width: 30, height: 30 },
  );

  assert.ok(Number.isFinite(placed.x));
  assert.ok(Number.isFinite(placed.y));
  assert.ok(placed.x >= 0 && placed.y >= 0);
});
