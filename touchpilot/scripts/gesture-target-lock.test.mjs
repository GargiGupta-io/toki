import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createSyntheticDoubleTapFrames,
  createSyntheticTrackedHand,
} from "../apps/desktop/src/gestureFixtures.ts";
import {
  advanceGesturePointerTracking,
  classifyPointPose,
  defaultGesturePointerCalibration,
  resetGesturePointerTracking,
} from "../apps/desktop/src/gesturePointing.ts";
import {
  advanceDoubleAirTap,
  classifyAirTapPose,
  createScreenStateFingerprint,
  getPointerLockInvalidationReason,
  resetDoubleAirTapController,
} from "../apps/desktop/src/gestureTargetLock.ts";
import { createPointerLockSnapshot } from "../apps/desktop/src/gestureContracts.ts";

const display = {
  id: "test-display",
  width: 1470,
  height: 956,
  scaleFactor: 2,
};
const pointerCalibration = {
  ...defaultGesturePointerCalibration,
  pointHoldMs: 0,
};

function runFrames(frames) {
  let pointerState = resetGesturePointerTracking();
  let tapState = resetDoubleAirTapController();
  const requests = [];

  for (const multiHandFrame of frames) {
    const frame = multiHandFrame.hands[0] ?? null;
    const pointPose = classifyPointPose(frame, 0.6);
    const pointerResult = advanceGesturePointerTracking({
      previousState: pointerState,
      classification: pointPose,
      display,
      nowMs: Date.parse(multiHandFrame.capturedAt),
      calibration: pointerCalibration,
    });
    pointerState = pointerResult.state;
    const tapResult = advanceDoubleAirTap({
      previousState: tapState,
      pose: classifyAirTapPose({
        frame,
        pointPose,
        minDetectionConfidence: 0.6,
      }),
      pointer: pointerResult.pointer,
      nowMs: Date.parse(multiHandFrame.capturedAt),
    });
    tapState = tapResult.state;
    if (tapResult.lockRequest) {
      requests.push(tapResult.lockRequest);
    }
  }

  return { pointerState, tapState, requests };
}

function frameFor(hand) {
  return {
    frameId: hand.frameId,
    capturedAt: hand.capturedAt,
    sourceWidth: 1280,
    sourceHeight: 720,
    mirrored: true,
    hands: [hand],
  };
}

test("air tap distinguishes the pointing return from an intentional index flex", () => {
  const point = createSyntheticTrackedHand({ pose: "point" });
  const flexed = createSyntheticTrackedHand({ pose: "tap_flexed", frameId: 2 });
  const pointPose = classifyPointPose(point, 0.6);
  const flexedPointPose = classifyPointPose(flexed, 0.6);

  assert.equal(
    classifyAirTapPose({
      frame: point,
      pointPose,
      minDetectionConfidence: 0.6,
    }).label,
    "extended",
  );
  const flex = classifyAirTapPose({
    frame: flexed,
    pointPose: flexedPointPose,
    minDetectionConfidence: 0.6,
  });
  assert.equal(flex.label, "flexed");
  assert.ok(flex.indexExtensionRatio < flex.flexionRatioThreshold);
});

test("two complete flex-and-return taps lock one copied point", () => {
  const result = runFrames(createSyntheticDoubleTapFrames());

  assert.equal(result.requests.length, 1);
  assert.equal(result.tapState.tap.phase, "locked");
  assert.ok(result.tapState.tap.firstTap);
  assert.ok(result.tapState.tap.secondTap);
  assert.equal(result.requests[0].pointer.handTrackId, "pointer-hand");

  const lockedX = result.requests[0].pointer.display.x;
  result.pointerState.pointer.display.x = 1;
  assert.equal(result.requests[0].pointer.display.x, lockedX);
});

test("holding the index flexed does not manufacture a second tap", () => {
  const startAt = Date.parse("2026-07-15T00:00:00.000Z");
  const poses = ["point", "tap_flexed", "tap_flexed", "tap_flexed", "point"];
  const frames = poses.map((pose, index) => {
    const capturedAt = new Date(startAt + index * 150).toISOString();
    return frameFor(
      createSyntheticTrackedHand({
        pose,
        frameId: index + 1,
        capturedAt,
        trackId: "pointer-hand",
      }),
    );
  });
  const result = runFrames(frames);

  assert.equal(result.requests.length, 0);
  assert.equal(result.tapState.tap.phase, "armed");
  assert.ok(result.tapState.tap.firstTap);
  assert.equal(result.tapState.tap.secondTap, undefined);
});

test("a flex cannot begin from a stale point after pointer recovery ends", () => {
  const flexed = createSyntheticTrackedHand({ pose: "tap_flexed" });
  const pointPose = classifyPointPose(flexed, 0.6);
  const result = advanceDoubleAirTap({
    previousState: resetDoubleAirTapController({
      handTrackId: "hand-1",
      phase: "recovering",
      normalized: { x: 0.4, y: 0.3 },
      display: { displayId: display.id, x: 588, y: 287 },
      confidence: 0.95,
      sourceFrameId: 1,
      capturedAt: "2026-07-15T00:00:00.000Z",
    }),
    pose: classifyAirTapPose({
      frame: flexed,
      pointPose,
      minDetectionConfidence: 0.6,
    }),
    pointer: null,
    nowMs: Date.parse(flexed.capturedAt),
  });

  assert.equal(result.state.tap.phase, "idle");
  assert.equal(result.lockRequest, null);
});

