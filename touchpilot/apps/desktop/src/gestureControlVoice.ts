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
  interruptionSinceMs: number | null;
  missingSinceMs: number | null;
  lastSeenAtMs: number | null;
  rawNormalizedDistance: number | null;
  normalizedDistance: number | null;
  pressThreshold: number;
  releaseThreshold: number;
  eventSequence: number;
  lastEvent: ControlPinchEvent | null;
};

export type GestureVoiceDetector = "ordinary" | "control";

export type GestureVoiceOwner = {
  detector: GestureVoiceDetector;
  controlHandTrackId: HandTrackId;
  pressEventId: string;
};

export const controlPinchPolicy = Object.freeze({
  distanceSmoothingAlpha: 0.68,
  pressInterruptionGraceMs: 240,
  releaseThresholdMargin: 0.15,
  releaseHoldMs: 180,
  releaseInterruptionGraceMs: 160,
  trackingLossGraceMs: defaultGestureTimingPolicy.trackingLossGraceMs,
});

export function canStartGestureVoice(
  lock: PointerLockSnapshot | null,
  lockValidation: "idle" | "checking" | "locked" | "limited" | "invalidated",
  voiceCapturePhase: "idle" | "starting" | "capturing" | "submitting",
): lock is PointerLockSnapshot {
  return (
    lock != null &&
    (lockValidation === "locked" || lockValidation === "limited") &&
    voiceCapturePhase === "idle"
  );
}

