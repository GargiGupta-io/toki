import type {
  AirTapCycle,
  DisplayContext,
  DoubleAirTapState,
  GesturePointerSample,
  HandLandmarkFrame,
  HandLandmarkName,
  HandLandmarkPoint,
  PointerLockSnapshot,
} from "@toki/shared";
import { defaultGestureTimingPolicy } from "./gestureContracts";
import type { PointPoseClassification } from "./gesturePointing";

const defaultFlexionRatioThreshold = 1.3;
const requiredFoldedFingerCount = 2;
const sameTargetMovementRadius = 0.1;
const cooldownMs = 350;

export type AirTapPoseClassification = {
  label: "none" | "extended" | "flexed";
  confidence: number;
  handTrackId: string | null;
  indexExtensionRatio: number | null;
  foldedFingerCount: number;
  flexionRatioThreshold: number;
  sourceFrameId?: number;
  capturedAt?: string;
};

type PressedTap = {
  ordinal: 1 | 2;
  handTrackId: string;
  pressedAt: string;
  pressedAtMs: number;
  sourceFrameIds: number[];
  confidence: number;
};

export type DoubleAirTapControllerState = {
  tap: DoubleAirTapState;
  pressedTap: PressedTap | null;
  firstTapPointer: GesturePointerSample | null;
  lastPointer: GesturePointerSample | null;
  cooldownUntilMs: number | null;
};

export type PointerLockRequest = {
  id: string;
  lockedAt: string;
  pointer: GesturePointerSample;
  firstTap: AirTapCycle;
  secondTap: AirTapCycle;
};

export type PointerLockInvalidationReason =
  | "camera_unavailable"
  | "display_changed"
  | "screen_capture_unavailable"
  | "screen_state_changed"
  | "screen_state_unavailable";

export const initialDoubleAirTapControllerState: DoubleAirTapControllerState = {
  tap: { phase: "idle" },
  pressedTap: null,
  firstTapPointer: null,
  lastPointer: null,
  cooldownUntilMs: null,
};

export function classifyAirTapPose({
  frame,
  pointPose,
  minDetectionConfidence,
  flexionRatioThreshold = defaultFlexionRatioThreshold,
}: {
  frame: HandLandmarkFrame | null;
  pointPose: PointPoseClassification;
  minDetectionConfidence: number;
  flexionRatioThreshold?: number;
}): AirTapPoseClassification {
  if (frame == null || frame.confidence < minDetectionConfidence) {
    return createInactiveAirTapPose(undefined, flexionRatioThreshold);
  }

  if (pointPose.label === "point" && pointPose.handTrackId != null) {
    return {
      label: "extended",
      confidence: pointPose.confidence,
      handTrackId: pointPose.handTrackId,
      indexExtensionRatio: pointPose.indexExtensionRatio,
      foldedFingerCount: pointPose.foldedFingerCount,
      flexionRatioThreshold,
      sourceFrameId: frame.frameId,
      capturedAt: frame.capturedAt,
    };
  }

  const wrist = findLandmark(frame, "wrist");
  const indexMcp = findLandmark(frame, "index_mcp");
  const indexTip = findLandmark(frame, "index_tip");
  const middleMcp = findLandmark(frame, "middle_mcp");

  if (!wrist || !indexMcp || !indexTip || !middleMcp) {
    return createInactiveAirTapPose(frame, flexionRatioThreshold);
  }

  const palmSize = distance2d(wrist, indexMcp);
  if (palmSize <= 0) {
    return createInactiveAirTapPose(frame, flexionRatioThreshold);
  }

  const indexExtensionRatio = distance2d(wrist, indexTip) / palmSize;
  const foldedFingerCount = (["middle", "ring", "pinky"] as const).filter(
    (finger) => isFingerFolded(frame, wrist, middleMcp, finger),
  ).length;
  const isFlexed =
    indexExtensionRatio <= flexionRatioThreshold &&
    foldedFingerCount >= requiredFoldedFingerCount;

  return {
    label: isFlexed ? "flexed" : "none",
    confidence: isFlexed ? frame.confidence : 0,
    handTrackId: getHandTrackId(frame),
    indexExtensionRatio,
    foldedFingerCount,
    flexionRatioThreshold,
    sourceFrameId: frame.frameId,
    capturedAt: frame.capturedAt,
  };
}

