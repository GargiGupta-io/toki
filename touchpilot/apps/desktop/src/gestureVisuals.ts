import type {
  GestureLabel,
  GesturePhase,
  HandLandmarkFrame,
  HandLandmarkName,
} from "@toki/shared";

export type GestureVisualAnchor = {
  x: number;
  y: number;
  confidence: number;
  sourceFrameId: number;
};

export type GestureVisualResponse = {
  label: GestureLabel;
  phase: GesturePhase;
  active: boolean;
  offsetX: number;
  offsetY: number;
};

const maxHorizontalOffset = 24;
const maxVerticalOffset = 18;
const anchorDeadZone = 0.035;

export function getGestureVisualAnchor(
  frame: HandLandmarkFrame | null,
  label: GestureLabel,
): GestureVisualAnchor | null {
  if (frame == null || label === "none") {
    return null;
  }

  const names: HandLandmarkName[] =
    label === "pinch"
      ? ["thumb_tip", "index_tip"]
      : ["wrist", "index_mcp", "middle_mcp", "pinky_mcp"];
  const points = names
    .map((name) => frame.landmarks.find((landmark) => landmark.name === name))
    .filter((point) => point != null);

  if (points.length !== names.length) {
    return null;
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    confidence: frame.confidence,
    sourceFrameId: frame.frameId,
  };
}

export function getGestureVisualResponse({
  label,
  phase,
  anchor,
}: {
  label: GestureLabel;
  phase: GesturePhase;
  anchor: GestureVisualAnchor | null;
}): GestureVisualResponse {
  const active =
    label !== "none" &&
    phase !== "inactive" &&
    phase !== "cooldown" &&
    anchor != null;

  if (!active || anchor == null) {
    return {
      label,
      phase,
      active: false,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const mirroredX = 1 - anchor.x;

  return {
    label,
    phase,
    active: true,
    offsetX: normalizedOffset(mirroredX, maxHorizontalOffset),
    offsetY: normalizedOffset(anchor.y, maxVerticalOffset),
  };
}

export function isSameGestureVisualAnchor(
  left: GestureVisualAnchor | null,
  right: GestureVisualAnchor | null,
): boolean {
  if (left == null || right == null) {
    return left === right;
  }

  return (
    Math.abs(left.x - right.x) < 0.018 &&
    Math.abs(left.y - right.y) < 0.018 &&
    Math.abs(left.confidence - right.confidence) < 0.08
  );
}

function normalizedOffset(value: number, maximum: number): number {
  const centered = Math.min(0.5, Math.max(-0.5, value - 0.5));

  if (Math.abs(centered) <= anchorDeadZone) {
    return 0;
  }

  const direction = Math.sign(centered);
  const normalized =
    (Math.abs(centered) - anchorDeadZone) / (0.5 - anchorDeadZone);

  return direction * normalized * maximum;
}
