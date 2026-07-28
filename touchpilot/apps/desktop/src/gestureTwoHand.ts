import type {
  DisplayContext,
  GestureHandRole,
  HandTrackId,
  Handedness,
  MultiHandLandmarkFrame,
  NormalizedGesturePoint,
  TrackedHandLandmarkFrame,
} from "@toki/shared";
import { defaultGestureTimingPolicy } from "./gestureContracts";
import { getHandPalmCenter } from "./gestureHandTracking";
import {
  classifyPointPose,
  mapCameraPointToDisplay,
  type GesturePointerCalibration,
} from "./gesturePointing";

export type GestureHandRoleState = {
  pointerTrackId: HandTrackId | null;
  controlTrackId: HandTrackId | null;
};

export type GestureHandRoleResult = {
  state: GestureHandRoleState;
  roles: Partial<Record<HandTrackId, GestureHandRole>>;
  pointerHand: TrackedHandLandmarkFrame | null;
  controlHand: TrackedHandLandmarkFrame | null;
};

export type CreatureSplitPhase =
  | "merged"
  | "joining"
  | "armed"
  | "splitting"
  | "split"
  | "recovering"
  | "merging";

export type CreatureSplitState = {
  phase: CreatureSplitPhase;
  candidateSinceMs: number | null;
  armedAtMs: number | null;
  lastTwoHandsSeenAtMs: number | null;
  pointerTrackId: HandTrackId | null;
  controlTrackId: HandTrackId | null;
  pointerPoint: NormalizedGesturePoint | null;
  controlPoint: NormalizedGesturePoint | null;
  normalizedSeparation: number | null;
};

export type CreatureSplitVisualState = {
  phase: Exclude<CreatureSplitPhase, "merged" | "joining" | "armed">;
  pointerTrackId: HandTrackId;
  controlTrackId: HandTrackId;
  primary: {
    displayId: string;
    x: number;
    y: number;
  };
  secondary: {
    displayId: string;
    x: number;
    y: number;
  };
  normalizedSeparation: number;
  visualOnly: true;
};

export const creatureSplitPolicy = Object.freeze({
  joinSeparation: 0.72,
  joinExitSeparation: 0.92,
  splitSeparation: 1.55,
  mergeSeparation: 0.95,
  joinHoldMs: 240,
  splitHoldMs: 180,
  mergeHoldMs: 220,
  joinInterruptionGraceMs: 450,
  splitArmGraceMs: 2_000,
  // Matches pointerVisualRecoveryGraceMs: the same model dropout hides both the
  // pointer and the split lobes, so they must tolerate it identically.
  visualRecoveryMs: 500,
  trackingLossGraceMs: defaultGestureTimingPolicy.trackingLossGraceMs,
});

export function createInitialGestureHandRoleState(): GestureHandRoleState {
  return {
    pointerTrackId: null,
    controlTrackId: null,
  };
}

export function advanceGestureHandRoles({
  previousState,
  frame,
  retainedTrackIds,
  preferredPointerHand,
  minDetectionConfidence,
}: {
  previousState: GestureHandRoleState;
  frame: MultiHandLandmarkFrame;
  retainedTrackIds: HandTrackId[];
  preferredPointerHand: Handedness;
  minDetectionConfidence: number;
}): GestureHandRoleResult {
  const retained = new Set(retainedTrackIds);
  const confidentHands = frame.hands.filter(
    (hand) => hand.confidence >= minDetectionConfidence,
  );
  // Assigning a role is not a quality judgement — classifyPointPose still
  // decides whether a hand is actually pointing. Discarding every hand here
  // because the model's score dipped leaves no pointer hand at all, so the pose
  // classifier is handed null and the pointer starves while a hand is plainly
  // visible. A live trace showed 33 such frames.
  const currentHands =
    confidentHands.length > 0 ? confidentHands : frame.hands;
  const pointerTrackId = retained.has(previousState.pointerTrackId ?? "")
    ? previousState.pointerTrackId
    : choosePointerHand(currentHands, preferredPointerHand, minDetectionConfidence)
        ?.trackId ?? null;
  const availableControlHands = currentHands.filter(
    (hand) => hand.trackId !== pointerTrackId,
  );
  const controlTrackId =
    previousState.controlTrackId !== pointerTrackId &&
    retained.has(previousState.controlTrackId ?? "")
      ? previousState.controlTrackId
      : availableControlHands
          .slice()
          .sort(compareStableHands)[0]?.trackId ?? null;
  const state = { pointerTrackId, controlTrackId };
  const roles: Partial<Record<HandTrackId, GestureHandRole>> = {};

  for (const hand of frame.hands) {
    roles[hand.trackId] =
      hand.trackId === pointerTrackId
        ? "pointer"
        : hand.trackId === controlTrackId
          ? "control"
          : "unassigned";
  }

  return {
    state,
    roles,
    pointerHand:
      frame.hands.find((hand) => hand.trackId === pointerTrackId) ?? null,
    controlHand:
      frame.hands.find((hand) => hand.trackId === controlTrackId) ?? null,
  };
}

