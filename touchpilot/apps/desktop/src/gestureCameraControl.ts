import type {
  CameraRuntimeState,
  GestureRuntimeState,
  HandLandmarkName,
  HandLandmarkPoint,
  TrackedHandLandmarkFrame,
} from "@toki/shared";

const inactiveGesture = Object.freeze({
  label: "none" as const,
  phase: "inactive" as const,
  confidence: 0,
  holdMs: 0,
  cooldownRemainingMs: 0,
});

export function setCameraGestureRuntimeEnabled(
  currentState: GestureRuntimeState,
  enabled: boolean,
): GestureRuntimeState {
  return {
    ...currentState,
    enabled,
    currentGesture: enabled
      ? currentState.currentGesture
      : inactiveGesture,
    camera: {
      ...currentState.camera,
      enabled,
      status: enabled
        ? currentState.camera.enabled &&
          (currentState.camera.status === "active" ||
            currentState.camera.status === "requesting_permission")
          ? currentState.camera.status
          : "idle"
        : "disabled",
      permission: enabled ? currentState.camera.permission : "unknown",
      error: undefined,
    },
  };
}

export function reconcileCameraGestureRuntimeState(
  currentState: GestureRuntimeState,
  camera: CameraRuntimeState,
): GestureRuntimeState {
  const runtimeUnavailable =
    camera.status === "disabled" ||
    camera.status === "permission_denied" ||
    camera.status === "no_camera" ||
    camera.status === "error";

  return {
    ...currentState,
    // Camera and gestures are one capability. During camera startup the hook
    // can still report its previous `disabled` status for one render; that
    // transient status must never switch only gesture recognition back off.
    enabled: camera.enabled,
    currentGesture: runtimeUnavailable
      ? inactiveGesture
      : currentState.currentGesture,
    camera,
  };
}

export type CameraGestureVoiceIntent = {
  type: "enable_camera_gestures";
  normalizedTranscript: string;
};

export type ClosedFistClassification = {
  isClosedFist: boolean;
  confidence: number;
  curledFingerCount: number;
  requiredCurledFingers: number;
  thumbTucked: boolean;
};

export type CameraShutdownGesturePhase =
  | "idle"
  | "holding"
  | "recognized"
  | "cooldown";

export type CameraShutdownGestureEvent = {
  id: string;
  type: "disable_camera_gestures";
  firedAtMs: number;
  handTrackIds: readonly [string, string];
};

export type CameraShutdownGestureState = {
  phase: CameraShutdownGesturePhase;
  candidateSinceMs: number | null;
  lastBothFistsAtMs: number | null;
  releasedSinceMs: number | null;
  holdMs: number;
  eventSequence: number;
  handTrackIds: readonly [string, string] | null;
  lastEvent: CameraShutdownGestureEvent | null;
};

export const cameraShutdownGesturePolicy = Object.freeze({
  holdMs: 2_000,
  interruptionGraceMs: 250,
  releaseHoldMs: 500,
  requiredCurledFingers: 4,
  maxFingerExtensionRatio: 1.18,
  maxThumbToPalmRatio: 1.2,
});

// Whole seconds only. The shutdown hold advances every inference frame, so a
// finer countdown would rewrite the published status 24 times a second.
export function getCameraShutdownSecondsLeft(holdMs: number): number {
  return Math.max(
    0,
    Math.ceil((cameraShutdownGesturePolicy.holdMs - holdMs) / 1_000),
  );
}

