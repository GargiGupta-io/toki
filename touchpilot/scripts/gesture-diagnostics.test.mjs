import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeGestureDiagnosticTrace,
  appendGestureFrameDiagnostic,
  createGestureDiagnosticTrace,
  createGestureFrameDiagnostic,
  createGesturePresentationDiagnostic,
  createGestureWindowValidationDiagnostic,
  replayGesturePointerTrace,
} from "../apps/desktop/src/gestureDiagnostics.ts";
import {
  advanceGesturePointerTracking,
  defaultGesturePointerCalibration,
  resetGesturePointerTracking,
} from "../apps/desktop/src/gesturePointing.ts";
import {
  createInitialControlPinchState,
} from "../apps/desktop/src/gestureControlVoice.ts";
import {
  createEmptyGestureIntentArbiterSnapshot,
} from "../apps/desktop/src/gestureIntentArbiter.ts";
import {
  createInitialCameraShutdownGestureState,
} from "../apps/desktop/src/gestureCameraControl.ts";

const display = {
  id: "display-1",
  width: 1_470,
  height: 956,
  scaleFactor: 2,
};

const viewport = {
  width: display.width,
  height: display.height,
  devicePixelRatio: display.scaleFactor,
  updatedAt: "2026-07-26T12:00:00.000Z",
};

function pointPose(frameId, point = { x: 0.4, y: 0.35 }) {
  return {
    label: "point",
    phase: "candidate",
    confidence: 0.96,
    handTrackId: "hand-1",
    pointerTip: point,
    indexExtensionRatio: 1.9,
    indexPipAngle: 171,
    indexDipAngle: 168,
    foldedFingerCount: 3,
    requiredFoldedFingerCount: 3,
    sourceFrameId: frameId,
    capturedAt: new Date(1_000 + frameId * 100).toISOString(),
  };
}

function buildPointerTrace(frameCount = 5, capacity = 10) {
  let trace = createGestureDiagnosticTrace(capacity);
  let pointerState = resetGesturePointerTracking();
  let previousFrame = null;
  const ordinaryPinch = createInitialControlPinchState();
  const controlPinch = createInitialControlPinchState();

  for (let index = 0; index < frameCount; index += 1) {
    const nowMs = index * 100;
    const classification = pointPose(index + 1, {
      x: 0.4 + index * 0.01,
      y: 0.35 + index * 0.005,
    });
    const pointerResult = advanceGesturePointerTracking({
      previousState: pointerState,
      classification,
      display,
      nowMs,
      calibration: defaultGesturePointerCalibration,
    });
    pointerState = pointerResult.state;
    const frame = createGestureFrameDiagnostic({
      sourceFrameId: index + 1,
      capturedAt: classification.capturedAt,
      monotonicAtMs: nowMs,
      inferenceStartedAtMs: 10_000 + nowMs,
      inferenceCompletedAtMs: 10_008 + nowMs,
      previousFrame,
      handCount: 1,
      pointerTrackId: "hand-1",
      controlTrackId: null,
      pointPose: classification,
      pointer: pointerResult.pointer,
      display,
      viewport,
      ordinaryPinch,
      controlPinch,
      wristRoll: { phase: "idle" },
      cameraShutdown: createInitialCameraShutdownGestureState(),
      intentArbiter: createEmptyGestureIntentArbiterSnapshot(nowMs),
      ordinaryVoiceCanStart: true,
      controlVoiceCanStart: false,
    });
    trace = appendGestureFrameDiagnostic(trace, frame);
    previousFrame = trace.frames.at(-1);
  }

  return trace;
}

test("gesture diagnostics keep a bounded, ordered local trace", () => {
  const trace = buildPointerTrace(5, 3);

  assert.equal(trace.frames.length, 3);
  assert.equal(trace.firstSequence, 3);
  assert.equal(trace.lastSequence, 5);
  assert.deepEqual(
    trace.frames.map((frame) => frame.sourceFrameId),
    [3, 4, 5],
  );
  assert.equal(trace.frames.at(-1).timing.inferenceDurationMs, 8);
  assert.equal(trace.frames.at(-1).timing.intervalSincePreviousFrameMs, 100);
  assert.ok(trace.frames.at(-1).rawDisplayPoint);
  assert.ok(trace.frames.at(-1).logicalDisplayPoint);
  assert.ok(trace.frames.at(-1).visibleBlobCenter);
  assert.equal(trace.frames.at(-1).ordinaryPinch.rawNormalizedDistance, null);
  assert.deepEqual(trace.frames.at(-1).intentArbiter.owners, []);
});

test("recorded pointer frames replay deterministically", () => {
  const trace = buildPointerTrace();
  const replay = replayGesturePointerTrace(trace);

  assert.equal(replay.deterministic, true);
  assert.equal(replay.replayedFrames, 5);
  assert.equal(replay.phaseMismatchCount, 0);
  assert.ok(replay.maxDeltaPx < 0.01);
});

