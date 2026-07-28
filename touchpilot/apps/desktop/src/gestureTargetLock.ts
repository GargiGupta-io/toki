import type {
  ActiveWindowBounds,
  DisplayContext,
  GesturePointerSample,
  HandLandmarkFrame,
  HandLandmarkName,
  HandLandmarkPoint,
  PointerLockSnapshot,
} from "@toki/shared";
import type { PointPoseClassification } from "./gesturePointing";

export const wristRollLockPolicy = Object.freeze({
  rollStartDegrees: 70,
  rollResetDegrees: 30,
  rollHoldMs: 220,
  untwistHoldMs: 220,
  rollInterruptionGraceMs: 450,
  rollSequenceGraceMs: 2_000,
  cooldownMs: 350,
  minimumRolledIndexExtensionRatio: 1.45,
  requiredFoldedFingerCount: 2,
});

const {
  rollStartDegrees,
  rollResetDegrees,
  rollHoldMs,
  untwistHoldMs,
  rollInterruptionGraceMs,
  rollSequenceGraceMs,
  cooldownMs,
  minimumRolledIndexExtensionRatio,
  requiredFoldedFingerCount,
} = wristRollLockPolicy;

type GestureVector3 = {
  x: number;
  y: number;
  z: number;
};

export type WristRollPoseClassification = {
  label: "none" | "pointing" | "tracked";
  confidence: number;
  handTrackId: string | null;
  palmNormal: GestureVector3 | null;
  indexExtensionRatio: number | null;
  foldedFingerCount: number;
  rollStartDegrees: number;
  rollResetDegrees: number;
  sourceFrameId?: number;
  capturedAt?: string;
};

type WristRollBaseline = {
  handTrackId: string;
  palmNormal: GestureVector3;
  pointer: GesturePointerSample;
  startedAtMs: number;
  lastPointSeenAtMs: number;
};

type PendingWristRoll = {
  handTrackId: string;
  startedAt: string;
  startedAtMs: number;
  sourceFrameIds: number[];
  confidence: number;
  interruptedSinceMs: number | null;
  pointer: GesturePointerSample;
  rotationDegrees: number;
};

type PendingWristUntwist = {
  handTrackId: string;
  startedAt: string;
  startedAtMs: number;
  sourceFrameIds: number[];
  confidence: number;
  interruptedSinceMs: number | null;
  rotationDegrees: number;
};

export type WristRollCycle = {
  id: string;
  handTrackId: string;
  startedAt: string;
  lockedAt: string;
  sourceFrameIds: number[];
  confidence: number;
  rotationDegrees: number;
};

export type WristRollLockState = {
  phase:
    | "idle"
    | "armed"
    | "rolling"
    | "locked"
    | "unlocking"
    | "cooldown"
    | "cancelled";
  roll?: WristRollCycle;
  rotationDegrees?: number;
  holdUntil?: string;
};

export type WristRollLockControllerState = {
  lock: WristRollLockState;
  baseline: WristRollBaseline | null;
  pendingRoll: PendingWristRoll | null;
  pendingUntwist: PendingWristUntwist | null;
  lastPointer: GesturePointerSample | null;
  cooldownUntilMs: number | null;
};

export type PointerLockRequest = {
  id: string;
  lockedAt: string;
  pointer: GesturePointerSample;
  roll: WristRollCycle;
};

export type PointerUnlockRequest = {
  id: string;
  lockId: string;
  unlockedAt: string;
  handTrackId: string;
  sourceFrameIds: number[];
  confidence: number;
  rotationDegrees: number;
};

export type WristRollLockAdvanceResult = {
  state: WristRollLockControllerState;
  lockRequest: PointerLockRequest | null;
  unlockRequest: PointerUnlockRequest | null;
};

export type PointerLockInvalidationReason =
  | "camera_unavailable"
  | "display_changed"
  | "point_outside_active_window"
  | "screen_capture_unavailable"
  | "screen_state_changed"
  | "screen_state_unavailable";

export const initialWristRollLockControllerState: WristRollLockControllerState = {
  lock: { phase: "idle" },
  baseline: null,
  pendingRoll: null,
  pendingUntwist: null,
  lastPointer: null,
  cooldownUntilMs: null,
};

