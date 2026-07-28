import type {
  DisplayContext,
  GesturePointerSample,
  HandLandmarkFrame,
  HandLandmarkName,
  HandLandmarkPoint,
  NormalizedGesturePoint,
} from "@toki/shared";

const indexExtensionRatioThreshold = 1.65;
const indexPipAngleThreshold = 150;
const indexDipAngleThreshold = 145;
const foldedFingerRatioThreshold = 1.35;
const foldedFingerAngleThreshold = 125;
const requiredFoldedFingerCount = 3;
const continuationIndexExtensionRatioThreshold = 1.45;
const continuationIndexPipAngleThreshold = 135;
const continuationIndexDipAngleThreshold = 130;
const continuationRequiredFoldedFingerCount = 2;
const continuationDetectionConfidenceRatio = 0.75;
// Matches gestureInferenceFramesPerSecond; used only when two samples share a
// timestamp and the filter still needs a plausible step.
const fallbackPointerFrameIntervalMs = 1_000 / 30;

// MediaPipe drops a plainly visible hand for a few hundred milliseconds at a
// time. A live trace measured gaps of 197, 365, and 365 ms, so a 320 ms grace
// erased the pointer two times out of three while the hand was about to return
// and its track identity had never been lost. This must stay above the model's
// dropout envelope, and far below the 2 s tracking-loss grace so a hand the user
// genuinely lowered still clears promptly.
export const pointerVisualRecoveryGraceMs = 500;

export type PointPoseClassification = {
  label: "none" | "point";
  phase: "inactive" | "candidate";
  confidence: number;
  handTrackId: string | null;
  pointerTip: NormalizedGesturePoint | null;
  indexExtensionRatio: number | null;
  indexPipAngle: number | null;
  indexDipAngle: number | null;
  foldedFingerCount: number;
  requiredFoldedFingerCount: number;
  sourceFrameId?: number;
  capturedAt?: string;
};

export type GesturePointerCalibration = Readonly<{
  cameraMinX: number;
  cameraMaxX: number;
  cameraMinY: number;
  cameraMaxY: number;
  mirrorX: boolean;
  pointHoldMs: number;
  trackingLossGraceMs: number;
  restingResponseMs: number;
  movingResponseMs: number;
  jitterRadius: number;
  fullSpeedDistance: number;
  filterResetAfterMs: number;
}>;

export type GesturePointerTrackingState = {
  candidateTrackId: string | null;
  poseStartedAtMs: number | null;
  lastPointSeenAtMs: number | null;
  lastFilterAtMs: number | null;
  smoothedNormalized: NormalizedGesturePoint | null;
  pointer: GesturePointerSample | null;
  active: boolean;
};

export const defaultGesturePointerCalibration: GesturePointerCalibration =
  Object.freeze({
    cameraMinX: 0,
    cameraMaxX: 1,
    cameraMinY: 0,
    cameraMaxY: 1,
    mirrorX: true,
    pointHoldMs: 140,
    trackingLossGraceMs: 2_000,
    restingResponseMs: 85,
    movingResponseMs: 18,
    jitterRadius: 0.0035,
    fullSpeedDistance: 0.045,
    filterResetAfterMs: 180,
  });

export const initialGesturePointerTrackingState: GesturePointerTrackingState = {
  candidateTrackId: null,
  poseStartedAtMs: null,
  lastPointSeenAtMs: null,
  lastFilterAtMs: null,
  smoothedNormalized: null,
  pointer: null,
  active: false,
};