test("the second tap must return on the same hand and near the armed point", () => {
  const frames = createSyntheticDoubleTapFrames();
  frames[3] = frameFor(
    createSyntheticTrackedHand({
      pose: "tap_flexed",
      frameId: 4,
      capturedAt: frames[3].capturedAt,
      trackId: "other-hand",
    }),
  );
  frames[4] = frameFor(
    createSyntheticTrackedHand({
      pose: "point",
      frameId: 5,
      capturedAt: frames[4].capturedAt,
      trackId: "other-hand",
    }),
  );

  const wrongHand = runFrames(frames);
  assert.equal(wrongHand.requests.length, 0);
  assert.equal(wrongHand.tapState.tap.phase, "cooldown");

  const movedFrames = createSyntheticDoubleTapFrames();
  movedFrames[3] = frameFor(
    createSyntheticTrackedHand({
      pose: "tap_flexed",
      frameId: 4,
      capturedAt: movedFrames[3].capturedAt,
      trackId: "pointer-hand",
      centerX: 0.85,
    }),
  );
  movedFrames[4] = frameFor(
    createSyntheticTrackedHand({
      pose: "point",
      frameId: 5,
      capturedAt: movedFrames[4].capturedAt,
      trackId: "pointer-hand",
      centerX: 0.85,
    }),
  );
  const moved = runFrames(movedFrames);
  assert.equal(moved.requests.length, 0);
  assert.equal(moved.tapState.tap.phase, "cancelled");
});

test("a single tap expires after the two-second human grace window", () => {
  const frames = createSyntheticDoubleTapFrames().slice(0, 3);
  const firstTap = runFrames(frames);
  const expired = advanceDoubleAirTap({
    previousState: firstTap.tapState,
    pose: classifyAirTapPose({
      frame: null,
      pointPose: classifyPointPose(null, 0.6),
      minDetectionConfidence: 0.6,
    }),
    pointer: firstTap.pointerState.pointer,
    nowMs: Date.parse(frames[2].capturedAt) + 2_001,
  });

  assert.equal(expired.lockRequest, null);
  assert.equal(expired.state.tap.phase, "cancelled");
});

test("screen evidence invalidates a lock on permission, display, or window changes", () => {
  const pointer = {
    handTrackId: "pointer-hand",
    phase: "active",
    normalized: { x: 0.4, y: 0.3 },
    display: { displayId: display.id, x: 588, y: 287 },
    confidence: 0.95,
    sourceFrameId: 8,
    capturedAt: "2026-07-15T00:00:01.000Z",
  };
  const activeWindowId = createScreenStateFingerprint({
    appName: "Spotify",
    title: "Spotify Premium",
    x: 200,
    y: 100,
    width: 920,
    height: 720,
  });
  const lock = createPointerLockSnapshot({
    id: "lock-screen-state",
    lockedAt: pointer.capturedAt,
    pointer,
    evidence: {
      snapshotId: "snapshot-screen-state",
      capturedAt: pointer.capturedAt,
      activeWindowId,
      regionHash: activeWindowId,
    },
    display,
  });

  assert.equal(
    getPointerLockInvalidationReason({
      lock,
      display,
      screenCaptureAvailable: true,
      activeWindowId,
    }),
    null,
  );
  assert.equal(
    getPointerLockInvalidationReason({
      lock,
      display,
      screenCaptureAvailable: false,
      activeWindowId,
    }),
    "screen_capture_unavailable",
  );
  assert.equal(
    getPointerLockInvalidationReason({
      lock,
      display: { ...display, width: 1200 },
      screenCaptureAvailable: true,
      activeWindowId,
    }),
    "display_changed",
  );
  assert.equal(
    getPointerLockInvalidationReason({
      lock,
      display,
      screenCaptureAvailable: true,
      activeWindowId: activeWindowId.replace("spotify premium", "other window"),
    }),
    "screen_state_changed",
  );
});

test("lock feedback is distinct from accepted guidance and never clicks", () => {
  const appSource = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );
  const cueSource = readFileSync(
    new URL("../apps/desktop/src/TokiPointerLockCue.tsx", import.meta.url),
    "utf8",
  );
  const cueStyles = readFileSync(
    new URL("../apps/desktop/src/TokiPointerLockCue.css", import.meta.url),
    "utf8",
  );
  const runtimeSource = readFileSync(
    new URL("../apps/desktop/src/gestureRuntime.ts", import.meta.url),
    "utf8",
  );

  assert.match(appSource, /<TokiPointerLockCue/);
  assert.match(appSource, /screen_capture_access_status/);
  assert.match(appSource, /frontmost_window_bounds/);
  assert.doesNotMatch(cueSource, /TokiStatusRing/);
  assert.doesNotMatch(cueSource, /TargetCue/);
  assert.match(cueStyles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(cueStyles, /border:\s*\d+px\s+solid/);
  assert.doesNotMatch(runtimeSource, /native_click/);
});
