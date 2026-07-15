import type {
  AdaptiveGestureProfile,
  HandLandmarkIndex,
  HandLandmarkName,
  HandLandmarkPoint,
  Handedness,
  MultiHandLandmarkFrame,
  TrackedHandLandmarkFrame,
} from "@toki/shared";
import { defaultGestureTimingPolicy } from "./gestureContracts";

export type SyntheticHandPose =
  | "neutral"
  | "point"
  | "tap_flexed"
  | "pinch"
  | "open_palm";

const landmarkNames: HandLandmarkName[] = [
  "wrist",
  "thumb_cmc",
  "thumb_mcp",
  "thumb_ip",
  "thumb_tip",
  "index_mcp",
  "index_pip",
  "index_dip",
  "index_tip",
  "middle_mcp",
  "middle_pip",
  "middle_dip",
  "middle_tip",
  "ring_mcp",
  "ring_pip",
  "ring_dip",
  "ring_tip",
  "pinky_mcp",
  "pinky_pip",
  "pinky_dip",
  "pinky_tip",
];

const baseOffsets: Array<readonly [number, number]> = [
  [0, 0.24],
  [-0.15, 0.12],
  [-0.2, 0.02],
  [-0.24, -0.05],
  [-0.28, -0.1],
  [-0.1, 0.02],
  [-0.1, -0.1],
  [-0.1, -0.2],
  [-0.1, -0.31],
  [-0.03, 0],
  [-0.03, -0.1],
  [-0.03, -0.16],
  [-0.03, -0.2],
  [0.04, 0.02],
  [0.04, -0.07],
  [0.04, -0.12],
  [0.04, -0.16],
  [0.11, 0.05],
  [0.12, -0.03],
  [0.13, -0.07],
  [0.14, -0.1],
];

export function createSyntheticTrackedHand({
  trackId = "hand-1",
  frameId = 1,
  capturedAt = "2026-07-15T00:00:00.000Z",
  handedness = "right",
  pose = "point",
  centerX = 0.5,
  centerY = 0.5,
  confidence = 0.96,
  sequence = frameId,
}: {
  trackId?: string;
  frameId?: number;
  capturedAt?: string;
  handedness?: Handedness;
  pose?: SyntheticHandPose;
  centerX?: number;
  centerY?: number;
  confidence?: number;
  sequence?: number;
} = {}): TrackedHandLandmarkFrame {
  const landmarks = landmarkNames.map((name, index) => {
    const [offsetX, offsetY] = poseOffset(name, baseOffsets[index], pose);

    return {
      index: index as HandLandmarkIndex,
      name,
      x: clamp01(centerX + offsetX),
      y: clamp01(centerY + offsetY),
      z: 0,
    } satisfies HandLandmarkPoint;
  });

  return {
    trackId,
    frameId,
    capturedAt,
    handedness,
    confidence,
    trackingConfidence: confidence,
    sequence,
    lastSeenAt: capturedAt,
    landmarks,
  };
}

export function createSyntheticMultiHandFrame({
  frameId = 1,
  capturedAt = "2026-07-15T00:00:00.000Z",
  hands,
  sourceWidth = 1280,
  sourceHeight = 720,
  mirrored = true,
}: {
  frameId?: number;
  capturedAt?: string;
  hands: TrackedHandLandmarkFrame[];
  sourceWidth?: number;
  sourceHeight?: number;
  mirrored?: boolean;
}): MultiHandLandmarkFrame {
  return {
    frameId,
    capturedAt,
    sourceWidth,
    sourceHeight,
    mirrored,
    hands: hands.map((hand) => ({
      ...hand,
      frameId,
      capturedAt,
      lastSeenAt: capturedAt,
      landmarks: hand.landmarks.map((landmark) => ({ ...landmark })),
    })),
  };
}

export function createSyntheticDoubleTapFrames({
  trackId = "pointer-hand",
  startAtMs = Date.parse("2026-07-15T00:00:00.000Z"),
}: {
  trackId?: string;
  startAtMs?: number;
} = {}): MultiHandLandmarkFrame[] {
  const poses: Array<readonly [number, SyntheticHandPose]> = [
    [0, "point"],
    [180, "tap_flexed"],
    [360, "point"],
    [900, "tap_flexed"],
    [1_080, "point"],
  ];

  return poses.map(([offsetMs, pose], index) => {
    const capturedAt = new Date(startAtMs + offsetMs).toISOString();
    const frameId = index + 1;
    const hand = createSyntheticTrackedHand({
      trackId,
      frameId,
      capturedAt,
      pose,
      sequence: frameId,
    });

    return createSyntheticMultiHandFrame({ frameId, capturedAt, hands: [hand] });
  });
}

export function createSyntheticAdaptiveProfile({
  profileId = "gesture-profile-fixture",
  preferredPointerHand = "right",
}: {
  profileId?: string;
  preferredPointerHand?: Handedness;
} = {}): AdaptiveGestureProfile {
  const timestamp = "2026-07-15T00:00:00.000Z";

  return {
    version: 1,
    profileId,
    createdAt: timestamp,
    updatedAt: timestamp,
    preferredPointerHand,
    timing: { ...defaultGestureTimingPolicy },
    pointRangeX: derivedStatistic(0.44, 0.08, 8),
    pointRangeY: derivedStatistic(0.38, 0.07, 8),
    tapFlexion: derivedStatistic(0.52, 0.05, 10),
    pinchDistance: derivedStatistic(0.24, 0.04, 10),
  };
}

function poseOffset(
  name: HandLandmarkName,
  base: readonly [number, number],
  pose: SyntheticHandPose,
): readonly [number, number] {
  if (pose === "tap_flexed" && name === "index_tip") {
    return [-0.03, 0.03];
  }

  if (pose === "tap_flexed" && (name === "index_dip" || name === "index_pip")) {
    return [-0.06, -0.02];
  }

  if (pose === "pinch" && name === "thumb_tip") {
    return [-0.13, -0.2];
  }

  if (pose === "pinch" && name === "index_tip") {
    return [-0.11, -0.21];
  }

  if (pose === "neutral" && name.endsWith("_tip")) {
    return [base[0] * 0.6, 0.06];
  }

  if (pose === "point" && ["middle_tip", "ring_tip", "pinky_tip"].includes(name)) {
    return [base[0], 0.06];
  }

  if (pose !== "open_palm" && name === "thumb_tip") {
    return [-0.16, 0.02];
  }

  return base;
}

function derivedStatistic(
  median: number,
  medianAbsoluteDeviation: number,
  sampleCount: number,
) {
  return { median, medianAbsoluteDeviation, sampleCount };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
