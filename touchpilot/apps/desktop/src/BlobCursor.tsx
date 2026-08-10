import { useCallback, useEffect, useRef } from "react";
import "./BlobCursor.css";

type BlobType = "circle" | "square";

/**
 * Where the shadow comes from.
 *
 * "per-blob" gives every disc its own box-shadow, which is what the original
 * component did. Inside the gooey filter that is wrong: the discs overlap, so
 * the trailing one casts its shadow *onto* the lead one and paints a dark
 * crescent across the middle of what is supposed to be a single droplet. It is
 * the clearest tell that the shape is two circles.
 *
 * "silhouette" drops the shadow after the merge instead, so it is cast by the
 * outline the eye actually sees. Physically that is what a shadow is, and the
 * inside of the droplet stays one flat colour.
 */
type BlobShadowMode = "per-blob" | "silhouette";

/**
 * The highlight that makes the droplet look round.
 *
 * A flat fill is what stopped the two discs showing as two discs, but flat is
 * also all it is -- a sticker rather than a body. The obvious repair, a gradient
 * on each disc, is exactly what was removed: two of them disagree wherever they
 * overlap.
 *
 * So there is one highlight, drawn on top of the merged shape rather than
 * inside it. One cannot disagree with itself, and being outside the filter it
 * is never thresholded, so it stays a soft sheen instead of the hard white dot
 * that the old inner glint became once the fill went flat.
 *
 * A lit top-left and a shaded bottom-right is the whole trick; it is how a
 * sphere is drawn, and the eye reads it as volume without being told.
 *
 * Filter-based lighting was the other candidate -- feSpecularLighting over the
 * merged alpha, which is more correct and deforms with the shape. Rendered, it
 * washed the droplet almost white and cost five more primitives on a
 * full-screen filter that runs every frame. This is cheaper and looked better.
 */
function sheenBackground(strength: number): string {
  const light = (alpha: number) => `rgba(255, 255, 255, ${(alpha * strength).toFixed(3)})`;
  const shade = (alpha: number) => `rgba(2, 18, 44, ${(alpha * strength).toFixed(3)})`;

  return [
    `radial-gradient(circle at 33% 27%, ${light(0.62)} 0%, ${light(0.2)} 30%, rgba(255, 255, 255, 0) 58%)`,
    `radial-gradient(circle at 70% 80%, ${shade(0.4)} 0%, rgba(2, 18, 44, 0) 56%)`,
  ].join(", ");
}

type BlobCursorPosition = {
  clientX: number;
  clientY: number;
};

