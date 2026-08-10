import type { CSSProperties } from "react";
import type { TargetBox } from "@toki/shared";
import BlobCursor from "./BlobCursor";
import {
  arrivalPlacement,
  idleArrival,
  type ArrivalState,
} from "./creatureArrival";
import { applyCreatureColour } from "./creatureColour";
import {
  clampPuckCenterToViewport,
  pointerShadowGeometry,
  type PointerShadowPosition,
} from "./overlayGeometry";
import type { PuckMotionModel } from "./puckMotion";
import type { TokiCreatureMode, TokiCreatureState } from "./tokiCreatureState";
import { createSplitStrandGeometry } from "./gestureSplitStrand";
import type { GesturePuckLockState } from "./gesturePuckPresentation";
import type { CreatureSplitVisualState } from "./gestureTwoHand";
import "./BlobPuck.css";

type BlobPuckVisualConfig = {
  fillColor: string;
  sizes: [number, number];
  /** Strength of the single highlight drawn over the merged droplet. */
  sheenStrength: number;
  opacities: [number, number];
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  fastDuration: number;
  slowDuration: number;
  trailPull: number;
  liquidStretch: number;
  ambientMotion: number;
  ambientSpeed: number;
  ambientDeform: number;
};

export const gestureBlobFollowDurationSeconds = 0.025;

/** The roundness comes from the sheen over the merged shape instead. */
const noInnerDot: [number, number] = [0, 0];

/*
 * Flat fill, full opacity.
 *
 * These were radial gradients at 0.82-0.98 opacity, and both choices gave the
 * two discs away. A gradient is positioned relative to its own element, so the
 * lead and the trail each carried their own highlight and their own dark edge;
 * where they overlapped, the merge had a light ball welded to a dark one. Being
 * translucent made it worse, because the overlap composited twice and came out
 * darker than either disc.
 *
 * One flat colour at full opacity has nothing to disagree about, so the merged
 * outline reads as a single droplet even at full lag, when the two centres are
 * 22px apart.
 *
 * Flat is not the finished look, though -- on its own it is a sticker. The
 * roundness comes back as a single sheen drawn over the merged shape, and the
 * depth from a shadow cast by that same merged outline rather than by each
 * disc. Both are one-of, which is why neither can bring the seam back.
 *
 * Rendered and compared side by side before changing: gradient fill kept the
 * visible seam even after the shadow was fixed, so the fill was the larger of
 * the two causes.
 *
 * Each colour below is its gradient's old midpoint, which was the body tone;
 * "paused" says paused with a dim slate instead of with transparency.
 *
 * The lead blob is the large one.
 *
 * These were [small, large]. Blobs render in index order inside one stacking
 * context, so the trailing blob painted *over* the lead -- and every property
 * that carries the liquid character is weighted towards the lead: the velocity
 * stretch at 1.0 against 0.65, the shape morph at 1.0 against 0.72, and the
 * glint. All of it was happening on the disc underneath, hidden by a larger,
 * calmer circle. That is why the thing read as a rigid dot however much the
 * deformation was turned up.
 *
 * The largest size is unchanged in every preset, so the puck's radius, the
 * viewport clamping, and the two-hand split geometry all behave exactly as
 * before.
 */
/**
 * The creature at rest, which is also what the trail is coloured with.
 *
 * Exported so the wake off the blob is plainly the same substance as the blob,
 * including whatever colour was chosen when Toki was first met.
 */
export const idleCreatureColour = "#2A9BFF";

