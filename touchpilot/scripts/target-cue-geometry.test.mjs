import assert from "node:assert/strict";
import test from "node:test";
import { getTargetCueGeometry } from "../apps/desktop/src/targetCueGeometry.ts";

test("wide text targets receive a region cue around their complete rectangle", () => {
  const geometry = getTargetCueGeometry(107, 26);

  assert.equal(geometry.shape, "region");
  assert.ok(geometry.width > 107);
  assert.ok(geometry.height > 26);
});

test("wide navigation tabs use the same general region treatment", () => {
  const geometry = getTargetCueGeometry(178, 43);

  assert.equal(geometry.shape, "region");
  assert.ok(geometry.width >= 194);
  assert.ok(geometry.height >= 55);
});

test("compact icon targets preserve the circular ring", () => {
  assert.deepEqual(getTargetCueGeometry(28, 28), {
    shape: "circle",
    width: 52,
    height: 52,
    cornerRadius: 26,
  });
});

test("invalid target dimensions fail safely to a compact cue", () => {
  assert.equal(getTargetCueGeometry(Number.NaN, 0).shape, "circle");
});
