import type { CSSProperties } from "react";
import type { TargetBox } from "@toki/shared";
import BlobCursor from "./BlobCursor";
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
  innerSizes: [number, number];
  innerColor: string;
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

const blobPuckVisuals: Record<TokiCreatureMode, BlobPuckVisualConfig> = {
  idle: {
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(250, 254, 255, 0.96) 0%, rgba(105, 230, 255, 0.9) 18%, rgba(30, 150, 255, 0.84) 58%, rgba(45, 55, 218, 0.8) 100%)",
    sizes: [15, 22],
    innerSizes: [4, 0],
    innerColor: "rgba(255,255,255,0.56)",
    opacities: [0.88, 0.82],
    shadowColor: "rgba(2, 13, 34, 0.5)",
    shadowBlur: 7,
    shadowOffsetX: 3,
    shadowOffsetY: 5,
    fastDuration: 0.14,
    slowDuration: 0.16,
    trailPull: 3,
    liquidStretch: 0.28,
    ambientMotion: 1.6,
    ambientSpeed: 1.45,
    ambientDeform: 0.075,
  },
  listening: {
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.98) 0%, rgba(130, 250, 255, 0.96) 20%, rgba(31, 188, 255, 0.94) 58%, rgba(45, 92, 235, 0.88) 100%)",
    sizes: [17, 24],
    innerSizes: [5, 0],
    innerColor: "rgba(255,255,255,0.68)",
    opacities: [0.96, 0.9],
    shadowColor: "rgba(3, 54, 92, 0.58)",
    shadowBlur: 9,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.11,
    slowDuration: 0.13,
    trailPull: 4,
    liquidStretch: 0.36,
    ambientMotion: 2.6,
    ambientSpeed: 2.9,
    ambientDeform: 0.11,
  },
  thinking: {
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.95) 0%, rgba(143, 206, 255, 0.9) 18%, rgba(84, 104, 255, 0.88) 58%, rgba(72, 42, 198, 0.84) 100%)",
    sizes: [16, 25],
    innerSizes: [4, 0],
    innerColor: "rgba(255,255,255,0.58)",
    opacities: [0.9, 0.86],
    shadowColor: "rgba(20, 17, 75, 0.58)",
    shadowBlur: 9,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.16,
    slowDuration: 0.2,
    trailPull: 5,
    liquidStretch: 0.4,
    ambientMotion: 3.4,
    ambientSpeed: 2.35,
    ambientDeform: 0.145,
  },
  guiding: {
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.98) 0%, rgba(98, 236, 255, 0.98) 19%, rgba(20, 162, 255, 0.96) 58%, rgba(44, 73, 229, 0.9) 100%)",
    sizes: [17, 24],
    innerSizes: [5, 0],
    innerColor: "rgba(255,255,255,0.68)",
    opacities: [0.98, 0.92],
    shadowColor: "rgba(4, 44, 92, 0.62)",
    shadowBlur: 10,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.12,
    slowDuration: 0.14,
    trailPull: 4,
    liquidStretch: 0.44,
    ambientMotion: 2.2,
    ambientSpeed: 2.1,
    ambientDeform: 0.105,
  },
  confirming: {
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.99) 0%, rgba(178, 255, 242, 0.96) 20%, rgba(39, 203, 220, 0.9) 58%, rgba(35, 103, 216, 0.86) 100%)",
    sizes: [17, 24],
    innerSizes: [5, 0],
    innerColor: "rgba(255,255,255,0.72)",
    opacities: [0.96, 0.9],
    shadowColor: "rgba(6, 58, 88, 0.6)",
    shadowBlur: 10,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.13,
    slowDuration: 0.15,
    trailPull: 4,
    liquidStretch: 0.36,
    ambientMotion: 2.8,
    ambientSpeed: 2.55,
    ambientDeform: 0.12,
  },
  paused: {
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(240, 247, 255, 0.7) 0%, rgba(120, 164, 196, 0.58) 24%, rgba(59, 91, 148, 0.5) 62%, rgba(44, 50, 93, 0.45) 100%)",
    sizes: [14, 20],
    innerSizes: [3, 0],
    innerColor: "rgba(255,255,255,0.42)",
    opacities: [0.62, 0.52],
    shadowColor: "rgba(0, 0, 0, 0.42)",
    shadowBlur: 6,
    shadowOffsetX: 3,
    shadowOffsetY: 5,
    fastDuration: 0.2,
    slowDuration: 0.26,
    trailPull: 2,
    liquidStretch: 0.16,
    ambientMotion: 0,
    ambientSpeed: 0,
    ambientDeform: 0,
  },
  error: {
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 160, 120, 0.92) 18%, rgba(255, 78, 106, 0.86) 58%, rgba(132, 40, 95, 0.82) 100%)",
    sizes: [17, 24],
    innerSizes: [4, 0],
    innerColor: "rgba(255,255,255,0.6)",
    opacities: [0.9, 0.82],
    shadowColor: "rgba(82, 10, 45, 0.52)",
    shadowBlur: 9,
    shadowOffsetX: 3,
    shadowOffsetY: 6,
    fastDuration: 0.17,
    slowDuration: 0.22,
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
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.99) 0%, rgba(255, 238, 166, 0.98) 20%, rgba(255, 181, 63, 0.95) 58%, rgba(194, 85, 36, 0.9) 100%)",
    innerColor: "rgba(255,255,255,0.86)",
    shadowColor: "rgba(255, 165, 55, 0.78)",
    shadowBlur: 15,
    ambientMotion: 0,
    ambientSpeed: 0,
    ambientDeform: 0,
  },
  locked: {
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.99) 0%, rgba(155, 255, 242, 0.98) 20%, rgba(33, 220, 211, 0.95) 58%, rgba(27, 113, 202, 0.9) 100%)",
    innerColor: "rgba(255,255,255,0.9)",
    shadowColor: "rgba(45, 240, 220, 0.78)",
    shadowBlur: 16,
    ambientMotion: 0,
    ambientSpeed: 0,
    ambientDeform: 0,
  },
  limited: {
    fillColor:
      "radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.99) 0%, rgba(255, 224, 150, 0.97) 20%, rgba(245, 152, 51, 0.94) 58%, rgba(176, 67, 45, 0.9) 100%)",
    innerColor: "rgba(255,255,255,0.86)",
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
}: {
  creatureState?: TokiCreatureState;
  motion: PuckMotionModel;
  pointerShadow: PointerShadowPosition | null;
  pointerSource: "cursor" | "gesture";
  splitVisual: CreatureSplitVisualState | null;
  lockState: GesturePuckLockState;
  target: TargetBox | null;
}) {
  const presentedSplitVisual = lockState === "none" ? splitVisual : null;

  if (pointerShadow == null && presentedSplitVisual == null) {
    return null;
  }

  const mode = creatureState?.mode ?? "idle";
  const visual = {
    ...blobPuckVisuals[mode],
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
  const sizes = visual.sizes.map(
    (size) => size * gestureScale * splitScale,
  ) as [number, number];
  const innerSizes = visual.innerSizes.map(
    (size) => size * gestureScale * splitScale,
  ) as [
    number,
    number,
  ];
  const puckRadius = Math.max(...sizes) / 2 + 12;
  const unclampedCenterX = presentedSplitVisual
    ? presentedSplitVisual.primary.x
    : (pointerShadow?.x ?? 0) +
      pointerShadowGeometry.width / 2 +
      (gestureIsActive ? (gesture?.offsetX ?? 0) : 0);
  const unclampedCenterY = presentedSplitVisual
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
        innerSizes={innerSizes}
        innerColor={visual.innerColor}
        opacities={visual.opacities}
        shadowColor={visual.shadowColor}
        shadowBlur={visual.shadowBlur}
        shadowOffsetX={visual.shadowOffsetX}
        shadowOffsetY={visual.shadowOffsetY}
        filterId="toki-blob-puck"
        filterStdDeviation={11}
        useFilter={false}
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
              innerSizes={innerSizes}
              innerColor={visual.innerColor}
              opacities={visual.opacities}
              shadowColor={visual.shadowColor}
              shadowBlur={visual.shadowBlur}
              shadowOffsetX={visual.shadowOffsetX}
              shadowOffsetY={visual.shadowOffsetY}
              filterId="toki-blob-puck-secondary"
              filterStdDeviation={11}
              useFilter={false}
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
