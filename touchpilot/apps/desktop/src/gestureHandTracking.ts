import type {
  HandLandmarkFrame,
  HandLandmarkPoint,
  HandTrackId,
  Handedness,
  MultiHandLandmarkFrame,
  NormalizedGesturePoint,
  TrackedHandLandmarkFrame,
} from "@toki/shared";
import { defaultGestureTimingPolicy } from "./gestureContracts";

type HandTrackHistory = {
  trackId: HandTrackId;
  handedness: Handedness;
  center: NormalizedGesturePoint;
  velocity: NormalizedGesturePoint;
  lastSeenAtMs: number;
  sequence: number;
};

export type HandTrackingState = {
  nextTrackNumber: number;
  tracks: Record<HandTrackId, HandTrackHistory>;
};

export type HandTrackingResult = {
  state: HandTrackingState;
  frame: MultiHandLandmarkFrame;
};

export const maxTrackedHands = 2;
const maximumAssignmentDistance = 0.36;
const handednessMismatchPenalty = 0.12;

export function createInitialHandTrackingState(): HandTrackingState {
  return {
    nextTrackNumber: 1,
    tracks: {},
  };
}

export function advanceHandTracking({
  previousState,
  detections,
  frameId,
  capturedAt,
  sourceWidth,
  sourceHeight,
  mirrored,
  nowMs,
  trackingLossGraceMs = defaultGestureTimingPolicy.trackingLossGraceMs,
}: {
  previousState: HandTrackingState;
  detections: HandLandmarkFrame[];
  frameId: number;
  capturedAt: string;
  sourceWidth: number;
  sourceHeight: number;
  mirrored: boolean;
  nowMs: number;
  trackingLossGraceMs?: number;
}): HandTrackingResult {
  const liveTracks = Object.fromEntries(
    Object.entries(previousState.tracks).filter(
      ([, track]) => nowMs - track.lastSeenAtMs <= trackingLossGraceMs,
    ),
  );
  const currentDetections = detections
    .slice(0, maxTrackedHands)
    .map((detection) => ({ detection, center: getHandPalmCenter(detection) }))
    .sort((left, right) => left.center.x - right.center.x);
  const assignments = assignDetectionsToTracks(currentDetections, liveTracks);
  const nextTracks: Record<HandTrackId, HandTrackHistory> = { ...liveTracks };
  let nextTrackNumber = previousState.nextTrackNumber;
  const hands: TrackedHandLandmarkFrame[] = [];

  for (const current of currentDetections) {
    const matchedTrack = assignments.get(current.detection);
    const trackId = matchedTrack?.trackId ?? `hand-${nextTrackNumber++}`;
    const sequence = (matchedTrack?.sequence ?? 0) + 1;
    const velocity = matchedTrack
      ? {
          x: current.center.x - matchedTrack.center.x,
          y: current.center.y - matchedTrack.center.y,
        }
      : { x: 0, y: 0 };
    const continuity = matchedTrack
      ? clamp01(1 - normalizedDistance(current.center, predictCenter(matchedTrack)))
      : 0.72;
    const trackingConfidence = clamp01(
      current.detection.confidence * (0.72 + continuity * 0.28),
    );

    nextTracks[trackId] = {
      trackId,
      handedness: current.detection.handedness,
      center: current.center,
      velocity,
      lastSeenAtMs: nowMs,
      sequence,
    };
    hands.push({
      ...current.detection,
      frameId,
      capturedAt,
      trackId,
      sequence,
      trackingConfidence,
      lastSeenAt: capturedAt,
      landmarks: current.detection.landmarks.map((landmark) => ({ ...landmark })),
    });
  }

  hands.sort((left, right) => left.trackId.localeCompare(right.trackId));

  return {
    state: {
      nextTrackNumber,
      tracks: nextTracks,
    },
    frame: {
      frameId,
      capturedAt,
      sourceWidth,
      sourceHeight,
      mirrored,
      hands,
    },
  };
}

export function getHandPalmCenter(
  frame: HandLandmarkFrame,
): NormalizedGesturePoint {
  const palmPoints = ["wrist", "index_mcp", "middle_mcp", "pinky_mcp"]
    .map((name) => frame.landmarks.find((landmark) => landmark.name === name))
    .filter((landmark): landmark is HandLandmarkPoint => landmark != null);

  if (palmPoints.length === 0) {
    return { x: 0.5, y: 0.5 };
  }

  return {
    x: palmPoints.reduce((sum, point) => sum + point.x, 0) / palmPoints.length,
    y: palmPoints.reduce((sum, point) => sum + point.y, 0) / palmPoints.length,
  };
}

export function getRetainedHandTrackIds(
  state: HandTrackingState,
): HandTrackId[] {
  return Object.keys(state.tracks).sort();
}

function assignDetectionsToTracks(
  detections: Array<{
    detection: HandLandmarkFrame;
    center: NormalizedGesturePoint;
  }>,
  tracks: Record<HandTrackId, HandTrackHistory>,
): Map<HandLandmarkFrame, HandTrackHistory> {
  const assignment = new Map<HandLandmarkFrame, HandTrackHistory>();
  const usedTrackIds = new Set<HandTrackId>();
  const candidates = detections.flatMap((current) =>
    Object.values(tracks).map((track) => ({
      current,
      track,
      distance: normalizedDistance(current.center, predictCenter(track)),
      score:
        normalizedDistance(current.center, predictCenter(track)) +
        getHandednessPenalty(current.detection.handedness, track.handedness),
    })),
  );

  candidates.sort((left, right) => left.score - right.score);

  for (const candidate of candidates) {
    if (
      assignment.has(candidate.current.detection) ||
      usedTrackIds.has(candidate.track.trackId) ||
      candidate.distance > maximumAssignmentDistance
    ) {
      continue;
    }

    assignment.set(candidate.current.detection, candidate.track);
    usedTrackIds.add(candidate.track.trackId);
  }

  return assignment;
}

function predictCenter(track: HandTrackHistory): NormalizedGesturePoint {
  return {
    x: clamp01(track.center.x + track.velocity.x),
    y: clamp01(track.center.y + track.velocity.y),
  };
}

function getHandednessPenalty(
  detected: Handedness,
  tracked: Handedness,
): number {
  return detected !== "unknown" && tracked !== "unknown" && detected !== tracked
    ? handednessMismatchPenalty
    : 0;
}

function normalizedDistance(
  first: NormalizedGesturePoint,
  second: NormalizedGesturePoint,
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
