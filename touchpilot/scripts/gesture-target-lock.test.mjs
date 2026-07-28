import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createSyntheticTrackedHand,
  createSyntheticWristRollFrames,
} from "../apps/desktop/src/gestureFixtures.ts";
import {
  advanceGesturePointerTracking,
  classifyPointPose,
  defaultGesturePointerCalibration,
  resetGesturePointerTracking,
} from "../apps/desktop/src/gesturePointing.ts";
import {
  advanceWristRollLock,
  classifyWristRollPose,
  createScreenStateFingerprint,
  getPointerLockInvalidationReason,
  resetWristRollLockController,
} from "../apps/desktop/src/gestureTargetLock.ts";
import { createPointerLockSnapshot } from "../apps/desktop/src/gestureContracts.ts";
import { createGesturePuckPresentation } from "../apps/desktop/src/gesturePuckPresentation.ts";

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
  let rollState = resetWristRollLockController();
  const requests = [];
  const unlockRequests = [];

  for (const multiHandFrame of frames) {
    const frame = multiHandFrame.hands[0] ?? null;
    const pointPose = classifyPointPose(frame, 0.6);
    const nowMs = Date.parse(multiHandFrame.capturedAt);
    const pointerResult = advanceGesturePointerTracking({
      previousState: pointerState,
      classification: pointPose,
      display,
      nowMs,
      calibration: pointerCalibration,
    });
    pointerState = pointerResult.state;
    const rollResult = advanceWristRollLock({
      previousState: rollState,
      pose: classifyWristRollPose({
        frame,
        pointPose,
        minDetectionConfidence: 0.6,
      }),
      pointer: pointerState.pointer,
      nowMs,
    });
    rollState = rollResult.state;
    if (rollResult.lockRequest) {
      requests.push(rollResult.lockRequest);
    }
    if (rollResult.unlockRequest) {
      unlockRequests.push(rollResult.unlockRequest);
    }
  }

  return { pointerState, rollState, requests, unlockRequests };
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

function emptyFrame(frameId, capturedAtMs) {
  return {
    frameId,
    capturedAt: new Date(capturedAtMs).toISOString(),
    sourceWidth: 1280,
    sourceHeight: 720,
    mirrored: true,
    hands: [],
  };
}

function trackedFrame(
  pose,
  frameId,
  capturedAtMs,
  trackId = "pointer-hand",
  wristRollDegrees,
) {
  return frameFor(
    createSyntheticTrackedHand({
      pose,
      frameId,
      capturedAt: new Date(capturedAtMs).toISOString(),
      trackId,
      wristRollDegrees,
    }),
  );
}

test("wrist-roll pose preserves pointing structure while palm orientation changes", () => {
  const point = createSyntheticTrackedHand({ pose: "point" });
  const rolled = createSyntheticTrackedHand({ pose: "wrist_rolled", frameId: 2 });
  const pointClassification = classifyWristRollPose({
    frame: point,
    pointPose: classifyPointPose(point, 0.6),
    minDetectionConfidence: 0.6,
  });
  const rolledClassification = classifyWristRollPose({
    frame: rolled,
    pointPose: classifyPointPose(rolled, 0.6),
    minDetectionConfidence: 0.6,
  });

  assert.equal(pointClassification.label, "pointing");
  assert.ok(["pointing", "tracked"].includes(rolledClassification.label));
  assert.ok(rolledClassification.indexExtensionRatio > 1.45);
  assert.ok(rolledClassification.foldedFingerCount >= 2);
  assert.notDeepEqual(pointClassification.palmNormal, rolledClassification.palmNormal);
});

test("one deliberate wrist roll locks the copied pre-roll point", () => {
  const result = runFrames(createSyntheticWristRollFrames());

  assert.equal(result.requests.length, 1);
  assert.equal(result.rollState.lock.phase, "locked");
  assert.ok(result.rollState.lock.roll.rotationDegrees >= 70);
  assert.ok(result.requests[0].roll.id.startsWith("wrist-roll-"));
  assert.equal(result.requests[0].pointer.handTrackId, "pointer-hand");
  assert.notEqual(
    Math.round(result.requests[0].pointer.display.x),
    Math.round(result.pointerState.pointer.display.x),
  );

  const lockedX = result.requests[0].pointer.display.x;
  result.pointerState.pointer.display.x = 1;
  assert.equal(result.requests[0].pointer.display.x, lockedX);
});

