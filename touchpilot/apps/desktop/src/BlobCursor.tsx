import { useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import "./BlobCursor.css";

type BlobType = "circle" | "square";

type BlobCursorPosition = {
  clientX: number;
  clientY: number;
};

type BlobCursorProps = {
  blobType?: BlobType;
  fillColor?: string;
  trailCount?: number;
  sizes?: number[];
  innerSizes?: number[];
  innerColor?: string;
  opacities?: number[];
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  filterId?: string;
  filterStdDeviation?: number;
  filterColorMatrixValues?: string;
  useFilter?: boolean;
  fastDuration?: number;
  slowDuration?: number;
  fastEase?: string;
  slowEase?: string;
  zIndex?: number;
  position?: BlobCursorPosition | null;
  trailPull?: number;
  liquidStretch?: number;
};

export default function BlobCursor({
  blobType = "circle",
  fillColor = "#5227FF",
  trailCount = 3,
  sizes = [60, 125, 75],
  innerSizes = [20, 35, 25],
  innerColor = "rgba(255,255,255,0.8)",
  opacities = [0.6, 0.6, 0.6],
  shadowColor = "rgba(0,0,0,0.75)",
  shadowBlur = 5,
  shadowOffsetX = 10,
  shadowOffsetY = 10,
  filterId = "blob",
  filterStdDeviation = 30,
  filterColorMatrixValues = "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 35 -10",
  useFilter = true,
  fastDuration = 0.1,
  slowDuration = 0.5,
  fastEase = "power3.out",
  slowEase = "power1.out",
  zIndex = 100,
  position = null,
  trailPull = 0,
  liquidStretch = 0,
}: BlobCursorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blobsRef = useRef<Array<HTMLDivElement | null>>([]);
  const lastPositionRef = useRef<BlobCursorPosition | null>(null);
  const trailVectorRef = useRef({ x: -1, y: 0.18 });

  const updateOffset = useCallback(() => {
    if (!containerRef.current) {
      return { left: 0, top: 0 };
    }

    const rect = containerRef.current.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  }, []);

  const moveTo = useCallback(
    (clientX: number, clientY: number) => {
      const { left, top } = updateOffset();
      const x = clientX - left;
      const y = clientY - top;
      const previous = lastPositionRef.current;

      if (previous != null) {
        const deltaX = clientX - previous.clientX;
        const deltaY = clientY - previous.clientY;
        const distance = Math.hypot(deltaX, deltaY);

        if (distance < 1.25) {
          return;
        }

        if (distance > 1.25) {
          trailVectorRef.current = {
            x: -deltaX / distance,
            y: -deltaY / distance,
          };
        }
      }

      lastPositionRef.current = { clientX, clientY };
      const trailVector = trailVectorRef.current;
      const speed = previous == null ? 0 : Math.min(Math.hypot(clientX - previous.clientX, clientY - previous.clientY) / 42, 1);
      const rotation = Math.atan2(-trailVector.y, -trailVector.x) * (180 / Math.PI);

      blobsRef.current.forEach((el, i) => {
        if (!el) {
          return;
        }

        const isLead = i === 0;
        const offset = i * trailPull;
        gsap.to(el, {
          x: x + trailVector.x * offset,
          y: y + trailVector.y * offset,
          scaleX: 1 + speed * liquidStretch * (isLead ? 1 : 0.65),
          scaleY: 1 - speed * liquidStretch * (isLead ? 0.42 : 0.28),
          rotate: rotation,
          duration: isLead ? fastDuration : slowDuration,
          ease: isLead ? fastEase : slowEase,
          overwrite: true,
        });
      });
    },
    [fastDuration, fastEase, liquidStretch, slowDuration, slowEase, trailPull, updateOffset],
  );

  const handleMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const x = "clientX" in event ? event.clientX : event.touches[0]?.clientX;
      const y = "clientY" in event ? event.clientY : event.touches[0]?.clientY;

      if (x == null || y == null) {
        return;
      }

      moveTo(x, y);
    },
    [moveTo],
  );

  useEffect(() => {
    const onResize = () => updateOffset();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      gsap.killTweensOf(blobsRef.current.filter(Boolean));
    };
  }, [updateOffset]);

  useEffect(() => {
    if (position == null) {
      return;
    }

    moveTo(position.clientX, position.clientY);
  }, [moveTo, position]);

  return (
    <div
      ref={containerRef}
      className="blob-container"
      style={{ zIndex }}
      onMouseMove={handleMove}
      onTouchMove={handleMove}
    >
      {useFilter && (
        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation={filterStdDeviation} />
            <feColorMatrix in="blur" values={filterColorMatrixValues} />
          </filter>
        </svg>
      )}

      <div className="blob-main" style={{ filter: useFilter ? `url(#${filterId})` : undefined }}>
        {Array.from({ length: trailCount }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              blobsRef.current[i] = el;
            }}
            className="blob"
            style={{
              width: sizes[i],
              height: sizes[i],
              borderRadius: blobType === "circle" ? "50%" : "0%",
              background: fillColor,
              opacity: opacities[i],
              boxShadow: `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px 0 ${shadowColor}`,
            }}
          >
            {(innerSizes[i] ?? 0) > 0 ? (
              <div
                className="inner-dot"
                style={{
                  width: innerSizes[i],
                  height: innerSizes[i],
                  top: ((sizes[i] ?? 0) - (innerSizes[i] ?? 0)) / 2,
                  left: ((sizes[i] ?? 0) - (innerSizes[i] ?? 0)) / 2,
                  backgroundColor: innerColor,
                  borderRadius: blobType === "circle" ? "50%" : "0%",
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
