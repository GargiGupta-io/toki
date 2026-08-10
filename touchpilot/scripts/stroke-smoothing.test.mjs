import assert from "node:assert/strict";
import test from "node:test";

import {
  createStrokePathData,
  simplifyStroke,
  smoothStroke,
  smoothingPolicy,
  resampleStroke,
  toCurvedPathData,
} from "../apps/desktop/src/strokeSmoothing.ts";

/** A straight run with a one-pixel wobble on every other sample. */
function jitteryLine(count = 40, amplitude = 1) {
  return Array.from({ length: count }, (_, i) => ({
    x: i * 6,
    y: 100 + (i % 2 === 0 ? amplitude : -amplitude),
  }));
}

function circle(count = 60, radius = 120) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: 300 + Math.cos(a) * radius, y: 300 + Math.sin(a) * radius };
  });
}

test("hand-tracking jitter is thrown away, not averaged into the shape", () => {
  // Every wobble used to become a visible kink, because the trail drew the
  // input rather than a conclusion about it.
  const simplified = simplifyStroke(jitteryLine());

  assert.ok(
    simplified.length <= 4,
    `a straight jittery line should collapse, got ${simplified.length} points`,
  );
  assert.deepEqual(simplified[0], { x: 0, y: 101 }, "the start is kept exactly");
});

test("a deliberate corner survives simplification", () => {
  // The tolerance has to be small enough that circling something still looks
  // like circling it.
  const corner = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 100, y: 100 },
  ];

  const simplified = simplifyStroke(corner);

  assert.ok(
    simplified.some((p) => p.x === 100 && p.y === 0),
    "the corner itself is what the line is about",
  );
  assert.equal(simplified.length, 3, "the points along each straight run are not");
});

test("a circle keeps its shape through the whole pipeline", () => {
  const points = circle();
  const simplified = simplifyStroke(points);

  // Every surviving point still sits on the circle: simplification removes
  // points, it never moves them.
  for (const point of simplified) {
    const r = Math.hypot(point.x - 300, point.y - 300);
    assert.ok(Math.abs(r - 120) < 0.001, `moved a point to radius ${r}`);
  }

  assert.ok(simplified.length >= 8, "a circle cannot collapse to a line");
});

test("smoothing keeps both ends exactly where they were", () => {
  // The head is attached to the blob and the tail is where the gesture began.
  // Moving either detaches the drawing from the thing that drew it.
  const points = circle(12);
  const smoothed = smoothStroke(points);

  assert.deepEqual(smoothed[0], points[0]);
  assert.deepEqual(smoothed[smoothed.length - 1], points[points.length - 1]);
});

test("smoothing rounds corners rather than cutting across them", () => {
  const corner = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  const smoothed = smoothStroke(corner, 1);

  // The sharp vertex is gone, but the line still goes out and comes back --
  // it does not become the diagonal between the two ends.
  assert.ok(
    !smoothed.some((p) => p.x === 100 && p.y === 0),
    "the vertex should be cut",
  );
  assert.ok(
    smoothed.some((p) => p.x >= 70 && p.y <= 30),
    "but the line still travels out towards where it was",
  );
});

test("the curve passes through its points, it does not bulge past them", () => {
  // A loop drawn around an object must not creep over the object.
  const points = circle(24);
  const data = toCurvedPathData(points);
  const numbers = data.match(/-?\d+(\.\d+)?/g).map(Number);
  const maxRadius = Math.max(
    ...points.map((p) => Math.hypot(p.x - 300, p.y - 300)),
  );

  for (let i = 0; i < numbers.length - 1; i += 2) {
    const r = Math.hypot(numbers[i] - 300, numbers[i + 1] - 300);
    assert.ok(
      r < maxRadius * 1.12,
      `a control point reached radius ${r.toFixed(1)} outside ${maxRadius}`,
    );
  }
});

test("the whole pipeline emits one path, not many segments", () => {
  // One stroke can carry one uniform width. Many segments each carrying their
  // own opacity is what made this look like a comet tail instead of a line.
  const data = createStrokePathData(circle());

  assert.equal((data.match(/M /g) ?? []).length, 1, "exactly one subpath");
  assert.ok(data.includes(" C "), "curved, not straight segments");
});

test("degenerate strokes produce nothing rather than throwing", () => {
  assert.equal(createStrokePathData([]), "");
  assert.equal(createStrokePathData([{ x: 1, y: 2 }]), "");
  assert.match(createStrokePathData([{ x: 1, y: 2 }, { x: 3, y: 4 }]), /^M /);
});

test("the tolerance stays in the range that was measured", () => {
  // Below ~1.5 the wobble survives; above ~4 deliberate corners round off.
  assert.ok(smoothingPolicy.simplifyTolerancePx >= 1.5);
  assert.ok(smoothingPolicy.simplifyTolerancePx <= 4);
});

test("path data is rounded so it can be rebuilt every frame", () => {
  const data = createStrokePathData(circle(40));

  for (const number of data.match(/\d+\.\d+/g) ?? []) {
    const decimals = number.split(".")[1].length;
    assert.ok(decimals <= 2, `${number} carries ${decimals} decimals`);
  }
});

test("grains are spaced by distance, not by sample", () => {
  // Samples arrive at a fixed rate, so spacing by sample bunches them when the
  // hand is slow and spreads them when it is fast -- thinning the trail exactly
  // when there is most movement to show.
  const slow = Array.from({ length: 40 }, (_, i) => ({ x: i * 2, y: 0 }));
  const fast = Array.from({ length: 8 }, (_, i) => ({ x: i * 10, y: 0 }));

  const a = resampleStroke(slow, 10);
  const b = resampleStroke(fast, 10);

  // Both cover ~78px and ~70px of travel, so the counts should be close even
  // though one has five times the samples.
  assert.ok(Math.abs(a.length - b.length) <= 1, `${a.length} vs ${b.length}`);
});

test("resampled points sit on the path at even intervals", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  const grains = resampleStroke(line, 25);

  assert.deepEqual(
    grains.map((g) => Math.round(g.point.x)),
    [25, 50, 75, 100],
  );
  for (const grain of grains) {
    assert.equal(grain.point.y, 0, "never leaves the path");
  }
});

test("each grain knows how far along it is", () => {
  // Which is what lets the tail fade: position along the path, not index.
  const grains = resampleStroke(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    25,
  );

  assert.ok(grains.every((g) => g.total === 100));
  assert.deepEqual(grains.map((g) => g.distance), [25, 50, 75, 100]);
});

test("a degenerate stroke yields no grains rather than throwing", () => {
  assert.deepEqual(resampleStroke([], 10), []);
  assert.deepEqual(resampleStroke([{ x: 1, y: 1 }], 10), []);
  assert.deepEqual(resampleStroke([{ x: 1, y: 1 }, { x: 1, y: 1 }], 10), []);
  assert.deepEqual(resampleStroke([{ x: 0, y: 0 }, { x: 5, y: 0 }], 0), []);
});
