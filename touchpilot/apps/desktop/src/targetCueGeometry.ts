export type TargetCueShape = "circle" | "region";

export type TargetCueGeometry = {
  shape: TargetCueShape;
  width: number;
  height: number;
  cornerRadius: number;
};

const COMPACT_CUE_SIZE = 52;
const REGION_ASPECT_RATIO = 1.45;
const REGION_HORIZONTAL_PADDING = 8;
const REGION_VERTICAL_PADDING = 6;
const MIN_REGION_HEIGHT = 36;

function getSafeDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function getTargetCueGeometry(
  targetWidth: number,
  targetHeight: number,
): TargetCueGeometry {
  const safeWidth = getSafeDimension(targetWidth);
  const safeHeight = getSafeDimension(targetHeight);
  const isRegion = safeWidth / safeHeight >= REGION_ASPECT_RATIO;

  if (!isRegion) {
    return {
      shape: "circle",
      width: COMPACT_CUE_SIZE,
      height: COMPACT_CUE_SIZE,
      cornerRadius: COMPACT_CUE_SIZE / 2,
    };
  }

  const width = Math.max(
    COMPACT_CUE_SIZE,
    Math.ceil(safeWidth + REGION_HORIZONTAL_PADDING * 2),
  );
  const height = Math.max(
    MIN_REGION_HEIGHT,
    Math.ceil(safeHeight + REGION_VERTICAL_PADDING * 2),
  );

  return {
    shape: "region",
    width,
    height,
    cornerRadius: Math.min(14, height / 2),
  };
}