export function classifyPointPose(
  frame: HandLandmarkFrame | null,
  minDetectionConfidence: number,
  activePointerTrackId: string | null = null,
): PointPoseClassification {
  if (frame == null) {
    return createInactivePointPose();
  }

  // MediaPipe reports a depressed detection score for several frames after it
  // re-acquires a hand it briefly lost. Discarding those frames outright strands
  // an already-active pointer while the hand is plainly visible: a live trace
  // showed 16 consecutive frames with the hand present, the pointer dead, and no
  // measurements taken at all. A hand that is already driving the pointer keeps
  // being measured through that dip, mirroring the strict-entry / relaxed-
  // continuation split the pose thresholds already use.
  const isContinuation =
    activePointerTrackId != null &&
    getHandTrackId(frame) === activePointerTrackId;
  const confidenceFloor = isContinuation
    ? minDetectionConfidence * continuationDetectionConfidenceRatio
    : minDetectionConfidence;

  if (frame.confidence < confidenceFloor) {
    // Pass the frame so diagnostics can tell a confidence rejection (track id
    // present) from a genuinely absent hand (track id null).
    return createInactivePointPose(frame);
  }

  const wrist = findLandmark(frame, "wrist");
  const indexMcp = findLandmark(frame, "index_mcp");
  const indexPip = findLandmark(frame, "index_pip");
  const indexDip = findLandmark(frame, "index_dip");
  const indexTip = findLandmark(frame, "index_tip");

  if (!wrist || !indexMcp || !indexPip || !indexDip || !indexTip) {
    return createInactivePointPose(frame);
  }

  const palmSize = distance2d(wrist, indexMcp);
  if (palmSize <= 0) {
    return createInactivePointPose(frame);
  }

  const indexExtensionRatio = distance2d(wrist, indexTip) / palmSize;
  const indexPipAngle = angleDegrees(indexMcp, indexPip, indexDip);
  const indexDipAngle = angleDegrees(indexPip, indexDip, indexTip);
  const foldedFingerCount = (["middle", "ring", "pinky"] as const).filter(
    (finger) => isFingerFolded(frame, wrist, palmSize, finger),
  ).length;
  const isPointing =
    indexExtensionRatio >= indexExtensionRatioThreshold &&
    indexPipAngle >= indexPipAngleThreshold &&
    indexDipAngle >= indexDipAngleThreshold &&
    foldedFingerCount >= requiredFoldedFingerCount;

  return {
    label: isPointing ? "point" : "none",
    phase: isPointing ? "candidate" : "inactive",
    confidence: isPointing ? frame.confidence : 0,
    handTrackId: getHandTrackId(frame),
    pointerTip: { x: indexTip.x, y: indexTip.y },
    indexExtensionRatio,
    indexPipAngle,
    indexDipAngle,
    foldedFingerCount,
    requiredFoldedFingerCount,
    sourceFrameId: frame.frameId,
    capturedAt: frame.capturedAt,
  };
}

export function mapCameraPointToDisplay(
  point: NormalizedGesturePoint,
  display: DisplayContext,
  calibration: GesturePointerCalibration = defaultGesturePointerCalibration,
): {
  normalized: NormalizedGesturePoint;
  display: GesturePointerSample["display"];
} {
  const rangeX = normalizePersonalRange(
    point.x,
    calibration.cameraMinX,
    calibration.cameraMaxX,
  );
  const normalized = {
    x: calibration.mirrorX ? 1 - rangeX : rangeX,
    y: normalizePersonalRange(
      point.y,
      calibration.cameraMinY,
      calibration.cameraMaxY,
    ),
  };

  return {
    normalized,
    display: {
      displayId: display.id,
      x: normalized.x * Math.max(0, display.width - 1),
      y: normalized.y * Math.max(0, display.height - 1),
    },
  };
}

