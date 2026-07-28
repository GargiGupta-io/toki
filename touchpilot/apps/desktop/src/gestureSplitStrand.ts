export type SplitStrandPoint = Readonly<{
  x: number;
  y: number;
}>;

export type SplitStrandGeometry = Readonly<{
  startX: number;
  startY: number;
  width: number;
  angleDegrees: number;
  thickness: number;
}>;

export function createSplitStrandGeometry({
  primary,
  secondary,
  lobeRadius,
}: {
  primary: SplitStrandPoint;
  secondary: SplitStrandPoint;
  lobeRadius: number;
}): SplitStrandGeometry {
  const deltaX = secondary.x - primary.x;
  const deltaY = secondary.y - primary.y;
  const distance = Math.hypot(deltaX, deltaY);
  const angleDegrees = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

  if (distance <= Number.EPSILON) {
    return {
      startX: primary.x,
      startY: primary.y,
      width: 0,
      angleDegrees: 0,
      thickness: 6,
    };
  }

  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  const endpointInset = Math.min(Math.max(4, lobeRadius * 0.55), distance / 2);
  const width = Math.max(0, distance - endpointInset * 2);

  return {
    startX: primary.x + unitX * endpointInset,
    startY: primary.y + unitY * endpointInset,
    width,
    angleDegrees,
    thickness: clamp(7 - distance * 0.008, 2.75, 6),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
