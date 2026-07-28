import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSplitStrandGeometry } from "../apps/desktop/src/gestureSplitStrand.ts";

const blobPuckSource = readFileSync(
  new URL("../apps/desktop/src/BlobPuck.tsx", import.meta.url),
  "utf8",
);
const blobPuckCss = readFileSync(
  new URL("../apps/desktop/src/BlobPuck.css", import.meta.url),
  "utf8",
);
const geometrySource = readFileSync(
  new URL("../apps/desktop/src/gestureSplitStrand.ts", import.meta.url),
  "utf8",
);

test("the strand joins horizontal lobe edges instead of crossing their centers", () => {
  const geometry = createSplitStrandGeometry({
    primary: { x: 100, y: 80 },
    secondary: { x: 200, y: 80 },
    lobeRadius: 20,
  });

  assert.equal(geometry.startX, 111);
  assert.equal(geometry.startY, 80);
  assert.equal(geometry.width, 78);
  assert.equal(geometry.angleDegrees, 0);
});

test("the strand remains attached while the lobes move diagonally", () => {
  const geometry = createSplitStrandGeometry({
    primary: { x: 20, y: 30 },
    secondary: { x: 120, y: 130 },
    lobeRadius: 10,
  });

  assert.ok(Math.abs(geometry.angleDegrees - 45) < 0.001);
  assert.ok(geometry.startX > 20);
  assert.ok(geometry.startY > 30);
  assert.ok(geometry.width > 120);
});

test("the liquid strand becomes finer as the hands move farther apart", () => {
  const near = createSplitStrandGeometry({
    primary: { x: 0, y: 0 },
    secondary: { x: 80, y: 0 },
    lobeRadius: 20,
  });
  const far = createSplitStrandGeometry({
    primary: { x: 0, y: 0 },
    secondary: { x: 400, y: 0 },
    lobeRadius: 20,
  });

  assert.ok(far.thickness < near.thickness);
  assert.ok(far.thickness >= 2.75);
});

test("overlapping lobes produce safe zero-length geometry", () => {
  assert.deepEqual(
    createSplitStrandGeometry({
      primary: { x: 42, y: 64 },
      secondary: { x: 42, y: 64 },
      lobeRadius: 20,
    }),
    {
      startX: 42,
      startY: 64,
      width: 0,
      angleDegrees: 0,
      thickness: 6,
    },
  );
});

test("the rendered split keeps a persistent visual-only strand", () => {
  assert.match(blobPuckSource, /createSplitStrandGeometry/);
  assert.match(blobPuckSource, /data-split-strand=\{presentedSplitVisual \? "persistent" : "none"\}/);
  assert.match(blobPuckSource, /className="blob-puck__split-bridge"/);
  assert.match(blobPuckSource, /data-persistent="true"/);
  assert.match(
    blobPuckCss,
    /data-split-phase="split"[^}]+\.blob-puck__split-bridge\s*\{[^}]*opacity:\s*0\.[1-9]/,
  );
});

test("reduced motion freezes the strand without hiding it", () => {
  assert.match(blobPuckCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    blobPuckCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.blob-puck__split-bridge,[\s\S]*animation:\s*none;[\s\S]*transition:\s*none;/,
  );
  assert.doesNotMatch(
    blobPuckCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.blob-puck__split-bridge[^}]*display:\s*none/,
  );
});

test("strand geometry has no input, action, or provider authority", () => {
  assert.doesNotMatch(geometrySource, /\binvoke\b|\bdispatch\b|\bclick\b|provider/i);
});
