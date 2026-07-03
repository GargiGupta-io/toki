import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { PuckMotionModel } from "./puckMotion";
import { pointerShadowGeometry, type PointerShadowPosition } from "./overlayGeometry";

type BlobNode = HTMLDivElement | null;

const blobConfig = {
  blobType: "circle",
  fillColor: "rgba(82, 39, 255, 0.5)",
  trailCount: 3,
  sizes: [28, 58, 36],
  innerSizes: [0, 0, 0],
  innerColor: "rgba(255,255,255,0)",
  opacities: [0.42, 0.28, 0.34],
  shadowColor: "rgba(0,0,0,0.38)",
  shadowBlur: 8,
  shadowOffsetX: 4,
  shadowOffsetY: 7,
  filterId: "toki-blob-puck",
  filterStdDeviation: 22,
  filterColorMatrixValues: "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -8",
  fastDuration: 0.1,
  slowDuration: 0.5,
  fastEase: "power3.out",
  slowEase: "power1.out",
  zIndex: 100,
} as const;

function getMotionScale(motion: PuckMotionModel) {
  if (motion.state === "error") {
    return 0.88;
  }

  if (motion.state === "paused" || motion.state === "shadow") {
    return 0.92;
  }

  if (motion.state === "thinking" || motion.state === "guiding") {
    return 1;
  }

  return 0.98;
}

export function BlobPuck({
  motion,
  pointerShadow,
}: {
  motion: PuckMotionModel;
  pointerShadow: PointerShadowPosition | null;
}) {
  const blobsRef = useRef<BlobNode[]>([]);
  const lastAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const trailVectorRef = useRef({ x: -1, y: 0.25 });
  const prefersReducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const scale = getMotionScale(motion);
    const anchor =
      pointerShadow == null
        ? null
        : {
            x: pointerShadow.x + pointerShadowGeometry.width / 2,
            y: pointerShadow.y + pointerShadowGeometry.height / 2,
          };
    if (anchor != null) {
      const previousAnchor = lastAnchorRef.current;

      if (previousAnchor != null) {
        const deltaX = anchor.x - previousAnchor.x;
        const deltaY = anchor.y - previousAnchor.y;
        const distance = Math.hypot(deltaX, deltaY);

        if (distance > 0.75) {
          trailVectorRef.current = {
            x: -deltaX / distance,
            y: -deltaY / distance,
          };
        }
      }

      lastAnchorRef.current = anchor;
    }

    const trailVector = trailVectorRef.current;
    const offsets = [
      { x: 0, y: 0 },
      { x: trailVector.x * 7, y: trailVector.y * 7 },
      { x: trailVector.x * 12, y: trailVector.y * 12 },
    ];

    blobsRef.current.forEach((blob, index) => {
      if (blob == null) {
        return;
      }

      const isLead = index === 0;
      const offset = offsets[index] ?? offsets[0];
      const x = anchor == null ? 0 : anchor.x + offset.x;
      const y = anchor == null ? 0 : anchor.y + offset.y;

      gsap.to(blob, {
        x,
        y,
        scale,
        opacity:
          anchor == null
            ? 0
            : motion.state === "shadow"
              ? blobConfig.opacities[index] * 0.9
              : blobConfig.opacities[index],
        duration: prefersReducedMotion
          ? 0
          : isLead
            ? blobConfig.fastDuration
            : blobConfig.slowDuration,
        ease: isLead ? blobConfig.fastEase : blobConfig.slowEase,
        overwrite: true,
      });
    });
  }, [motion, pointerShadow, prefersReducedMotion]);

  return (
    <span
      className="blob-puck"
      data-motion={motion.state}
      data-pointer-shadow={pointerShadow ? "active" : "idle"}
      aria-hidden="true"
    >
      <div className="blob-container" style={{ zIndex: blobConfig.zIndex }}>
        <svg className="blob-puck-filter" focusable="false">
          <filter id={blobConfig.filterId}>
            <feGaussianBlur
              in="SourceGraphic"
              result="blur"
              stdDeviation={blobConfig.filterStdDeviation}
            />
            <feColorMatrix in="blur" values={blobConfig.filterColorMatrixValues} />
          </filter>
        </svg>

        <div className="blob-main" style={{ filter: `url(#${blobConfig.filterId})` }}>
          {Array.from({ length: blobConfig.trailCount }).map((_, index) => {
            const size = blobConfig.sizes[index] ?? blobConfig.sizes[0];
            const innerSize = blobConfig.innerSizes[index] ?? blobConfig.innerSizes[0];

            return (
              <div
                key={index}
                ref={(node) => {
                  blobsRef.current[index] = node;
                }}
                className="blob"
                style={{
                  width: size,
                  height: size,
                  borderRadius: blobConfig.blobType === "circle" ? "50%" : "0%",
                  backgroundColor: blobConfig.fillColor,
                  opacity: 0,
                  boxShadow: `${blobConfig.shadowOffsetX}px ${blobConfig.shadowOffsetY}px ${blobConfig.shadowBlur}px 0 ${blobConfig.shadowColor}`,
                }}
              >
                {innerSize > 0 ? (
                  <div
                    className="inner-dot"
                    style={{
                      width: innerSize,
                      height: innerSize,
                      top: (size - innerSize) / 2,
                      left: (size - innerSize) / 2,
                      backgroundColor: blobConfig.innerColor,
                      borderRadius: blobConfig.blobType === "circle" ? "50%" : "0%",
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </span>
  );
}
