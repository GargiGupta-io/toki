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
        fillColor="rgba(82, 39, 255, 0.62)"
        trailCount={3}
        sizes={[34, 54, 42]}
        innerSizes={[0, 0, 0]}
        innerColor="rgba(255,255,255,0)"
        opacities={[0.58, 0.42, 0.46]}
        shadowColor="rgba(0,0,0,0.42)"
        shadowBlur={7}
        shadowOffsetX={5}
        shadowOffsetY={7}
        filterId="toki-blob-puck"
        filterStdDeviation={18}
        useFilter={true}
        fastDuration={0.08}
        slowDuration={0.18}
        zIndex={100}
      />
    </span>
  );
}
