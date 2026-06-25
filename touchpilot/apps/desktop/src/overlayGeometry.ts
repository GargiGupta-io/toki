import type { TargetBox } from "@toki/shared";

export type ViewportMetrics = {
  width: number;
  height: number;
  devicePixelRatio: number;
  updatedAt: string;
};

export type PointerShadowPosition = {
  x: number;
  y: number;
};

export type PuckTargetVector = {
  x: number;
  y: number;
};

export const pointerShadowGeometry = {
  offsetX: 6,
  offsetY: 8,
  margin: 8,
  width: 24,
  height: 30,
} as const;

export const targetDropletAnchor = {
  right: 80,
  bottom: 140,
} as const;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function getPointerShadowPosition(
  pointerX: number,
  pointerY: number,
  viewport: ViewportMetrics,
): PointerShadowPosition {
  const maxX =
    viewport.width -
    pointerShadowGeometry.width -
    pointerShadowGeometry.margin;
  const maxY =
    viewport.height -
    pointerShadowGeometry.height -
    pointerShadowGeometry.margin;

  return {
    x: clamp(
      pointerX + pointerShadowGeometry.offsetX,
      pointerShadowGeometry.margin,
      maxX,
    ),
    y: clamp(
      pointerY + pointerShadowGeometry.offsetY,
      pointerShadowGeometry.margin,
      maxY,
    ),
  };
}

export function getPuckTargetVector(
  target: TargetBox,
  viewport: ViewportMetrics,
): PuckTargetVector {
  const puckCenterX = viewport.width - targetDropletAnchor.right;
  const puckCenterY = viewport.height - targetDropletAnchor.bottom;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;

  return {
    x: targetCenterX - puckCenterX,
    y: targetCenterY - puckCenterY,
  };
}
