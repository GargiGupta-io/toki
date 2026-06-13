import type {
  GestureClassification,
  GestureThresholds,
  HandLandmarkFrame,
  HandLandmarkName,
  HandLandmarkPoint,
} from "@touchpilot/shared";

const pinchThreshold = 0.34;

export type PinchClassification = GestureClassification & {
  normalizedDistance: number | null;
  pinchThreshold: number;
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

function findLandmark(
  frame: HandLandmarkFrame,
  name: HandLandmarkName,
): HandLandmarkPoint | undefined {
  return frame.landmarks.find((landmark) => landmark.name === name);
}

function distance2d(a: HandLandmarkPoint, b: HandLandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
