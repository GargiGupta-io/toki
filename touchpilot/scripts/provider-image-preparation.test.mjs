import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_IMAGE_JPEG_QUALITY,
  PROVIDER_IMAGE_MAX_EDGE,
  createProviderImagePreparationPlan,
} from "../apps/desktop/src/providerImagePreparation.ts";

test("passes through a compact screenshot without losing its encoding", () => {
  const plan = createProviderImagePreparationPlan({
    imageWidth: 1280,
    imageHeight: 800,
    format: "png",
    byteLength: 1_250_000,
  });

  assert.equal(plan.strategy, "passthrough");
  assert.equal(plan.shouldRender, false);
  assert.deepEqual(plan.output, {
    imageWidth: 1280,
    imageHeight: 800,
    format: "png",
  });
  assert.deepEqual(plan.sourceGeometry.region, {
    x: 0,
    y: 0,
    width: 1280,
    height: 800,
  });
  assert.deepEqual(plan.preprocessing, {
    strategy: "passthrough",
    scaleX: 1,
    scaleY: 1,
    maxEdge: PROVIDER_IMAGE_MAX_EDGE,
  });
});

test("keeps a compact active-window crop at native screenshot resolution", () => {
  const plan = createProviderImagePreparationPlan({
    imageWidth: 3024,
    imageHeight: 1964,
    format: "png",
    byteLength: 4_200_000,
    crop: { x: 412, y: 236, width: 1200, height: 840 },
  });

  assert.equal(plan.strategy, "crop");
  assert.equal(plan.shouldRender, true);
  assert.deepEqual(plan.output, {
    imageWidth: 1200,
    imageHeight: 840,
    format: "jpeg",
  });
  assert.deepEqual(plan.sourceGeometry.region, {
    x: 412,
    y: 236,
    width: 1200,
    height: 840,
  });
  assert.deepEqual(plan.preprocessing, {
    strategy: "crop",
    scaleX: 1,
    scaleY: 1,
    maxEdge: PROVIDER_IMAGE_MAX_EDGE,
    jpegQuality: PROVIDER_IMAGE_JPEG_QUALITY,
  });
});

test("resizes a large active-window crop with exact source geometry", () => {
  const plan = createProviderImagePreparationPlan({
    imageWidth: 3024,
    imageHeight: 1964,
    format: "png",
    byteLength: 5_000_000,
    crop: { x: 300, y: 180, width: 2400, height: 1600 },
  });

  assert.equal(plan.strategy, "crop_resize");
  assert.deepEqual(plan.output, {
    imageWidth: 1536,
    imageHeight: 1024,
    format: "jpeg",
  });
  assert.deepEqual(plan.sourceGeometry, {
    imageWidth: 3024,
    imageHeight: 1964,
    format: "png",
    region: { x: 300, y: 180, width: 2400, height: 1600 },
  });
  assert.deepEqual(plan.preprocessing, {
    strategy: "crop_resize",
    scaleX: 0.64,
    scaleY: 0.64,
    maxEdge: 1536,
    jpegQuality: 0.9,
  });
});

test("reencodes an oversized payload even when dimensions already fit", () => {
  const plan = createProviderImagePreparationPlan({
    imageWidth: 1400,
    imageHeight: 900,
    format: "png",
    byteLength: 3_000_000,
  });

  assert.equal(plan.strategy, "reencode");
  assert.equal(plan.shouldRender, true);
  assert.deepEqual(plan.output, {
    imageWidth: 1400,
    imageHeight: 900,
    format: "jpeg",
  });
});

test("rejects source regions outside the screenshot", () => {
  assert.throws(
    () =>
      createProviderImagePreparationPlan({
        imageWidth: 1000,
        imageHeight: 700,
        format: "png",
        byteLength: 1000,
        crop: { x: 900, y: 100, width: 200, height: 200 },
      }),
    /exceeds the screenshot bounds/,
  );
});
