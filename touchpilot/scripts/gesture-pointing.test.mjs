import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSyntheticTrackedHand } from "../apps/desktop/src/gestureFixtures.ts";
import {
  advanceGesturePointerTracking,
  classifyPointPose,
  defaultGesturePointerCalibration,
  isPointPoseContinuation,
  mapCameraPointToDisplay,
  pointerVisualRecoveryGraceMs,
  resetGesturePointerTracking,
} from "../apps/desktop/src/gesturePointing.ts";
import {
  clampPuckCenterToViewport,
  cursorPointerSeparation,
  gesturePointerSeparation,
  getDetachedGesturePointerShadowPosition,
  getPointerShadowPosition,
  pointerShadowGeometry,
} from "../apps/desktop/src/overlayGeometry.ts";

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

test("point continuation tolerates a softened same-hand pose without weakening entry", () => {
  const strict = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", frameId: 1 }),
    0.6,
  );
  const softened = {
    ...strict,
    label: "none",
    phase: "inactive",
    confidence: 0,
    sourceFrameId: 2,
    indexExtensionRatio: 1.5,
    indexPipAngle: 140,
    indexDipAngle: 135,
    foldedFingerCount: 2,
  };
  const calibration = {
    ...defaultGesturePointerCalibration,
    pointHoldMs: 140,
  };
  const started = advanceGesturePointerTracking({
    previousState: resetGesturePointerTracking(),
    classification: strict,
    display,
    nowMs: 1_000,
    calibration,
  });
  const continued = advanceGesturePointerTracking({
    previousState: started.state,
    classification: softened,
    display,
    nowMs: 1_140,
    calibration,
  });

  assert.equal(strict.label, "point");
  assert.equal(isPointPoseContinuation(softened), true);
  assert.equal(continued.pointer?.phase, "active");
  assert.equal(continued.pointer?.handTrackId, strict.handTrackId);
});

test("a single glitched frame does not drop a hand that is still pointing", () => {
  // Replays a real failure from a live trace. Over three minutes the pose was
  // lost 16 times while the hand stayed plainly visible, and 13 of those lasted
  // a single frame: the index extension ratio read 1.78, then 0.65, then 1.55
  // again, with the landmarks unusable only in the middle frame. Entering the
  // pose already required a stable hold; leaving it did not, so each of those
  // glitches let go of a hand the user was still pointing with.
  const calibration = { ...defaultGesturePointerCalibration, pointHoldMs: 0 };
  const healthy = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", trackId: "pointer-hand" }),
    0.6,
  );
  const active = advanceGesturePointerTracking({
    previousState: resetGesturePointerTracking(),
    classification: healthy,
    display,
    nowMs: 1_000,
    calibration,
  });
  assert.equal(active.pointer?.phase, "active");

  // One frame where the landmarks were never measurable at all.
  const glitched = advanceGesturePointerTracking({
    previousState: active.state,
    classification: {
      ...healthy,
      label: "none",
      phase: "inactive",
      inactiveReason: "missing_landmark",
      pointerTip: null,
      indexExtensionRatio: null,
      sourceFrameId: 2,
    },
    display,
    nowMs: 1_033,
    calibration,
  });
  assert.equal(
    glitched.pointer?.phase,
    "active",
    "one unmeasurable frame must not let go of the hand",
  );

  // The very next frame is healthy again, as it was in the trace.
  const resumed = advanceGesturePointerTracking({
    previousState: glitched.state,
    classification: { ...healthy, sourceFrameId: 3 },
    display,
    nowMs: 1_066,
    calibration,
  });
  assert.equal(resumed.pointer?.phase, "active");
  assert.equal(
    resumed.state.active,
    true,
    "the pointer should never have needed to re-acquire",
  );
});

test("a sustained pose failure still releases the pointer", () => {
  // The hold must not become a way to keep a stale pointer alive: the same
  // trace had genuine losses lasting 283 ms, 382 ms and 1206 ms, and those
  // should clear.
  const calibration = { ...defaultGesturePointerCalibration, pointHoldMs: 0 };
  const healthy = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", trackId: "pointer-hand" }),
    0.6,
  );
  let current = advanceGesturePointerTracking({
    previousState: resetGesturePointerTracking(),
    classification: healthy,
    display,
    nowMs: 1_000,
    calibration,
  });

  const missing = classifyPointPose(null, 0.6);
  for (const nowMs of [1_033, 1_066, 1_100, 1_133]) {
    current = advanceGesturePointerTracking({
      previousState: current.state,
      classification: missing,
      display,
      nowMs,
      calibration,
    });
  }

  assert.equal(
    current.pointer?.phase,
    "recovering",
    "a failure lasting past the hold must release the pointer",
  );
});

