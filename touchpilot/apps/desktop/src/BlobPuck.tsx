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
        fillColor="#5227FF"
        trailCount={3}
        sizes={[60, 125, 75]}
        innerSizes={[20, 35, 25]}
        innerColor="rgba(255,255,255,0.8)"
        opacities={[0.6, 0.6, 0.6]}
        shadowColor="rgba(0,0,0,0.75)"
        shadowBlur={5}
        shadowOffsetX={10}
        shadowOffsetY={10}
        filterId="toki-blob-puck"
        filterStdDeviation={30}
        useFilter={true}
        fastDuration={0.1}
        slowDuration={0.5}
        zIndex={100}
      />
    </span>
  );
}
