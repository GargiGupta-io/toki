import type {
  AdaptiveGestureProfile,
  GestureDerivedStatistic,
  Handedness,
} from "@toki/shared";
import { defaultGestureTimingPolicy } from "./gestureContracts";
import {
  defaultGesturePointerCalibration,
  type GesturePointerCalibration,
} from "./gesturePointing";

export const adaptiveGestureProfileStorageKey = "toki.gesture-profile.v1";
export const adaptiveGestureProfileVersion = 1 as const;

export type GestureCalibrationStage =
  | "point_range"
  | "tap_flexion"
  | "pinch_distance"
  | "complete";

export type GestureCalibrationCandidate = {
  stage: Exclude<GestureCalibrationStage, "complete">;
  frameId: number;
  capturedAt: string;
  handedness: Handedness;
  confidence: number;
  point?: { x: number; y: number };
  value?: number;
};

export type GestureCalibrationSession = {
  status: "idle" | "collecting" | "reviewing" | "complete";
  stage: GestureCalibrationStage;
  instruction: string;
  pending: GestureCalibrationCandidate | null;
  acceptedCount: number;
  rejectedCount: number;
  requiredCount: number;
  lastCandidateFrameId: number | null;
  pointSamples: ReadonlyArray<{ x: number; y: number; handedness: Handedness }>;
  tapFlexionSamples: readonly number[];
  pinchDistanceSamples: readonly number[];
  updatedAt: string;
};

export type AdaptiveGestureSettings = {
  source: "default" | "adaptive_profile";
  profileId: string | null;
  pointerCalibration: GesturePointerCalibration;
  tapFlexionRatioThreshold: number;
  pinchDistanceThreshold: number;
};

export type GestureProfileStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

const stageRequirements = Object.freeze({
  point_range: 6,
  tap_flexion: 5,
  pinch_distance: 5,
});

const stageInstructions: Record<GestureCalibrationStage, string> = {
  point_range:
    "Point naturally at several parts of the screen. When the live sample matches your intended point, choose Correct.",
  tap_flexion:
    "Point naturally, turn that wrist roughly a quarter-to-half turn, and hold. Choose Correct only when the intended roll is recognized.",
  pinch_distance:
    "Touch or nearly touch thumb and index in your natural pinch. Choose Correct only while holding that pinch.",
  complete:
    "Calibration is complete. Only bounded derived statistics were saved locally.",
};

export function createIdleGestureCalibrationSession(
  now = "1970-01-01T00:00:00.000Z",
): GestureCalibrationSession {
  return {
    status: "idle",
    stage: "point_range",
    instruction: "Start calibration when the camera and gestures are enabled.",
    pending: null,
    acceptedCount: 0,
    rejectedCount: 0,
    requiredCount: stageRequirements.point_range,
    lastCandidateFrameId: null,
    pointSamples: [],
    tapFlexionSamples: [],
    pinchDistanceSamples: [],
    updatedAt: now,
  };
}

export function startGestureCalibration(now: string): GestureCalibrationSession {
  return {
    ...createIdleGestureCalibrationSession(now),
    status: "collecting",
    instruction: stageInstructions.point_range,
  };
}

export function offerGestureCalibrationCandidate(
  session: GestureCalibrationSession,
  candidate: GestureCalibrationCandidate | null,
  now: string,
): GestureCalibrationSession {
  if (
    session.status !== "collecting" ||
    candidate == null ||
    candidate.stage !== session.stage ||
    candidate.frameId === session.lastCandidateFrameId ||
    !isCandidateWithinTrainingBounds(candidate)
  ) {
    return session;
  }

  return {
    ...session,
    status: "reviewing",
    pending: candidate,
    lastCandidateFrameId: candidate.frameId,
    updatedAt: now,
  };
}

export function rejectGestureCalibrationCandidate(
  session: GestureCalibrationSession,
  now: string,
): GestureCalibrationSession {
  if (session.status !== "reviewing" || session.pending == null) {
    return session;
  }

  return {
    ...session,
    status: "collecting",
    pending: null,
    rejectedCount: session.rejectedCount + 1,
    updatedAt: now,
  };
}

