import type {
  ActiveWindowBounds,
  DisplayContext,
  GesturePointerSample,
  NormalizedGesturePoint,
} from "@toki/shared";
import type { CameraShutdownGestureState } from "./gestureCameraControl";
import type { ControlPinchState } from "./gestureControlVoice";
import type { GestureIntentArbiterSnapshot } from "./gestureIntentArbiter";
import {
  advanceGesturePointerTracking,
  defaultGesturePointerCalibration,
  mapCameraPointToDisplay,
  resetGesturePointerTracking,
  type GesturePointerCalibration,
  type PointPoseClassification,
} from "./gesturePointing";
import type {
  PointerLockInvalidationReason,
  WristRollLockState,
} from "./gestureTargetLock";
import type { GesturePuckLockState } from "./gesturePuckPresentation";
import {
  getDetachedGesturePointerShadowPosition,
  pointerShadowGeometry,
  type PointerShadowPosition,
  type ViewportMetrics,
} from "./overlayGeometry";

export const gestureDiagnosticTraceSchemaVersion = 3;
export const gestureDiagnosticTraceCapacity = 144;
export const gestureDiagnosticPublishIntervalMs = 250;

export type DiagnosticDisplayPoint = {
  x: number;
  y: number;
};

export type GestureFrameTimingDiagnostic = {
  inferenceStartedAt: string;
  inferenceCompletedAt: string;
  inferenceDurationMs: number;
  intervalSincePreviousFrameMs: number | null;
};

export type GesturePinchDiagnostic = Pick<
  ControlPinchState,
  | "phase"
  | "controlHandTrackId"
  | "rawNormalizedDistance"
  | "normalizedDistance"
  | "pressThreshold"
  | "releaseThreshold"
  | "eventSequence"
> & {
  lastEventId: string | null;
  lastEventType: ControlPinchState["lastEvent"] extends infer Event
    ? Event extends { type: infer Type }
      ? Type | null
      : null
    : null;
};

export type GestureFrameDiagnostic = {
  sequence: number;
  sourceFrameId: number;
  capturedAt: string;
  monotonicAtMs: number;
  timing: GestureFrameTimingDiagnostic;
  handCount: number;
  pointerTrackId: string | null;
  controlTrackId: string | null;
  pointPose: PointPoseClassification;
  rawCameraPoint: NormalizedGesturePoint | null;
  rawDisplayPoint: DiagnosticDisplayPoint | null;
  logicalDisplayPoint: DiagnosticDisplayPoint | null;
  visibleBlobCenter: DiagnosticDisplayPoint | null;
  rawToLogicalDistancePx: number | null;
  logicalToBlobDistancePx: number | null;
  pointerPhase: GesturePointerSample["phase"] | "inactive";
  pointerConfidence: number;
  display: DisplayContext;
  calibration: GesturePointerCalibration;
  ordinaryPinch: GesturePinchDiagnostic;
  controlPinch: GesturePinchDiagnostic;
  wristRoll: {
    phase: WristRollLockState["phase"];
    rotationDegrees: number | null;
  };
  cameraShutdown: {
    phase: CameraShutdownGestureState["phase"];
    holdMs: number;
  };
  intentArbiter: GestureIntentArbiterSnapshot;
  voiceEligibility: {
    ordinary: boolean;
    contextual: boolean;
  };
};

export type GestureDiagnosticTrace = {
  schemaVersion: typeof gestureDiagnosticTraceSchemaVersion;
  capacity: number;
  firstSequence: number | null;
  lastSequence: number | null;
  updatedAt: string;
  frames: GestureFrameDiagnostic[];
};

export type GestureTraceSymptom =
  | "pointer_never_activated"
  | "ordinary_pinch_press_without_release"
  | "control_pinch_press_without_release"
  | "ordinary_pinch_chatter"
  | "control_pinch_chatter"
  | "inference_stall"
  | "large_filter_gap";

export type GestureTraceAnalysis = {
  sampleCount: number;
  durationMs: number;
  inferenceDurationP95Ms: number | null;
  frameIntervalP95Ms: number | null;
  rawToLogicalDistanceP95Px: number | null;
  logicalToBlobDistanceP95Px: number | null;
  pointerActiveFrames: number;
  ordinaryPinchEvents: string[];
  controlPinchEvents: string[];
  symptoms: GestureTraceSymptom[];
};