const blobPuckVisuals: Record<TokiCreatureMode, BlobPuckVisualConfig> = {
  idle: {
    fillColor: "#2A9BFF",
    sizes: [22, 14],
    sheenStrength: 1,
    opacities: [1, 1],
    shadowColor: "rgba(2, 13, 34, 0.5)",
    shadowBlur: 7,
    shadowOffsetX: 3,
    shadowOffsetY: 5,
    fastDuration: 0.14,
    slowDuration: 0.266,
    trailPull: 3,
    liquidStretch: 0.28,
    ambientMotion: 1.6,
    ambientSpeed: 1.45,
    ambientDeform: 0.075,
  },
  listening: {
    fillColor: "#24BEFF",
    sizes: [24, 15],
    sheenStrength: 1,
    opacities: [1, 1],
    shadowColor: "rgba(3, 54, 92, 0.58)",
    shadowBlur: 9,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.11,
    slowDuration: 0.209,
    trailPull: 4,
    liquidStretch: 0.36,
    ambientMotion: 2.6,
    ambientSpeed: 2.9,
    ambientDeform: 0.11,
  },
  thinking: {
    fillColor: "#5A6EFF",
    sizes: [25, 16],
    sheenStrength: 1,
    opacities: [1, 1],
    shadowColor: "rgba(20, 17, 75, 0.58)",
    shadowBlur: 9,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.16,
    slowDuration: 0.304,
    trailPull: 5,
    liquidStretch: 0.4,
    ambientMotion: 3.4,
    ambientSpeed: 2.35,
    ambientDeform: 0.145,
  },
  guiding: {
    fillColor: "#17A6FF",
    sizes: [24, 15],
    sheenStrength: 1,
    opacities: [1, 1],
    shadowColor: "rgba(4, 44, 92, 0.62)",
    shadowBlur: 10,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.12,
    slowDuration: 0.228,
    trailPull: 4,
    liquidStretch: 0.44,
    ambientMotion: 2.2,
    ambientSpeed: 2.1,
    ambientDeform: 0.105,
  },
  confirming: {
    fillColor: "#2BCEDF",
    sizes: [24, 15],
    sheenStrength: 1,
    opacities: [1, 1],
    shadowColor: "rgba(6, 58, 88, 0.6)",
    shadowBlur: 10,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.13,
    slowDuration: 0.247,
    trailPull: 4,
    liquidStretch: 0.36,
    ambientMotion: 2.8,
    ambientSpeed: 2.55,
    ambientDeform: 0.12,
  },
  paused: {
    fillColor: "#45638F",
    sizes: [20, 13],
    sheenStrength: 0.7,
    opacities: [1, 1],
    shadowColor: "rgba(0, 0, 0, 0.42)",
    shadowBlur: 6,
    shadowOffsetX: 3,
    shadowOffsetY: 5,
    fastDuration: 0.2,
    slowDuration: 0.38,
    trailPull: 2,
    liquidStretch: 0.16,
    ambientMotion: 0,
    ambientSpeed: 0,
    ambientDeform: 0,
  },
  error: {
    fillColor: "#FF5470",
    sizes: [24, 15],
    sheenStrength: 1,
    opacities: [1, 1],
    shadowColor: "rgba(82, 10, 45, 0.52)",
    shadowBlur: 9,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.17,
    slowDuration: 0.323,
    trailPull: 3,
    liquidStretch: 0.24,
    ambientMotion: 1.3,
    ambientSpeed: 1.85,
    ambientDeform: 0.085,
  },
};

const blobPuckLockVisuals: Record<
  GesturePuckLockState,
  Partial<BlobPuckVisualConfig>
> = {
  none: {},
  checking: {
    fillColor: "#FFB63F",
    shadowColor: "rgba(255, 165, 55, 0.78)",
    shadowBlur: 15,
    ambientMotion: 0,
    ambientSpeed: 0,
    ambientDeform: 0,
  },
  locked: {
    fillColor: "#26DED5",
    shadowColor: "rgba(45, 240, 220, 0.78)",
    shadowBlur: 16,
    ambientMotion: 0,
    ambientSpeed: 0,
    ambientDeform: 0,
  },
  limited: {
    fillColor: "#F79A35",
    shadowColor: "rgba(255, 143, 48, 0.76)",
    shadowBlur: 15,
    ambientMotion: 0,
    ambientSpeed: 0,
    ambientDeform: 0,
  },
};

