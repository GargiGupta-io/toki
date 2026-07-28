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
  margin: 6,
  width: 132,
  height: 132,
} as const;

export const cursorPointerSeparation = {
  horizontal: 36,
  vertical: 0,
} as const;

export const cursorPointerEdgeRadius = 25;

export const gesturePointerSeparation = {
  horizontal: 100,
  vertical: 80,
} as const;

export const gesturePointerEdgeFade = {
  horizontal: 220,
  vertical: 180,
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
  const halfWidth = pointerShadowGeometry.width / 2;
  const halfHeight = pointerShadowGeometry.height / 2;
  const horizontalEdgeRadius = Math.min(
    cursorPointerEdgeRadius,
    Math.max(0, viewport.width / 2),
  );
  const verticalEdgeRadius = Math.min(
    cursorPointerEdgeRadius,
    Math.max(0, viewport.height / 2),
  );
  const centerY = clamp(
    overlayPointerY + cursorPointerSeparation.vertical,
    verticalEdgeRadius,
    viewport.height - verticalEdgeRadius,
  );
  const verticalDistance = centerY - overlayPointerY;
  const availableHorizontalDistance = Math.sqrt(
    Math.max(
      0,
      cursorPointerSeparation.horizontal ** 2 - verticalDistance ** 2,
    ),
  );
  const centerX = clamp(
    overlayPointerX + availableHorizontalDistance,
    horizontalEdgeRadius,
    viewport.width - horizontalEdgeRadius,
  );

  return {
    x: centerX - halfWidth,
    y: centerY - halfHeight,
  };
}

export function getDetachedGesturePointerShadowPosition(
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
  const halfWidth = pointerShadowGeometry.width / 2;
  const halfHeight = pointerShadowGeometry.height / 2;
  const horizontalOffsetWeight = getEdgeOffsetWeight(
    overlayPointerX,
    viewport.width,
    gesturePointerEdgeFade.horizontal,
  );
  const verticalOffsetWeight = getEdgeOffsetWeight(
    overlayPointerY,
    viewport.height,
    gesturePointerEdgeFade.vertical,
  );
  const offsetX = gesturePointerSeparation.horizontal * horizontalOffsetWeight;
  const offsetY = -gesturePointerSeparation.vertical * verticalOffsetWeight;

  const centerX = overlayPointerX + offsetX;
  const centerY = overlayPointerY + offsetY;

  return {
    x: centerX - halfWidth,
    y: centerY - halfHeight,
  };
}

export function clampPuckCenterToViewport(
  center: number,
  radius: number,
  viewportSize: number,
): number {
  return clamp(center, radius, viewportSize - radius);
}

function getEdgeOffsetWeight(
  pointerCoordinate: number,
  viewportSize: number,
  fadeDistance: number,
): number {
  if (viewportSize <= 0 || fadeDistance <= 0) {
    return 0;
  }

  const distanceToNearestEdge = Math.min(
    Math.max(0, pointerCoordinate),
    Math.max(0, viewportSize - pointerCoordinate),
  );

  return clamp(distanceToNearestEdge / fadeDistance, 0, 1);
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
