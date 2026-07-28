import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  advanceGestureVideoFrameFreshness,
  createInitialGestureVideoFrameFreshnessState,
  gestureVideoFramePolicy,
  readGestureVideoFrameProgress,
} from "../apps/desktop/src/gestureFrameFreshness.ts";
import { defaultGesturePointerCalibration } from "../apps/desktop/src/gesturePointing.ts";
import {
  gestureCandidateLossGraceMs,
  initialGestureSmoothingState,
  smoothGestureCandidate,
} from "../apps/desktop/src/gestureSmoothing.ts";

const thresholds = {
  minDetectionConfidence: 0.6,
  pinchHoldMs: 180,
  openPalmHoldMs: 220,
  cooldownMs: 700,
  maxHands: 2,
};

const appSource = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("../apps/desktop/src/gestureRuntime.ts", import.meta.url),
  "utf8",
);

test("duplicate camera frames are skipped and a stalled stream advances empty input", () => {
  let state = createInitialGestureVideoFrameFreshnessState();
  const first = advanceGestureVideoFrameFreshness({
    previousState: state,
    videoTime: 1,
    nowMs: 0,
  });
  state = first.state;
  const duplicate = advanceGestureVideoFrameFreshness({
    previousState: state,
    videoTime: 1,
    nowMs: gestureVideoFramePolicy.staleAfterMs - 1,
  });
  const stalled = advanceGestureVideoFrameFreshness({
    previousState: duplicate.state,
    videoTime: 1,
    nowMs: gestureVideoFramePolicy.staleAfterMs,
  });
  const resumed = advanceGestureVideoFrameFreshness({
    previousState: stalled.state,
    videoTime: 1.033,
    nowMs: gestureVideoFramePolicy.staleAfterMs + 10,
  });

  assert.equal(first.shouldInfer, true);
  assert.equal(duplicate.shouldInfer, false);
  assert.equal(duplicate.shouldAdvanceWithEmptyFrame, false);
  assert.equal(stalled.shouldAdvanceWithEmptyFrame, true);
  assert.equal(stalled.state.stale, true);
  assert.equal(resumed.shouldInfer, true);
  assert.equal(resumed.state.stale, false);
});

test("live WebKit camera timing cannot suppress every hand inference", () => {
  assert.equal(
    readGestureVideoFrameProgress({
      currentTime: Number.POSITIVE_INFINITY,
    }),
    null,
  );
  assert.equal(
    readGestureVideoFrameProgress({
      currentTime: 0,
    }),
    null,
  );
  assert.equal(
    readGestureVideoFrameProgress({
      currentTime: 0,
      webkitDecodedFrameCount: 14,
    }),
    14,
  );
  assert.equal(
    readGestureVideoFrameProgress({
      currentTime: 0,
      getVideoPlaybackQuality: () => ({ totalVideoFrames: 22 }),
    }),
    22,
  );

  const fallback = advanceGestureVideoFrameFreshness({
    previousState: createInitialGestureVideoFrameFreshnessState(),
    videoTime: null,
    nowMs: 100,
  });

  assert.equal(fallback.shouldInfer, true);
  assert.equal(fallback.shouldAdvanceWithEmptyFrame, false);
  assert.equal(fallback.state.stale, false);
});

test("one brief missing classification does not erase an in-progress gesture", () => {
  const pinch = { label: "pinch", confidence: 0.94, sourceFrameId: 1 };
  const missing = { label: "none", confidence: 0, sourceFrameId: 2 };
  const started = smoothGestureCandidate(
    initialGestureSmoothingState,
    pinch,
    thresholds,
    0,
  );
  const briefLoss = smoothGestureCandidate(
    started.state,
    missing,
    thresholds,
    gestureCandidateLossGraceMs - 1,
  );
  const recovered = smoothGestureCandidate(
    briefLoss.state,
    { ...pinch, sourceFrameId: 3 },
    thresholds,
    thresholds.pinchHoldMs,
  );

  assert.equal(briefLoss.classification.label, "pinch");
  assert.equal(briefLoss.classification.phase, "holding");
  assert.equal(recovered.classification.phase, "recognized");
});

test("default pointer precision uses a time-aware responsive full-frame filter", () => {
  assert.equal(defaultGesturePointerCalibration.cameraMinX, 0);
  assert.equal(defaultGesturePointerCalibration.cameraMaxX, 1);
  assert.equal(defaultGesturePointerCalibration.cameraMinY, 0);
  assert.equal(defaultGesturePointerCalibration.cameraMaxY, 1);
  assert.equal(defaultGesturePointerCalibration.restingResponseMs, 85);
  assert.equal(defaultGesturePointerCalibration.movingResponseMs, 18);
  assert.equal(defaultGesturePointerCalibration.jitterRadius, 0.0035);
  assert.equal(defaultGesturePointerCalibration.fullSpeedDistance, 0.045);
  assert.equal(defaultGesturePointerCalibration.filterResetAfterMs, 180);
});

test("live pointing is derived in the inference frame at a responsive bounded cadence", () => {
  const pointerAdvanceIndex = runtimeSource.indexOf(
    "const pointerResult = advanceGesturePointerTracking",
  );
  const landmarkPublishIndex = runtimeSource.indexOf(
    "setMultiHandLandmarkFrame(tracking.frame)",
  );

  assert.match(runtimeSource, /gestureInferenceFramesPerSecond = 30/);
  assert.match(runtimeSource, /gestureInferenceToleranceMs/);
  assert.ok(pointerAdvanceIndex >= 0);
  assert.ok(landmarkPublishIndex > pointerAdvanceIndex);
});

test("control pinch waits through lock validation and stale video cannot freeze hands", () => {
  const checkingIndex = appSource.indexOf(
    'gesturePointerLockFeedback.validation === "checking"',
  );
  const handledIndex = appSource.indexOf(
    "handledControlPinchEventRef.current = event.id",
    checkingIndex,
  );

  assert.ok(checkingIndex >= 0);
  assert.ok(handledIndex > checkingIndex);
  assert.match(runtimeSource, /advanceGestureVideoFrameFreshness/);
  assert.match(runtimeSource, /readGestureVideoFrameProgress\(video\)/);
  assert.match(runtimeSource, /shouldAdvanceWithEmptyFrame/);
  assert.match(
    runtimeSource,
    /canPress: controlPinchEligible && controlPinchSelected/,
  );
  assert.match(runtimeSource, /advanceGestureIntentArbiter/);
  assert.doesNotMatch(runtimeSource, /video\.play\(\)\.catch/);
});

test("a deliberate untwist releases the same lock it was granted for", () => {
  assert.match(runtimeSource, /setUnlockRequest\(result\.unlockRequest\)/);
  assert.match(runtimeSource, /state\.lock\.phase !== "unlocking"/);

  const unlockIndex = appSource.indexOf(
    "alwaysOnGestureRuntime.unlockRequest",
  );
  const guardIndex = appSource.indexOf(
    "gesturePointerLock?.id !== request.lockId",
    unlockIndex,
  );
  const releaseIndex = appSource.indexOf(
    "setGesturePointerLock(null)",
    guardIndex,
  );

  assert.ok(unlockIndex >= 0);
  assert.ok(guardIndex > unlockIndex);
  assert.ok(releaseIndex > guardIndex);
});