export function advanceDoubleAirTap({
  previousState,
  pose,
  pointer,
  nowMs,
}: {
  previousState: DoubleAirTapControllerState;
  pose: AirTapPoseClassification;
  pointer: GesturePointerSample | null;
  nowMs: number;
}): {
  state: DoubleAirTapControllerState;
  lockRequest: PointerLockRequest | null;
} {
  const lastPointer = getCurrentPointer(previousState.lastPointer, pointer);
  const stateWithPointer = { ...previousState, lastPointer };

  if (
    previousState.tap.phase === "locked" ||
    previousState.tap.phase === "cancelled"
  ) {
    return {
      state: {
        ...stateWithPointer,
        tap: { ...previousState.tap, phase: "cooldown" },
        pressedTap: null,
        cooldownUntilMs: nowMs + cooldownMs,
      },
      lockRequest: null,
    };
  }

  if (previousState.tap.phase === "cooldown") {
    if (
      previousState.cooldownUntilMs != null &&
      nowMs < previousState.cooldownUntilMs
    ) {
      return { state: stateWithPointer, lockRequest: null };
    }

    return {
      state: resetDoubleAirTapController(lastPointer),
      lockRequest: null,
    };
  }

  const graceUntilMs = previousState.tap.graceUntil
    ? Date.parse(previousState.tap.graceUntil)
    : null;
  if (
    previousState.tap.firstTap != null &&
    graceUntilMs != null &&
    nowMs > graceUntilMs
  ) {
    return {
      state: {
        ...stateWithPointer,
        tap: {
          ...previousState.tap,
          phase: "cancelled",
        },
        pressedTap: null,
      },
      lockRequest: null,
    };
  }

  if (pose.label === "flexed") {
    return beginOrContinuePress(stateWithPointer, pose, nowMs);
  }

  if (pose.label === "extended" && previousState.pressedTap != null) {
    return completePress(stateWithPointer, pose, lastPointer, nowMs);
  }

  return { state: stateWithPointer, lockRequest: null };
}

export function resetDoubleAirTapController(
  lastPointer: GesturePointerSample | null = null,
): DoubleAirTapControllerState {
  return {
    ...initialDoubleAirTapControllerState,
    lastPointer,
  };
}