export function advanceGesturePointerTracking({
  previousState,
  classification,
  display,
  nowMs,
  calibration = defaultGesturePointerCalibration,
}: {
  previousState: GesturePointerTrackingState;
  classification: PointPoseClassification;
  display: DisplayContext;
  nowMs: number;
  calibration?: GesturePointerCalibration;
}): {
  state: GesturePointerTrackingState;
  pointer: GesturePointerSample | null;
} {
  const sameTrack =
    classification.handTrackId != null &&
    previousState.candidateTrackId === classification.handTrackId;
  const isStrictPoint = classification.label === "point";
  const isRetainedPoint =
    sameTrack &&
    (previousState.active || previousState.poseStartedAtMs != null) &&
    isPointPoseContinuation(classification);

  if (
    (!isStrictPoint && !isRetainedPoint) ||
    classification.pointerTip == null ||
    classification.handTrackId == null ||
    classification.sourceFrameId == null ||
    classification.capturedAt == null
  ) {
    return recoverOrResetPointer(previousState, nowMs, calibration);
  }

  const continuingActivePoint = previousState.active && sameTrack;
  const poseStartedAtMs = sameTrack
    ? previousState.poseStartedAtMs ?? nowMs
    : nowMs;
  const hasStablePose =
    continuingActivePoint || nowMs - poseStartedAtMs >= calibration.pointHoldMs;

  if (!hasStablePose) {
    const state: GesturePointerTrackingState = {
      candidateTrackId: classification.handTrackId,
      poseStartedAtMs,
      lastPointSeenAtMs: null,
      lastFilterAtMs: null,
      smoothedNormalized: null,
      pointer: null,
      active: false,
    };

    return { state, pointer: null };
  }

  const mapped = mapCameraPointToDisplay(
    classification.pointerTip,
    display,
    calibration,
  );
  const smoothedNormalized = smoothNormalizedPoint(
    previousState.smoothedNormalized,
    mapped.normalized,
    previousState.lastFilterAtMs,
    nowMs,
    calibration,
  );
  const pointer: GesturePointerSample = {
    handTrackId: classification.handTrackId,
    phase: "active",
    normalized: smoothedNormalized,
    display: {
      displayId: display.id,
      x: smoothedNormalized.x * Math.max(0, display.width - 1),
      y: smoothedNormalized.y * Math.max(0, display.height - 1),
    },
    confidence: classification.confidence,
    sourceFrameId: classification.sourceFrameId,
    capturedAt: classification.capturedAt,
  };
  const state: GesturePointerTrackingState = {
    candidateTrackId: classification.handTrackId,
    poseStartedAtMs,
    lastPointSeenAtMs: nowMs,
    lastFilterAtMs: nowMs,
    smoothedNormalized,
    pointer,
    active: true,
  };

  return { state, pointer };
}

export function isPointPoseContinuation(
  classification: PointPoseClassification,
): boolean {
  return (
    classification.pointerTip != null &&
    classification.indexExtensionRatio != null &&
    classification.indexExtensionRatio >=
      continuationIndexExtensionRatioThreshold &&
    classification.indexPipAngle != null &&
    classification.indexPipAngle >= continuationIndexPipAngleThreshold &&
    classification.indexDipAngle != null &&
    classification.indexDipAngle >= continuationIndexDipAngleThreshold &&
    classification.foldedFingerCount >= continuationRequiredFoldedFingerCount
  );
}

export function resetGesturePointerTracking(): GesturePointerTrackingState {
  return { ...initialGesturePointerTrackingState };
}

function recoverOrResetPointer(
  previousState: GesturePointerTrackingState,
  nowMs: number,
  calibration: GesturePointerCalibration,
): {
  state: GesturePointerTrackingState;
  pointer: GesturePointerSample | null;
} {
  if (
    previousState.active &&
    previousState.pointer != null &&
    previousState.lastPointSeenAtMs != null &&
    nowMs - previousState.lastPointSeenAtMs < calibration.trackingLossGraceMs
  ) {
    const missingForMs = nowMs - previousState.lastPointSeenAtMs;
    const pointer = {
      ...previousState.pointer,
      phase: "recovering" as const,
    };
    const state = {
      ...previousState,
      pointer,
    };

    return {
      state,
      pointer: missingForMs < pointerVisualRecoveryGraceMs ? pointer : null,
    };
  }

  const state = resetGesturePointerTracking();
  return { state, pointer: null };
}

