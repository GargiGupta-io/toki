import assert from "node:assert/strict";
import test from "node:test";

import {
  createScreenshotCropFromDisplayRect,
  mapDisplayRectToProviderImage,
  mapProviderTargetToDisplay,
} from "../apps/desktop/src/coordinateTransforms.ts";

const retinaContext = {
  display: { width: 1512, height: 982 },
  screenshot: { width: 3024, height: 1964 },
  providerImage: { width: 1000, height: 700 },
  crop: { x: 400, y: 200, width: 2000, height: 1400 },
};

test("creates a screenshot crop from logical Retina window points", () => {
  assert.deepEqual(
    createScreenshotCropFromDisplayRect(
      { x: 200, y: 100, width: 1000, height: 700 },
      retinaContext.display,
      retinaContext.screenshot,
    ),
    retinaContext.crop,
  );
});

test("maps a cropped provider target back into display points", () => {
  const mapping = mapProviderTargetToDisplay(
    { centerX: 250, centerY: 150, width: 50, height: 30 },
    retinaContext,
  );

  assert.equal(mapping.coordinateMode, "center");
  assert.deepEqual(mapping.providerRect, { x: 225, y: 135, width: 50, height: 30 });
  assert.deepEqual(mapping.screenshotRect, { x: 850, y: 470, width: 100, height: 60 });
  assert.deepEqual(mapping.displayRect, { x: 425, y: 235, width: 50, height: 30 });
  assert.deepEqual(mapping.scale, {
    imageToScreenshotX: 2,
    imageToScreenshotY: 2,
    screenshotToDisplayX: 0.5,
    screenshotToDisplayY: 0.5,
  });
});

test("round trips a display candidate through a cropped provider image", () => {
  const displayRect = { x: 325, y: 210, width: 44, height: 32 };
  const providerRect = mapDisplayRectToProviderImage(displayRect, retinaContext);

  assert.deepEqual(providerRect, { x: 125, y: 110, width: 44, height: 32 });

  const mapping = mapProviderTargetToDisplay(providerRect, retinaContext);
  assert.deepEqual(mapping.displayRect, displayRect);
});

test("clips partially visible candidates to the provider crop", () => {
  const providerRect = mapDisplayRectToProviderImage(
    { x: 180, y: 90, width: 40, height: 40 },
    retinaContext,
  );

  assert.deepEqual(providerRect, { x: 0, y: 0, width: 20, height: 30 });
});

test("maps full-display provider pixels without a crop offset", () => {
  const mapping = mapProviderTargetToDisplay(
    { x: 480, y: 290, width: 40, height: 20 },
    {
      display: { width: 1512, height: 982 },
      screenshot: { width: 3024, height: 1964 },
      providerImage: { width: 1512, height: 982 },
    },
  );

  assert.equal(mapping.coordinateMode, "top_left");
  assert.deepEqual(mapping.displayRect, { x: 480, y: 290, width: 40, height: 20 });
});

test("rejects missing, null, and off-image target coordinates", () => {
  assert.throws(
    () => mapProviderTargetToDisplay({}, retinaContext),
    /target coordinates are missing/,
  );
  assert.throws(
    () =>
      mapProviderTargetToDisplay(
        { centerX: null, centerY: null, width: 20, height: 20 },
        retinaContext,
      ),
    /target coordinates are missing/,
  );
  assert.throws(
    () =>
      mapProviderTargetToDisplay(
        { centerX: 995, centerY: 695, width: 20, height: 20 },
        retinaContext,
      ),
    /outside the provided image/,
  );
});
