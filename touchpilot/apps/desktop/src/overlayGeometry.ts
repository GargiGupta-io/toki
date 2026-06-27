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
  centerOffsetX: 3,
  centerOffsetY: 5,
  edgeCenterOffsetX: 8,
  edgeCenterOffsetY: 10,
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

function toOverlayCoordinate(value: number, viewportSize: number, devicePixelRatio: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value >= 0 && value <= viewportSize) {
    return value;
  }

  if (devicePixelRatio > 1) {
    const scaledValue = value / devicePixelRatio;

    if (scaledValue >= 0 && scaledValue <= viewportSize) {
      return scaledValue;
    }
  }

  return value;
}

export function getPointerShadowPosition(
  pointerX: number,
  pointerY: number,
  viewport: ViewportMetrics,
): PointerShadowPosition {
  const overlayPointerX = toOverlayCoordinate(
    pointerX,
    viewport.width,
    viewport.devicePixelRatio,
  );
  const overlayPointerY = toOverlayCoordinate(
    pointerY,
    viewport.height,
    viewport.devicePixelRatio,
  );
  const maxX =
    viewport.width -
    pointerShadowGeometry.width -
    pointerShadowGeometry.margin;
  const maxY =
    viewport.height -
    pointerShadowGeometry.height -
    pointerShadowGeometry.margin;

  const preferredCenterX = overlayPointerX + pointerShadowGeometry.centerOffsetX;
  const preferredCenterY = overlayPointerY + pointerShadowGeometry.centerOffsetY;
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
      overlayPointerX + centerOffsetX - halfWidth,
      pointerShadowGeometry.margin,
      maxX,
    ),
    y: clamp(
      overlayPointerY + centerOffsetY - halfHeight,
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