export function acceptGestureCalibrationCandidate({
  session,
  now,
  profileId,
  existingProfile = null,
}: {
  session: GestureCalibrationSession;
  now: string;
  profileId: string;
  existingProfile?: AdaptiveGestureProfile | null;
}): {
  session: GestureCalibrationSession;
  profile: AdaptiveGestureProfile | null;
} {
  const pending = session.pending;
  if (session.status !== "reviewing" || pending == null) {
    return { session, profile: null };
  }

  const pointSamples =
    pending.stage === "point_range" && pending.point != null
      ? [
          ...session.pointSamples,
          { ...pending.point, handedness: pending.handedness },
        ]
      : session.pointSamples;
  const tapFlexionSamples =
    pending.stage === "tap_flexion" && pending.value != null
      ? [...session.tapFlexionSamples, pending.value]
      : session.tapFlexionSamples;
  const pinchDistanceSamples =
    pending.stage === "pinch_distance" && pending.value != null
      ? [...session.pinchDistanceSamples, pending.value]
      : session.pinchDistanceSamples;
  const stageCount = getStageCount(pending.stage, {
    pointSamples,
    tapFlexionSamples,
    pinchDistanceSamples,
  });
  const stageComplete = stageCount >= stageRequirements[pending.stage];
  const nextStage = stageComplete ? getNextStage(pending.stage) : pending.stage;
  const nextSession: GestureCalibrationSession = {
    ...session,
    status: nextStage === "complete" ? "complete" : "collecting",
    stage: nextStage,
    instruction: stageInstructions[nextStage],
    pending: null,
    acceptedCount: session.acceptedCount + 1,
    requiredCount:
      nextStage === "complete" ? 0 : stageRequirements[nextStage],
    pointSamples,
    tapFlexionSamples,
    pinchDistanceSamples,
    updatedAt: now,
  };

  if (nextStage !== "complete") {
    return { session: nextSession, profile: null };
  }

  return {
    session: nextSession,
    profile: buildAdaptiveGestureProfile({
      session: nextSession,
      now,
      profileId,
      existingProfile,
    }),
  };
}

export function buildAdaptiveGestureProfile({
  session,
  now,
  profileId,
  existingProfile = null,
}: {
  session: GestureCalibrationSession;
  now: string;
  profileId: string;
  existingProfile?: AdaptiveGestureProfile | null;
}): AdaptiveGestureProfile {
  if (
    session.pointSamples.length < stageRequirements.point_range ||
    session.tapFlexionSamples.length < stageRequirements.tap_flexion ||
    session.pinchDistanceSamples.length < stageRequirements.pinch_distance
  ) {
    throw new Error("Gesture calibration does not have enough approved samples.");
  }

  const preferredPointerHand = mostCommonKnownHand(
    session.pointSamples.map((sample) => sample.handedness),
  );

  return {
    version: adaptiveGestureProfileVersion,
    profileId,
    createdAt: existingProfile?.createdAt ?? now,
    updatedAt: now,
    preferredPointerHand,
    timing: { ...defaultGestureTimingPolicy },
    pointRangeX: deriveStatistic(session.pointSamples.map((sample) => sample.x)),
    pointRangeY: deriveStatistic(session.pointSamples.map((sample) => sample.y)),
    tapFlexion: deriveStatistic(session.tapFlexionSamples),
    pinchDistance: deriveStatistic(session.pinchDistanceSamples),
  };
}

export function deriveAdaptiveGestureSettings(
  profile: AdaptiveGestureProfile | null,
): AdaptiveGestureSettings {
  if (profile == null || !isAdaptiveGestureProfile(profile)) {
    return {
      source: "default",
      profileId: null,
      pointerCalibration: defaultGesturePointerCalibration,
      tapFlexionRatioThreshold: 1.3,
      pinchDistanceThreshold: 0.34,
    };
  }

  return {
    source: "adaptive_profile",
    profileId: profile.profileId,
    pointerCalibration: Object.freeze({
      ...defaultGesturePointerCalibration,
      trackingLossGraceMs: clamp(
        profile.timing.trackingLossGraceMs,
        1_500,
        2_500,
      ),
    }),
    tapFlexionRatioThreshold: clamp(
      profile.tapFlexion.median + profile.tapFlexion.medianAbsoluteDeviation * 2,
      1,
      1.45,
    ),
    pinchDistanceThreshold: clamp(
      profile.pinchDistance.median +
        profile.pinchDistance.medianAbsoluteDeviation * 2,
      0.22,
      0.45,
    ),
  };
}

