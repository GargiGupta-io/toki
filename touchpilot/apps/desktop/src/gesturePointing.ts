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
  smoothingAlpha: number;
  deadZone: number;
}>;

export type GesturePointerTrackingState = {
  candidateTrackId: string | null;
  poseStartedAtMs: number | null;
  lastPointSeenAtMs: number | null;
  smoothedNormalized: NormalizedGesturePoint | null;
  pointer: GesturePointerSample | null;
  active: boolean;
};

export const defaultGesturePointerCalibration: GesturePointerCalibration =
  Object.freeze({
    cameraMinX: 0.12,
    cameraMaxX: 0.88,
    cameraMinY: 0.08,
    cameraMaxY: 0.72,
    mirrorX: true,
    pointHoldMs: 140,
    trackingLossGraceMs: 2_000,
    smoothingAlpha: 0.34,
    deadZone: 0.006,
  });

export const initialGesturePointerTrackingState: GesturePointerTrackingState = {
  candidateTrackId: null,
  poseStartedAtMs: null,
  lastPointSeenAtMs: null,
  smoothedNormalized: null,
  pointer: null,
  active: false,
};

export function classifyPointPose(
  frame: HandLandmarkFrame | null,
  minDetectionConfidence: number,
): PointPoseClassification {
  if (frame == null || frame.confidence < minDetectionConfidence) {
    return createInactivePointPose();
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
  if (
    classification.label !== "point" ||
    classification.pointerTip == null ||
    classification.handTrackId == null ||
    classification.sourceFrameId == null ||
    classification.capturedAt == null
  ) {
    return recoverOrResetPointer(previousState, nowMs, calibration);
  }

  const sameTrack =
    previousState.candidateTrackId === classification.handTrackId;
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
    smoothedNormalized,
    pointer,
    active: true,
  };

  return { state, pointer };
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
    const pointer = {
      ...previousState.pointer,
      phase: "recovering" as const,
    };
    const state = {
      ...previousState,
      pointer,
    };

    return { state, pointer };
  }

  const state = resetGesturePointerTracking();
  return { state, pointer: null };
}

function smoothNormalizedPoint(
  previous: NormalizedGesturePoint | null,
  next: NormalizedGesturePoint,
  calibration: GesturePointerCalibration,
): NormalizedGesturePoint {
  if (previous == null) {
    return next;
  }

  if (Math.hypot(next.x - previous.x, next.y - previous.y) <= calibration.deadZone) {
    return previous;
  }

  return {
    x: clamp01(previous.x + (next.x - previous.x) * calibration.smoothingAlpha),
    y: clamp01(previous.y + (next.y - previous.y) * calibration.smoothingAlpha),
  };
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