export type GesturePointerReplayFrame = {
  sourceFrameId: number;
  recordedPoint: DiagnosticDisplayPoint | null;
  replayedPoint: DiagnosticDisplayPoint | null;
  deltaPx: number | null;
  recordedPhase: GestureFrameDiagnostic["pointerPhase"];
  replayedPhase: GestureFrameDiagnostic["pointerPhase"];
};

export type GesturePointerReplayResult = {
  deterministic: boolean;
  replayedFrames: number;
  phaseMismatchCount: number;
  maxDeltaPx: number;
  frames: GesturePointerReplayFrame[];
};

export type GesturePresentationDiagnostic = {
  source: "live_pointer" | "locked_pointer" | "none";
  logicalPoint: DiagnosticDisplayPoint | null;
  visibleBlobCenter: DiagnosticDisplayPoint | null;
  offset: DiagnosticDisplayPoint | null;
  visibleLobeCount: 0 | 1 | 2;
  splitVisualRequested: boolean;
  splitVisualPresented: boolean;
  splitSuppressedByLock: boolean;
  sourceFrameId: number | null;
  lockId: string | null;
  lockValidation: string;
  lockPresentation: GesturePuckLockState;
  lockReason: PointerLockInvalidationReason | null;
  updatedAt: string;
};

export type GestureWindowValidationDiagnostic = {
  lockId: string;
  checkedAt: string;
  checkDurationMs: number;
  screenCaptureAvailable: boolean | null;
  expectedFingerprint: string | null;
  actualFingerprint: string | null;
  expectedWindow: ActiveWindowBounds | null;
  actualWindow: ActiveWindowBounds | null;
  windowDelta: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  logicalPoint: DiagnosticDisplayPoint;
  pointInsideActualWindow: boolean | null;
  result: "pending" | "accepted" | "limited" | "invalidated";
  reason: PointerLockInvalidationReason | null;
  error: string | null;
};

export function createGestureDiagnosticTrace(
  capacity = gestureDiagnosticTraceCapacity,
): GestureDiagnosticTrace {
  return {
    schemaVersion: gestureDiagnosticTraceSchemaVersion,
    capacity: Math.max(1, Math.round(capacity)),
    firstSequence: null,
    lastSequence: null,
    updatedAt: "1970-01-01T00:00:00.000Z",
    frames: [],
  };
}

export function appendGestureFrameDiagnostic(
  trace: GestureDiagnosticTrace,
  frame: Omit<GestureFrameDiagnostic, "sequence">,
): GestureDiagnosticTrace {
  const sequence = (trace.lastSequence ?? 0) + 1;
  const frames = [...trace.frames, { ...frame, sequence }].slice(-trace.capacity);

  return {
    ...trace,
    firstSequence: frames[0]?.sequence ?? null,
    lastSequence: sequence,
    updatedAt: frame.timing.inferenceCompletedAt,
    frames,
  };
}

