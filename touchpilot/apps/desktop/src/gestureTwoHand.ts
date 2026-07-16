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
  | "splitting"
  | "split"
  | "recovering"
  | "merging";

export type CreatureSplitState = {
  phase: CreatureSplitPhase;
  candidateSinceMs: number | null;
  lastTwoHandsSeenAtMs: number | null;
  pointerTrackId: HandTrackId | null;
  controlTrackId: HandTrackId | null;
  pointerPoint: NormalizedGesturePoint | null;
  controlPoint: NormalizedGesturePoint | null;
  normalizedSeparation: number | null;
};

export type CreatureSplitVisualState = {
  phase: Exclude<CreatureSplitPhase, "merged">;
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
  splitSeparation: 1.55,
  mergeSeparation: 0.95,
  splitHoldMs: 180,
  mergeHoldMs: 220,
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
  const currentHands = frame.hands.filter(
    (hand) => hand.confidence >= minDetectionConfidence,
  );
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
      return normalizedSeparation >= creatureSplitPolicy.splitSeparation
        ? { ...observed, phase: "splitting", candidateSinceMs: nowMs }
        : { ...observed, candidateSinceMs: null };
    }

    if (previousState.phase === "splitting") {
      if (normalizedSeparation < creatureSplitPolicy.splitSeparation) {
        return { ...observed, phase: "merged", candidateSinceMs: null };
      }

      return nowMs - (previousState.candidateSinceMs ?? nowMs) >=
        creatureSplitPolicy.splitHoldMs
        ? { ...observed, phase: "split", candidateSinceMs: null }
        : observed;
    }

    if (previousState.phase === "merging") {
      if (normalizedSeparation > creatureSplitPolicy.mergeSeparation) {
        return { ...observed, phase: "split", candidateSinceMs: null };
      }

      return nowMs - (previousState.candidateSinceMs ?? nowMs) >=
        creatureSplitPolicy.mergeHoldMs
        ? createInitialCreatureSplitState()
        : observed;
    }

    if (normalizedSeparation <= creatureSplitPolicy.mergeSeparation) {
      return { ...observed, phase: "merging", candidateSinceMs: nowMs };
    }

    return { ...observed, phase: "split", candidateSinceMs: null };
  }

  if (
    (previousState.phase === "split" ||
      previousState.phase === "splitting" ||
      previousState.phase === "recovering") &&
    previousState.lastTwoHandsSeenAtMs != null &&
    nowMs - previousState.lastTwoHandsSeenAtMs <
      creatureSplitPolicy.trackingLossGraceMs
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