function smoothNormalizedPoint(
  previous: NormalizedGesturePoint | null,
  next: NormalizedGesturePoint,
  previousAtMs: number | null,
  nowMs: number,
  calibration: GesturePointerCalibration,
): NormalizedGesturePoint {
  if (previous == null || previousAtMs == null) {
    return next;
  }

  const elapsedMs =
    nowMs > previousAtMs ? nowMs - previousAtMs : fallbackPointerFrameIntervalMs;
  if (elapsedMs >= calibration.filterResetAfterMs) {
    return next;
  }

  const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
  const motionRatio = smoothStep(
    calibration.jitterRadius,
    calibration.fullSpeedDistance,
    distance,
  );
  const responseMs =
    calibration.restingResponseMs +
    (calibration.movingResponseMs - calibration.restingResponseMs) *
      motionRatio;
  const smoothingAlpha = 1 - Math.exp(-elapsedMs / Math.max(1, responseMs));

  return {
    x: clamp01(previous.x + (next.x - previous.x) * smoothingAlpha),
    y: clamp01(previous.y + (next.y - previous.y) * smoothingAlpha),
  };
}

function smoothStep(lower: number, upper: number, value: number): number {
  if (upper <= lower) {
    return value >= upper ? 1 : 0;
  }

  const normalized = clamp01((value - lower) / (upper - lower));
  return normalized * normalized * (3 - 2 * normalized);
}

function createInactivePointPose(
  frame?: HandLandmarkFrame,
): PointPoseClassification {
  return {
    label: "none",
    phase: "inactive",
    confidence: 0,
    handTrackId: frame ? getHandTrackId(frame) : null,
    pointerTip: null,
    indexExtensionRatio: null,
    indexPipAngle: null,
    indexDipAngle: null,
    foldedFingerCount: 0,
    requiredFoldedFingerCount,
    sourceFrameId: frame?.frameId,
    capturedAt: frame?.capturedAt,
  };
}

function isFingerFolded(
  frame: HandLandmarkFrame,
  wrist: HandLandmarkPoint,
  palmSize: number,
  finger: "middle" | "ring" | "pinky",
): boolean {
  const pip = findLandmark(frame, `${finger}_pip`);
  const dip = findLandmark(frame, `${finger}_dip`);
  const tip = findLandmark(frame, `${finger}_tip`);

  if (!pip || !dip || !tip) {
    return false;
  }

  const extensionRatio = distance2d(wrist, tip) / palmSize;
  const dipAngle = angleDegrees(pip, dip, tip);

  return (
    extensionRatio <= foldedFingerRatioThreshold ||
    dipAngle <= foldedFingerAngleThreshold
  );
}

function getHandTrackId(frame: HandLandmarkFrame): string {
  if (
    "trackId" in frame &&
    typeof (frame as HandLandmarkFrame & { trackId?: unknown }).trackId === "string"
  ) {
    return (frame as HandLandmarkFrame & { trackId: string }).trackId;
  }

  return "primary-hand";
}

function findLandmark(
  frame: HandLandmarkFrame,
  name: HandLandmarkName,
): HandLandmarkPoint | undefined {
  return frame.landmarks.find((landmark) => landmark.name === name);
}

function angleDegrees(
  first: HandLandmarkPoint,
  vertex: HandLandmarkPoint,
  last: HandLandmarkPoint,
): number {
  const firstX = first.x - vertex.x;
  const firstY = first.y - vertex.y;
  const lastX = last.x - vertex.x;
  const lastY = last.y - vertex.y;
  const denominator = Math.hypot(firstX, firstY) * Math.hypot(lastX, lastY);

  if (denominator <= Number.EPSILON) {
    return 0;
  }

  const cosine = Math.min(
    1,
    Math.max(-1, (firstX * lastX + firstY * lastY) / denominator),
  );

  return (Math.acos(cosine) * 180) / Math.PI;
}

function normalizePersonalRange(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || maximum <= minimum) {
    return 0.5;
  }

  return clamp01((value - minimum) / (maximum - minimum));
}

function distance2d(a: HandLandmarkPoint, b: HandLandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
