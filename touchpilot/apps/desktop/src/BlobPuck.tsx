import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { PuckMotionModel } from "./puckMotion";
import type { PointerShadowPosition, PuckTargetVector } from "./overlayGeometry";

type BlobNode = HTMLSpanElement | null;

const blobAnchor = { x: 66, y: 68 } as const;

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

    blobsRef.current.forEach((blob, index) => {
      if (blob == null) {
        return;
      }

      const isLead = index === 0;
      const isTail = index === 2 && motion.canSendTargetDroplets;
      const x = blobAnchor.x + (isTail ? pull.x : 0);
      const y = blobAnchor.y + (isTail ? pull.y : 0);

      gsap.to(blob, {
        x,
        xPercent: -50,
        y,
        yPercent: -50,
        scale: isLead ? scale : scale * (isTail ? 0.96 : 1),
        opacity:
          pointerShadow == null
            ? 0
            : motion.state === "shadow"
              ? 0.6
              : 0.62,
        duration: prefersReducedMotion ? 0 : isLead ? 0.1 : 0.5,
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
          <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="30" />
          <feColorMatrix
            in="blur"
            values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 35 -10"
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
