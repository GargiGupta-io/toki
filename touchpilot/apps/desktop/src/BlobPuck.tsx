import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { PuckMotionModel } from "./puckMotion";
import {
  pointerShadowGeometry,
  type PointerShadowPosition,
  type PuckTargetVector,
} from "./overlayGeometry";

type BlobNode = HTMLDivElement | null;

const blobConfig = {
  blobType: "circle",
  fillColor: "#5227FF",
  trailCount: 3,
  sizes: [60, 125, 75],
  innerSizes: [20, 35, 25],
  innerColor: "rgba(255,255,255,0.8)",
  opacities: [0.6, 0.6, 0.6],
  shadowColor: "rgba(0,0,0,0.75)",
  shadowBlur: 5,
  shadowOffsetX: 10,
  shadowOffsetY: 10,
  filterId: "toki-blob-puck",
  filterStdDeviation: 30,
  filterColorMatrixValues: "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 35 -10",
  fastDuration: 0.1,
  slowDuration: 0.5,
  fastEase: "power3.out",
  slowEase: "power1.out",
  zIndex: 100,
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTargetPull(targetVector: PuckTargetVector | null) {
  if (targetVector == null) {
    return { x: 0, y: 0 };
  }

  const distance = Math.hypot(targetVector.x, targetVector.y);

  if (distance < 1) {
    return { x: 0, y: 0 };
  }

  const pull = clamp(distance / 40, 0, 18);

  return {
    x: (targetVector.x / distance) * pull,
    y: (targetVector.y / distance) * pull,
  };
}

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
  targetVector,
}: {
  motion: PuckMotionModel;
  pointerShadow: PointerShadowPosition | null;
  targetVector: PuckTargetVector | null;
}) {
  const blobsRef = useRef<BlobNode[]>([]);
  const prefersReducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const pull = motion.canSendTargetDroplets ? getTargetPull(targetVector) : { x: 0, y: 0 };
    const scale = getMotionScale(motion);
    const anchor =
      pointerShadow == null
        ? null
        : {
            x: pointerShadow.x + pointerShadowGeometry.width / 2,
            y: pointerShadow.y + pointerShadowGeometry.height / 2,
          };

    blobsRef.current.forEach((blob, index) => {
      if (blob == null) {
        return;
      }

      const isLead = index === 0;
      const isTail = index === 2 && motion.canSendTargetDroplets;
      const x = (anchor?.x ?? 0) + (isTail ? pull.x : 0);
      const y = (anchor?.y ?? 0) + (isTail ? pull.y : 0);

      gsap.to(blob, {
        x,
        xPercent: -50,
        y,
        yPercent: -50,
        scale: isLead ? scale : scale * (isTail ? 0.96 : 1),
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
  }, [motion, pointerShadow, prefersReducedMotion, targetVector]);

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
              </div>
            );
          })}
        </div>
      </div>
    </span>
  );
}