export const blobAmbientFramesPerSecond = 30;

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
  shadowMode?: BlobShadowMode;
  /** 0 turns the highlight off; 1 is the tuned strength. */
  sheenStrength?: number;
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
  ambientMotion?: number;
  ambientSpeed?: number;
  ambientDeform?: number;
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
  shadowMode = "per-blob",
  sheenStrength = 0,
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
  ambientMotion = 0,
  ambientSpeed = 1,
  ambientDeform = 0,
}: BlobCursorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blobsRef = useRef<Array<HTMLDivElement | null>>([]);
  const sheenRef = useRef<HTMLDivElement | null>(null);
  const targetPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastClientPositionRef = useRef<BlobCursorPosition | null>(null);
  const blobFramesRef = useRef<BlobFrame[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const animationIsAmbientOnlyRef = useRef(false);
  const lastRenderedAtRef = useRef(0);
  const targetRevisionRef = useRef(0);
  const lastRenderedTargetRevisionRef = useRef(-1);
  const offsetRef = useRef({ left: 0, top: 0 });
  const trailVectorRef = useRef({ x: -1, y: 0.18 });
  const reducedMotionRef = useRef(false);

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

  const applyFrame = useCallback((timestamp: number) => {
    const target = targetPositionRef.current;

    if (target == null) {
      animationIsAmbientOnlyRef.current = false;
      animationFrameRef.current = null;
      return;
    }

    const targetChanged =
      targetRevisionRef.current !== lastRenderedTargetRevisionRef.current;
    const ambientFrameIntervalMs = 1_000 / blobAmbientFramesPerSecond;
    if (
      animationIsAmbientOnlyRef.current &&
      !targetChanged &&
      timestamp - lastRenderedAtRef.current < ambientFrameIntervalMs
    ) {
      animationFrameRef.current = window.requestAnimationFrame(applyFrame);
      return;
    }

    lastRenderedAtRef.current = timestamp;
    lastRenderedTargetRevisionRef.current = targetRevisionRef.current;
    const trailVector = trailVectorRef.current;
    const rotation = Math.atan2(-trailVector.y, -trailVector.x) * (180 / Math.PI);
    const ambientMotionIsActive =
      !reducedMotionRef.current && ambientMotion > 0 && ambientSpeed > 0;
    const elapsed = timestamp / 1000;
    let shouldContinue = false;
    let movementIsActive = false;

    blobsRef.current.forEach((el, i) => {
      if (!el) {
        return;
      }

      const isLead = i === 0;
      const offset = i * trailPull;
      const phase = elapsed * ambientSpeed + i * 2.17;
      const ambientWeight = isLead ? 0.58 : 1;
      const ambientX = ambientMotionIsActive
        ? Math.sin(phase) * ambientMotion * ambientWeight
        : 0;
      const ambientY = ambientMotionIsActive
        ? Math.cos(phase * 1.23) * ambientMotion * ambientWeight * 0.74
        : 0;
      const desiredX = target.x + trailVector.x * offset + ambientX;
      const desiredY = target.y + trailVector.y * offset + ambientY;
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
      // Divided by 9, not 16.
      //
      // This never measured pointer velocity. The macOS cursor is polled every
      // 50ms and only emitted once it has moved, so the target arrived as a
      // 20Hz staircase and this measured the lerp *catching up* to each step --
      // which peaked at nearly twice the true speed and pulsed about 5:1 within
      // every cycle. That pulse was what made the stretch visible, and 16 was
      // calibrated against it.
      //
      // A spring now smooths the position before it arrives, which removed the
      // staircase and the bonus with it. 9 restores the same stretch across the
      // speeds people actually move at, and it is steady rather than
      // flickering, so it reads as more rather than less.
      const speed = Math.min(Math.hypot(frame.x - frame.previousX, frame.y - frame.previousY) / 9, 1);
      const ambientShape = ambientMotionIsActive
        ? Math.sin(phase * 1.41) * ambientDeform * (isLead ? 1 : 0.72)
        : 0;
      const scaleX = 1 + speed * liquidStretch * (isLead ? 1 : 0.65) + ambientShape;
      const scaleY =
        1 - speed * liquidStretch * (isLead ? 0.42 : 0.28) - ambientShape * 0.72;
      const rotationWobble = ambientMotionIsActive ? Math.sin(phase * 0.83) * 5 : 0;

      blobFramesRef.current[i] = frame;
      el.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0) translate(-50%, -50%) rotate(${rotation + rotationWobble}deg) scale(${scaleX}, ${scaleY})`;

      if (isLead && sheenRef.current != null) {
        /*
         * The highlight follows the lead lobe, but not its rotation.
         *
         * The blob is turned to face the way it is travelling, which is
         * invisible on a circle. Turning the highlight with it would make the
         * light appear to orbit the droplet whenever the direction changed --
         * light does not follow a mouse.
         *
         * It takes the smaller of the two stretch factors, applied evenly. The
         * blob's own stretch is measured along its direction of travel; matching
         * that exactly without the rotation would let the highlight cross the
         * outline diagonally. The smaller factor is inside the shape whichever
         * way it is pointing.
         */
        const containedScale = Math.min(scaleX, scaleY);
        sheenRef.current.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0) translate(-50%, -50%) scale(${containedScale})`;
      }

      if (blobType === "circle") {
        const radiusShift = ambientMotionIsActive
          ? Math.sin(phase * 1.13) * ambientDeform * 100
          : 0;
        const crossShift = ambientMotionIsActive
          ? Math.cos(phase * 0.91) * ambientDeform * 76
          : 0;
        const radiusA = Math.min(64, Math.max(36, 50 + radiusShift));
        const radiusB = Math.min(64, Math.max(36, 50 + crossShift));
        el.style.borderRadius = `${radiusA}% ${100 - radiusA}% ${radiusB}% ${
          100 - radiusB
        }% / ${radiusB}% ${radiusA}% ${100 - radiusB}% ${100 - radiusA}%`;
      }

      if (ambientMotionIsActive || remainingDistance > 0.35) {
        shouldContinue = true;
      }
      if (remainingDistance > 0.35) {
        movementIsActive = true;
      }
    });

    animationIsAmbientOnlyRef.current =
      shouldContinue && ambientMotionIsActive && !movementIsActive;
    animationFrameRef.current = shouldContinue ? window.requestAnimationFrame(applyFrame) : null;
  }, [
    ambientDeform,
    ambientMotion,
    ambientSpeed,
    blobType,
    fastDuration,
    getLerpAlpha,
    liquidStretch,
    slowDuration,
    trailPull,
  ]);

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

      // 0.4px, not 1.25px.
      //
      // The threshold was sized for the 20Hz staircase, where a real movement
      // arrived as one large jump every three frames. Smoothed input arrives as
      // small steps every frame instead, so 1.25 let the trail direction go
      // stale below roughly 75 px/s -- the trail pointed the wrong way during
      // exactly the slow, deliberate movement it is meant to describe.
      if (distance > 0.4) {
        trailVectorRef.current = {
          x: -deltaX / distance,
          y: -deltaY / distance,
        };
      }

      lastClientPositionRef.current = { clientX, clientY };
      const nextTarget = {
        x: clientX - left,
        y: clientY - top,
      };
      const previousTarget = targetPositionRef.current;
      targetPositionRef.current = nextTarget;
      if (
        previousTarget == null ||
        previousTarget.x !== nextTarget.x ||
        previousTarget.y !== nextTarget.y
      ) {
        targetRevisionRef.current += 1;
      }
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
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncReducedMotion = () => {
      reducedMotionRef.current = reducedMotionQuery.matches;
      animationIsAmbientOnlyRef.current = false;
      startAnimationLoop();
    };

    syncReducedMotion();
    reducedMotionQuery.addEventListener("change", syncReducedMotion);

    return () => {
      reducedMotionQuery.removeEventListener("change", syncReducedMotion);
    };
  }, [startAnimationLoop]);

  useEffect(() => {
    if (targetPositionRef.current == null) {
      return;
    }

    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = window.requestAnimationFrame(applyFrame);

    return () => {
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [applyFrame]);

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
    };
  }, [moveTo, updateOffset]);

  useEffect(() => {
    if (position == null) {
      return;
    }

    moveTo(position.clientX, position.clientY);
  }, [moveTo, position]);

  const castsSilhouetteShadow = shadowMode === "silhouette";
  /*
   * The shadow is a filter primitive, not a chained CSS function.
   *
   * Writing `filter: url(#goo) drop-shadow(...)` reads better and is the same
   * picture in Gecko and Blink, but a CSS filter list mixing url() with a
   * shorthand function is the case WebKit has always been weakest at -- and
   * this ships inside a WebView. As a primitive it is one filter, evaluated
   * after feColorMatrix, so the shadow is cast by the merged shape and there is
   * nothing for the engine to compose.
   *
   * It is also cheaper: one pass over the layer instead of two.
   *
   * CSS blur radius is roughly twice a Gaussian standard deviation, so the
   * halved value here reproduces the box-shadow it replaces.
   */
  const shadowDeviation = shadowBlur / 2;
  // Only when the filter is off does the shadow have to come from CSS, since
  // there is then no filter chain to put it in.
  const mainFilter = useFilter
    ? `url(#${filterId})`
    : castsSilhouetteShadow
      ? `drop-shadow(${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor})`
      : "";

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
            {castsSilhouetteShadow ? (
              // No `in`, so it takes the merged result above -- the shadow is
              // cast by the outline the eye sees rather than by each disc.
              <feDropShadow
                dx={shadowOffsetX}
                dy={shadowOffsetY}
                stdDeviation={shadowDeviation}
                floodColor={shadowColor}
              />
            ) : null}
          </filter>
        </svg>
      )}

      <div className="blob-main" style={{ filter: mainFilter === "" ? undefined : mainFilter }}>
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
              boxShadow: castsSilhouetteShadow
                ? undefined
                : `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px 0 ${shadowColor}`,
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

      {sheenStrength > 0 && (sizes[0] ?? 0) > 0 ? (
        // Outside .blob-main, so the merge filter never touches it. Inside, the
        // alpha threshold would turn this soft gradient into a hard edge --
        // which is what it is here to replace.
        <div
          ref={sheenRef}
          className="blob-sheen"
          style={{
            width: sizes[0],
            height: sizes[0],
            borderRadius: blobType === "circle" ? "50%" : "0%",
            background: sheenBackground(sheenStrength),
          }}
        />
      ) : null}
    </div>
  );
}
