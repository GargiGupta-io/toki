import { useCallback, useEffect, useRef } from "react";
import "./BlobCursor.css";

type BlobType = "circle" | "square";

type BlobCursorPosition = {
  clientX: number;
  clientY: number;
};

type BlobFrame = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  initialized: boolean;
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
  zIndex = 100,
  position = null,
  trailPull = 0,
  liquidStretch = 0,
}: BlobCursorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blobsRef = useRef<Array<HTMLDivElement | null>>([]);
  const targetPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastClientPositionRef = useRef<BlobCursorPosition | null>(null);
  const blobFramesRef = useRef<BlobFrame[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const offsetRef = useRef({ left: 0, top: 0 });
  const trailVectorRef = useRef({ x: -1, y: 0.18 });

  const updateOffset = useCallback(() => {
    if (!containerRef.current) {
      offsetRef.current = { left: 0, top: 0 };
      return offsetRef.current;
    }

    const rect = containerRef.current.getBoundingClientRect();
    offsetRef.current = { left: rect.left, top: rect.top };
    return offsetRef.current;
  }, []);

  const getLerpAlpha = useCallback((duration: number) => {
    const frames = Math.max(1, duration * 60);
    return Math.min(0.78, Math.max(0.1, 1 - Math.pow(0.001, 1 / frames)));
  }, []);

  const applyFrame = useCallback(() => {
    const target = targetPositionRef.current;

    if (target == null) {
      animationFrameRef.current = null;
      return;
    }

    const trailVector = trailVectorRef.current;
    const rotation = Math.atan2(-trailVector.y, -trailVector.x) * (180 / Math.PI);
    let shouldContinue = false;

    blobsRef.current.forEach((el, i) => {
      if (!el) {
        return;
      }

      const isLead = i === 0;
      const offset = i * trailPull;
      const desiredX = target.x + trailVector.x * offset;
      const desiredY = target.y + trailVector.y * offset;
      const alpha = getLerpAlpha(isLead ? fastDuration : slowDuration);
      const frame =
        blobFramesRef.current[i] ??
        {
          x: desiredX,
          y: desiredY,
          previousX: desiredX,
          previousY: desiredY,
          initialized: false,
        };

      if (!frame.initialized) {
        frame.x = desiredX;
        frame.y = desiredY;
        frame.previousX = desiredX;
        frame.previousY = desiredY;
        frame.initialized = true;
      } else {
        frame.previousX = frame.x;
        frame.previousY = frame.y;
        frame.x += (desiredX - frame.x) * alpha;
        frame.y += (desiredY - frame.y) * alpha;
      }

      const remainingDistance = Math.hypot(desiredX - frame.x, desiredY - frame.y);
      const speed = Math.min(Math.hypot(frame.x - frame.previousX, frame.y - frame.previousY) / 16, 1);
      const scaleX = 1 + speed * liquidStretch * (isLead ? 1 : 0.65);
      const scaleY = 1 - speed * liquidStretch * (isLead ? 0.42 : 0.28);

      blobFramesRef.current[i] = frame;
      el.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0) translate(-50%, -50%) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`;

      if (remainingDistance > 0.35) {
        shouldContinue = true;
      }
    });

    animationFrameRef.current = shouldContinue ? window.requestAnimationFrame(applyFrame) : null;
  }, [fastDuration, getLerpAlpha, liquidStretch, slowDuration, trailPull]);

  const startAnimationLoop = useCallback(() => {
    if (animationFrameRef.current != null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(applyFrame);
  }, [applyFrame]);

  const moveTo = useCallback(
    (clientX: number, clientY: number) => {
      const { left, top } = updateOffset();
      const previous = lastClientPositionRef.current;
      const deltaX = previous == null ? 0 : clientX - previous.clientX;
      const deltaY = previous == null ? 0 : clientY - previous.clientY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > 1.25) {
        trailVectorRef.current = {
          x: -deltaX / distance,
          y: -deltaY / distance,
        };
      }

      lastClientPositionRef.current = { clientX, clientY };
      targetPositionRef.current = {
        x: clientX - left,
        y: clientY - top,
      };
      startAnimationLoop();
    },
    [startAnimationLoop, updateOffset],
  );

  useEffect(() => {
    blobFramesRef.current = [];

    const target = targetPositionRef.current;
    if (target != null) {
      blobsRef.current.forEach((el, i) => {
        if (!el) {
          return;
        }

        const offset = i * trailPull;
        const x = target.x + trailVectorRef.current.x * offset;
        const y = target.y + trailVectorRef.current.y * offset;
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      });
    }
  }, [trailCount, trailPull]);

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
    const onResize = () => {
      updateOffset();

      const lastClientPosition = lastClientPositionRef.current;
      if (lastClientPosition != null) {
        moveTo(lastClientPosition.clientX, lastClientPosition.clientY);
      }
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [moveTo, updateOffset]);

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
