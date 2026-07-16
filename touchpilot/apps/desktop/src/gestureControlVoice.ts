import type {
  GestureThresholds,
  GestureVoiceContext,
  HandTrackId,
  PointerLockSnapshot,
  TrackedHandLandmarkFrame,
} from "@toki/shared";
import { classifyPinchGesture } from "./gestureClassifier";
import { createPointerLockSnapshot, defaultGestureTimingPolicy } from "./gestureContracts";

export type ControlPinchPhase =
  | "idle"
  | "pressing"
  | "held"
  | "releasing"
  | "recovering";

export type ControlPinchEventType = "press" | "release" | "tracking_lost";

export type ControlPinchEvent = {
  id: string;
  type: ControlPinchEventType;
  controlHandTrackId: HandTrackId;
  firedAt: string;
  sourceFrameId?: number;
};

export type ControlPinchState = {
  phase: ControlPinchPhase;
  controlHandTrackId: HandTrackId | null;
  candidateSinceMs: number | null;
  missingSinceMs: number | null;
  lastSeenAtMs: number | null;
  normalizedDistance: number | null;
  pressThreshold: number;
  releaseThreshold: number;
  eventSequence: number;
  lastEvent: ControlPinchEvent | null;
};

export const controlPinchPolicy = Object.freeze({
  releaseThresholdMargin: 0.12,
  releaseHoldMs: 140,
  trackingLossGraceMs: defaultGestureTimingPolicy.trackingLossGraceMs,
});

export function canStartGestureVoice(
  lock: PointerLockSnapshot | null,
  lockValidation: "idle" | "checking" | "locked" | "invalidated",
  voiceCapturePhase: "idle" | "starting" | "capturing" | "submitting",
): lock is PointerLockSnapshot {
  return (
    lock != null && lockValidation === "locked" && voiceCapturePhase === "idle"
  );
}

export function createInitialControlPinchState(
  pressThreshold = 0.34,
): ControlPinchState {
  return {
    phase: "idle",
    controlHandTrackId: null,
    candidateSinceMs: null,
    missingSinceMs: null,
    lastSeenAtMs: null,
    normalizedDistance: null,
    pressThreshold,
    releaseThreshold: getReleaseThreshold(pressThreshold),
    eventSequence: 0,
    lastEvent: null,
  };
}