export function BlobPuck({
  creatureState,
  motion,
  pointerShadow,
  pointerSource,
  splitVisual,
  lockState,
  target,
  hueShift = 0,
  arrival = idleArrival,
}: {
  creatureState?: TokiCreatureState;
  motion: PuckMotionModel;
  pointerShadow: PointerShadowPosition | null;
  pointerSource: "cursor" | "gesture";
  splitVisual: CreatureSplitVisualState | null;
  lockState: GesturePuckLockState;
  target: TargetBox | null;
  /** How far to turn the creature's colours. Zero is the colour it was drawn in. */
  hueShift?: number;
  /**
   * The one-off journey from the middle of the screen to the notch, at the end
   * of the introduction. Idle every other second of the creature's life.
   */
  arrival?: ArrivalState;
}) {
  const presentedSplitVisual = lockState === "none" ? splitVisual : null;
  const arriving = arrival.phase !== "idle";

  /*
   * During the arrival the creature is not following anything.
   *
   * It is being introduced: it appears in the middle of the screen, oversized,
   * and travels to the notch. Letting the pointer drive it here would have it
   * chase the cursor across its own introduction.
   */
  if (!arriving && pointerShadow == null && presentedSplitVisual == null) {
    return null;
  }

  const mode = creatureState?.mode ?? "idle";

  /*
   * The colour somebody chose when they met Toki, applied here.
   *
   * A rotation of the whole family rather than one hex overwriting every state:
   * resting, listening and thinking are deliberately different tones, and that
   * difference is what makes a glance at the creature informative.
   *
   * The lock colours are applied *after*, and are not rotated. Amber means
   * checking and teal means locked on; those are meanings, and a green Toki
   * still has to be able to say them.
   */
  const visual = {
    ...applyCreatureColour(blobPuckVisuals[mode], mode, hueShift),
    ...blobPuckLockVisuals[lockState],
  };
  const gesture = creatureState?.gesture;
  const gestureIsActive =
    pointerSource === "cursor" &&
    creatureState?.anchor === "gesture" &&
    gesture?.active === true;
  const leadFollowDuration =
    pointerSource === "gesture"
      ? gestureBlobFollowDurationSeconds
      : gestureIsActive
        ? visual.fastDuration * 0.9
        : visual.fastDuration;
  const gestureScale =
    gestureIsActive && gesture?.label === "pinch"
      ? 0.86
      : gestureIsActive && gesture?.label === "open_palm"
        ? 1.08
        : 1;
  const splitScale =
    presentedSplitVisual == null
      ? 1
      : presentedSplitVisual.phase === "splitting" ||
          presentedSplitVisual.phase === "merging"
        ? 0.74
        : 0.82;
  /*
   * Where it is arriving from, and how big it is on the way.
   *
   * The destination is the notch, measured rather than assumed: the creature
   * settles where it actually lives, which is under the housing at the top
   * centre of the display.
   */
  const arrivalAt_ = arriving
    ? arrivalPlacement(
        arrival,
        { width: window.innerWidth, height: window.innerHeight },
        { x: window.innerWidth / 2, y: pointerShadowGeometry.margin + 26 },
      )
    : null;

  const sizes = visual.sizes.map(
    (size) => size * gestureScale * splitScale * (arrivalAt_?.scale ?? 1),
  ) as [number, number];
  const puckRadius = Math.max(...sizes) / 2 + 12;
  const unclampedCenterX = arrivalAt_
    ? arrivalAt_.x
    : presentedSplitVisual
      ? presentedSplitVisual.primary.x
      : (pointerShadow?.x ?? 0) +
        pointerShadowGeometry.width / 2 +
        (gestureIsActive ? (gesture?.offsetX ?? 0) : 0);
  const unclampedCenterY = arrivalAt_
    ? arrivalAt_.y
    : presentedSplitVisual
      ? presentedSplitVisual.primary.y
      : (pointerShadow?.y ?? 0) +
        pointerShadowGeometry.height / 2 +
        (gestureIsActive ? (gesture?.offsetY ?? 0) : 0);
  const centerX = clampPuckCenterToViewport(
    unclampedCenterX,
    puckRadius,
    window.innerWidth,
  );
  const centerY = clampPuckCenterToViewport(
    unclampedCenterY,
    puckRadius,
    window.innerHeight,
  );
  const secondaryCenterX =
    presentedSplitVisual == null
      ? centerX
      : clampPuckCenterToViewport(
          presentedSplitVisual.secondary.x,
          puckRadius,
          window.innerWidth,
        );
  const secondaryCenterY =
    presentedSplitVisual == null
      ? centerY
      : clampPuckCenterToViewport(
          presentedSplitVisual.secondary.y,
          puckRadius,
          window.innerHeight,
        );
  const splitStrand = createSplitStrandGeometry({
    primary: { x: centerX, y: centerY },
    secondary: { x: secondaryCenterX, y: secondaryCenterY },
    lobeRadius: puckRadius,
  });
  const splitBridgeStyle = {
    left: `${splitStrand.startX}px`,
    top: `${splitStrand.startY}px`,
    width: `${splitStrand.width}px`,
    "--toki-split-strand-thickness": `${splitStrand.thickness}px`,
    transform: `translateY(-50%) rotate(${splitStrand.angleDegrees}deg)`,
    background: visual.fillColor,
    boxShadow: `0 0 7px ${visual.shadowColor}`,
  } as CSSProperties;
  const canSendTargetDroplet = motion.canSendTargetDroplets && target != null;
  const targetCenterX = target == null ? centerX : target.x + target.width / 2;
  const targetCenterY = target == null ? centerY : target.y + target.height / 2;
  const targetDeltaX = targetCenterX - centerX;
  const targetDeltaY = targetCenterY - centerY;
  const targetDistance = Math.max(1, Math.hypot(targetDeltaX, targetDeltaY));
  const releaseOffset = Math.max(5, sizes[0] / 2 - 1);
  const dropletSourceX = centerX + (targetDeltaX / targetDistance) * releaseOffset;
  const dropletSourceY = centerY + (targetDeltaY / targetDistance) * releaseOffset;
  const dropletTravelX = targetCenterX - dropletSourceX;
  const dropletTravelY = targetCenterY - dropletSourceY;
  const dropletArc = Math.min(28, Math.max(10, targetDistance * 0.075));
  const dropletStyle = {
    "--toki-droplet-source-x": `${dropletSourceX}px`,
    "--toki-droplet-source-y": `${dropletSourceY}px`,
    "--toki-droplet-mid-x": `${dropletTravelX * 0.54}px`,
    "--toki-droplet-mid-y": `${dropletTravelY * 0.54 - dropletArc}px`,
    "--toki-droplet-travel-x": `${dropletTravelX}px`,
    "--toki-droplet-travel-y": `${dropletTravelY}px`,
    background: visual.fillColor,
    boxShadow: `0 0 8px ${visual.shadowColor}`,
  } as CSSProperties;
  const dropletKey =
    target == null
      ? "none"
      : `${target.label}:${target.x}:${target.y}:${target.width}:${target.height}`;

  return (
    <span
      className="blob-puck"
      data-mode={mode}
      data-gesture={gesture?.label ?? "none"}
      data-gesture-phase={gesture?.phase ?? "inactive"}
      data-gesture-active={gestureIsActive ? "true" : "false"}
      data-pointer-source={pointerSource}
      data-lock-state={lockState}
      data-lock-feedback={lockState === "none" ? "none" : "persistent"}
      data-split-phase={presentedSplitVisual?.phase ?? "merged"}
      data-split-strand={presentedSplitVisual ? "persistent" : "none"}
      data-split-visual-only={
        presentedSplitVisual?.visualOnly ? "true" : "false"
      }
      data-droplet-travel={canSendTargetDroplet ? "true" : "false"}
      aria-hidden="true"
    >
      <BlobCursor
        position={{
          clientX: centerX,
          clientY: centerY,
        }}
        blobType="circle"
        fillColor={visual.fillColor}
        trailCount={2}
        sizes={sizes}
        // No inner dot. It was the only highlight once the fill went flat,
        // and at 4px it read as a hard white speck rather than a shine --
        // most visible while moving, which is when it was most looked at.
        innerSizes={noInnerDot}
        sheenStrength={visual.sheenStrength}
        opacities={visual.opacities}
        shadowColor={visual.shadowColor}
        shadowBlur={visual.shadowBlur}
        shadowOffsetX={visual.shadowOffsetX}
        shadowOffsetY={visual.shadowOffsetY}
        // Cast by the merged outline, not by each disc. Per-disc shadows
        // land inside the droplet and draw the seam between the two.
        shadowMode="silhouette"
        filterId="toki-blob-puck"
        filterStdDeviation={5}
        useFilter={true}
        fastDuration={leadFollowDuration}
        slowDuration={gestureIsActive ? visual.slowDuration * 0.88 : visual.slowDuration}
        trailPull={gestureIsActive ? visual.trailPull + 2 : visual.trailPull}
        liquidStretch={gestureIsActive ? visual.liquidStretch + 0.12 : visual.liquidStretch}
        ambientMotion={visual.ambientMotion}
        ambientSpeed={visual.ambientSpeed}
        ambientDeform={visual.ambientDeform}
        zIndex={100}
      />
      {presentedSplitVisual ? (
        <>
          <span
            className="blob-puck__split-bridge"
            data-persistent="true"
            style={splitBridgeStyle}
          />
          <span className="blob-puck__secondary-lobe">
            <BlobCursor
              position={{
                clientX: secondaryCenterX,
                clientY: secondaryCenterY,
              }}
              blobType="circle"
              fillColor={visual.fillColor}
              trailCount={2}
              sizes={sizes}
              innerSizes={noInnerDot}
              sheenStrength={visual.sheenStrength}
              opacities={visual.opacities}
              shadowColor={visual.shadowColor}
              shadowBlur={visual.shadowBlur}
              shadowOffsetX={visual.shadowOffsetX}
              shadowOffsetY={visual.shadowOffsetY}
        // Cast by the merged outline, not by each disc. Per-disc shadows
        // land inside the droplet and draw the seam between the two.
        shadowMode="silhouette"
              filterId="toki-blob-puck-secondary"
              filterStdDeviation={5}
              useFilter={true}
              fastDuration={visual.fastDuration}
              slowDuration={visual.slowDuration}
              trailPull={visual.trailPull}
              liquidStretch={visual.liquidStretch + 0.08}
              ambientMotion={visual.ambientMotion}
              ambientSpeed={visual.ambientSpeed * 1.04}
              ambientDeform={visual.ambientDeform}
              zIndex={100}
            />
          </span>
        </>
      ) : null}
      {canSendTargetDroplet ? (
        <span
          key={dropletKey}
          className="blob-puck__target-droplet"
          data-target-label={target.label}
          style={dropletStyle}
        />
      ) : null}
    </span>
  );
}