const directEnableVerbs = /\b(?:start|enable|activate)\b/;
const directionalEnableVerbs = /\b(?:turn|switch)\b/;
const cameraObject = /\b(?:camera|webcam)\b/;
const gestureObject = /\b(?:gestures?|hand tracking|gesture controls?)\b/;
const enableDirection = /\bon\b/;
const negativeDirection = /\b(?:off|disable|stop|deactivate)\b/;
const negation = /\b(?:don['’]?t|do not|never|not)\b/;

export function classifyCameraGestureVoiceCommand(
  transcript: string,
): CameraGestureVoiceIntent | null {
  const normalizedTranscript = transcript
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9'’]+/g, " ")
    .replace(/\s+/g, " ");

  if (
    normalizedTranscript.length === 0 ||
    negation.test(normalizedTranscript) ||
    negativeDirection.test(normalizedTranscript)
  ) {
    return null;
  }

  const namesCameraOrGestures =
    cameraObject.test(normalizedTranscript) || gestureObject.test(normalizedTranscript);
  const explicitlyEnables =
    directEnableVerbs.test(normalizedTranscript) ||
    (directionalEnableVerbs.test(normalizedTranscript) &&
      enableDirection.test(normalizedTranscript)) ||
    (/^(?:camera|webcam|gestures?|hand tracking)\s+on$/.test(normalizedTranscript) &&
      enableDirection.test(normalizedTranscript));

  if (!namesCameraOrGestures || !explicitlyEnables) {
    return null;
  }

  return {
    type: "enable_camera_gestures",
    normalizedTranscript,
  };
}

export function classifyClosedFist(
  hand: TrackedHandLandmarkFrame | null,
  minDetectionConfidence = 0.6,
): ClosedFistClassification {
  const requiredCurledFingers = cameraShutdownGesturePolicy.requiredCurledFingers;

  if (hand == null || hand.confidence < minDetectionConfidence) {
    return {
      isClosedFist: false,
      confidence: hand?.confidence ?? 0,
      curledFingerCount: 0,
      requiredCurledFingers,
      thumbTucked: false,
    };
  }

  const wrist = findLandmark(hand, "wrist");
  const middleMcp = findLandmark(hand, "middle_mcp");
  const indexMcp = findLandmark(hand, "index_mcp");
  const thumbTip = findLandmark(hand, "thumb_tip");

  if (wrist == null || middleMcp == null || indexMcp == null || thumbTip == null) {
    return {
      isClosedFist: false,
      confidence: hand.confidence,
      curledFingerCount: 0,
      requiredCurledFingers,
      thumbTucked: false,
    };
  }

  const palmSize = distance2d(wrist, middleMcp);
  if (palmSize <= Number.EPSILON) {
    return {
      isClosedFist: false,
      confidence: hand.confidence,
      curledFingerCount: 0,
      requiredCurledFingers,
      thumbTucked: false,
    };
  }

  const fingerNames: Array<
    readonly [HandLandmarkName, HandLandmarkName]
  > = [
    ["index_mcp", "index_tip"],
    ["middle_mcp", "middle_tip"],
    ["ring_mcp", "ring_tip"],
    ["pinky_mcp", "pinky_tip"],
  ];
  const curledFingerCount = fingerNames.filter(([mcpName, tipName]) => {
    const mcp = findLandmark(hand, mcpName);
    const tip = findLandmark(hand, tipName);
    if (mcp == null || tip == null) {
      return false;
    }

    const extensionRatio =
      distance2d(wrist, tip) / Math.max(Number.EPSILON, distance2d(wrist, mcp));
    return extensionRatio <= cameraShutdownGesturePolicy.maxFingerExtensionRatio;
  }).length;
  const thumbTucked =
    distance2d(thumbTip, indexMcp) / palmSize <=
    cameraShutdownGesturePolicy.maxThumbToPalmRatio;

  return {
    isClosedFist: curledFingerCount >= requiredCurledFingers && thumbTucked,
    confidence: hand.confidence,
    curledFingerCount,
    requiredCurledFingers,
    thumbTucked,
  };
}

export function createInitialCameraShutdownGestureState(): CameraShutdownGestureState {
  return {
    phase: "idle",
    candidateSinceMs: null,
    lastBothFistsAtMs: null,
    releasedSinceMs: null,
    holdMs: 0,
    eventSequence: 0,
    handTrackIds: null,
    lastEvent: null,
  };
}

export function advanceCameraShutdownGesture({
  previousState,
  hands,
  nowMs,
  minDetectionConfidence = 0.6,
}: {
  previousState: CameraShutdownGestureState;
  hands: TrackedHandLandmarkFrame[];
  nowMs: number;
  minDetectionConfidence?: number;
}): CameraShutdownGestureState {
  const fists = hands
    .filter((hand) => classifyClosedFist(hand, minDetectionConfidence).isClosedFist)
    .sort((left, right) => left.trackId.localeCompare(right.trackId));
  const hasTwoFists = fists.length >= 2;

  if (hasTwoFists) {
    const handTrackIds = [fists[0].trackId, fists[1].trackId] as const;
    const sameHands =
      previousState.handTrackIds == null ||
      (previousState.handTrackIds[0] === handTrackIds[0] &&
        previousState.handTrackIds[1] === handTrackIds[1]);

    if (!sameHands) {
      return {
        ...createInitialCameraShutdownGestureState(),
        phase: "holding",
        candidateSinceMs: nowMs,
        lastBothFistsAtMs: nowMs,
        handTrackIds,
        eventSequence: previousState.eventSequence,
        lastEvent: previousState.lastEvent,
      };
    }

    if (previousState.phase === "recognized" || previousState.phase === "cooldown") {
      return {
        ...previousState,
        phase: "cooldown",
        lastBothFistsAtMs: nowMs,
        releasedSinceMs: null,
        handTrackIds,
      };
    }

    const candidateSinceMs = previousState.candidateSinceMs ?? nowMs;
    const holdMs = Math.max(0, nowMs - candidateSinceMs);
    if (holdMs < cameraShutdownGesturePolicy.holdMs) {
      return {
        ...previousState,
        phase: "holding",
        candidateSinceMs,
        lastBothFistsAtMs: nowMs,
        releasedSinceMs: null,
        holdMs,
        handTrackIds,
      };
    }

    const eventSequence = previousState.eventSequence + 1;
    return {
      ...previousState,
      phase: "recognized",
      candidateSinceMs,
      lastBothFistsAtMs: nowMs,
      releasedSinceMs: null,
      holdMs,
      eventSequence,
      handTrackIds,
      lastEvent: {
        id: `camera-shutdown-${eventSequence}-${handTrackIds.join("-")}`,
        type: "disable_camera_gestures",
        firedAtMs: nowMs,
        handTrackIds,
      },
    };
  }

  if (
    previousState.phase === "holding" &&
    previousState.lastBothFistsAtMs != null &&
    nowMs - previousState.lastBothFistsAtMs <=
      cameraShutdownGesturePolicy.interruptionGraceMs
  ) {
    return previousState;
  }

  if (previousState.phase === "recognized" || previousState.phase === "cooldown") {
    const releasedSinceMs = previousState.releasedSinceMs ?? nowMs;
    if (nowMs - releasedSinceMs < cameraShutdownGesturePolicy.releaseHoldMs) {
      return {
        ...previousState,
        phase: "cooldown",
        releasedSinceMs,
      };
    }
  }

  return {
    ...createInitialCameraShutdownGestureState(),
    eventSequence: previousState.eventSequence,
    lastEvent: previousState.lastEvent,
  };
}

function findLandmark(
  hand: TrackedHandLandmarkFrame,
  name: HandLandmarkName,
): HandLandmarkPoint | undefined {
  return hand.landmarks.find((landmark) => landmark.name === name);
}

function distance2d(a: HandLandmarkPoint, b: HandLandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