test("point continuation rejects a relaxed pose from another hand or an open palm", () => {
  const strict = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", trackId: "pointer-hand" }),
    0.6,
  );
  const started = advanceGesturePointerTracking({
    previousState: resetGesturePointerTracking(),
    classification: strict,
    display,
    nowMs: 1_000,
    calibration: {
      ...defaultGesturePointerCalibration,
      pointHoldMs: 0,
    },
  });
  const otherHand = {
    ...strict,
    label: "none",
    phase: "inactive",
    handTrackId: "other-hand",
    sourceFrameId: 2,
    indexExtensionRatio: 1.5,
    indexPipAngle: 140,
    indexDipAngle: 135,
    foldedFingerCount: 2,
  };
  const openPalm = classifyPointPose(
    createSyntheticTrackedHand({
      pose: "open_palm",
      trackId: "pointer-hand",
      frameId: 3,
    }),
    0.6,
  );

  // Within the exit hold the pointer stays put. Entering the pose already
  // required pointHoldMs of stable classification because a single frame is not
  // trustworthy; leaving it now takes the same care, so a one-frame landmark
  // glitch no longer drops the hand the user is still pointing with.
  assert.equal(
    advanceGesturePointerTracking({
      previousState: started.state,
      classification: otherHand,
      display,
      nowMs: 1_050,
    }).pointer?.phase,
    "active",
  );

  // Past the hold the rejection stands: this pose is not a continuation, and a
  // sustained failure still releases the pointer promptly.
  assert.equal(
    advanceGesturePointerTracking({
      previousState: started.state,
      classification: otherHand,
      display,
      nowMs: 1_000 + defaultGesturePointerCalibration.poseExitHoldMs + 1,
    }).pointer?.phase,
    "recovering",
  );
  assert.equal(isPointPoseContinuation(openPalm), false);
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

test("default mapping is one-to-one across the complete camera frame", () => {
  const mapped = mapCameraPointToDisplay({ x: 0.25, y: 0.4 }, display);

  assert.deepEqual(mapped.normalized, { x: 0.75, y: 0.4 });
  assert.equal(mapped.display.x, 0.75 * (display.width - 1));
  assert.equal(mapped.display.y, 0.4 * (display.height - 1));
  assert.deepEqual(
    {
      minX: defaultGesturePointerCalibration.cameraMinX,
      maxX: defaultGesturePointerCalibration.cameraMaxX,
      minY: defaultGesturePointerCalibration.cameraMinY,
      maxY: defaultGesturePointerCalibration.cameraMaxY,
    },
    { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  );
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

test("adaptive timing attenuates resting jitter without freezing the pointer", () => {
  const calibration = {
    ...defaultGesturePointerCalibration,
    pointHoldMs: 0,
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
    createSyntheticTrackedHand({ pose: "point", frameId: 2, centerX: 0.502 }),
    0.6,
  );
  const tinyMove = advanceGesturePointerTracking({
    previousState: first.state,
    classification: tinyMovePose,
    display,
    nowMs: 1_042,
    calibration,
  });
  const rawTinyMove = mapCameraPointToDisplay(
    tinyMovePose.pointerTip,
    display,
    calibration,
  );
  const largeMovePose = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", frameId: 3, centerX: 0.7 }),
    0.6,
  );
  const largeMove = advanceGesturePointerTracking({
    previousState: tinyMove.state,
    classification: largeMovePose,
    display,
    nowMs: 1_084,
    calibration,
  });

  const rawJitterDistance = Math.hypot(
    rawTinyMove.normalized.x - first.pointer.normalized.x,
    rawTinyMove.normalized.y - first.pointer.normalized.y,
  );
  const filteredJitterDistance = Math.hypot(
    tinyMove.pointer.normalized.x - first.pointer.normalized.x,
    tinyMove.pointer.normalized.y - first.pointer.normalized.y,
  );

  assert.ok(filteredJitterDistance > 0);
  assert.ok(filteredJitterDistance < rawJitterDistance * 0.5);
  assert.notDeepEqual(largeMove.pointer?.normalized, first.pointer?.normalized);
  assert.notDeepEqual(
    largeMove.pointer?.normalized,
    mapCameraPointToDisplay(largeMovePose.pointerTip, display, calibration).normalized,
  );
});

test("default smoothing catches up quickly on deliberate movement", () => {
  const calibration = {
    ...defaultGesturePointerCalibration,
    pointHoldMs: 0,
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
  const movedPose = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", frameId: 2, centerX: 0.7 }),
    0.6,
  );
  const moved = advanceGesturePointerTracking({
    previousState: first.state,
    classification: movedPose,
    display,
    nowMs: 1_042,
    calibration,
  });
  const rawMoved = mapCameraPointToDisplay(
    movedPose.pointerTip,
    display,
    calibration,
  );
  const fullDelta = Math.abs(
    rawMoved.normalized.x - first.pointer.normalized.x,
  );
  const followedDelta = Math.abs(
    moved.pointer.normalized.x - first.pointer.normalized.x,
  );

  assert.ok(followedDelta / fullDelta >= 0.8);
});

test("adaptive pointer response is stable across inference frame rates", () => {
  const calibration = {
    ...defaultGesturePointerCalibration,
    pointHoldMs: 0,
  };
  const runStepResponse = (framesPerSecond) => {
    let state = resetGesturePointerTracking();
    const initialPose = classifyPointPose(
      createSyntheticTrackedHand({
        pose: "point",
        frameId: 1,
        centerX: 0.5,
      }),
      0.6,
    );
    let result = advanceGesturePointerTracking({
      previousState: state,
      classification: initialPose,
      display,
      nowMs: 0,
      calibration,
    });
    state = result.state;
    const movedPose = classifyPointPose(
      createSyntheticTrackedHand({
        pose: "point",
        frameId: 2,
        centerX: 0.7,
      }),
      0.6,
    );
    const intervalMs = 1_000 / framesPerSecond;
    const durationMs = 250;

    for (let nowMs = intervalMs; nowMs < durationMs; nowMs += intervalMs) {
      result = advanceGesturePointerTracking({
        previousState: state,
        classification: movedPose,
        display,
        nowMs,
        calibration,
      });
      state = result.state;
    }

    return advanceGesturePointerTracking({
      previousState: state,
      classification: movedPose,
      display,
      nowMs: durationMs,
      calibration,
    }).pointer.normalized;
  };

  const at24Fps = runStepResponse(24);
  const at60Fps = runStepResponse(60);

  assert.ok(Math.abs(at24Fps.x - at60Fps.x) < 0.005);
  assert.ok(Math.abs(at24Fps.y - at60Fps.y) < 0.005);
});

test("adaptive filtering never overshoots and resets after a long frame gap", () => {
  const calibration = {
    ...defaultGesturePointerCalibration,
    pointHoldMs: 0,
  };
  const initialPose = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", frameId: 1, centerX: 0.5 }),
    0.6,
  );
  const initial = advanceGesturePointerTracking({
    previousState: resetGesturePointerTracking(),
    classification: initialPose,
    display,
    nowMs: 1_000,
    calibration,
  });
  const movedPose = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", frameId: 2, centerX: 0.7 }),
    0.6,
  );
  const rawMoved = mapCameraPointToDisplay(
    movedPose.pointerTip,
    display,
    calibration,
  );
  const moved = advanceGesturePointerTracking({
    previousState: initial.state,
    classification: movedPose,
    display,
    nowMs: 1_042,
    calibration,
  });
  const lowerX = Math.min(initial.pointer.normalized.x, rawMoved.normalized.x);
  const upperX = Math.max(initial.pointer.normalized.x, rawMoved.normalized.x);

  assert.ok(moved.pointer.normalized.x >= lowerX);
  assert.ok(moved.pointer.normalized.x <= upperX);

  const afterGapPose = classifyPointPose(
    createSyntheticTrackedHand({ pose: "point", frameId: 3, centerX: 0.3 }),
    0.6,
  );
  const afterGapRaw = mapCameraPointToDisplay(
    afterGapPose.pointerTip,
    display,
    calibration,
  );
  const afterGap = advanceGesturePointerTracking({
    previousState: moved.state,
    classification: afterGapPose,
    display,
    nowMs: 1_042 + calibration.filterResetAfterMs,
    calibration,
  });

  assert.deepEqual(afterGap.pointer.normalized, afterGapRaw.normalized);
});

test("cursor blob keeps a visible right-side gap without jumping at screen edges", () => {
  const viewport = {
    width: 1_000,
    height: 800,
    devicePixelRatio: 2,
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
  const puckRadius = 24;
  const renderedCenter = (x, y) => {
    const shadow = getPointerShadowPosition(x, y, viewport);

    return {
      x: clampPuckCenterToViewport(
        shadow.x + pointerShadowGeometry.width / 2,
        puckRadius,
        viewport.width,
      ),
      y: clampPuckCenterToViewport(
        shadow.y + pointerShadowGeometry.height / 2,
        puckRadius,
        viewport.height,
      ),
    };
  };
  const openPointer = { x: 500, y: 400 };
  const openCenter = renderedCenter(openPointer.x, openPointer.y);
  const openDistance = Math.hypot(
    cursorPointerSeparation.horizontal,
    cursorPointerSeparation.vertical,
  );

  assert.deepEqual(openCenter, {
    x: openPointer.x + cursorPointerSeparation.horizontal,
    y: openPointer.y + cursorPointerSeparation.vertical,
  });
  assert.equal(
    Math.hypot(
      openCenter.x - openPointer.x,
      openCenter.y - openPointer.y,
    ),
    openDistance,
  );

  for (const pointer of [
    { x: 0, y: 400 },
    { x: viewport.width, y: 400 },
    { x: 500, y: 0 },
    { x: 500, y: viewport.height },
    { x: viewport.width, y: 0 },
  ]) {
    const center = renderedCenter(pointer.x, pointer.y);
    const edgeDistance = Math.hypot(
      center.x - pointer.x,
      center.y - pointer.y,
    );

    assert.ok(edgeDistance <= openDistance + Number.EPSILON * 100);
    assert.ok(center.x >= puckRadius);
    assert.ok(center.x <= viewport.width - puckRadius);
    assert.ok(center.y >= puckRadius);
    assert.ok(center.y <= viewport.height - puckRadius);
  }

  const nearRight = renderedCenter(viewport.width - 1, 400);
  const atRight = renderedCenter(viewport.width, 400);
  assert.ok(Math.abs(atRight.x - nearRight.x) <= 1);
  assert.ok(Math.abs(atRight.y - nearRight.y) <= 1);
});

test("gesture blob keeps open-space separation and compresses naturally at screen edges", () => {
  const viewport = {
    width: 1_000,
    height: 800,
    devicePixelRatio: 2,
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
  const detached = getDetachedGesturePointerShadowPosition(500, 400, viewport);
  const detachedCenter = {
    x: detached.x + pointerShadowGeometry.width / 2,
    y: detached.y + pointerShadowGeometry.height / 2,
  };
  const puckRadius = 34;
  const openSpaceDistance = Math.hypot(
    gesturePointerSeparation.horizontal,
    gesturePointerSeparation.vertical,
  );
  const edgePointers = [
    { x: 0, y: viewport.height / 2, edge: "left", expected: puckRadius },
    {
      x: viewport.width,
      y: viewport.height / 2,
      edge: "right",
      expected: viewport.width - puckRadius,
    },
    { x: viewport.width / 2, y: 0, edge: "top", expected: puckRadius },
    {
      x: viewport.width / 2,
      y: viewport.height,
      edge: "bottom",
      expected: viewport.height - puckRadius,
    },
  ];

  assert.equal(detachedCenter.x - 500, gesturePointerSeparation.horizontal);
  assert.equal(400 - detachedCenter.y, gesturePointerSeparation.vertical);
  assert.equal(
    Math.hypot(detachedCenter.x - 500, detachedCenter.y - 400),
    openSpaceDistance,
  );

  for (const edgePointer of edgePointers) {
    const shadow = getDetachedGesturePointerShadowPosition(
      edgePointer.x,
      edgePointer.y,
      viewport,
    );
    const rawCenterX = shadow.x + pointerShadowGeometry.width / 2;
    const rawCenterY = shadow.y + pointerShadowGeometry.height / 2;
    const centerX = clampPuckCenterToViewport(
      rawCenterX,
      puckRadius,
      viewport.width,
    );
    const centerY = clampPuckCenterToViewport(
      rawCenterY,
      puckRadius,
      viewport.height,
    );
    const edgeCoordinate =
      edgePointer.edge === "left" || edgePointer.edge === "right"
        ? centerX
        : centerY;
    assert.equal(edgeCoordinate, edgePointer.expected);
    const edgeDistance = Math.hypot(
      centerX - edgePointer.x,
      centerY - edgePointer.y,
    );
    assert.ok(edgeDistance >= 45);
    assert.ok(edgeDistance < openSpaceDistance);
  }


  const corner = getDetachedGesturePointerShadowPosition(0, 0, viewport);
  const cornerCenter = {
    x: clampPuckCenterToViewport(
      corner.x + pointerShadowGeometry.width / 2,
      puckRadius,
      viewport.width,
    ),
    y: clampPuckCenterToViewport(
      corner.y + pointerShadowGeometry.height / 2,
      puckRadius,
      viewport.height,
    ),
  };
  const cornerDistance = Math.hypot(cornerCenter.x, cornerCenter.y);
  assert.equal(cornerDistance, Math.hypot(puckRadius, puckRadius));
  assert.ok(cornerDistance < openSpaceDistance);
});

test("brief loss keeps internal recovery for two seconds without freezing the visible pointer", () => {
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
  const visiblyRecovering = advanceGesturePointerTracking({
    previousState: active.state,
    classification: missing,
    display,
    nowMs: 5_000 + pointerVisualRecoveryGraceMs - 1,
    calibration,
  });
  const visuallyCleared = advanceGesturePointerTracking({
    previousState: visiblyRecovering.state,
    classification: missing,
    display,
    nowMs: 5_000 + pointerVisualRecoveryGraceMs,
    calibration,
  });
  const stale = advanceGesturePointerTracking({
    previousState: visuallyCleared.state,
    classification: missing,
    display,
    nowMs: 7_000,
    calibration,
  });

  assert.equal(visiblyRecovering.pointer?.phase, "recovering");
  assert.equal(visuallyCleared.pointer, null);
  assert.equal(visuallyCleared.state.active, true);
  assert.equal(visuallyCleared.state.pointer?.phase, "recovering");
  assert.equal(stale.pointer, null);
  assert.equal(stale.state.active, false);
});

test("runtime clears pointing when camera access is unavailable", () => {
  assert.match(runtimeSource, /cameraStatus !== "active"/);
  assert.match(runtimeSource, /pointerTrackingStateRef\.current = resetGesturePointerTracking/);
  assert.match(runtimeSource, /setGesturePointer\(null\)/);
});

test("gesture pointer replaces only the blob position and never locks or clicks", () => {
  // The gesture placement is sprung before it reaches the blob, so the value
  // handed over is the sprung one. What this test is about is unchanged: the
  // hand moves the blob and nothing else.
  assert.match(appSource, /sprungPointerShadow \?\? pointerShadow/);
  assert.match(appSource, /usePuckSpring\(/);
  assert.match(appSource, /getDetachedGesturePointerShadowPosition/);
  assert.match(blobSource, /data-pointer-source/);
  assert.match(blobSource, /gestureBlobFollowDurationSeconds = 0\.025/);
  assert.doesNotMatch(runtimeSource, /createPointerLockSnapshot/);
  assert.doesNotMatch(runtimeSource, /native_click/);
});

test("an active pointer keeps being measured through a dip in detection confidence", () => {
  const strong = createSyntheticTrackedHand({
    pose: "point",
    trackId: "hand-1",
    frameId: 1,
  });
  const dipped = {
    ...createSyntheticTrackedHand({
      pose: "point",
      trackId: "hand-1",
      frameId: 2,
    }),
    confidence: 0.5,
  };

  // No active pointer: the dip is rejected outright and nothing is measured.
  const cold = classifyPointPose(dipped, 0.6);
  assert.equal(cold.label, "none");
  assert.equal(cold.indexExtensionRatio, null);

  // The same frame while that track already drives the pointer stays measured.
  const warm = classifyPointPose(dipped, 0.6, "hand-1");
  assert.equal(warm.label, "point");
  assert.ok(warm.indexExtensionRatio > 0);
  assert.equal(warm.handTrackId, "hand-1");

  // A different hand gets no such credit.
  const other = classifyPointPose(dipped, 0.6, "hand-2");
  assert.equal(other.label, "none");
  assert.equal(other.indexExtensionRatio, null);

  // A rejected frame still names its track, so diagnostics can tell a
  // confidence rejection from a genuinely absent hand.
  assert.equal(other.handTrackId, "hand-1");
  assert.equal(classifyPointPose(null, 0.6).handTrackId, null);

  // The floor is a dip, not an open door.
  const collapsed = { ...strong, confidence: 0.2 };
  assert.equal(classifyPointPose(collapsed, 0.6, "hand-1").label, "none");
});