export function createGestureFrameDiagnostic({
  sourceFrameId,
  capturedAt,
  monotonicAtMs,
  inferenceStartedAtMs,
  inferenceCompletedAtMs,
  previousFrame,
  handCount,
  pointerTrackId,
  controlTrackId,
  pointPose,
  pointer,
  display,
  calibration = defaultGesturePointerCalibration,
  viewport,
  ordinaryPinch,
  controlPinch,
  wristRoll,
  cameraShutdown,
  intentArbiter,
  ordinaryVoiceCanStart,
  controlVoiceCanStart,
}: {
  sourceFrameId: number;
  capturedAt: string;
  monotonicAtMs: number;
  inferenceStartedAtMs: number;
  inferenceCompletedAtMs: number;
  previousFrame: GestureFrameDiagnostic | null;
  handCount: number;
  pointerTrackId: string | null;
  controlTrackId: string | null;
  pointPose: PointPoseClassification;
  pointer: GesturePointerSample | null;
  display: DisplayContext;
  calibration?: GesturePointerCalibration;
  viewport: ViewportMetrics;
  ordinaryPinch: ControlPinchState;
  controlPinch: ControlPinchState;
  wristRoll: WristRollLockState;
  cameraShutdown: CameraShutdownGestureState;
  intentArbiter: GestureIntentArbiterSnapshot;
  ordinaryVoiceCanStart: boolean;
  controlVoiceCanStart: boolean;
}): Omit<GestureFrameDiagnostic, "sequence"> {
  const rawCameraPoint = pointPose.pointerTip;
  const rawDisplayPoint =
    rawCameraPoint == null
      ? null
      : copyDisplayPoint(
          mapCameraPointToDisplay(rawCameraPoint, display, calibration).display,
        );
  const logicalDisplayPoint =
    pointer == null ? null : copyDisplayPoint(pointer.display);
  const visibleBlobCenter =
    logicalDisplayPoint == null
      ? null
      : getPointerShadowCenter(
          getDetachedGesturePointerShadowPosition(
            logicalDisplayPoint.x,
            logicalDisplayPoint.y,
            viewport,
          ),
        );

  return {
    sourceFrameId,
    capturedAt,
    monotonicAtMs,
    timing: {
      inferenceStartedAt: new Date(inferenceStartedAtMs).toISOString(),
      inferenceCompletedAt: new Date(inferenceCompletedAtMs).toISOString(),
      inferenceDurationMs: Math.max(
        0,
        inferenceCompletedAtMs - inferenceStartedAtMs,
      ),
      intervalSincePreviousFrameMs:
        previousFrame == null
          ? null
          : Math.max(0, monotonicAtMs - previousFrame.monotonicAtMs),
    },
    handCount,
    pointerTrackId,
    controlTrackId,
    pointPose: copyPointPose(pointPose),
    rawCameraPoint:
      rawCameraPoint == null ? null : { ...rawCameraPoint },
    rawDisplayPoint,
    logicalDisplayPoint,
    visibleBlobCenter,
    rawToLogicalDistancePx: pointDistance(
      rawDisplayPoint,
      logicalDisplayPoint,
    ),
    logicalToBlobDistancePx: pointDistance(
      logicalDisplayPoint,
      visibleBlobCenter,
    ),
    pointerPhase: pointer?.phase ?? "inactive",
    pointerConfidence: pointer?.confidence ?? 0,
    display: { ...display },
    calibration: { ...calibration },
    ordinaryPinch: copyPinch(ordinaryPinch),
    controlPinch: copyPinch(controlPinch),
    wristRoll: {
      phase: wristRoll.phase,
      rotationDegrees: wristRoll.rotationDegrees ?? null,
    },
    cameraShutdown: {
      phase: cameraShutdown.phase,
      holdMs: cameraShutdown.holdMs,
    },
    intentArbiter: copyIntentArbiter(intentArbiter),
    voiceEligibility: {
      ordinary: ordinaryVoiceCanStart,
      contextual: controlVoiceCanStart,
    },
  };
}

export function shouldPublishGestureDiagnosticTrace({
  previousPublishedFrame,
  nextFrame,
  lastPublishedAtMs,
  nowMs,
}: {
  previousPublishedFrame: GestureFrameDiagnostic | null;
  nextFrame: GestureFrameDiagnostic;
  lastPublishedAtMs: number;
  nowMs: number;
}): boolean {
  if (nowMs - lastPublishedAtMs >= gestureDiagnosticPublishIntervalMs) {
    return true;
  }

  return (
    previousPublishedFrame == null ||
    previousPublishedFrame.pointerPhase !== nextFrame.pointerPhase ||
    previousPublishedFrame.ordinaryPinch.phase !== nextFrame.ordinaryPinch.phase ||
    previousPublishedFrame.controlPinch.phase !== nextFrame.controlPinch.phase ||
    previousPublishedFrame.wristRoll.phase !== nextFrame.wristRoll.phase ||
    previousPublishedFrame.cameraShutdown.phase !==
      nextFrame.cameraShutdown.phase ||
    intentOwnerSignature(previousPublishedFrame.intentArbiter) !==
      intentOwnerSignature(nextFrame.intentArbiter) ||
    intentSuppressionSignature(previousPublishedFrame.intentArbiter) !==
      intentSuppressionSignature(nextFrame.intentArbiter) ||
    previousPublishedFrame.handCount !== nextFrame.handCount
  );
}

