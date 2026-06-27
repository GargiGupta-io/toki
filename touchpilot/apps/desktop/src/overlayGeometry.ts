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
  centerOffsetX: 6,
  centerOffsetY: 7,
  edgeCenterOffsetX: 10,
  edgeCenterOffsetY: 12,
  margin: 4,
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

  const preferredCenterX = pointerX + pointerShadowGeometry.centerOffsetX;
  const preferredCenterY = pointerY + pointerShadowGeometry.centerOffsetY;
  const halfWidth = pointerShadowGeometry.width / 2;
  const halfHeight = pointerShadowGeometry.height / 2;
  const centerOffsetX =
    preferredCenterX + halfWidth > viewport.width - pointerShadowGeometry.margin
      ? -pointerShadowGeometry.edgeCenterOffsetX
      : preferredCenterX - halfWidth < pointerShadowGeometry.margin
        ? pointerShadowGeometry.edgeCenterOffsetX
        : pointerShadowGeometry.centerOffsetX;
  const centerOffsetY =
    preferredCenterY + halfHeight > viewport.height - pointerShadowGeometry.margin
      ? -pointerShadowGeometry.edgeCenterOffsetY
      : preferredCenterY - halfHeight < pointerShadowGeometry.margin
        ? pointerShadowGeometry.edgeCenterOffsetY
        : pointerShadowGeometry.centerOffsetY;

  return {
    x: clamp(
      pointerX + centerOffsetX - halfWidth,
      pointerShadowGeometry.margin,
      maxX,
    ),
    y: clamp(
      pointerY + centerOffsetY - halfHeight,
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