export function classifyWristRollPose({
  frame,
  pointPose,
  minDetectionConfidence,
}: {
  frame: HandLandmarkFrame | null;
  pointPose: PointPoseClassification;
  minDetectionConfidence: number;
}): WristRollPoseClassification {
  if (frame == null || frame.confidence < minDetectionConfidence) {
    return createInactiveWristRollPose(frame ?? undefined);
  }

  const wrist = findLandmark(frame, "wrist");
  const indexMcp = findLandmark(frame, "index_mcp");
  const indexTip = findLandmark(frame, "index_tip");
  const middleMcp = findLandmark(frame, "middle_mcp");
  const pinkyMcp = findLandmark(frame, "pinky_mcp");

  if (!wrist || !indexMcp || !indexTip || !middleMcp || !pinkyMcp) {
    return createInactiveWristRollPose(frame);
  }

  const palmNormal = getPalmNormal(wrist, indexMcp, pinkyMcp);
  const palmSize = distance3d(wrist, middleMcp);
  if (palmNormal == null || palmSize <= 0) {
    return createInactiveWristRollPose(frame);
  }

  const indexExtensionRatio = distance3d(wrist, indexTip) / palmSize;
  const foldedFingerCount = (["middle", "ring", "pinky"] as const).filter(
    (finger) => isFingerFolded(frame, wrist, middleMcp, finger),
  ).length;
  const stillHasPointingStructure =
    indexExtensionRatio >= minimumRolledIndexExtensionRatio &&
    foldedFingerCount >= requiredFoldedFingerCount;
  const label =
    pointPose.label === "point"
      ? "pointing"
      : stillHasPointingStructure
        ? "tracked"
        : "none";

  return {
    label,
    confidence: label === "none" ? 0 : frame.confidence,
    handTrackId: getHandTrackId(frame),
    palmNormal,
    indexExtensionRatio,
    foldedFingerCount,
    rollStartDegrees,
    rollResetDegrees,
    sourceFrameId: frame.frameId,
    capturedAt: frame.capturedAt,
  };
}

export function advanceWristRollLock({
  previousState,
  pose,
  pointer,
  nowMs,
}: {
  previousState: WristRollLockControllerState;
  pose: WristRollPoseClassification;
  pointer: GesturePointerSample | null;
  nowMs: number;
}): WristRollLockAdvanceResult {
  const lastPointer = pointer == null ? previousState.lastPointer : copyPointer(pointer);

  if (
    previousState.lock.phase === "locked" ||
    previousState.lock.phase === "unlocking"
  ) {
    return advanceLockedWristRoll({
      previousState,
      pose,
      lastPointer,
      nowMs,
    });
  }

  if (previousState.lock.phase === "cooldown") {
    const canRearm =
      pose.label === "pointing" &&
      pose.palmNormal != null &&
      pose.handTrackId != null &&
      pointer?.phase === "active" &&
      pointer.handTrackId === pose.handTrackId &&
      nowMs >= (previousState.cooldownUntilMs ?? 0);

    return canRearm
      ? armWristRoll(pose, pointer, nowMs)
      : {
          state: { ...previousState, lastPointer },
          lockRequest: null,
          unlockRequest: null,
        };
  }

  let baseline = previousState.baseline;
  if (
    baseline == null &&
    pose.label === "pointing" &&
    pose.palmNormal != null &&
    pose.handTrackId != null &&
    pointer?.phase === "active" &&
    pointer.handTrackId === pose.handTrackId
  ) {
    return armWristRoll(pose, pointer, nowMs);
  }

  if (baseline == null) {
    return {
      state: { ...previousState, lock: { phase: "idle" }, lastPointer },
      lockRequest: null,
      unlockRequest: null,
    };
  }

  if (
    pose.handTrackId != null &&
    pose.handTrackId !== baseline.handTrackId
  ) {
    return {
      state: {
        ...resetWristRollLockController(lastPointer),
        lock: { phase: "cancelled" },
        cooldownUntilMs: nowMs + cooldownMs,
      },
      lockRequest: null,
      unlockRequest: null,
    };
  }

  const rotationDegrees =
    pose.palmNormal == null
      ? null
      : getVectorAngleDegrees(baseline.palmNormal, pose.palmNormal);

  if (
    pose.label === "pointing" &&
    pose.handTrackId === baseline.handTrackId &&
    pointer?.phase === "active" &&
    pointer.handTrackId === baseline.handTrackId &&
    previousState.pendingRoll == null &&
    rotationDegrees != null &&
    rotationDegrees <= rollResetDegrees
  ) {
    baseline = {
      ...baseline,
      pointer: copyPointer(pointer),
      lastPointSeenAtMs: nowMs,
    };
  }

  if (
    previousState.pendingRoll == null &&
    nowMs - baseline.lastPointSeenAtMs > rollSequenceGraceMs
  ) {
    return {
      state: resetWristRollLockController(lastPointer),
      lockRequest: null,
      unlockRequest: null,
    };
  }

  const qualifiesAsRoll =
    pose.label !== "none" &&
    pose.handTrackId === baseline.handTrackId &&
    rotationDegrees != null &&
    rotationDegrees >= rollStartDegrees;

  if (qualifiesAsRoll && pose.sourceFrameId != null && pose.capturedAt != null) {
    return beginOrContinueWristRoll({
      state: { ...previousState, baseline, lastPointer },
      pose,
      rotationDegrees,
      nowMs,
    });
  }

  if (previousState.pendingRoll != null) {
    const interruptedSinceMs =
      previousState.pendingRoll.interruptedSinceMs ?? nowMs;
    if (nowMs - interruptedSinceMs < rollInterruptionGraceMs) {
      return {
        state: {
          ...previousState,
          baseline,
          lastPointer,
          lock: {
            phase: "rolling",
            rotationDegrees:
              rotationDegrees ?? previousState.pendingRoll.rotationDegrees,
            holdUntil: new Date(
              previousState.pendingRoll.startedAtMs + rollHoldMs,
            ).toISOString(),
          },
          pendingRoll: {
            ...previousState.pendingRoll,
            interruptedSinceMs,
          },
        },
        lockRequest: null,
        unlockRequest: null,
      };
    }

    return {
      state: {
        ...previousState,
        baseline,
        pendingRoll: null,
        lastPointer,
        lock: { phase: "armed", rotationDegrees: rotationDegrees ?? 0 },
      },
      lockRequest: null,
      unlockRequest: null,
    };
  }

  return {
    state: {
      ...previousState,
      baseline,
      lastPointer,
      lock: {
        phase: "armed",
        rotationDegrees: rotationDegrees ?? 0,
      },
    },
    lockRequest: null,
    unlockRequest: null,
  };
}