export function createInitialControlPinchState(
  pressThreshold = 0.34,
): ControlPinchState {
  return {
    phase: "idle",
    controlHandTrackId: null,
    candidateSinceMs: null,
    interruptionSinceMs: null,
    missingSinceMs: null,
    lastSeenAtMs: null,
    rawNormalizedDistance: null,
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
  canPress = true,
  trackingLossGraceMs = controlPinchPolicy.trackingLossGraceMs,
}: {
  previousState: ControlPinchState;
  controlHand: TrackedHandLandmarkFrame | null;
  thresholds: GestureThresholds;
  pressThreshold: number;
  nowMs: number;
  canPress?: boolean;
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
  const normalizedDistance = smoothControlPinchDistance({
    previousState,
    observedHand,
    rawDistance: pinch.normalizedDistance,
  });
  const rawNormalizedDistance = pinch.normalizedDistance;

  if (previousState.phase === "idle") {
    if (
      !canPress ||
      observedHand == null ||
      normalizedDistance == null ||
      normalizedDistance > pressThreshold
    ) {
      return {
        ...previousState,
        pressThreshold,
        releaseThreshold,
        rawNormalizedDistance,
        normalizedDistance,
      };
    }

    return {
      ...previousState,
      phase: "pressing",
      controlHandTrackId: observedHand.trackId,
      candidateSinceMs: nowMs,
      interruptionSinceMs: null,
      missingSinceMs: null,
      lastSeenAtMs: nowMs,
      rawNormalizedDistance,
      normalizedDistance,
      pressThreshold,
      releaseThreshold,
    };
  }

  if (previousState.phase === "pressing") {
    if (!canPress) {
      return resetControlPinch(
        previousState,
        pressThreshold,
        normalizedDistance,
      );
    }

    if (
      observedHand == null ||
      normalizedDistance == null ||
      normalizedDistance > pressThreshold
    ) {
      const interruptionSinceMs = previousState.interruptionSinceMs ?? nowMs;
      const interruptionExpired =
        nowMs - interruptionSinceMs >=
        controlPinchPolicy.pressInterruptionGraceMs;

      if (interruptionExpired) {
        return resetControlPinch(
          previousState,
          pressThreshold,
          normalizedDistance,
          rawNormalizedDistance,
        );
      }

      return {
        ...previousState,
        interruptionSinceMs,
        missingSinceMs: observedHand == null
          ? previousState.missingSinceMs ?? nowMs
          : null,
        lastSeenAtMs: observedHand == null
          ? previousState.lastSeenAtMs
          : nowMs,
        rawNormalizedDistance,
        normalizedDistance,
        pressThreshold,
        releaseThreshold,
      };
    }

    const candidateSinceMs =
      (previousState.candidateSinceMs ?? nowMs) +
      (previousState.interruptionSinceMs == null
        ? 0
        : nowMs - previousState.interruptionSinceMs);
    if (nowMs - candidateSinceMs < thresholds.pinchHoldMs) {
      return {
        ...previousState,
        candidateSinceMs,
        interruptionSinceMs: null,
        missingSinceMs: null,
        lastSeenAtMs: nowMs,
        rawNormalizedDistance,
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
        interruptionSinceMs: null,
        missingSinceMs: null,
        lastSeenAtMs: nowMs,
        rawNormalizedDistance,
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
    if (previousState.phase === "releasing") {
      const releaseStartedAtMs = previousState.candidateSinceMs ?? nowMs;
      if (
        nowMs - releaseStartedAtMs >=
        controlPinchPolicy.releaseHoldMs
      ) {
        return emitControlPinchEvent(
          resetControlPinch(previousState, pressThreshold),
          "release",
          null,
          nowMs,
          previousState.controlHandTrackId,
        );
      }

      return {
          ...previousState,
          phase: "releasing",
          candidateSinceMs: releaseStartedAtMs,
          interruptionSinceMs: null,
          missingSinceMs: previousState.missingSinceMs ?? nowMs,
          rawNormalizedDistance,
          pressThreshold,
          releaseThreshold,
        };
    }

    const missingSinceMs = previousState.missingSinceMs ?? nowMs;
    if (nowMs - missingSinceMs < trackingLossGraceMs) {
      return {
        ...previousState,
        phase: "recovering",
        candidateSinceMs: null,
        interruptionSinceMs: null,
        missingSinceMs,
        rawNormalizedDistance,
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
          interruptionSinceMs: null,
          missingSinceMs: null,
          lastSeenAtMs: nowMs,
          rawNormalizedDistance,
          normalizedDistance,
          pressThreshold,
          releaseThreshold,
        }
      : {
          ...previousState,
          phase: "held",
          candidateSinceMs: null,
          interruptionSinceMs: null,
          missingSinceMs: null,
          lastSeenAtMs: nowMs,
          rawNormalizedDistance,
          normalizedDistance,
          pressThreshold,
          releaseThreshold,
        };
  }

  if (previousState.phase === "held") {
    if (normalizedDistance < releaseThreshold) {
      return {
        ...previousState,
        interruptionSinceMs: null,
        missingSinceMs: null,
        lastSeenAtMs: nowMs,
        rawNormalizedDistance,
        normalizedDistance,
        pressThreshold,
        releaseThreshold,
      };
    }

    return {
      ...previousState,
      phase: "releasing",
      candidateSinceMs: nowMs,
      interruptionSinceMs: null,
      missingSinceMs: null,
      lastSeenAtMs: nowMs,
      rawNormalizedDistance,
      normalizedDistance,
      pressThreshold,
      releaseThreshold,
    };
  }

  if (normalizedDistance < releaseThreshold) {
    const interruptionSinceMs = previousState.interruptionSinceMs ?? nowMs;
    if (
      nowMs - interruptionSinceMs <
      controlPinchPolicy.releaseInterruptionGraceMs
    ) {
      return {
        ...previousState,
        interruptionSinceMs,
        missingSinceMs: null,
        lastSeenAtMs: nowMs,
        rawNormalizedDistance,
        normalizedDistance,
        pressThreshold,
        releaseThreshold,
      };
    }

    return {
      ...previousState,
      phase: "held",
      candidateSinceMs: null,
      interruptionSinceMs: null,
      missingSinceMs: null,
      lastSeenAtMs: nowMs,
      rawNormalizedDistance,
      normalizedDistance,
      pressThreshold,
      releaseThreshold,
    };
  }

  const candidateSinceMs =
    (previousState.candidateSinceMs ?? nowMs) +
    (previousState.interruptionSinceMs == null
      ? 0
      : nowMs - previousState.interruptionSinceMs);
  if (
    nowMs - candidateSinceMs <
    controlPinchPolicy.releaseHoldMs
  ) {
    return {
      ...previousState,
      candidateSinceMs,
      interruptionSinceMs: null,
      missingSinceMs: null,
      lastSeenAtMs: nowMs,
      rawNormalizedDistance,
      normalizedDistance,
      pressThreshold,
      releaseThreshold,
    };
  }

  return emitControlPinchEvent(
    resetControlPinch(
      previousState,
      pressThreshold,
      normalizedDistance,
      rawNormalizedDistance,
    ),
    "release",
    observedHand,
    nowMs,
    previousState.controlHandTrackId,
  );
}

export function createGestureVoiceOwner(
  detector: GestureVoiceDetector,
  pressEvent: ControlPinchEvent,
): GestureVoiceOwner {
  return Object.freeze({
    detector,
    controlHandTrackId: pressEvent.controlHandTrackId,
    pressEventId: pressEvent.id,
  });
}

export function isGestureVoiceTerminationForOwner(
  owner: GestureVoiceOwner | null,
  detector: GestureVoiceDetector,
  event: ControlPinchEvent,
): boolean {
  return (
    owner != null &&
    owner.detector === detector &&
    owner.controlHandTrackId === event.controlHandTrackId &&
    (event.type === "release" || event.type === "tracking_lost")
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

function smoothControlPinchDistance({
  previousState,
  observedHand,
  rawDistance,
}: {
  previousState: ControlPinchState;
  observedHand: TrackedHandLandmarkFrame | null;
  rawDistance: number | null;
}): number | null {
  if (observedHand == null || rawDistance == null) {
    return null;
  }

  if (
    previousState.controlHandTrackId == null ||
    previousState.controlHandTrackId !== observedHand.trackId ||
    previousState.normalizedDistance == null
  ) {
    return rawDistance;
  }

  return (
    previousState.normalizedDistance +
    (rawDistance - previousState.normalizedDistance) *
      controlPinchPolicy.distanceSmoothingAlpha
  );
}

function resetControlPinch(
  previousState: ControlPinchState,
  pressThreshold: number,
  normalizedDistance: number | null = null,
  rawNormalizedDistance: number | null = null,
): ControlPinchState {
  return {
    ...createInitialControlPinchState(pressThreshold),
    rawNormalizedDistance,
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