export function replayGesturePointerTrace(
  trace: GestureDiagnosticTrace,
): GesturePointerReplayResult {
  let state = resetGesturePointerTracking();
  const frames: GesturePointerReplayFrame[] = [];

  for (const frame of trace.frames) {
    const replay = advanceGesturePointerTracking({
      previousState: state,
      classification: frame.pointPose,
      display: frame.display,
      nowMs: frame.monotonicAtMs,
      calibration: frame.calibration,
    });
    state = replay.state;

    const replayedPoint =
      replay.pointer == null ? null : copyDisplayPoint(replay.pointer.display);
    const recordedPoint = frame.logicalDisplayPoint;
    const replayedPhase = replay.pointer?.phase ?? "inactive";

    frames.push({
      sourceFrameId: frame.sourceFrameId,
      recordedPoint,
      replayedPoint,
      deltaPx: pointDistance(recordedPoint, replayedPoint),
      recordedPhase: frame.pointerPhase,
      replayedPhase,
    });
  }

  const phaseMismatchCount = frames.filter(
    (frame) => frame.recordedPhase !== frame.replayedPhase,
  ).length;
  const maxDeltaPx = Math.max(
    0,
    ...frames.map((frame) => frame.deltaPx ?? 0),
  );

  return {
    deterministic: phaseMismatchCount === 0 && maxDeltaPx < 0.01,
    replayedFrames: frames.length,
    phaseMismatchCount,
    maxDeltaPx,
    frames,
  };
}

export function analyzeGestureDiagnosticTrace(
  trace: GestureDiagnosticTrace,
): GestureTraceAnalysis {
  const frames = trace.frames;
  const ordinaryPinchEvents = uniqueEventIds(
    frames.map((frame) => frame.ordinaryPinch.lastEventId),
  );
  const controlPinchEvents = uniqueEventIds(
    frames.map((frame) => frame.controlPinch.lastEventId),
  );
  const symptoms: GestureTraceSymptom[] = [];
  const pointCandidateFrames = frames.filter(
    (frame) => frame.pointPose.label === "point",
  );
  const pointerActiveFrames = frames.filter(
    (frame) => frame.pointerPhase === "active",
  ).length;

  if (pointCandidateFrames.length >= 4 && pointerActiveFrames === 0) {
    symptoms.push("pointer_never_activated");
  }
  if (hasPressWithoutRelease(frames, "ordinaryPinch")) {
    symptoms.push("ordinary_pinch_press_without_release");
  }
  if (hasPressWithoutRelease(frames, "controlPinch")) {
    symptoms.push("control_pinch_press_without_release");
  }
  if (hasPinchChatter(frames, "ordinaryPinch")) {
    symptoms.push("ordinary_pinch_chatter");
  }
  if (hasPinchChatter(frames, "controlPinch")) {
    symptoms.push("control_pinch_chatter");
  }
  if (
    frames.some(
      (frame) =>
        (frame.timing.intervalSincePreviousFrameMs ?? 0) >
        Math.max(250, gestureDiagnosticPublishIntervalMs),
    )
  ) {
    symptoms.push("inference_stall");
  }
  if (
    percentile(
      frames.map((frame) => frame.rawToLogicalDistancePx),
      0.95,
    ) >= 120
  ) {
    symptoms.push("large_filter_gap");
  }

  return {
    sampleCount: frames.length,
    durationMs:
      frames.length < 2
        ? 0
        : Math.max(
            0,
            frames[frames.length - 1].monotonicAtMs -
              frames[0].monotonicAtMs,
          ),
    inferenceDurationP95Ms: nullablePercentile(
      frames.map((frame) => frame.timing.inferenceDurationMs),
      0.95,
    ),
    frameIntervalP95Ms: nullablePercentile(
      frames.map((frame) => frame.timing.intervalSincePreviousFrameMs),
      0.95,
    ),
    rawToLogicalDistanceP95Px: nullablePercentile(
      frames.map((frame) => frame.rawToLogicalDistancePx),
      0.95,
    ),
    logicalToBlobDistanceP95Px: nullablePercentile(
      frames.map((frame) => frame.logicalToBlobDistancePx),
      0.95,
    ),
    pointerActiveFrames,
    ordinaryPinchEvents,
    controlPinchEvents,
    symptoms,
  };
}