export function resetWristRollLockController(
  lastPointer: GesturePointerSample | null = null,
): WristRollLockControllerState {
  return {
    ...initialWristRollLockControllerState,
    lastPointer: lastPointer == null ? null : copyPointer(lastPointer),
  };
}

export function getWristRollDegrees(
  baseline: GestureVector3,
  current: GestureVector3,
): number {
  return getVectorAngleDegrees(baseline, current);
}

export function createScreenStateFingerprint(
  window: ActiveWindowBounds,
): string {
  const geometry = [
    Math.round(window.x),
    Math.round(window.y),
    Math.round(window.width),
    Math.round(window.height),
  ];
  const hasNativeIdentity =
    typeof window.ownerProcessId === "number" &&
    Number.isFinite(window.ownerProcessId) &&
    typeof window.windowNumber === "number" &&
    Number.isFinite(window.windowNumber);

  return hasNativeIdentity
    ? [
        "native",
        normalizeIdentityPart(window.bundleIdentifier ?? window.appName),
        Math.round(window.ownerProcessId!),
        Math.round(window.windowNumber!),
        ...geometry,
      ].join("|")
    : [
        "fallback",
        normalizeIdentityPart(window.appName),
        normalizeIdentityPart(window.title),
        ...geometry,
      ].join("|");
}

export function getPointerLockInvalidationReason({
  lock,
  display,
  screenCaptureAvailable,
  activeWindowId,
  activeWindow,
}: {
  lock: PointerLockSnapshot;
  display: DisplayContext;
  screenCaptureAvailable: boolean;
  activeWindowId: string | null;
  activeWindow?: ActiveWindowBounds | null;
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
    activeWindow != null &&
    !isPointInsideWindow(lock.pointer.display, activeWindow)
  ) {
    return "point_outside_active_window";
  }

  if (
    lock.evidence.activeWindowId != null &&
    lock.evidence.activeWindowId !== activeWindowId
  ) {
    return "screen_state_changed";
  }

  return null;
}

function isPointInsideWindow(
  point: { x: number; y: number },
  window: ActiveWindowBounds,
): boolean {
  return (
    point.x >= window.x &&
    point.x <= window.x + window.width &&
    point.y >= window.y &&
    point.y <= window.y + window.height
  );
}

function armWristRoll(
  pose: WristRollPoseClassification,
  pointer: GesturePointerSample,
  nowMs: number,
): WristRollLockAdvanceResult {
  const copiedPointer = copyPointer(pointer);
  return {
    state: {
      lock: { phase: "armed", rotationDegrees: 0 },
      baseline: {
        handTrackId: pose.handTrackId!,
        palmNormal: { ...pose.palmNormal! },
        pointer: copiedPointer,
        startedAtMs: nowMs,
        lastPointSeenAtMs: nowMs,
      },
      pendingRoll: null,
      pendingUntwist: null,
      lastPointer: copiedPointer,
      cooldownUntilMs: null,
    },
    lockRequest: null,
    unlockRequest: null,
  };
}

