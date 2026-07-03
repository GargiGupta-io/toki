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
  offsetX: -52,
  offsetY: -54,
  edgeOffsetX: -112,
  edgeOffsetY: -118,
  margin: 6,
  width: 132,
  height: 132,
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

  const wouldOverflowRight =
    overlayPointerX + pointerShadowGeometry.offsetX + pointerShadowGeometry.width >
    viewport.width - pointerShadowGeometry.margin;
  const wouldOverflowBottom =
    overlayPointerY + pointerShadowGeometry.offsetY + pointerShadowGeometry.height >
    viewport.height - pointerShadowGeometry.margin;
  const offsetX = wouldOverflowRight
    ? pointerShadowGeometry.edgeOffsetX
    : pointerShadowGeometry.offsetX;
  const offsetY = wouldOverflowBottom
    ? pointerShadowGeometry.edgeOffsetY
    : pointerShadowGeometry.offsetY;

  return {
    x: clamp(
      overlayPointerX + offsetX,
      pointerShadowGeometry.margin,
      maxX,
    ),
    y: clamp(
      overlayPointerY + offsetY,
      pointerShadowGeometry.margin,
      maxY,
    ),
  };
}

export function getPuckTargetVector(
  target: TargetBox,
  viewport: ViewportMetrics,
  pointerShadow: PointerShadowPosition | null = null,
): PuckTargetVector {
  const puckCenterX =
    pointerShadow?.x == null
      ? viewport.width - targetDropletAnchor.right
      : pointerShadow.x + pointerShadowGeometry.width / 2;
  const puckCenterY =
    pointerShadow?.y == null
      ? viewport.height - targetDropletAnchor.bottom
      : pointerShadow.y + pointerShadowGeometry.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;

  return {
    x: targetCenterX - puckCenterX,
    y: targetCenterY - puckCenterY,
  };
}