export function createGesturePresentationDiagnostic({
  livePointer,
  lockedPointer,
  pointerShadow,
  lockId,
  lockValidation,
  lockPresentation = "none",
  lockReason,
  splitVisualRequested = false,
  splitVisualPresented = false,
  updatedAt,
}: {
  livePointer: GesturePointerSample | null;
  lockedPointer: GesturePointerSample | null;
  pointerShadow: PointerShadowPosition | null;
  lockId: string | null;
  lockValidation: string;
  lockPresentation?: GesturePuckLockState;
  lockReason: PointerLockInvalidationReason | null;
  splitVisualRequested?: boolean;
  splitVisualPresented?: boolean;
  updatedAt: string;
}): GesturePresentationDiagnostic {
  const pointer = lockedPointer ?? livePointer;
  const logicalPoint =
    pointer == null ? null : copyDisplayPoint(pointer.display);
  const visibleBlobCenter =
    pointerShadow == null ? null : getPointerShadowCenter(pointerShadow);

  return {
    source:
      lockedPointer != null
        ? "locked_pointer"
        : livePointer != null
          ? "live_pointer"
          : "none",
    logicalPoint,
    visibleBlobCenter,
    offset:
      logicalPoint == null || visibleBlobCenter == null
        ? null
        : {
            x: visibleBlobCenter.x - logicalPoint.x,
            y: visibleBlobCenter.y - logicalPoint.y,
          },
    visibleLobeCount:
      pointerShadow == null && !splitVisualPresented
        ? 0
        : splitVisualPresented
          ? 2
          : 1,
    splitVisualRequested,
    splitVisualPresented,
    splitSuppressedByLock:
      lockedPointer != null &&
      splitVisualRequested &&
      !splitVisualPresented,
    sourceFrameId: pointer?.sourceFrameId ?? null,
    lockId,
    lockValidation,
    lockPresentation,
    lockReason,
    updatedAt,
  };
}

export function createGestureWindowValidationDiagnostic({
  lockId,
  checkStartedAtMs,
  checkCompletedAtMs,
  screenCaptureAvailable,
  expectedFingerprint,
  actualFingerprint,
  expectedWindow,
  actualWindow,
  logicalPoint,
  reason,
  error = null,
}: {
  lockId: string;
  checkStartedAtMs: number;
  checkCompletedAtMs: number;
  screenCaptureAvailable: boolean | null;
  expectedFingerprint: string | null;
  actualFingerprint: string | null;
  expectedWindow: ActiveWindowBounds | null;
  actualWindow: ActiveWindowBounds | null;
  logicalPoint: DiagnosticDisplayPoint;
  reason: PointerLockInvalidationReason | null;
  error?: string | null;
}): GestureWindowValidationDiagnostic {
  return {
    lockId,
    checkedAt: new Date(checkCompletedAtMs).toISOString(),
    checkDurationMs: Math.max(0, checkCompletedAtMs - checkStartedAtMs),
    screenCaptureAvailable,
    expectedFingerprint,
    actualFingerprint,
    expectedWindow: copyWindow(expectedWindow),
    actualWindow: copyWindow(actualWindow),
    windowDelta:
      expectedWindow == null || actualWindow == null
        ? null
        : {
            x: actualWindow.x - expectedWindow.x,
            y: actualWindow.y - expectedWindow.y,
            width: actualWindow.width - expectedWindow.width,
            height: actualWindow.height - expectedWindow.height,
          },
    logicalPoint: { ...logicalPoint },
    pointInsideActualWindow:
      actualWindow == null
        ? null
        : isPointInsideWindow(logicalPoint, actualWindow),
    result:
      reason == null
        ? "accepted"
        : reason === "screen_capture_unavailable" ||
            reason === "screen_state_unavailable"
          ? "limited"
          : "invalidated",
    reason,
    error,
  };
}

function copyIntentArbiter(
  snapshot: GestureIntentArbiterSnapshot,
): GestureIntentArbiterSnapshot {
  return {
    owners: snapshot.owners.map((owner) => ({ ...owner })),
    selected: snapshot.selected.map((candidate) => ({ ...candidate })),
    suppressed: snapshot.suppressed.map((suppression) => ({
      ...suppression,
    })),
    updatedAtMs: snapshot.updatedAtMs,
  };
}