export function loadAdaptiveGestureProfile(
  storage: GestureProfileStorage | null,
): AdaptiveGestureProfile | null {
  if (storage == null) {
    return null;
  }

  try {
    const raw = storage.getItem(adaptiveGestureProfileStorageKey);
    if (raw == null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isAdaptiveGestureProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAdaptiveGestureProfile(
  storage: GestureProfileStorage | null,
  profile: AdaptiveGestureProfile,
): boolean {
  if (storage == null || !isAdaptiveGestureProfile(profile)) {
    return false;
  }

  try {
    storage.setItem(adaptiveGestureProfileStorageKey, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function clearAdaptiveGestureProfile(
  storage: GestureProfileStorage | null,
): boolean {
  if (storage == null) {
    return false;
  }

  try {
    storage.removeItem(adaptiveGestureProfileStorageKey);
    return true;
  } catch {
    return false;
  }
}

export function isAdaptiveGestureProfile(
  value: unknown,
): value is AdaptiveGestureProfile {
  if (value == null || typeof value !== "object") {
    return false;
  }

  const profile = value as Partial<AdaptiveGestureProfile>;
  return (
    profile.version === adaptiveGestureProfileVersion &&
    typeof profile.profileId === "string" &&
    profile.profileId.length > 0 &&
    typeof profile.createdAt === "string" &&
    typeof profile.updatedAt === "string" &&
    (profile.preferredPointerHand === "left" ||
      profile.preferredPointerHand === "right" ||
      profile.preferredPointerHand === "unknown") &&
    isTimingPolicy(profile.timing) &&
    isDerivedStatistic(profile.pointRangeX, stageRequirements.point_range) &&
    isDerivedStatistic(profile.pointRangeY, stageRequirements.point_range) &&
    isDerivedStatistic(profile.tapFlexion, stageRequirements.tap_flexion) &&
    isDerivedStatistic(profile.pinchDistance, stageRequirements.pinch_distance)
  );
}

export function getGestureCalibrationStageProgress(
  session: GestureCalibrationSession,
): { accepted: number; required: number } {
  if (session.stage === "complete") {
    return { accepted: 0, required: 0 };
  }

  return {
    accepted: getStageCount(session.stage, session),
    required: stageRequirements[session.stage],
  };
}

function deriveStatistic(values: readonly number[]): GestureDerivedStatistic {
  const median = getMedian(values);
  return {
    median,
    medianAbsoluteDeviation: getMedian(
      values.map((value) => Math.abs(value - median)),
    ),
    sampleCount: values.length,
  };
}

function getMedian(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot derive a statistic from zero samples.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function getStageCount(
  stage: Exclude<GestureCalibrationStage, "complete">,
  samples: Pick<
    GestureCalibrationSession,
    "pointSamples" | "tapFlexionSamples" | "pinchDistanceSamples"
  >,
): number {
  if (stage === "point_range") {
    return samples.pointSamples.length;
  }
  if (stage === "tap_flexion") {
    return samples.tapFlexionSamples.length;
  }
  return samples.pinchDistanceSamples.length;
}

function getNextStage(
  stage: Exclude<GestureCalibrationStage, "complete">,
): GestureCalibrationStage {
  if (stage === "point_range") {
    return "tap_flexion";
  }
  if (stage === "tap_flexion") {
    return "pinch_distance";
  }
  return "complete";
}

function isCandidateWithinTrainingBounds(
  candidate: GestureCalibrationCandidate,
): boolean {
  if (
    candidate.confidence < 0.6 ||
    !Number.isInteger(candidate.frameId) ||
    candidate.frameId < 0
  ) {
    return false;
  }

  if (candidate.stage === "point_range") {
    return (
      candidate.point != null &&
      isFiniteInRange(candidate.point.x, 0, 1) &&
      isFiniteInRange(candidate.point.y, 0, 1)
    );
  }
  if (candidate.stage === "tap_flexion") {
    return candidate.value != null && isFiniteInRange(candidate.value, 0.65, 1.8);
  }
  return candidate.value != null && isFiniteInRange(candidate.value, 0.08, 0.5);
}

function isDerivedStatistic(
  value: unknown,
  minimumSamples: number,
): value is GestureDerivedStatistic {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const statistic = value as Partial<GestureDerivedStatistic>;
  return (
    Number.isFinite(statistic.median) &&
    Number.isFinite(statistic.medianAbsoluteDeviation) &&
    typeof statistic.sampleCount === "number" &&
    Number.isInteger(statistic.sampleCount) &&
    statistic.sampleCount >= minimumSamples
  );
}

function isTimingPolicy(value: unknown): boolean {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const timing = value as Partial<AdaptiveGestureProfile["timing"]>;
  return (
    Number.isFinite(timing.humanGraceMs) &&
    Number.isFinite(timing.doubleTapMaxGapMs) &&
    Number.isFinite(timing.trackingLossGraceMs) &&
    Number.isFinite(timing.lockFreshnessMaxAgeMs)
  );
}

function mostCommonKnownHand(hands: readonly Handedness[]): Handedness {
  const left = hands.filter((hand) => hand === "left").length;
  const right = hands.filter((hand) => hand === "right").length;
  if (left === right) {
    return "unknown";
  }
  return left > right ? "left" : "right";
}

function isFiniteInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
