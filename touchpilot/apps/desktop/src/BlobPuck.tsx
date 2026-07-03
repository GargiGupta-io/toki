import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { PuckMotionModel } from "./puckMotion";
import type { PointerShadowPosition, PuckTargetVector } from "./overlayGeometry";

type BlobNode = HTMLSpanElement | null;

const blobBasePositions = [
  { x: 26, y: 31 },
  { x: 34, y: 26 },
  { x: 42, y: 18 },
] as const;

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

  const pull = clamp(distance / 32, 4, 22);

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
    return 0.9;
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

    blobsRef.current.forEach((blob, index) => {
      if (blob == null) {
        return;
      }

      const base = blobBasePositions[index] ?? blobBasePositions[0];
      const isLead = index === 0;
      const isTargetDrop = index === 2 && motion.canSendTargetDroplets;
      const idleSpread = motion.state === "thinking" ? 3 : 0;
      const x = base.x + (isTargetDrop ? pull.x : index * idleSpread);
      const y = base.y + (isTargetDrop ? pull.y : -index * idleSpread);

      gsap.to(blob, {
        x,
        y,
        scale: isLead ? scale : scale * (isTargetDrop ? 0.9 : 1),
        opacity:
          pointerShadow == null
            ? 0
            : motion.state === "shadow"
              ? index === 0
                ? 0.92
                : 0.72
              : isTargetDrop
                ? 0.82
                : 0.86,
        duration: prefersReducedMotion ? 0 : isLead ? 0.08 : 0.28 + index * 0.08,
        ease: isLead ? "power3.out" : "power1.out",
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
      <svg className="blob-puck-filter" focusable="false">
        <filter id="toki-blob-puck">
          <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="11" />
          <feColorMatrix
            in="blur"
            values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 32 -10"
          />
        </filter>
      </svg>
      <span className="blob-puck-layer">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            ref={(node) => {
              blobsRef.current[index] = node;
            }}
            className={`blob-puck-node blob-puck-node-${index + 1}`}
          >
            <span className="blob-puck-glint" />
          </span>
        ))}
      </span>
    </span>
  );
}