test("the roll must begin from an active point", () => {
  const startAt = Date.parse("2026-07-15T00:00:00.000Z");
  const result = runFrames([
    trackedFrame("wrist_rolled", 1, startAt),
    trackedFrame("wrist_rolled", 2, startAt + 300),
  ]);

  assert.equal(result.requests.length, 0);
  assert.equal(result.rollState.lock.phase, "armed");
});

test("an ordinary hand angle below the roll threshold cannot lock", () => {
  const startAt = Date.parse("2026-07-15T00:00:00.000Z");
  const result = runFrames([
    trackedFrame("point", 1, startAt),
    trackedFrame("wrist_rolled", 2, startAt + 100, "pointer-hand", 40),
    trackedFrame("wrist_rolled", 3, startAt + 400, "pointer-hand", 40),
  ]);

  assert.equal(result.requests.length, 0);
  assert.equal(result.rollState.lock.phase, "armed");
  assert.ok(result.rollState.lock.rotationDegrees < 70);
});

test("brief landmark interruption does not discard an intentional wrist roll", () => {
  const startAt = Date.parse("2026-07-15T00:00:00.000Z");
  const result = runFrames([
    trackedFrame("point", 1, startAt),
    trackedFrame("wrist_rolled", 2, startAt + 100),
    trackedFrame("open_palm", 3, startAt + 180),
    trackedFrame("wrist_rolled", 4, startAt + 360),
  ]);

  assert.equal(result.requests.length, 1);
  assert.equal(result.rollState.lock.phase, "locked");
});

test("a different hand cannot finish the active wrist roll", () => {
  const startAt = Date.parse("2026-07-15T00:00:00.000Z");
  const result = runFrames([
    trackedFrame("point", 1, startAt),
    trackedFrame("wrist_rolled", 2, startAt + 100),
    trackedFrame("wrist_rolled", 3, startAt + 360, "other-hand"),
  ]);

  assert.equal(result.requests.length, 0);
  assert.equal(result.rollState.lock.phase, "cancelled");
});

test("a lock persists until the same hand deliberately untwists", () => {
  const startAt = Date.parse("2026-07-15T00:00:00.000Z");
  const result = runFrames([
    trackedFrame("point", 1, startAt),
    trackedFrame("wrist_rolled", 2, startAt + 100),
    trackedFrame("wrist_rolled", 3, startAt + 340),
    trackedFrame("wrist_rolled", 4, startAt + 500),
    trackedFrame("point", 5, startAt + 700),
    trackedFrame("point", 6, startAt + 950),
    trackedFrame("point", 7, startAt + 1_350),
    trackedFrame("wrist_rolled", 8, startAt + 1_450),
    trackedFrame("wrist_rolled", 9, startAt + 1_700),
  ]);

  assert.equal(result.requests.length, 2);
  assert.equal(result.unlockRequests.length, 1);
  assert.equal(result.unlockRequests[0].lockId, result.requests[0].id);
  assert.equal(result.unlockRequests[0].handTrackId, "pointer-hand");
  assert.notEqual(result.requests[0].id, result.requests[1].id);
  assert.equal(result.rollState.lock.phase, "locked");
});

test("lowering the locking hand out of view keeps the copied target locked", () => {
  const startAt = Date.parse("2026-07-15T00:00:00.000Z");
  const result = runFrames([
    trackedFrame("point", 1, startAt),
    trackedFrame("wrist_rolled", 2, startAt + 100),
    trackedFrame("wrist_rolled", 3, startAt + 340),
    emptyFrame(4, startAt + 700),
    emptyFrame(5, startAt + 1_200),
    emptyFrame(6, startAt + 3_000),
  ]);

  assert.equal(result.requests.length, 1);
  assert.equal(result.unlockRequests.length, 0);
  assert.equal(result.rollState.lock.phase, "locked");
});

