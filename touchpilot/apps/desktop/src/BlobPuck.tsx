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
        fillColor="rgba(82, 39, 255, 0.82)"
        trailCount={3}
        sizes={[42, 64, 52]}
        innerSizes={[0, 0, 0]}
        innerColor="rgba(255,255,255,0)"
        opacities={[0.78, 0.68, 0.7]}
        shadowColor="rgba(0,0,0,0.52)"
        shadowBlur={8}
        shadowOffsetX={6}
        shadowOffsetY={8}
        filterId="toki-blob-puck"
        filterStdDeviation={26}
        useFilter={true}
        fastDuration={0.07}
        slowDuration={0.1}
        zIndex={100}
      />
    </span>
  );
}
