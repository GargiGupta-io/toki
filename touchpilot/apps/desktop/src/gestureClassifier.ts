import type {
  GestureClassification,
  GestureThresholds,
  HandLandmarkFrame,
  HandLandmarkName,
  HandLandmarkPoint,
} from "@toki/shared";

const pinchThreshold = 0.34;
const openPalmMinExtendedFingers = 4;
const openPalmMinSpread = 0.72;

export type PinchClassification = GestureClassification & {
  normalizedDistance: number | null;
  pinchThreshold: number;
};

export type OpenPalmClassification = GestureClassification & {
  extendedFingerCount: number;
  normalizedSpread: number | null;
  requiredExtendedFingers: number;
  spreadThreshold: number;
};

export function classifyPinchGesture(
  frame: HandLandmarkFrame | null,
  thresholds: GestureThresholds,
): PinchClassification {
  if (!frame || frame.confidence < thresholds.minDetectionConfidence) {
    return createPinchClassification("none", "inactive", 0, null);
  }

  const thumbTip = findLandmark(frame, "thumb_tip");
  const indexTip = findLandmark(frame, "index_tip");
  const wrist = findLandmark(frame, "wrist");
  const middleMcp = findLandmark(frame, "middle_mcp");

  if (!thumbTip || !indexTip || !wrist || !middleMcp) {
    return createPinchClassification("none", "inactive", frame.confidence, null);
  }

  const palmSize = distance2d(wrist, middleMcp);

  if (palmSize <= 0) {
    return createPinchClassification("none", "inactive", frame.confidence, null);
  }

  const normalizedDistance = distance2d(thumbTip, indexTip) / palmSize;
  const isPinching = normalizedDistance <= pinchThreshold;

  return {
    label: isPinching ? "pinch" : "none",
    phase: isPinching ? "candidate" : "inactive",
    confidence: isPinching ? frame.confidence : 0,
    holdMs: 0,
    cooldownRemainingMs: 0,
    sourceFrameId: frame.frameId,
    normalizedDistance,
    pinchThreshold,
  };
}

function createPinchClassification(
  label: "none" | "pinch",
  phase: "inactive" | "candidate",
  confidence: number,
  normalizedDistance: number | null,
): PinchClassification {
  return {
    label,
    phase,
    confidence,
    holdMs: 0,
    cooldownRemainingMs: 0,
    normalizedDistance,
    pinchThreshold,
  };
}

export function classifyOpenPalmGesture(
  frame: HandLandmarkFrame | null,
  thresholds: GestureThresholds,
): OpenPalmClassification {
  if (!frame || frame.confidence < thresholds.minDetectionConfidence) {
    return createOpenPalmClassification("none", "inactive", 0, 0, null);
  }

  const wrist = findLandmark(frame, "wrist");
  const indexMcp = findLandmark(frame, "index_mcp");
  const middleMcp = findLandmark(frame, "middle_mcp");
  const ringMcp = findLandmark(frame, "ring_mcp");
  const pinkyMcp = findLandmark(frame, "pinky_mcp");
  const indexTip = findLandmark(frame, "index_tip");
  const middleTip = findLandmark(frame, "middle_tip");
  const ringTip = findLandmark(frame, "ring_tip");
  const pinkyTip = findLandmark(frame, "pinky_tip");

  if (
    !wrist ||
    !indexMcp ||
    !middleMcp ||
    !ringMcp ||
    !pinkyMcp ||
    !indexTip ||
    !middleTip ||
    !ringTip ||
    !pinkyTip
  ) {
    return createOpenPalmClassification("none", "inactive", frame.confidence, 0, null);
  }

  const palmSize = distance2d(wrist, middleMcp);

  if (palmSize <= 0) {
    return createOpenPalmClassification("none", "inactive", frame.confidence, 0, null);
  }

  const fingers = [
    { tip: indexTip, mcp: indexMcp },
    { tip: middleTip, mcp: middleMcp },
    { tip: ringTip, mcp: ringMcp },
    { tip: pinkyTip, mcp: pinkyMcp },
  ];
  const extendedFingerCount = fingers.filter(
    ({ tip, mcp }) => distance2d(wrist, tip) > distance2d(wrist, mcp) * 1.35,
  ).length;
  const normalizedSpread =
    (distance2d(indexTip, pinkyTip) + distance2d(indexTip, ringTip)) / palmSize;
  const isOpenPalm =
    extendedFingerCount >= openPalmMinExtendedFingers &&
    normalizedSpread >= openPalmMinSpread;

  return {
    label: isOpenPalm ? "open_palm" : "none",
    phase: isOpenPalm ? "candidate" : "inactive",
    confidence: isOpenPalm ? frame.confidence : 0,
    holdMs: 0,
    cooldownRemainingMs: 0,
    sourceFrameId: frame.frameId,
    extendedFingerCount,
    normalizedSpread,
    requiredExtendedFingers: openPalmMinExtendedFingers,
    spreadThreshold: openPalmMinSpread,
  };
}

function createOpenPalmClassification(
  label: "none" | "open_palm",
  phase: "inactive" | "candidate",
  confidence: number,
  extendedFingerCount: number,
  normalizedSpread: number | null,
): OpenPalmClassification {
  return {
    label,
    phase,
    confidence,
    holdMs: 0,
    cooldownRemainingMs: 0,
    extendedFingerCount,
    normalizedSpread,
    requiredExtendedFingers: openPalmMinExtendedFingers,
    spreadThreshold: openPalmMinSpread,
  };
}

function findLandmark(
  frame: HandLandmarkFrame,
  name: HandLandmarkName,
): HandLandmarkPoint | undefined {
  return frame.landmarks.find((landmark) => landmark.name === name);
}

function distance2d(a: HandLandmarkPoint, b: HandLandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