function beginOrContinueWristRoll({
  state,
  pose,
  rotationDegrees,
  nowMs,
}: {
  state: WristRollLockControllerState;
  pose: WristRollPoseClassification;
  rotationDegrees: number;
  nowMs: number;
}): WristRollLockAdvanceResult {
  const existing = state.pendingRoll;
  const pendingRoll: PendingWristRoll =
    existing == null
      ? {
          handTrackId: pose.handTrackId!,
          startedAt: pose.capturedAt!,
          startedAtMs: nowMs,
          sourceFrameIds: [pose.sourceFrameId!],
          confidence: pose.confidence,
          interruptedSinceMs: null,
          pointer: copyPointer(state.baseline!.pointer),
          rotationDegrees,
        }
      : {
          ...existing,
          sourceFrameIds: existing.sourceFrameIds.includes(pose.sourceFrameId!)
            ? existing.sourceFrameIds
            : [...existing.sourceFrameIds, pose.sourceFrameId!],
          confidence: Math.min(existing.confidence, pose.confidence),
          interruptedSinceMs: null,
          rotationDegrees: Math.max(existing.rotationDegrees, rotationDegrees),
        };

  if (nowMs - pendingRoll.startedAtMs < rollHoldMs) {
    return {
      state: {
        ...state,
        pendingRoll,
        lock: {
          phase: "rolling",
          rotationDegrees,
          holdUntil: new Date(pendingRoll.startedAtMs + rollHoldMs).toISOString(),
        },
      },
      lockRequest: null,
      unlockRequest: null,
    };
  }

  const roll: WristRollCycle = {
    id: `wrist-roll-${pendingRoll.handTrackId}-${pendingRoll.sourceFrameIds[0]}-${pose.sourceFrameId}`,
    handTrackId: pendingRoll.handTrackId,
    startedAt: pendingRoll.startedAt,
    lockedAt: pose.capturedAt!,
    sourceFrameIds: pendingRoll.sourceFrameIds,
    confidence: pendingRoll.confidence,
    rotationDegrees: pendingRoll.rotationDegrees,
  };
  const lockRequest: PointerLockRequest = {
    id: `gesture-lock-${roll.id}`,
    lockedAt: roll.lockedAt,
    pointer: copyPointer(pendingRoll.pointer),
    roll,
  };

  return {
    state: {
      ...state,
      lock: { phase: "locked", roll, rotationDegrees: roll.rotationDegrees },
      pendingRoll: null,
      pendingUntwist: null,
      lastPointer: copyPointer(pendingRoll.pointer),
    },
    lockRequest,
    unlockRequest: null,
  };
}