test("trace analysis exposes timing, geometry, and incomplete pinch symptoms", () => {
  const trace = buildPointerTrace();
  const lastFrame = trace.frames.at(-1);
  const withPressedPinch = {
    ...lastFrame,
    ordinaryPinch: {
      ...lastFrame.ordinaryPinch,
      phase: "held",
      eventSequence: 1,
      lastEventId: "ordinary-press-1",
      lastEventType: "press",
    },
  };
  const nextTrace = {
    ...trace,
    frames: [...trace.frames.slice(0, -1), withPressedPinch],
  };
  const analysis = analyzeGestureDiagnosticTrace(nextTrace);

  assert.equal(analysis.sampleCount, 5);
  assert.equal(analysis.inferenceDurationP95Ms, 8);
  assert.equal(analysis.frameIntervalP95Ms, 100);
  assert.ok(analysis.logicalToBlobDistanceP95Px > 0);
  assert.ok(
    analysis.symptoms.includes("ordinary_pinch_press_without_release"),
  );
});

test("presentation diagnostics distinguish the logical point from one visible blob", () => {
  const pointer = {
    handTrackId: "hand-1",
    phase: "active",
    normalized: { x: 0.5, y: 0.5 },
    display: { displayId: display.id, x: 735, y: 478 },
    confidence: 0.98,
    sourceFrameId: 14,
    capturedAt: "2026-07-26T12:00:00.000Z",
  };
  const presentation = createGesturePresentationDiagnostic({
    livePointer: pointer,
    lockedPointer: null,
    pointerShadow: { x: 769, y: 332 },
    lockId: null,
    lockValidation: "idle",
    lockReason: null,
    updatedAt: "2026-07-26T12:00:00.000Z",
  });

  assert.equal(presentation.source, "live_pointer");
  assert.deepEqual(presentation.logicalPoint, { x: 735, y: 478 });
  assert.deepEqual(presentation.visibleBlobCenter, { x: 835, y: 398 });
  assert.deepEqual(presentation.offset, { x: 100, y: -80 });
  assert.equal(presentation.visibleLobeCount, 1);
  assert.equal(presentation.splitVisualRequested, false);
  assert.equal(presentation.splitVisualPresented, false);
  assert.equal(presentation.splitSuppressedByLock, false);
  assert.equal(presentation.lockPresentation, "none");
  assert.equal(presentation.sourceFrameId, 14);
});

test("presentation diagnostics prove that a lock suppresses a requested split", () => {
  const pointer = {
    handTrackId: "hand-1",
    phase: "active",
    normalized: { x: 0.5, y: 0.5 },
    display: { displayId: display.id, x: 735, y: 478 },
    confidence: 0.98,
    sourceFrameId: 14,
    capturedAt: "2026-07-26T12:00:00.000Z",
  };
  const presentation = createGesturePresentationDiagnostic({
    livePointer: pointer,
    lockedPointer: pointer,
    pointerShadow: { x: 769, y: 332 },
    lockId: "lock-1",
    lockValidation: "locked",
    lockPresentation: "locked",
    lockReason: null,
    splitVisualRequested: true,
    splitVisualPresented: false,
    updatedAt: "2026-07-26T12:00:00.000Z",
  });

  assert.equal(presentation.source, "locked_pointer");
  assert.equal(presentation.visibleLobeCount, 1);
  assert.equal(presentation.splitSuppressedByLock, true);
  assert.equal(presentation.lockPresentation, "locked");
});

test("window validation records the exact identity and geometry delta", () => {
  const expectedWindow = {
    appName: "Spotify",
    title: "Mood",
    bundleIdentifier: "com.spotify.client",
    ownerProcessId: 4_201,
    windowNumber: 77,
    x: 200,
    y: 100,
    width: 1_000,
    height: 700,
  };
  const actualWindow = {
    ...expectedWindow,
    title: "Mood — Spotify Premium",
    x: 202,
    width: 998,
  };
  const diagnostic = createGestureWindowValidationDiagnostic({
    lockId: "lock-1",
    checkStartedAtMs: 1_000,
    checkCompletedAtMs: 1_025,
    screenCaptureAvailable: true,
    expectedFingerprint: "spotify|mood|200|100|1000|700",
    actualFingerprint: "spotify|mood spotify premium|202|100|998|700",
    expectedWindow,
    actualWindow,
    logicalPoint: { x: 500, y: 400 },
    reason: "screen_state_changed",
  });

  assert.equal(diagnostic.checkDurationMs, 25);
  assert.equal(diagnostic.result, "invalidated");
  assert.deepEqual(diagnostic.windowDelta, {
    x: 2,
    y: 0,
    width: -2,
    height: 0,
  });
  assert.equal(diagnostic.pointInsideActualWindow, true);
  assert.equal(diagnostic.expectedWindow.windowNumber, 77);
  assert.equal(diagnostic.actualWindow.bundleIdentifier, "com.spotify.client");
});