test("a different hand and brief tracking loss cannot unlock the copied target", () => {
  const startAt = Date.parse("2026-07-15T00:00:00.000Z");
  const result = runFrames([
    trackedFrame("point", 1, startAt),
    trackedFrame("wrist_rolled", 2, startAt + 100),
    trackedFrame("wrist_rolled", 3, startAt + 340),
    trackedFrame("point", 4, startAt + 600, "other-hand"),
    trackedFrame("open_palm", 5, startAt + 780),
    trackedFrame("wrist_rolled", 6, startAt + 1_000),
  ]);

  assert.equal(result.requests.length, 1);
  assert.equal(result.unlockRequests.length, 0);
  assert.equal(result.rollState.lock.phase, "locked");
  assert.equal(result.rollState.lock.roll.handTrackId, "pointer-hand");
});

test("an interrupted untwist needs a fresh deliberate hold before it unlocks", () => {
  const startAt = Date.parse("2026-07-15T00:00:00.000Z");
  const result = runFrames([
    trackedFrame("point", 1, startAt),
    trackedFrame("wrist_rolled", 2, startAt + 100),
    trackedFrame("wrist_rolled", 3, startAt + 340),
    trackedFrame("point", 4, startAt + 600),
    trackedFrame("open_palm", 5, startAt + 700),
    trackedFrame("open_palm", 6, startAt + 1_200),
    trackedFrame("point", 7, startAt + 1_300),
    trackedFrame("point", 8, startAt + 1_550),
  ]);

  assert.equal(result.requests.length, 1);
  assert.equal(result.unlockRequests.length, 1);
  assert.equal(result.rollState.lock.phase, "cooldown");
  assert.ok(result.unlockRequests[0].sourceFrameIds.includes(7));
  assert.ok(result.unlockRequests[0].sourceFrameIds.includes(8));
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
  const activeWindow = {
    appName: "Spotify",
    title: "Spotify Premium",
    bundleIdentifier: "com.spotify.client",
    ownerProcessId: 4_201,
    windowNumber: 77,
    x: 200,
    y: 100,
    width: 920,
    height: 720,
  };
  const activeWindowId = createScreenStateFingerprint(activeWindow);
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
      activeWindow,
    }),
    null,
  );
  const changedTitleWindow = {
    ...activeWindow,
    title: "A different song title",
  };
  assert.equal(
    createScreenStateFingerprint(changedTitleWindow),
    activeWindowId,
  );
  assert.equal(
    getPointerLockInvalidationReason({
      lock,
      display,
      screenCaptureAvailable: true,
      activeWindowId: createScreenStateFingerprint(changedTitleWindow),
      activeWindow: changedTitleWindow,
    }),
    null,
  );
  assert.equal(
    getPointerLockInvalidationReason({
      lock,
      display,
      screenCaptureAvailable: false,
      activeWindowId,
      activeWindow,
    }),
    "screen_capture_unavailable",
  );
  assert.equal(
    getPointerLockInvalidationReason({
      lock,
      display: { ...display, width: 1200 },
      screenCaptureAvailable: true,
      activeWindowId,
      activeWindow,
    }),
    "display_changed",
  );
  const differentWindow = {
    ...activeWindow,
    windowNumber: activeWindow.windowNumber + 1,
  };
  assert.equal(
    getPointerLockInvalidationReason({
      lock,
      display,
      screenCaptureAvailable: true,
      activeWindowId: createScreenStateFingerprint(differentWindow),
      activeWindow: differentWindow,
    }),
    "screen_state_changed",
  );
  const windowOutsidePoint = {
    ...activeWindow,
    x: 700,
  };
  assert.equal(
    getPointerLockInvalidationReason({
      lock,
      display,
      screenCaptureAvailable: true,
      activeWindowId: createScreenStateFingerprint(windowOutsidePoint),
      activeWindow: windowOutsidePoint,
    }),
    "point_outside_active_window",
  );
});