function advanceLockedWristRoll({
  previousState,
  pose,
  lastPointer,
  nowMs,
}: {
  previousState: WristRollLockControllerState;
  pose: WristRollPoseClassification;
  lastPointer: GesturePointerSample | null;
  nowMs: number;
}): WristRollLockAdvanceResult {
  const roll = previousState.lock.roll;
  const baseline = previousState.baseline;
  if (roll == null || baseline == null) {
    return {
      state: resetWristRollLockController(lastPointer),
      lockRequest: null,
      unlockRequest: null,
    };
  }

  const isLockingHand = pose.handTrackId === roll.handTrackId;
  const rotationDegrees =
    !isLockingHand || pose.palmNormal == null
      ? null
      : getVectorAngleDegrees(baseline.palmNormal, pose.palmNormal);
  const qualifiesAsUntwist =
    isLockingHand &&
    pose.label !== "none" &&
    rotationDegrees != null &&
    rotationDegrees <= rollResetDegrees &&
    pose.sourceFrameId != null &&
    pose.capturedAt != null;

  if (qualifiesAsUntwist) {
    const existing = previousState.pendingUntwist;
    const pendingUntwist: PendingWristUntwist =
      existing == null
        ? {
            handTrackId: roll.handTrackId,
            startedAt: pose.capturedAt!,
            startedAtMs: nowMs,
            sourceFrameIds: [pose.sourceFrameId!],
            confidence: pose.confidence,
            interruptedSinceMs: null,
            rotationDegrees: rotationDegrees!,
          }
        : {
            ...existing,
            sourceFrameIds: existing.sourceFrameIds.includes(pose.sourceFrameId!)
              ? existing.sourceFrameIds
              : [...existing.sourceFrameIds, pose.sourceFrameId!],
            confidence: Math.min(existing.confidence, pose.confidence),
            interruptedSinceMs: null,
            rotationDegrees: Math.min(
              existing.rotationDegrees,
              rotationDegrees!,
            ),
          };

    if (nowMs - pendingUntwist.startedAtMs < untwistHoldMs) {
      return {
        state: {
          ...previousState,
          lock: {
            phase: "unlocking",
            roll,
            rotationDegrees,
            holdUntil: new Date(
              pendingUntwist.startedAtMs + untwistHoldMs,
            ).toISOString(),
          },
          pendingUntwist,
          lastPointer,
        },
        lockRequest: null,
        unlockRequest: null,
      };
    }

    const lockId = `gesture-lock-${roll.id}`;
    const unlockRequest: PointerUnlockRequest = {
      id: `gesture-unlock-${roll.id}-${pose.sourceFrameId}`,
      lockId,
      unlockedAt: pose.capturedAt!,
      handTrackId: roll.handTrackId,
      sourceFrameIds: pendingUntwist.sourceFrameIds,
      confidence: pendingUntwist.confidence,
      rotationDegrees: pendingUntwist.rotationDegrees,
    };

    return {
      state: {
        lock: {
          phase: "cooldown",
          roll,
          rotationDegrees,
        },
        baseline: null,
        pendingRoll: null,
        pendingUntwist: null,
        lastPointer,
        cooldownUntilMs: nowMs + cooldownMs,
      },
      lockRequest: null,
      unlockRequest,
    };
  }

  if (previousState.pendingUntwist != null) {
    const interruptedSinceMs =
      previousState.pendingUntwist.interruptedSinceMs ?? nowMs;
    if (nowMs - interruptedSinceMs < rollInterruptionGraceMs) {
      return {
        state: {
          ...previousState,
          lock: {
            phase: "unlocking",
            roll,
            rotationDegrees:
              rotationDegrees ?? previousState.lock.rotationDegrees,
            holdUntil: new Date(
              previousState.pendingUntwist.startedAtMs + untwistHoldMs,
            ).toISOString(),
          },
          pendingUntwist: {
            ...previousState.pendingUntwist,
            interruptedSinceMs,
          },
          lastPointer,
        },
        lockRequest: null,
        unlockRequest: null,
      };
    }
  }

  return {
    state: {
      ...previousState,
      lock: {
        phase: "locked",
        roll,
        rotationDegrees: rotationDegrees ?? previousState.lock.rotationDegrees,
      },
      pendingRoll: null,
      pendingUntwist: null,
      lastPointer,
    },
    lockRequest: null,
    unlockRequest: null,
  };
}

function createInactiveWristRollPose(
  frame?: HandLandmarkFrame,
): WristRollPoseClassification {
  return {
    label: "none",
    confidence: 0,
    handTrackId: frame ? getHandTrackId(frame) : null,
    palmNormal: null,
    indexExtensionRatio: null,
    foldedFingerCount: 0,
    rollStartDegrees,
    rollResetDegrees,
    sourceFrameId: frame?.frameId,
    capturedAt: frame?.capturedAt,
  };
}

function getPalmNormal(
  wrist: HandLandmarkPoint,
  indexMcp: HandLandmarkPoint,
  pinkyMcp: HandLandmarkPoint,
): GestureVector3 | null {
  const indexVector = subtract(indexMcp, wrist);
  const pinkyVector = subtract(pinkyMcp, wrist);
  const cross = {
    x: indexVector.y * pinkyVector.z - indexVector.z * pinkyVector.y,
    y: indexVector.z * pinkyVector.x - indexVector.x * pinkyVector.z,
    z: indexVector.x * pinkyVector.y - indexVector.y * pinkyVector.x,
  };
  const magnitude = Math.hypot(cross.x, cross.y, cross.z);
  return magnitude <= 0
    ? null
    : {
        x: cross.x / magnitude,
        y: cross.y / magnitude,
        z: cross.z / magnitude,
      };
}

function getVectorAngleDegrees(left: GestureVector3, right: GestureVector3): number {
  const dot = left.x * right.x + left.y * right.y + left.z * right.z;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

function subtract(
  left: HandLandmarkPoint,
  right: HandLandmarkPoint,
): GestureVector3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: (left.z ?? 0) - (right.z ?? 0),
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

  const palmSize = distance3d(wrist, middleMcp);
  return palmSize > 0 && distance3d(wrist, tip) / palmSize <= 1.35;
}

function copyPointer(pointer: GesturePointerSample): GesturePointerSample {
  return {
    ...pointer,
    normalized: { ...pointer.normalized },
    display: { ...pointer.display },
  };
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

function distance3d(a: HandLandmarkPoint, b: HandLandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
}
