import BlobCursor from "./BlobCursor";
import { pointerShadowGeometry, type PointerShadowPosition } from "./overlayGeometry";
import type { PuckMotionModel } from "./puckMotion";

export function BlobPuck({
  pointerShadow,
}: {
  motion: PuckMotionModel;
  pointerShadow: PointerShadowPosition | null;
}) {
  if (pointerShadow == null) {
    return null;
  }

  return (
    <span className="blob-puck" aria-hidden="true">
      <BlobCursor
        position={{
          clientX: pointerShadow.x + pointerShadowGeometry.width / 2,
          clientY: pointerShadow.y + pointerShadowGeometry.height / 2,
        }}
        blobType="circle"
        fillColor="radial-gradient(circle at 34% 28%, rgba(250, 254, 255, 0.98) 0%, rgba(105, 230, 255, 0.94) 18%, rgba(30, 150, 255, 0.9) 58%, rgba(45, 55, 218, 0.84) 100%)"
        trailCount={2}
        sizes={[15, 22]}
        innerSizes={[4, 0]}
        innerColor="rgba(255,255,255,0.58)"
        opacities={[0.94, 0.9]}
        shadowColor="rgba(2, 13, 34, 0.58)"
        shadowBlur={7}
        shadowOffsetX={3}
        shadowOffsetY={5}
        filterId="toki-blob-puck"
        filterStdDeviation={11}
        useFilter={false}
        fastDuration={0.14}
        slowDuration={0.16}
        trailPull={3}
        liquidStretch={0.28}
        zIndex={100}
      />
    </span>
  );
}