test("a lock keeps one creature, preserves the copied point, and never clicks", () => {
  const appSource = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );
  const runtimeSource = readFileSync(
    new URL("../apps/desktop/src/gestureRuntime.ts", import.meta.url),
    "utf8",
  );
  const blobPuckSource = readFileSync(
    new URL("../apps/desktop/src/BlobPuck.tsx", import.meta.url),
    "utf8",
  );
  const nativeSource = readFileSync(
    new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url),
    "utf8",
  );
  const windowProbeSource = nativeSource.slice(
    nativeSource.indexOf("fn frontmost_window_bounds_swift_source"),
    nativeSource.indexOf("fn screen_capture_access_status"),
  );

  assert.doesNotMatch(appSource, /TokiPointerLockCue/);
  assert.equal(appSource.match(/<BlobPuck/g)?.length, 1);
  assert.match(appSource, /screen_capture_access_status/);
  assert.match(appSource, /frontmost_window_bounds/);
  assert.match(
    appSource,
    /frontmost_window_bounds",[\s\S]*?pointX: lock\.pointer\.display\.x,[\s\S]*?pointY: lock\.pointer\.display\.y/,
  );
  assert.match(
    appSource,
    /capture_active_window_snapshot",[\s\S]*?pointX: lock\.pointer\.display\.x,[\s\S]*?pointY: lock\.pointer\.display\.y/,
  );
  assert.match(appSource, /keepLimited\("screen_capture_unavailable"\)/);
  assert.match(
    appSource,
    /gesturePointerLock\?\.pointer \?\? alwaysOnGestureRuntime\.pointer/,
  );
  assert.match(
    appSource,
    /splitVisual=\{gesturePuckPresentation\.splitVisual\}/,
  );
  assert.match(
    appSource,
    /lockState=\{gesturePuckPresentation\.lockState\}/,
  );
  assert.match(
    blobPuckSource,
    /const presentedSplitVisual = lockState === "none" \? splitVisual : null/,
  );
  assert.match(blobPuckSource, /data-lock-state=\{lockState\}/);
  assert.match(
    blobPuckSource,
    /data-lock-feedback=\{lockState === "none" \? "none" : "persistent"\}/,
  );
  assert.match(windowProbeSource, /kCGWindowNumber/);
  assert.match(windowProbeSource, /bundleIdentifier/);
  assert.match(windowProbeSource, /pointMatches\.first/);
  assert.match(windowProbeSource, /CGWindowListCopyWindowInfo preserves front-to-back z-order/);
  assert.doesNotMatch(windowProbeSource, /fallbackOwnerPid/);
  assert.doesNotMatch(windowProbeSource, /\.max\(by:/);
  if (process.platform === "darwin") {
    const swiftSource = windowProbeSource.match(/r#"\n([\s\S]*?)\n"#/)?.[1];
    assert.ok(swiftSource);
    const parsed = spawnSync("/usr/bin/swift", ["-frontend", "-parse", "-"], {
      input: swiftSource,
      encoding: "utf8",
    });
    assert.equal(parsed.status, 0, parsed.stderr);
  }
  assert.doesNotMatch(runtimeSource, /native_click/);
});

test("a pointer lock suppresses split lobes and keeps persistent same-puck feedback", () => {
  const splitVisual = {
    phase: "split",
    pointerTrackId: "pointer-hand",
    controlTrackId: "control-hand",
    primary: { displayId: display.id, x: 400, y: 300 },
    secondary: { displayId: display.id, x: 800, y: 300 },
    normalizedSeparation: 1.8,
    visualOnly: true,
  };

  const unlocked = createGesturePuckPresentation({
    hasPointerLock: false,
    lockValidation: "idle",
    splitVisual,
  });
  assert.equal(unlocked.lockState, "none");
  assert.equal(unlocked.splitVisual, splitVisual);
  assert.equal(unlocked.splitSuppressedByLock, false);

  for (const [validation, expectedLockState] of [
    ["checking", "checking"],
    ["locked", "locked"],
    ["limited", "limited"],
  ]) {
    const locked = createGesturePuckPresentation({
      hasPointerLock: true,
      lockValidation: validation,
      splitVisual,
    });

    assert.equal(locked.lockState, expectedLockState);
    assert.equal(locked.splitVisual, null);
    assert.equal(locked.splitSuppressedByLock, true);
  }
});