export function createInitialCreatureSplitState(): CreatureSplitState {
  return {
    phase: "merged",
    candidateSinceMs: null,
    armedAtMs: null,
    lastTwoHandsSeenAtMs: null,
    pointerTrackId: null,
    controlTrackId: null,
    pointerPoint: null,
    controlPoint: null,
    normalizedSeparation: null,
  };
}

export function advanceCreatureSplit({
  previousState,
  pointerHand,
  controlHand,
  nowMs,
}: {
  previousState: CreatureSplitState;
  pointerHand: TrackedHandLandmarkFrame | null;
  controlHand: TrackedHandLandmarkFrame | null;
  nowMs: number;
}): CreatureSplitState {
  if (pointerHand != null && controlHand != null) {
    const pointerPoint = getHandPalmCenter(pointerHand);
    const controlPoint = getHandPalmCenter(controlHand);
    const normalizedSeparation = getNormalizedHandSeparation(
      pointerHand,
      controlHand,
      pointerPoint,
      controlPoint,
    );
    const observed = {
      ...previousState,
      lastTwoHandsSeenAtMs: nowMs,
      pointerTrackId: pointerHand.trackId,
      controlTrackId: controlHand.trackId,
      pointerPoint,
      controlPoint,
      normalizedSeparation,
    };

    if (previousState.phase === "merged") {
      return normalizedSeparation <= creatureSplitPolicy.joinSeparation
        ? {
            ...observed,
            phase: "joining",
            candidateSinceMs: nowMs,
            armedAtMs: null,
          }
        : {
            ...observed,
            phase: "merged",
            candidateSinceMs: null,
            armedAtMs: null,
          };
    }

    if (previousState.phase === "joining") {
      if (normalizedSeparation > creatureSplitPolicy.joinExitSeparation) {
        return {
          ...observed,
          phase: "merged",
          candidateSinceMs: null,
          armedAtMs: null,
        };
      }

      return nowMs - (previousState.candidateSinceMs ?? nowMs) >=
        creatureSplitPolicy.joinHoldMs
        ? {
            ...observed,
            phase: "armed",
            candidateSinceMs: null,
            armedAtMs: nowMs,
          }
        : observed;
    }

    if (previousState.phase === "armed") {
      const armedAtMs = previousState.armedAtMs ?? nowMs;
      if (nowMs - armedAtMs > creatureSplitPolicy.splitArmGraceMs) {
        return {
          ...observed,
          phase: "merged",
          candidateSinceMs: null,
          armedAtMs: null,
        };
      }

      return normalizedSeparation >= creatureSplitPolicy.splitSeparation
        ? {
            ...observed,
            phase: "splitting",
            candidateSinceMs: nowMs,
            armedAtMs,
          }
        : { ...observed, candidateSinceMs: null, armedAtMs };
    }

    if (previousState.phase === "splitting") {
      if (normalizedSeparation < creatureSplitPolicy.splitSeparation) {
        const armedAtMs = previousState.armedAtMs ?? nowMs;
        return nowMs - armedAtMs <= creatureSplitPolicy.splitArmGraceMs
          ? {
              ...observed,
              phase: "armed",
              candidateSinceMs: null,
              armedAtMs,
            }
          : {
              ...observed,
              phase: "merged",
              candidateSinceMs: null,
              armedAtMs: null,
            };
      }

      return nowMs - (previousState.candidateSinceMs ?? nowMs) >=
        creatureSplitPolicy.splitHoldMs
        ? {
            ...observed,
            phase: "split",
            candidateSinceMs: null,
            armedAtMs: null,
          }
        : observed;
    }

    if (previousState.phase === "merging") {
      if (normalizedSeparation > creatureSplitPolicy.mergeSeparation) {
        return {
          ...observed,
          phase: "split",
          candidateSinceMs: null,
          armedAtMs: null,
        };
      }

      return nowMs - (previousState.candidateSinceMs ?? nowMs) >=
        creatureSplitPolicy.mergeHoldMs
        ? createInitialCreatureSplitState()
        : observed;
    }

    if (normalizedSeparation <= creatureSplitPolicy.mergeSeparation) {
      return {
        ...observed,
        phase: "merging",
        candidateSinceMs: nowMs,
        armedAtMs: null,
      };
    }

    return {
      ...observed,
      phase: "split",
      candidateSinceMs: null,
      armedAtMs: null,
    };
  }

  if (
    previousState.phase === "joining" &&
    previousState.lastTwoHandsSeenAtMs != null &&
    nowMs - previousState.lastTwoHandsSeenAtMs <
      creatureSplitPolicy.joinInterruptionGraceMs
  ) {
    return previousState;
  }

  // An arm only survives a brief dropout, not the second hand actually leaving.
  // splitArmGraceMs is how long the user has to complete a split once both
  // hands are together; reusing it here kept the creature armed for two seconds
  // after a hand left the frame, so simply raising that hand again — anywhere,
  // already far apart — split the creature with no join. Separating is a
  // continuous motion, so an interruption grace is the right bound.
  if (
    (previousState.phase === "armed" || previousState.phase === "splitting") &&
    previousState.armedAtMs != null &&
    previousState.lastTwoHandsSeenAtMs != null &&
    nowMs - previousState.lastTwoHandsSeenAtMs <
      creatureSplitPolicy.joinInterruptionGraceMs &&
    nowMs - previousState.armedAtMs < creatureSplitPolicy.splitArmGraceMs
  ) {
    return {
      ...previousState,
      phase: "armed",
      candidateSinceMs: null,
    };
  }

  if (
    (previousState.phase === "split" ||
      previousState.phase === "splitting" ||
      previousState.phase === "recovering") &&
    previousState.lastTwoHandsSeenAtMs != null &&
    nowMs - previousState.lastTwoHandsSeenAtMs <
      creatureSplitPolicy.visualRecoveryMs
  ) {
    return {
      ...previousState,
      phase: "recovering",
      candidateSinceMs: null,
    };
  }

  if (previousState.phase === "recovering" || previousState.phase === "split") {
    return {
      ...previousState,
      phase: "merging",
      candidateSinceMs: nowMs,
    };
  }

  if (previousState.phase === "merging") {
    return nowMs - (previousState.candidateSinceMs ?? nowMs) >=
      creatureSplitPolicy.mergeHoldMs
      ? createInitialCreatureSplitState()
      : previousState;
  }

  return createInitialCreatureSplitState();
}