export function advanceControlPinch({
  previousState,
  controlHand,
  thresholds,
  pressThreshold,
  nowMs,
  trackingLossGraceMs = controlPinchPolicy.trackingLossGraceMs,
}: {
  previousState: ControlPinchState;
  controlHand: TrackedHandLandmarkFrame | null;
  thresholds: GestureThresholds;
  pressThreshold: number;
  nowMs: number;
  trackingLossGraceMs?: number;
}): ControlPinchState {
  const releaseThreshold = getReleaseThreshold(pressThreshold);
  const observedHand =
    controlHand != null &&
    (previousState.controlHandTrackId == null ||
      controlHand.trackId === previousState.controlHandTrackId)
      ? controlHand
      : null;
  const pinch = classifyPinchGesture(observedHand, thresholds, pressThreshold);
  const normalizedDistance = pinch.normalizedDistance;

  if (previousState.phase === "idle") {
    if (
      observedHand == null ||
      normalizedDistance == null ||
      normalizedDistance > pressThreshold
    ) {
      return {
        ...previousState,
        pressThreshold,
        releaseThreshold,
        normalizedDistance,
      };
    }

    return {
      ...previousState,
      phase: "pressing",
      controlHandTrackId: observedHand.trackId,
      candidateSinceMs: nowMs,
      missingSinceMs: null,
      lastSeenAtMs: nowMs,
      normalizedDistance,
      pressThreshold,
      releaseThreshold,
    };
  }

  if (previousState.phase === "pressing") {
    if (observedHand == null || normalizedDistance == null) {
      return resetControlPinch(previousState, pressThreshold);
    }

    if (normalizedDistance > pressThreshold) {
      return resetControlPinch(previousState, pressThreshold, normalizedDistance);
    }

    if (nowMs - (previousState.candidateSinceMs ?? nowMs) < thresholds.pinchHoldMs) {
      return {
        ...previousState,
        lastSeenAtMs: nowMs,
        normalizedDistance,
        pressThreshold,
        releaseThreshold,
      };
    }

    return emitControlPinchEvent(
      {
        ...previousState,
        phase: "held",
        candidateSinceMs: null,
        missingSinceMs: null,
        lastSeenAtMs: nowMs,
        normalizedDistance,
        pressThreshold,
        releaseThreshold,
      },
      "press",
      observedHand,
      nowMs,
    );
  }

  if (observedHand == null || normalizedDistance == null) {
    const missingSinceMs = previousState.missingSinceMs ?? nowMs;
    if (nowMs - missingSinceMs < trackingLossGraceMs) {
      return {
        ...previousState,
        phase: "recovering",
        candidateSinceMs: null,
        missingSinceMs,
        pressThreshold,
        releaseThreshold,
      };
    }

    return emitControlPinchEvent(
      resetControlPinch(previousState, pressThreshold),
      "tracking_lost",
      null,
      nowMs,
      previousState.controlHandTrackId,
    );
  }

  if (previousState.phase === "recovering") {
    return normalizedDistance >= releaseThreshold
      ? {
          ...previousState,
          phase: "releasing",
          candidateSinceMs: nowMs,
          missingSinceMs: null,
          lastSeenAtMs: nowMs,
          normalizedDistance,
          pressThreshold,
          releaseThreshold,
        }
      : {
          ...previousState,
          phase: "held",
          candidateSinceMs: null,
          missingSinceMs: null,
          lastSeenAtMs: nowMs,
          normalizedDistance,
          pressThreshold,
          releaseThreshold,
        };
  }

  if (previousState.phase === "held") {
    if (normalizedDistance < releaseThreshold) {
      return {
        ...previousState,
        lastSeenAtMs: nowMs,
        normalizedDistance,
        pressThreshold,
        releaseThreshold,
      };
    }

    return {
      ...previousState,
      phase: "releasing",
      candidateSinceMs: nowMs,
      missingSinceMs: null,
      lastSeenAtMs: nowMs,
      normalizedDistance,
      pressThreshold,
      releaseThreshold,
    };
  }

  if (normalizedDistance < releaseThreshold) {
    return {
      ...previousState,
      phase: "held",
      candidateSinceMs: null,
      missingSinceMs: null,
      lastSeenAtMs: nowMs,
      normalizedDistance,
      pressThreshold,
      releaseThreshold,
    };
  }

  if (
    nowMs - (previousState.candidateSinceMs ?? nowMs) <
    controlPinchPolicy.releaseHoldMs
  ) {
    return {
      ...previousState,
      lastSeenAtMs: nowMs,
      normalizedDistance,
      pressThreshold,
      releaseThreshold,
    };
  }

  return emitControlPinchEvent(
    resetControlPinch(previousState, pressThreshold, normalizedDistance),
    "release",
    observedHand,
    nowMs,
    previousState.controlHandTrackId,
  );
}

export function createGestureVoiceContext({
  sessionId,
  controlHandTrackId,
  startedAt,
  lock,
}: {
  sessionId: string;
  controlHandTrackId: HandTrackId;
  startedAt: string;
  lock: PointerLockSnapshot;
}): GestureVoiceContext {
  const frozenLock = createPointerLockSnapshot({
    id: lock.id,
    lockedAt: lock.lockedAt,
    pointer: lock.pointer,
    evidence: lock.evidence,
    display: lock.display,
  });

  return Object.freeze({
    sessionId,
    controlHandTrackId,
    startedAt,
    lock: frozenLock,
  });
}

function getReleaseThreshold(pressThreshold: number): number {
  return Math.min(1.5, pressThreshold + controlPinchPolicy.releaseThresholdMargin);
}

function resetControlPinch(
  previousState: ControlPinchState,
  pressThreshold: number,
  normalizedDistance: number | null = null,
): ControlPinchState {
  return {
    ...createInitialControlPinchState(pressThreshold),
    normalizedDistance,
    eventSequence: previousState.eventSequence,
    lastEvent: previousState.lastEvent,
  };
}

function emitControlPinchEvent(
  state: ControlPinchState,
  type: ControlPinchEventType,
  hand: TrackedHandLandmarkFrame | null,
  nowMs: number,
  fallbackTrackId?: HandTrackId | null,
): ControlPinchState {
  const controlHandTrackId = hand?.trackId ?? fallbackTrackId;
  if (controlHandTrackId == null) {
    return state;
  }

  const eventSequence = state.eventSequence + 1;
  return {
    ...state,
    eventSequence,
    lastEvent: {
      id: `control-pinch-${eventSequence}-${controlHandTrackId}-${type}`,
      type,
      controlHandTrackId,
      firedAt: new Date(nowMs).toISOString(),
      sourceFrameId: hand?.frameId,
    },
  };
}