export function createScreenStateFingerprint(window: {
  appName?: string | null;
  title?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  return [
    normalizeIdentityPart(window.appName),
    normalizeIdentityPart(window.title),
    Math.round(window.x),
    Math.round(window.y),
    Math.round(window.width),
    Math.round(window.height),
  ].join("|");
}

export function getPointerLockInvalidationReason({
  lock,
  display,
  screenCaptureAvailable,
  activeWindowId,
}: {
  lock: PointerLockSnapshot;
  display: DisplayContext;
  screenCaptureAvailable: boolean;
  activeWindowId: string | null;
}): PointerLockInvalidationReason | null {
  if (!screenCaptureAvailable) {
    return "screen_capture_unavailable";
  }

  if (
    lock.display.id !== display.id ||
    lock.display.width !== display.width ||
    lock.display.height !== display.height ||
    lock.display.scaleFactor !== display.scaleFactor
  ) {
    return "display_changed";
  }

  if (activeWindowId == null) {
    return "screen_state_unavailable";
  }

  if (
    lock.evidence.activeWindowId != null &&
    lock.evidence.activeWindowId !== activeWindowId
  ) {
    return "screen_state_changed";
  }

  return null;
}

function beginOrContinuePress(
  state: DoubleAirTapControllerState,
  pose: AirTapPoseClassification,
  nowMs: number,
): {
  state: DoubleAirTapControllerState;
  lockRequest: null;
} {
  const pointer = state.lastPointer;
  if (
    state.tap.firstTap != null &&
    pose.handTrackId != null &&
    state.tap.firstTap.handTrackId !== pose.handTrackId
  ) {
    return {
      state: {
        ...state,
        tap: { ...state.tap, phase: "cancelled" },
        pressedTap: null,
      },
      lockRequest: null,
    };
  }

  if (
    pointer == null ||
    pose.handTrackId == null ||
    pose.sourceFrameId == null ||
    pose.capturedAt == null ||
    pointer.handTrackId !== pose.handTrackId
  ) {
    return { state, lockRequest: null };
  }

  if (state.pressedTap != null) {
    if (state.pressedTap.handTrackId !== pose.handTrackId) {
      return {
        state: {
          ...state,
          tap: { ...state.tap, phase: "cancelled" },
          pressedTap: null,
        },
        lockRequest: null,
      };
    }

    const sourceFrameIds = state.pressedTap.sourceFrameIds.includes(
      pose.sourceFrameId,
    )
      ? state.pressedTap.sourceFrameIds
      : [...state.pressedTap.sourceFrameIds, pose.sourceFrameId];

    return {
      state: {
        ...state,
        pressedTap: {
          ...state.pressedTap,
          sourceFrameIds,
          confidence: Math.min(state.pressedTap.confidence, pose.confidence),
        },
      },
      lockRequest: null,
    };
  }

  const ordinal = state.tap.firstTap == null ? 1 : 2;
  if (
    ordinal === 2 &&
    state.tap.firstTap?.handTrackId !== pose.handTrackId
  ) {
    return {
      state: {
        ...state,
        tap: { ...state.tap, phase: "cancelled" },
      },
      lockRequest: null,
    };
  }

  return {
    state: {
      ...state,
      tap: { ...state.tap, phase: "pressing" },
      pressedTap: {
        ordinal,
        handTrackId: pose.handTrackId,
        pressedAt: pose.capturedAt,
        pressedAtMs: nowMs,
        sourceFrameIds: [pose.sourceFrameId],
        confidence: pose.confidence,
      },
    },
    lockRequest: null,
  };
}

function completePress(
  state: DoubleAirTapControllerState,
  pose: AirTapPoseClassification,
  pointer: GesturePointerSample | null,
  nowMs: number,
): {
  state: DoubleAirTapControllerState;
  lockRequest: PointerLockRequest | null;
} {
  const pressedTap = state.pressedTap;
  if (
    pressedTap == null ||
    pointer == null ||
    pose.handTrackId == null ||
    pose.sourceFrameId == null ||
    pose.capturedAt == null ||
    pressedTap.handTrackId !== pose.handTrackId ||
    pointer.handTrackId !== pose.handTrackId
  ) {
    return {
      state: {
        ...state,
        tap: { ...state.tap, phase: "cancelled" },
        pressedTap: null,
      },
      lockRequest: null,
    };
  }

  const cycle: AirTapCycle = {
    id: `air-tap-${pose.handTrackId}-${pressedTap.sourceFrameIds[0]}-${pose.sourceFrameId}`,
    handTrackId: pose.handTrackId,
    pressedAt: pressedTap.pressedAt,
    releasedAt: pose.capturedAt,
    sourceFrameIds: [...pressedTap.sourceFrameIds, pose.sourceFrameId],
    confidence: Math.min(pressedTap.confidence, pose.confidence),
  };

  if (pressedTap.ordinal === 1) {
    const graceUntil = new Date(
      nowMs + defaultGestureTimingPolicy.doubleTapMaxGapMs,
    ).toISOString();

    return {
      state: {
        ...state,
        tap: {
          phase: "armed",
          firstTap: cycle,
          graceUntil,
        },
        pressedTap: null,
        firstTapPointer: copyPointer(pointer),
      },
      lockRequest: null,
    };
  }

  const firstTap = state.tap.firstTap;
  const firstTapPointer = state.firstTapPointer;
  const isInsideMovementRadius =
    firstTapPointer != null &&
    distanceBetweenPointers(firstTapPointer, pointer) <= sameTargetMovementRadius;
  const isInsideGrace =
    firstTap != null &&
    nowMs - Date.parse(firstTap.releasedAt) <=
      defaultGestureTimingPolicy.doubleTapMaxGapMs;

  if (firstTap == null || !isInsideMovementRadius || !isInsideGrace) {
    return {
      state: {
        ...state,
        tap: {
          ...state.tap,
          phase: "cancelled",
          secondTap: cycle,
        },
        pressedTap: null,
      },
      lockRequest: null,
    };
  }

  const copiedPointer = copyPointer(pointer);
  const lockRequest: PointerLockRequest = {
    id: `gesture-lock-${cycle.id}`,
    lockedAt: pose.capturedAt,
    pointer: copiedPointer,
    firstTap,
    secondTap: cycle,
  };

  return {
    state: {
      ...state,
      tap: {
        phase: "locked",
        firstTap,
        secondTap: cycle,
      },
      pressedTap: null,
      lastPointer: copiedPointer,
    },
    lockRequest,
  };
}

function getCurrentPointer(
  _previous: GesturePointerSample | null,
  current: GesturePointerSample | null,
): GesturePointerSample | null {
  return current;
}

function copyPointer(pointer: GesturePointerSample): GesturePointerSample {
  return {
    ...pointer,
    normalized: { ...pointer.normalized },
    display: { ...pointer.display },
  };
}

function distanceBetweenPointers(
  first: GesturePointerSample,
  second: GesturePointerSample,
): number {
  return Math.hypot(
    first.normalized.x - second.normalized.x,
    first.normalized.y - second.normalized.y,
  );
}

function createInactiveAirTapPose(
  frame?: HandLandmarkFrame,
  threshold = defaultFlexionRatioThreshold,
): AirTapPoseClassification {
  return {
    label: "none",
    confidence: 0,
    handTrackId: frame ? getHandTrackId(frame) : null,
    indexExtensionRatio: null,
    foldedFingerCount: 0,
    flexionRatioThreshold: threshold,
    sourceFrameId: frame?.frameId,
    capturedAt: frame?.capturedAt,
  };
}

function isFingerFolded(
  frame: HandLandmarkFrame,
  wrist: HandLandmarkPoint,
  middleMcp: HandLandmarkPoint,
  finger: "middle" | "ring" | "pinky",
): boolean {
  const tip = findLandmark(frame, `${finger}_tip`);
  if (!tip) {
    return false;
  }

  const palmSize = distance2d(wrist, middleMcp);
  return palmSize > 0 && distance2d(wrist, tip) / palmSize <= 1.35;
}

function getHandTrackId(frame: HandLandmarkFrame): string {
  if (
    "trackId" in frame &&
    typeof (frame as HandLandmarkFrame & { trackId?: unknown }).trackId === "string"
  ) {
    return (frame as HandLandmarkFrame & { trackId: string }).trackId;
  }

  return "primary-hand";
}

function findLandmark(
  frame: HandLandmarkFrame,
  name: HandLandmarkName,
): HandLandmarkPoint | undefined {
  return frame.landmarks.find((landmark) => landmark.name === name);
}

function distance2d(a: HandLandmarkPoint, b: HandLandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}
