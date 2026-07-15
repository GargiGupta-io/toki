import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSyntheticTrackedHand } from "../apps/desktop/src/gestureFixtures.ts";
import {
  advanceGesturePointerTracking,
  classifyPointPose,
  defaultGesturePointerCalibration,
  mapCameraPointToDisplay,
  resetGesturePointerTracking,
} from "../apps/desktop/src/gesturePointing.ts";

const display = {
  id: "test-display",
  width: 1470,
  height: 956,
  scaleFactor: 2,
};

const runtimeSource = readFileSync(
  new URL("../apps/desktop/src/gestureRuntime.ts", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);
const blobSource = readFileSync(
  new URL("../apps/desktop/src/BlobPuck.tsx", import.meta.url),
  "utf8",
);

test("point pose requires an extended index and three folded fingers", () => {
  const point = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point" }),
    0.6,
  );

  assert.equal(point.label, "point");
  assert.equal(point.phase, "candidate");
  assert.ok(point.indexExtensionRatio > 1.65);
  assert.equal(point.foldedFingerCount, 3);
  assert.deepEqual(point.pointerTip, { x: 0.4, y: 0.19 });
});

test("open palm, pinch, neutral, and low-confidence hands do not point", () => {
  for (const pose of ["open_palm", "pinch", "neutral"]) {
    assert.equal(
      classifyPointPose(createSyntheticTrackedHand({ pose }), 0.6).label,
      "none",
      pose,
    );
  }

  assert.equal(
    classifyPointPose(
      createSyntheticTrackedHand({ pose: "point", confidence: 0.4 }),
      0.6,
    ).label,
    "none",
  );
});

test("personal camera range maps to the full active display and mirrors x", () => {
  const calibration = {
    ...defaultGesturePointerCalibration,
    cameraMinX: 0.2,
    cameraMaxX: 0.8,
    cameraMinY: 0.1,
    cameraMaxY: 0.7,
  };
  const upperRight = mapCameraPointToDisplay(
    { x: 0.2, y: 0.1 },
    display,
    calibration,
  );
  const lowerLeft = mapCameraPointToDisplay(
    { x: 0.8, y: 0.7 },
    display,
    calibration,
  );

  assert.deepEqual(upperRight.normalized, { x: 1, y: 0 });
  assert.equal(upperRight.display.x, display.width - 1);
  assert.equal(upperRight.display.y, 0);
  assert.deepEqual(lowerLeft.normalized, { x: 0, y: 1 });
  assert.equal(lowerLeft.display.x, 0);
  assert.equal(lowerLeft.display.y, display.height - 1);
});

test("mapping clamps out-of-range movement inside the display", () => {
  const mapped = mapCameraPointToDisplay(
    { x: -10, y: 10 },
    display,
  );

  assert.ok(mapped.display.x >= 0 && mapped.display.x < display.width);
  assert.ok(mapped.display.y >= 0 && mapped.display.y < display.height);
  assert.ok(mapped.normalized.x >= 0 && mapped.normalized.x <= 1);
  assert.ok(mapped.normalized.y >= 0 && mapped.normalized.y <= 1);
});

test("pointing waits for a stable hold before producing a screen pointer", () => {
  const classification = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point" }),
    0.6,
  );
  const started = advanceGesturePointerTracking({
    previousState: resetGesturePointerTracking(),
    classification,
    display,
    nowMs: 1_000,
  });
  const almostStable = advanceGesturePointerTracking({
    previousState: started.state,
    classification,
    display,
    nowMs: 1_139,
  });
  const active = advanceGesturePointerTracking({
    previousState: almostStable.state,
    classification,
    display,
    nowMs: 1_140,
  });

  assert.equal(started.pointer, null);
  assert.equal(almostStable.pointer, null);
  assert.equal(active.pointer?.phase, "active");
  assert.equal(active.pointer?.display.displayId, display.id);
});

test("dead-zone and smoothing suppress jitter without blocking real movement", () => {
  const calibration = {
    ...defaultGesturePointerCalibration,
    pointHoldMs: 0,
    smoothingAlpha: 0.5,
    deadZone: 0.01,
  };
  const firstPose = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", frameId: 1, centerX: 0.5 }),
    0.6,
  );
  const first = advanceGesturePointerTracking({
    previousState: resetGesturePointerTracking(),
    classification: firstPose,
    display,
    nowMs: 1_000,
    calibration,
  });
  const tinyMovePose = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", frameId: 2, centerX: 0.501 }),
    0.6,
  );
  const tinyMove = advanceGesturePointerTracking({
    previousState: first.state,
    classification: tinyMovePose,
    display,
    nowMs: 1_067,
    calibration,
  });
  const largeMovePose = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", frameId: 3, centerX: 0.7 }),
    0.6,
  );
  const largeMove = advanceGesturePointerTracking({
    previousState: tinyMove.state,
    classification: largeMovePose,
    display,
    nowMs: 1_134,
    calibration,
  });

  assert.deepEqual(tinyMove.pointer?.normalized, first.pointer?.normalized);
  assert.notDeepEqual(largeMove.pointer?.normalized, first.pointer?.normalized);
  assert.notDeepEqual(
    largeMove.pointer?.normalized,
    mapCameraPointToDisplay(largeMovePose.pointerTip, display, calibration).normalized,
  );
});

test("brief tracking loss preserves the point for two seconds and then clears it", () => {
  const calibration = {
    ...defaultGesturePointerCalibration,
    pointHoldMs: 0,
  };
  const active = advanceGesturePointerTracking({
    previousState: resetGesturePointerTracking(),
    classification: classifyPointPose(
      createSyntheticTrackedHand({ pose: "point" }),
      0.6,
    ),
    display,
    nowMs: 5_000,
    calibration,
  });
  const missing = classifyPointPose(null, 0.6);
  const recovering = advanceGesturePointerTracking({
    previousState: active.state,
    classification: missing,
    display,
    nowMs: 6_999,
    calibration,
  });
  const stale = advanceGesturePointerTracking({
    previousState: recovering.state,
    classification: missing,
    display,
    nowMs: 7_000,
    calibration,
  });

  assert.equal(recovering.pointer?.phase, "recovering");
  assert.equal(stale.pointer, null);
  assert.equal(stale.state.active, false);
});

test("runtime clears pointing when camera access is unavailable", () => {
  assert.match(runtimeSource, /cameraStatus !== "active"/);
  assert.match(runtimeSource, /pointerTrackingStateRef\.current = resetGesturePointerTracking/);
  assert.match(runtimeSource, /setGesturePointer\(null\)/);
});

test("gesture pointer replaces only the blob position and never locks or clicks", () => {
  assert.match(appSource, /gesturePointerShadow \?\? pointerShadow/);
  assert.match(blobSource, /data-pointer-source/);
  assert.doesNotMatch(runtimeSource, /createPointerLockSnapshot/);
  assert.doesNotMatch(runtimeSource, /native_click/);
});