function intentOwnerSignature(
  snapshot: GestureIntentArbiterSnapshot,
): string {
  return snapshot.owners
    .map(
      (owner) =>
        `${owner.trackId}:${owner.intent}:${owner.lifecycle}`,
    )
    .join("|");
}

function intentSuppressionSignature(
  snapshot: GestureIntentArbiterSnapshot,
): string {
  return snapshot.suppressed
    .map(
      (suppression) =>
        `${suppression.trackId}:${suppression.intent}:${suppression.reason}:${suppression.winner}`,
    )
    .join("|");
}

function copyPointPose(
  pointPose: PointPoseClassification,
): PointPoseClassification {
  return {
    ...pointPose,
    pointerTip:
      pointPose.pointerTip == null ? null : { ...pointPose.pointerTip },
  };
}

function copyPinch(state: ControlPinchState): GesturePinchDiagnostic {
  return {
    phase: state.phase,
    controlHandTrackId: state.controlHandTrackId,
    rawNormalizedDistance: state.rawNormalizedDistance,
    normalizedDistance: state.normalizedDistance,
    pressThreshold: state.pressThreshold,
    releaseThreshold: state.releaseThreshold,
    eventSequence: state.eventSequence,
    lastEventId: state.lastEvent?.id ?? null,
    lastEventType: state.lastEvent?.type ?? null,
  };
}

function copyDisplayPoint(point: { x: number; y: number }): DiagnosticDisplayPoint {
  return { x: point.x, y: point.y };
}

function getPointerShadowCenter(
  pointerShadow: PointerShadowPosition,
): DiagnosticDisplayPoint {
  return {
    x: pointerShadow.x + pointerShadowGeometry.width / 2,
    y: pointerShadow.y + pointerShadowGeometry.height / 2,
  };
}

function pointDistance(
  first: DiagnosticDisplayPoint | null,
  second: DiagnosticDisplayPoint | null,
): number | null {
  if (first == null || second == null) {
    return null;
  }

  return Math.hypot(second.x - first.x, second.y - first.y);
}

function nullablePercentile(
  values: Array<number | null>,
  quantile: number,
): number | null {
  const finiteValues = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return finiteValues.length === 0 ? null : percentile(finiteValues, quantile);
}

function percentile(
  values: Array<number | null>,
  quantile: number,
): number {
  const sorted = values
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(quantile * sorted.length) - 1),
  );
  return sorted[index];
}

function uniqueEventIds(values: Array<string | null>): string[] {
  return values.filter(
    (value, index): value is string =>
      value != null && values.indexOf(value) === index,
  );
}

function hasPressWithoutRelease(
  frames: GestureFrameDiagnostic[],
  key: "ordinaryPinch" | "controlPinch",
): boolean {
  let pressed = false;

  for (const frame of frames) {
    const event = frame[key].lastEventType;
    if (event === "press") {
      pressed = true;
    }
    if (event === "release" || event === "tracking_lost") {
      pressed = false;
    }
  }

  return pressed;
}

function hasPinchChatter(
  frames: GestureFrameDiagnostic[],
  key: "ordinaryPinch" | "controlPinch",
): boolean {
  const transitions: Array<{ type: string; atMs: number }> = [];
  let previousEventId: string | null = null;

  for (const frame of frames) {
    const pinch = frame[key];
    if (pinch.lastEventId == null || pinch.lastEventId === previousEventId) {
      continue;
    }
    previousEventId = pinch.lastEventId;
    transitions.push({
      type: pinch.lastEventType ?? "unknown",
      atMs: frame.monotonicAtMs,
    });
  }

  return transitions.some((transition, index) => {
    const windowEnd = transition.atMs + 1_000;
    return (
      transitions.slice(index).filter((item) => item.atMs <= windowEnd).length >= 4
    );
  });
}

function copyWindow(
  window: ActiveWindowBounds | null,
): ActiveWindowBounds | null {
  return window == null ? null : { ...window };
}

function isPointInsideWindow(
  point: DiagnosticDisplayPoint,
  window: ActiveWindowBounds,
): boolean {
  return (
    point.x >= window.x &&
    point.x <= window.x + window.width &&
    point.y >= window.y &&
    point.y <= window.y + window.height
  );
}