export function createCreatureSplitVisualState({
  state,
  display,
  calibration,
}: {
  state: CreatureSplitState;
  display: DisplayContext;
  calibration: GesturePointerCalibration;
}): CreatureSplitVisualState | null {
  if (
    state.phase === "merged" ||
    state.phase === "joining" ||
    state.phase === "armed" ||
    state.pointerTrackId == null ||
    state.controlTrackId == null ||
    state.pointerPoint == null ||
    state.controlPoint == null ||
    state.normalizedSeparation == null
  ) {
    return null;
  }

  const primary = mapCameraPointToDisplay(
    state.pointerPoint,
    display,
    calibration,
  ).display;
  const secondary = mapCameraPointToDisplay(
    state.controlPoint,
    display,
    calibration,
  ).display;

  return {
    phase: state.phase,
    pointerTrackId: state.pointerTrackId,
    controlTrackId: state.controlTrackId,
    primary,
    secondary,
    normalizedSeparation: state.normalizedSeparation,
    visualOnly: true,
  };
}

function choosePointerHand(
  hands: TrackedHandLandmarkFrame[],
  preferredPointerHand: Handedness,
  minDetectionConfidence: number,
): TrackedHandLandmarkFrame | null {
  const pointingHands = hands.filter(
    (hand) => classifyPointPose(hand, minDetectionConfidence).label === "point",
  );
  const candidates = pointingHands.length > 0 ? pointingHands : hands;

  return (
    candidates
      .slice()
      .sort((left, right) => {
        const leftPreferred = left.handedness === preferredPointerHand ? 1 : 0;
        const rightPreferred = right.handedness === preferredPointerHand ? 1 : 0;
        return rightPreferred - leftPreferred || compareStableHands(left, right);
      })[0] ?? null
  );
}

function compareStableHands(
  left: TrackedHandLandmarkFrame,
  right: TrackedHandLandmarkFrame,
): number {
  return (
    right.trackingConfidence - left.trackingConfidence ||
    left.trackId.localeCompare(right.trackId)
  );
}

function getNormalizedHandSeparation(
  pointerHand: TrackedHandLandmarkFrame,
  controlHand: TrackedHandLandmarkFrame,
  pointerPoint: NormalizedGesturePoint,
  controlPoint: NormalizedGesturePoint,
): number {
  const averagePalmSize =
    (getPalmSize(pointerHand) + getPalmSize(controlHand)) / 2;
  return averagePalmSize <= Number.EPSILON
    ? 0
    : Math.hypot(
        pointerPoint.x - controlPoint.x,
        pointerPoint.y - controlPoint.y,
      ) / averagePalmSize;
}

function getPalmSize(hand: TrackedHandLandmarkFrame): number {
  const wrist = hand.landmarks.find((landmark) => landmark.name === "wrist");
  const middleMcp = hand.landmarks.find(
    (landmark) => landmark.name === "middle_mcp",
  );

  return wrist != null && middleMcp != null
    ? Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y)
    : 0;
}
