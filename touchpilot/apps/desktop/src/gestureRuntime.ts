// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AdaptiveGestureProfile,
  CameraDeviceSummary,
  CameraPermissionState,
  CameraRuntimeState,
  CameraStreamStatus,
  DisplayContext,
  GestureActionEvent,
  GestureClassification,
  GestureHandRole,
  GesturePointerSample,
  GestureThresholds,
  HandLandmarkFrame,
  HandTrackId,
  MultiHandLandmarkFrame,
} from "@toki/shared";
import {
  deriveAdaptiveGestureSettings,
  type AdaptiveGestureSettings,
} from "./gestureAdaptiveProfile";
import { probeCameraDevices } from "./cameraDevices";
import {
  classifyOpenPalmGesture,
  classifyPinchGesture,
  type OpenPalmClassification,
  type PinchClassification,
} from "./gestureClassifier";
import {
  initialGestureSmoothingState,
  smoothGestureCandidate,
} from "./gestureSmoothing";
import {
  getGestureVisualAnchor,
  type GestureVisualAnchor,
} from "./gestureVisuals";
import {
  advanceGesturePointerTracking,
  classifyPointPose,
  defaultGesturePointerCalibration,
  resetGesturePointerTracking,
  type PointPoseClassification,
} from "./gesturePointing";
import {
  advanceWristRollLock,
  classifyWristRollPose,
  initialWristRollLockControllerState,
  resetWristRollLockController,
  type PointerLockRequest,
  type PointerUnlockRequest,
  type WristRollLockState,
  type WristRollLockControllerState,
  type WristRollPoseClassification,
} from "./gestureTargetLock";
import {
  detectHandLandmarksForVideo,
  getHandLandmarker,
  handLandmarkerAssetMode,
} from "./handLandmarker";
import {
  advanceHandTracking,
  createInitialHandTrackingState,
  getRetainedHandTrackIds,
  type HandTrackAssignmentDiagnostic,
  type HandTrackingState,
} from "./gestureHandTracking";
import {
  advanceCreatureSplit,
  advanceGestureHandRoles,
  createCreatureSplitVisualState,
  createInitialCreatureSplitState,
  createInitialGestureHandRoleState,
  type CreatureSplitState,
  type CreatureSplitVisualState,
  type GestureHandRoleState,
} from "./gestureTwoHand";
import {
  advanceControlPinch,
  createInitialControlPinchState,
  type ControlPinchState,
} from "./gestureControlVoice";
import {
  advanceGestureVideoFrameFreshness,
  createInitialGestureVideoFrameFreshnessState,
  readGestureVideoFrameProgress,
} from "./gestureFrameFreshness";
import {
  advanceCameraShutdownGesture,
  createInitialCameraShutdownGestureState,
  type CameraShutdownGestureState,
} from "./gestureCameraControl";
import {
  appendGestureFrameDiagnostic,
  createGestureDiagnosticTrace,
  createGestureFrameDiagnostic,
  shouldPublishGestureDiagnosticTrace,
  type GestureDiagnosticTrace,
} from "./gestureDiagnostics";
import {
  initialCameraReframingState,
  type CameraReframingState,
} from "./cameraReframing";
import {
  advanceGestureIntentArbiter,
  createEmptyGestureIntentArbiterSnapshot,
  createInitialGestureIntentArbiterState,
  isGestureIntentSelected,
  type GestureIntentArbiterSnapshot,
  type GestureIntentCandidate,
  type GestureIntentArbiterState,
} from "./gestureIntentArbiter";

export type GestureRuntimeOwner = "overlay";

/**
 * Asks macOS whether it is re-framing the camera. A failure here is never worth
 * surfacing — an unknown answer means Toki simply says nothing.
 */
async function probeCameraReframing(): Promise<CameraReframingState> {
  try {
    const active = await invoke<boolean | null>("camera_reframing_status");
    return { active: active ?? null, checkedAt: new Date().toISOString() };
  } catch {
    return { active: null, checkedAt: new Date().toISOString() };
  }
}

// Inference is driven by requestAnimationFrame, so the achievable cadence is
// quantised to the display refresh grid: at 60 Hz only 16.7, 33.3, and 50 ms
// exist. A 24 fps target asks for 41.7 ms, which no tick satisfies, so the gate
// overshoots to the next tick and the real rate silently becomes 20 fps. 30 fps
// lands exactly on a tick.
export const gestureInferenceFramesPerSecond = 30;

// Half a 60 Hz tick. rAF timestamps jitter a fraction of a millisecond either
// side of the grid, and without this a 33.3 ms gate can miss its own tick and
// fall through to the next one, collapsing back to 20 fps.
export const gestureInferenceToleranceMs = 8;
export type CameraProbeStatus =
  | "idle"
  | "probing"
  | "ready"
  | "unsupported"
  | "error";
export type HandLandmarkerStatus =
  | "idle"
  | "loading"
  | "running"
  | "no_hand"
  | "error";

export type HandLandmarkSummary = {
  frameId: number;
  capturedAt: string;
  trackId: HandTrackId;
  role: GestureHandRole;
  handedness: HandLandmarkFrame["handedness"];
  confidence: number;
  trackingConfidence: number;
  sequence: number;
  landmarkCount: number;
};

export type GestureRuntimeDiagnostics = {
  owner: GestureRuntimeOwner;
  previewVisible: false;
  rawCameraFramesShared: false;
  cameraProbeStatus: CameraProbeStatus;
  cameraProbeError: string | null;
  cameraDevices: CameraDeviceSummary[];
  cameraStatus: CameraStreamStatus;
  cameraPermission: CameraPermissionState;
  cameraError: string | null;
  handLandmarkerStatus: HandLandmarkerStatus;
  handLandmarkerAssetMode: typeof handLandmarkerAssetMode;
  handLandmarkerError: string | null;
  handTrackAssignments: HandTrackAssignmentDiagnostic[];
  hand: HandLandmarkSummary | null;
  hands: HandLandmarkSummary[];
  handRoles: Partial<Record<HandTrackId, GestureHandRole>>;
  split: CreatureSplitState;
  ordinaryPinch: ControlPinchState;
  controlPinch: ControlPinchState;
  cameraShutdown: CameraShutdownGestureState;
  cameraReframing: CameraReframingState;
  intentArbiter: GestureIntentArbiterSnapshot;
  pinch: PinchClassification;
  openPalm: OpenPalmClassification;
  pointPose: PointPoseClassification;
  pointer: GesturePointerSample | null;
  wristRollPose: WristRollPoseClassification;
  wristRollLock: WristRollLockState;
  lockRequest: PointerLockRequest | null;
  unlockRequest: PointerUnlockRequest | null;
  pointerDisplay: DisplayContext;
  pointerCalibration: typeof defaultGesturePointerCalibration;
  adaptiveSettings: AdaptiveGestureSettings;
  smoothedGesture: GestureClassification;
  visualAnchor: GestureVisualAnchor | null;
  trace: GestureDiagnosticTrace;
  updatedAt: string;
};

export type AlwaysOnGestureRuntime = {
  camera: CameraRuntimeState;
  classification: GestureClassification;
  pointer: GesturePointerSample | null;
  splitVisual: CreatureSplitVisualState | null;
  ordinaryPinch: ControlPinchState;
  controlPinch: ControlPinchState;
  cameraShutdown: CameraShutdownGestureState;
  cameraReframing: CameraReframingState;
  wristRollLock: WristRollLockState;
  lockRequest: PointerLockRequest | null;
  unlockRequest: PointerUnlockRequest | null;
  visualAnchor: GestureVisualAnchor | null;
  diagnostics: GestureRuntimeDiagnostics;
};

export function createInactiveGestureClassification(): GestureClassification {
  return {
    label: "none",
    phase: "inactive",
    confidence: 0,
    holdMs: 0,
    cooldownRemainingMs: 0,
  };
}

export function getGestureActionForClassification(
  classification: GestureClassification,
  firedAt: string,
): GestureActionEvent | null {
  if (classification.phase !== "recognized") {
    return null;
  }

  if (classification.label === "open_palm") {
    return {
      type: "pause_assistant",
      gesture: "open_palm",
      confidence: classification.confidence,
      firedAt,
      sourceFrameId: classification.sourceFrameId,
    };
  }

  return null;
}

export function createEmptyGestureRuntimeDiagnostics(
  thresholds: GestureThresholds,
  now = "1970-01-01T00:00:00.000Z",
): GestureRuntimeDiagnostics {
  return {
    owner: "overlay",
    previewVisible: false,
    rawCameraFramesShared: false,
    cameraProbeStatus: "idle",
    cameraProbeError: null,
    cameraDevices: [],
    cameraStatus: "idle",
    cameraPermission: "unknown",
    cameraError: null,
    handLandmarkerStatus: "idle",
    handLandmarkerAssetMode,
    handLandmarkerError: null,
    handTrackAssignments: [],
    hand: null,
    hands: [],
    handRoles: {},
    split: createInitialCreatureSplitState(),
    ordinaryPinch: createInitialControlPinchState(),
    controlPinch: createInitialControlPinchState(),
    cameraShutdown: createInitialCameraShutdownGestureState(),
    cameraReframing: initialCameraReframingState,
    intentArbiter: createEmptyGestureIntentArbiterSnapshot(),
    pinch: classifyPinchGesture(null, thresholds),
    openPalm: classifyOpenPalmGesture(null, thresholds),
    pointPose: classifyPointPose(null, thresholds.minDetectionConfidence),
    pointer: null,
    wristRollPose: classifyWristRollPose({
      frame: null,
      pointPose: classifyPointPose(null, thresholds.minDetectionConfidence),
      minDetectionConfidence: thresholds.minDetectionConfidence,
    }),
    wristRollLock: { phase: "idle" },
    lockRequest: null,
    unlockRequest: null,
    pointerDisplay: {
      id: "overlay-unavailable",
      width: 0,
      height: 0,
      scaleFactor: 1,
    },
    pointerCalibration: defaultGesturePointerCalibration,
    adaptiveSettings: deriveAdaptiveGestureSettings(null),
    smoothedGesture: createInactiveGestureClassification(),
    visualAnchor: null,
    trace: createGestureDiagnosticTrace(),
    updatedAt: now,
  };
}

export function useAlwaysOnGestureRuntime({
  cameraEnabled,
  gesturesEnabled,
  thresholds,
  deviceRefreshToken,
  display,
  adaptiveProfile,
  ordinaryVoiceCanStart,
  controlVoiceCanStart,
}: {
  cameraEnabled: boolean;
  gesturesEnabled: boolean;
  thresholds: GestureThresholds;
  deviceRefreshToken: number;
  display: DisplayContext;
  adaptiveProfile: AdaptiveGestureProfile | null;
  ordinaryVoiceCanStart: boolean;
  controlVoiceCanStart: boolean;
}): AlwaysOnGestureRuntime {
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceSummary[]>([]);
  const [cameraProbeStatus, setCameraProbeStatus] =
    useState<CameraProbeStatus>("idle");
  const [cameraProbeError, setCameraProbeError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStreamStatus>(
    cameraEnabled ? "idle" : "disabled",
  );
  const [cameraPermission, setCameraPermission] =
    useState<CameraPermissionState>("unknown");
  const [cameraError, setCameraError] = useState<string | null>(null);
  // Why each hand got the track id it did. A hand that returns with a *new* id
  // is indistinguishable from a new hand, so the pointer stops following it and
  // must re-acquire the pose — which is what "Toki let go while my hand was
  // right there" looks like from the inside. Nothing else in the diagnostics
  // records that decision.
  const [handTrackAssignments, setHandTrackAssignments] = useState<
    HandTrackAssignmentDiagnostic[]
  >([]);
  const [handLandmarkerStatus, setHandLandmarkerStatus] =
    useState<HandLandmarkerStatus>("idle");
  const [handLandmarkerError, setHandLandmarkerError] = useState<string | null>(null);
  const [multiHandLandmarkFrame, setMultiHandLandmarkFrame] =
    useState<MultiHandLandmarkFrame | null>(null);
  const [handRoleState, setHandRoleState] = useState<GestureHandRoleState>(
    createInitialGestureHandRoleState,
  );
  const [handRoles, setHandRoles] = useState<
    Partial<Record<HandTrackId, GestureHandRole>>
  >({});
  const [creatureSplitState, setCreatureSplitState] =
    useState<CreatureSplitState>(createInitialCreatureSplitState);
  const [ordinaryPinchState, setOrdinaryPinchState] = useState<ControlPinchState>(
    createInitialControlPinchState,
  );
  const [controlPinchState, setControlPinchState] = useState<ControlPinchState>(
    createInitialControlPinchState,
  );
  const [cameraShutdownState, setCameraShutdownState] =
    useState<CameraShutdownGestureState>(createInitialCameraShutdownGestureState);
  const [gestureIntentArbiter, setGestureIntentArbiter] =
    useState<GestureIntentArbiterSnapshot>(
      createEmptyGestureIntentArbiterSnapshot,
    );
  const [smoothedGesture, setSmoothedGesture] = useState<GestureClassification>(
    createInactiveGestureClassification,
  );
  const [gesturePointer, setGesturePointer] =
    useState<GesturePointerSample | null>(null);
  const [wristRollLock, setWristRollLock] = useState<WristRollLockState>({
    phase: "idle",
  });
  const [lockRequest, setLockRequest] = useState<PointerLockRequest | null>(null);
  const [unlockRequest, setUnlockRequest] =
    useState<PointerUnlockRequest | null>(null);
  const [cameraReframing, setCameraReframing] = useState<CameraReframingState>(
    initialCameraReframingState,
  );
  const [gestureDiagnosticTrace, setGestureDiagnosticTrace] =
    useState<GestureDiagnosticTrace>(createGestureDiagnosticTrace);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handFrameIdRef = useRef(0);
  const handTrackingStateRef = useRef<HandTrackingState>(
    createInitialHandTrackingState(),
  );
  const handRoleStateRef = useRef<GestureHandRoleState>(
    createInitialGestureHandRoleState(),
  );
  const creatureSplitStateRef = useRef<CreatureSplitState>(
    createInitialCreatureSplitState(),
  );
  const ordinaryPinchStateRef = useRef<ControlPinchState>(
    createInitialControlPinchState(),
  );
  const controlPinchStateRef = useRef<ControlPinchState>(
    createInitialControlPinchState(),
  );
  const cameraShutdownStateRef = useRef<CameraShutdownGestureState>(
    createInitialCameraShutdownGestureState(),
  );
  const gestureIntentArbiterStateRef = useRef<GestureIntentArbiterState>(
    createInitialGestureIntentArbiterState(),
  );
  const controlVoiceCanStartRef = useRef(controlVoiceCanStart);
  controlVoiceCanStartRef.current = controlVoiceCanStart;
  const ordinaryVoiceCanStartRef = useRef(ordinaryVoiceCanStart);
  ordinaryVoiceCanStartRef.current = ordinaryVoiceCanStart;
  const gestureSmoothingStateRef = useRef(initialGestureSmoothingState);
  const pointerTrackingStateRef = useRef(resetGesturePointerTracking());
  const wristRollLockStateRef = useRef(initialWristRollLockControllerState);
  const gestureDiagnosticTraceRef = useRef<GestureDiagnosticTrace>(
    createGestureDiagnosticTrace(),
  );
  const lastPublishedGestureDiagnosticFrameRef =
    useRef<GestureDiagnosticTrace["frames"][number] | null>(null);
  const lastGestureDiagnosticPublishAtMsRef = useRef(0);
  const adaptiveSettings = useMemo(
    () => deriveAdaptiveGestureSettings(adaptiveProfile),
    [adaptiveProfile],
  );

  useEffect(() => {
    let cancelled = false;

    async function refreshCameraDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setCameraProbeStatus("unsupported");
        setCameraProbeError("Camera device enumeration is not available.");
        setCameraDevices([]);
        return;
      }

      setCameraProbeStatus("probing");
      setCameraProbeError(null);

      try {
        const devices = await probeCameraDevices();
        if (!cancelled) {
          setCameraDevices(devices);
          setCameraProbeStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setCameraDevices([]);
          setCameraProbeStatus("error");
          setCameraProbeError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void refreshCameraDevices();

    return () => {
      cancelled = true;
    };
  }, [deviceRefreshToken]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;

    function resetRecognition() {
      setMultiHandLandmarkFrame(null);
      handTrackingStateRef.current = createInitialHandTrackingState();
      handRoleStateRef.current = createInitialGestureHandRoleState();
      setHandRoleState(handRoleStateRef.current);
      setHandRoles({});
      creatureSplitStateRef.current = createInitialCreatureSplitState();
      setCreatureSplitState(creatureSplitStateRef.current);
      ordinaryPinchStateRef.current = createInitialControlPinchState(
        adaptiveSettings.pinchDistanceThreshold,
      );
      setOrdinaryPinchState(ordinaryPinchStateRef.current);
      controlPinchStateRef.current = createInitialControlPinchState(
        adaptiveSettings.pinchDistanceThreshold,
      );
      setControlPinchState(controlPinchStateRef.current);
      cameraShutdownStateRef.current = createInitialCameraShutdownGestureState();
      setCameraShutdownState(cameraShutdownStateRef.current);
      gestureIntentArbiterStateRef.current =
        createInitialGestureIntentArbiterState();
      setGestureIntentArbiter(createEmptyGestureIntentArbiterSnapshot());
      setHandLandmarkerStatus("idle");
      setHandLandmarkerError(null);
      gestureSmoothingStateRef.current = initialGestureSmoothingState;
      setSmoothedGesture(createInactiveGestureClassification());
      pointerTrackingStateRef.current = resetGesturePointerTracking();
      setGesturePointer(null);
      wristRollLockStateRef.current = resetWristRollLockController();
      setWristRollLock({ phase: "idle" });
      setLockRequest(null);
    }

    async function startCameraRuntime() {
      if (!cameraEnabled) {
        setCameraStatus("disabled");
        setCameraPermission("unknown");
        setCameraError(null);
        resetRecognition();
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("error");
        setCameraPermission("unsupported");
        setCameraError("Camera capture is not available in this WebView.");
        resetRecognition();
        return;
      }

      setCameraStatus("requesting_permission");
      setCameraPermission("prompt");
      setCameraError(null);

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();
        setCameraStatus("active");
        setCameraPermission("granted");
        void probeCameraReframing().then((next) => {
          if (!cancelled) {
            setCameraReframing(next);
          }
        });
      } catch (error) {
        const errorName = error instanceof DOMException ? error.name : "";
        const message = error instanceof Error ? error.message : String(error);
        const nextStatus: CameraStreamStatus =
          errorName === "NotAllowedError" || errorName === "SecurityError"
            ? "permission_denied"
            : errorName === "NotFoundError" || errorName === "DevicesNotFoundError"
              ? "no_camera"
              : "error";

        setCameraStatus(nextStatus);
        setCameraPermission(nextStatus === "permission_denied" ? "denied" : "error");
        setCameraError(message);
        resetRecognition();
      }
    }

    void startCameraRuntime();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      video.pause();
      video.srcObject = null;
      if (videoRef.current === video) {
        videoRef.current = null;
      }
    };
  }, [cameraEnabled, deviceRefreshToken]);

  useEffect(() => {
    if (cameraStatus !== "active" || !gesturesEnabled) {
      setHandLandmarkerStatus("idle");
      setMultiHandLandmarkFrame(null);
      handTrackingStateRef.current = createInitialHandTrackingState();
      handRoleStateRef.current = createInitialGestureHandRoleState();
      setHandRoleState(handRoleStateRef.current);
      setHandRoles({});
      creatureSplitStateRef.current = createInitialCreatureSplitState();
      setCreatureSplitState(creatureSplitStateRef.current);
      ordinaryPinchStateRef.current = createInitialControlPinchState(
        adaptiveSettings.pinchDistanceThreshold,
      );
      setOrdinaryPinchState(ordinaryPinchStateRef.current);
      controlPinchStateRef.current = createInitialControlPinchState(
        adaptiveSettings.pinchDistanceThreshold,
      );
      setControlPinchState(controlPinchStateRef.current);
      cameraShutdownStateRef.current = createInitialCameraShutdownGestureState();
      setCameraShutdownState(cameraShutdownStateRef.current);
      gestureIntentArbiterStateRef.current =
        createInitialGestureIntentArbiterState();
      setGestureIntentArbiter(createEmptyGestureIntentArbiterSnapshot());
      gestureSmoothingStateRef.current = initialGestureSmoothingState;
      setSmoothedGesture(createInactiveGestureClassification());
      pointerTrackingStateRef.current = resetGesturePointerTracking();
      setGesturePointer(null);
      setHandLandmarkerError(null);
      return;
    }

    let cancelled = false;
    let animationFrame = 0;
    let lastDetectionAt = 0;
    let frameFreshnessState = createInitialGestureVideoFrameFreshnessState();
    const detectionIntervalMs =
      1_000 / gestureInferenceFramesPerSecond - gestureInferenceToleranceMs;

    async function runHandLandmarker() {
      setHandLandmarkerStatus("loading");
      setHandLandmarkerError(null);

      try {
        const landmarker = await getHandLandmarker();

        function detectFrame(now: number) {
          if (cancelled) {
            return;
          }

          if (now - lastDetectionAt >= detectionIntervalMs) {
            lastDetectionAt = now;
            const video = videoRef.current;

            if (video) {
              const inferenceStartedAtMs = Date.now();
              const freshness = advanceGestureVideoFrameFreshness({
                previousState: frameFreshnessState,
                videoTime: readGestureVideoFrameProgress(video),
                nowMs: now,
              });
              frameFreshnessState = freshness.state;
              const detections = freshness.shouldInfer
                ? detectHandLandmarksForVideo(
                    landmarker,
                    video,
                    handFrameIdRef.current + 1,
                  )
                : freshness.shouldAdvanceWithEmptyFrame
                  ? []
                  : null;

              if (detections == null) {
                animationFrame = window.requestAnimationFrame(detectFrame);
                return;
              }

              handFrameIdRef.current += 1;
              const capturedAt =
                detections[0]?.capturedAt ?? new Date().toISOString();
              const tracking = advanceHandTracking({
                previousState: handTrackingStateRef.current,
                detections,
                frameId: handFrameIdRef.current,
                capturedAt,
                sourceWidth: video.videoWidth,
                sourceHeight: video.videoHeight,
                mirrored: true,
                nowMs: now,
                trackingLossGraceMs:
                  adaptiveSettings.pointerCalibration.trackingLossGraceMs,
              });
              handTrackingStateRef.current = tracking.state;
              setHandTrackAssignments(tracking.assignments);
              const roles = advanceGestureHandRoles({
                previousState: handRoleStateRef.current,
                frame: tracking.frame,
                retainedTrackIds: getRetainedHandTrackIds(tracking.state),
                preferredPointerHand:
                  adaptiveProfile?.preferredPointerHand ?? "unknown",
                minDetectionConfidence: thresholds.minDetectionConfidence,
              });
              handRoleStateRef.current = roles.state;
              const pointPose = classifyPointPose(
                roles.pointerHand,
                thresholds.minDetectionConfidence,
                pointerTrackingStateRef.current.active
                  ? pointerTrackingStateRef.current.candidateTrackId
                  : null,
              );
              const pointerResult = advanceGesturePointerTracking({
                previousState: pointerTrackingStateRef.current,
                classification: pointPose,
                display,
                nowMs: now,
                calibration: adaptiveSettings.pointerCalibration,
              });
              pointerTrackingStateRef.current = pointerResult.state;
              const split = advanceCreatureSplit({
                previousState: creatureSplitStateRef.current,
                pointerHand: roles.pointerHand,
                controlHand: roles.controlHand,
                nowMs: now,
              });
              creatureSplitStateRef.current = split;
              const inferenceTimestampMs = Date.now();
              const ordinaryPinchEligible =
                ordinaryVoiceCanStartRef.current &&
                tracking.frame.hands.length === 1 &&
                roles.controlHand == null &&
                controlPinchStateRef.current.phase === "idle";
              const controlPinchEligible = controlVoiceCanStartRef.current;
              const rawOrdinaryPinch = classifyPinchGesture(
                roles.pointerHand,
                thresholds,
                adaptiveSettings.pinchDistanceThreshold,
              );
              const rawControlPinch = classifyPinchGesture(
                roles.controlHand,
                thresholds,
                adaptiveSettings.pinchDistanceThreshold,
              );
              const rawOpenPalm = classifyOpenPalmGesture(
                roles.pointerHand,
                thresholds,
              );
              const cameraShutdown = advanceCameraShutdownGesture({
                previousState: cameraShutdownStateRef.current,
                hands: tracking.frame.hands,
                nowMs: inferenceTimestampMs,
                minDetectionConfidence: thresholds.minDetectionConfidence,
              });
              cameraShutdownStateRef.current = cameraShutdown;
              const intentCandidates: GestureIntentCandidate[] = [];

              if (pointerResult.pointer != null) {
                intentCandidates.push({
                  intent: "point",
                  trackId: pointerResult.pointer.handTrackId,
                  confidence: pointerResult.pointer.confidence,
                  lifecycle: "candidate",
                  sourceFrameId: pointerResult.pointer.sourceFrameId,
                });
              }
              appendPinchIntentCandidate({
                candidates: intentCandidates,
                intent: "ordinary_pinch",
                previousState: ordinaryPinchStateRef.current,
                rawClassification: rawOrdinaryPinch,
                rawTrackId: roles.pointerHand?.trackId ?? null,
                eligible: ordinaryPinchEligible,
              });
              appendPinchIntentCandidate({
                candidates: intentCandidates,
                intent: "control_pinch",
                previousState: controlPinchStateRef.current,
                rawClassification: rawControlPinch,
                rawTrackId: roles.controlHand?.trackId ?? null,
                eligible: controlPinchEligible,
              });
              if (
                rawOpenPalm.label === "open_palm" &&
                roles.pointerHand != null
              ) {
                intentCandidates.push({
                  intent: "open_palm",
                  trackId: roles.pointerHand.trackId,
                  confidence: rawOpenPalm.confidence,
                  lifecycle: "candidate",
                  sourceFrameId: rawOpenPalm.sourceFrameId,
                });
              }
              appendWristRollIntentCandidate(
                intentCandidates,
                wristRollLockStateRef.current,
              );
              appendCameraShutdownIntentCandidates(
                intentCandidates,
                cameraShutdown,
              );
              const intentArbitration = advanceGestureIntentArbiter({
                previousState: gestureIntentArbiterStateRef.current,
                candidates: intentCandidates,
                nowMs: inferenceTimestampMs,
              });
              gestureIntentArbiterStateRef.current = intentArbitration.state;
              const ordinaryPinchSelected = isGestureIntentSelected(
                intentArbitration.snapshot,
                "ordinary_pinch",
                roles.pointerHand?.trackId,
              );
              const controlPinchSelected = isGestureIntentSelected(
                intentArbitration.snapshot,
                "control_pinch",
                roles.controlHand?.trackId,
              );
              const ordinaryPinch = advanceControlPinch({
                previousState: ordinaryPinchStateRef.current,
                controlHand: roles.pointerHand,
                thresholds,
                pressThreshold: adaptiveSettings.pinchDistanceThreshold,
                nowMs: inferenceTimestampMs,
                canPress: ordinaryPinchEligible && ordinaryPinchSelected,
                trackingLossGraceMs:
                  adaptiveSettings.pointerCalibration.trackingLossGraceMs,
              });
              ordinaryPinchStateRef.current = ordinaryPinch;
              const controlPinch = advanceControlPinch({
                previousState: controlPinchStateRef.current,
                controlHand: roles.controlHand,
                thresholds,
                pressThreshold: adaptiveSettings.pinchDistanceThreshold,
                nowMs: inferenceTimestampMs,
                canPress: controlPinchEligible && controlPinchSelected,
                trackingLossGraceMs:
                  adaptiveSettings.pointerCalibration.trackingLossGraceMs,
              });
              controlPinchStateRef.current = controlPinch;
              const selectedGestureCandidate = createSelectedGestureCandidate({
                arbitration: intentArbitration.snapshot,
                pointerHandTrackId: roles.pointerHand?.trackId ?? null,
                rawPinch: rawOrdinaryPinch,
                rawOpenPalm,
                sourceFrameId: tracking.frame.frameId,
              });
              const smoothing = smoothGestureCandidate(
                gestureSmoothingStateRef.current,
                selectedGestureCandidate,
                thresholds,
                now,
              );
              gestureSmoothingStateRef.current = smoothing.state;
              const inferenceCompletedAtMs = Date.now();
              const previousDiagnosticFrame =
                gestureDiagnosticTraceRef.current.frames[
                  gestureDiagnosticTraceRef.current.frames.length - 1
                ] ?? null;
              const diagnosticFrame = createGestureFrameDiagnostic({
                sourceFrameId: tracking.frame.frameId,
                capturedAt,
                monotonicAtMs: now,
                inferenceStartedAtMs,
                inferenceCompletedAtMs,
                previousFrame: previousDiagnosticFrame,
                handCount: tracking.frame.hands.length,
                pointerTrackId: roles.state.pointerTrackId,
                controlTrackId: roles.state.controlTrackId,
                pointPose,
                pointer: pointerResult.pointer,
                display,
                calibration: adaptiveSettings.pointerCalibration,
                viewport: {
                  width: display.width,
                  height: display.height,
                  devicePixelRatio: display.scaleFactor,
                  updatedAt: new Date(inferenceCompletedAtMs).toISOString(),
                },
                ordinaryPinch,
                controlPinch,
                wristRoll: wristRollLockStateRef.current.lock,
                cameraShutdown,
                intentArbiter: intentArbitration.snapshot,
                ordinaryVoiceCanStart: ordinaryVoiceCanStartRef.current,
                controlVoiceCanStart: controlVoiceCanStartRef.current,
              });
              const nextDiagnosticTrace = appendGestureFrameDiagnostic(
                gestureDiagnosticTraceRef.current,
                diagnosticFrame,
              );
              gestureDiagnosticTraceRef.current = nextDiagnosticTrace;
              const nextPublishedFrame =
                nextDiagnosticTrace.frames[nextDiagnosticTrace.frames.length - 1];
              if (
                nextPublishedFrame != null &&
                shouldPublishGestureDiagnosticTrace({
                  previousPublishedFrame:
                    lastPublishedGestureDiagnosticFrameRef.current,
                  nextFrame: nextPublishedFrame,
                  lastPublishedAtMs:
                    lastGestureDiagnosticPublishAtMsRef.current,
                  nowMs: inferenceCompletedAtMs,
                })
              ) {
                lastPublishedGestureDiagnosticFrameRef.current =
                  nextPublishedFrame;
                lastGestureDiagnosticPublishAtMsRef.current =
                  inferenceCompletedAtMs;
                setGestureDiagnosticTrace(nextDiagnosticTrace);
              }
              setMultiHandLandmarkFrame(tracking.frame);
              setHandRoleState(roles.state);
              setHandRoles(roles.roles);
              setGesturePointer((current) =>
                isSameGesturePointer(current, pointerResult.pointer)
                  ? current
                  : pointerResult.pointer,
              );
              setCreatureSplitState(split);
              setOrdinaryPinchState((current) =>
                sameControlPinchState(current, ordinaryPinch)
                  ? current
                  : ordinaryPinch,
              );
              setControlPinchState((current) =>
                sameControlPinchState(current, controlPinch) ? current : controlPinch,
              );
              setCameraShutdownState((current) =>
                sameCameraShutdownGestureState(current, cameraShutdown)
                  ? current
                  : cameraShutdown,
              );
              setGestureIntentArbiter((current) =>
                sameGestureIntentArbiterSnapshot(
                  current,
                  intentArbitration.snapshot,
                )
                  ? current
                  : intentArbitration.snapshot,
              );
              setSmoothedGesture((current) =>
                sameGestureClassification(current, smoothing.classification)
                  ? current
                  : smoothing.classification,
              );

              if (tracking.frame.hands.length > 0) {
                setHandLandmarkerStatus("running");
              } else {
                setHandLandmarkerStatus("no_hand");
              }
            }
          }

          animationFrame = window.requestAnimationFrame(detectFrame);
        }

        animationFrame = window.requestAnimationFrame(detectFrame);
      } catch (error) {
        if (!cancelled) {
          setHandLandmarkerStatus("error");
          setHandLandmarkerError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void runHandLandmarker();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    adaptiveProfile?.preferredPointerHand,
    adaptiveSettings.pointerCalibration,
    adaptiveSettings.pinchDistanceThreshold,
    cameraStatus,
    display,
    gesturesEnabled,
    thresholds,
  ]);

  const handLandmarkFrame = useMemo<HandLandmarkFrame | null>(() => {
    if (multiHandLandmarkFrame == null || handRoleState.pointerTrackId == null) {
      return null;
    }

    return (
      multiHandLandmarkFrame.hands.find(
        (hand) => hand.trackId === handRoleState.pointerTrackId,
      ) ?? null
    );
  }, [handRoleState.pointerTrackId, multiHandLandmarkFrame]);

  const pinchClassification = useMemo(
    () =>
      classifyPinchGesture(
        handLandmarkFrame,
        thresholds,
        adaptiveSettings.pinchDistanceThreshold,
      ),
    [adaptiveSettings.pinchDistanceThreshold, handLandmarkFrame, thresholds],
  );
  const openPalmClassification = useMemo(
    () => classifyOpenPalmGesture(handLandmarkFrame, thresholds),
    [handLandmarkFrame, thresholds],
  );
  const pointPoseClassification = useMemo(
    () => classifyPointPose(handLandmarkFrame, thresholds.minDetectionConfidence),
    [handLandmarkFrame, thresholds.minDetectionConfidence],
  );
  const wristRollPoseClassification = useMemo(
    () =>
      classifyWristRollPose({
        frame: handLandmarkFrame,
        pointPose: pointPoseClassification,
        minDetectionConfidence: thresholds.minDetectionConfidence,
      }),
    [
      handLandmarkFrame,
      pointPoseClassification,
      thresholds.minDetectionConfidence,
    ],
  );
  useEffect(() => {
    if (
      gesturePointer?.phase !== "recovering" ||
      pointerTrackingStateRef.current.lastPointSeenAtMs == null
    ) {
      return;
    }

    const elapsedMs =
      performance.now() - pointerTrackingStateRef.current.lastPointSeenAtMs;
    const remainingMs = Math.max(
      0,
      adaptiveSettings.pointerCalibration.trackingLossGraceMs - elapsedMs,
    );
    const timeout = window.setTimeout(() => {
      const result = advanceGesturePointerTracking({
        previousState: pointerTrackingStateRef.current,
        classification: classifyPointPose(null, thresholds.minDetectionConfidence),
        display,
        nowMs: performance.now(),
        calibration: adaptiveSettings.pointerCalibration,
      });
      pointerTrackingStateRef.current = result.state;
      setGesturePointer(result.pointer);
    }, remainingMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    display,
    adaptiveSettings.pointerCalibration,
    gesturePointer?.phase,
    gesturePointer?.sourceFrameId,
    thresholds.minDetectionConfidence,
  ]);

  useEffect(() => {
    if (!gesturesEnabled || cameraStatus !== "active") {
      wristRollLockStateRef.current = resetWristRollLockController();
      setWristRollLock({ phase: "idle" });
      setLockRequest(null);
      setUnlockRequest(null);
      return;
    }

    const result = advanceWristRollLock({
      previousState: wristRollLockStateRef.current,
      pose: wristRollPoseClassification,
      pointer: pointerTrackingStateRef.current.pointer,
      nowMs: Date.now(),
    });
    wristRollLockStateRef.current = result.state;
    setWristRollLock((current) =>
      sameWristRollLockState(current, result.state.lock) ? current : result.state.lock,
    );
    if (result.lockRequest != null) {
      setLockRequest(result.lockRequest);
    }
    if (result.unlockRequest != null) {
      setUnlockRequest(result.unlockRequest);
    }
  }, [cameraStatus, gesturesEnabled, wristRollPoseClassification]);

  const gestureVisualAnchor = useMemo(() => {
    const canAnimate =
      gesturesEnabled &&
      smoothedGesture.label !== "none" &&
      smoothedGesture.phase !== "inactive" &&
      smoothedGesture.phase !== "cooldown";

    return canAnimate
      ? getGestureVisualAnchor(handLandmarkFrame, smoothedGesture.label)
      : null;
  }, [gesturesEnabled, handLandmarkFrame, smoothedGesture.label, smoothedGesture.phase]);

  const creatureSplitVisual = useMemo(
    () =>
      createCreatureSplitVisualState({
        state: creatureSplitState,
        display,
        calibration: adaptiveSettings.pointerCalibration,
      }),
    [
      adaptiveSettings.pointerCalibration,
      creatureSplitState,
      display,
    ],
  );

  const camera = useMemo<CameraRuntimeState>(
    () => ({
      enabled: cameraEnabled,
      permission: cameraPermission,
      status: cameraStatus,
      devices: cameraDevices,
      error: cameraError ?? undefined,
    }),
    [cameraDevices, cameraEnabled, cameraError, cameraPermission, cameraStatus],
  );

  const diagnostics = useMemo<GestureRuntimeDiagnostics>(
    () => ({
      owner: "overlay",
      previewVisible: false,
      rawCameraFramesShared: false,
      cameraProbeStatus,
      cameraProbeError,
      cameraDevices,
      cameraStatus,
      cameraPermission,
      cameraError,
      handLandmarkerStatus,
      handLandmarkerAssetMode,
      handLandmarkerError,
      handTrackAssignments,
      hand: handLandmarkFrame
        ? {
            frameId: handLandmarkFrame.frameId,
            capturedAt: handLandmarkFrame.capturedAt,
            trackId:
              "trackId" in handLandmarkFrame
                ? String(handLandmarkFrame.trackId)
                : "primary-hand",
            role: "pointer",
            handedness: handLandmarkFrame.handedness,
            confidence: handLandmarkFrame.confidence,
            trackingConfidence:
              "trackingConfidence" in handLandmarkFrame &&
              typeof handLandmarkFrame.trackingConfidence === "number"
                ? handLandmarkFrame.trackingConfidence
                : handLandmarkFrame.confidence,
            sequence:
              "sequence" in handLandmarkFrame &&
              typeof handLandmarkFrame.sequence === "number"
                ? handLandmarkFrame.sequence
                : 1,
            landmarkCount: handLandmarkFrame.landmarks.length,
          }
        : null,
      hands:
        multiHandLandmarkFrame?.hands.map((hand) => ({
          frameId: hand.frameId,
          capturedAt: hand.capturedAt,
          trackId: hand.trackId,
          role: handRoles[hand.trackId] ?? "unassigned",
          handedness: hand.handedness,
          confidence: hand.confidence,
          trackingConfidence: hand.trackingConfidence,
          sequence: hand.sequence,
          landmarkCount: hand.landmarks.length,
        })) ?? [],
      handRoles,
      split: creatureSplitState,
      ordinaryPinch: ordinaryPinchState,
      controlPinch: controlPinchState,
      cameraShutdown: cameraShutdownState,
      cameraReframing,
      intentArbiter: gestureIntentArbiter,
      pinch: pinchClassification,
      openPalm: openPalmClassification,
      pointPose: pointPoseClassification,
      pointer: gesturePointer,
      wristRollPose: wristRollPoseClassification,
      wristRollLock,
      lockRequest,
      unlockRequest,
      pointerDisplay: display,
      pointerCalibration: adaptiveSettings.pointerCalibration,
      adaptiveSettings,
      smoothedGesture,
      visualAnchor: gestureVisualAnchor,
      trace: gestureDiagnosticTrace,
      updatedAt:
        multiHandLandmarkFrame?.capturedAt ?? new Date().toISOString(),
    }),
    [
      cameraDevices,
      cameraError,
      cameraPermission,
      cameraProbeError,
      cameraProbeStatus,
      cameraStatus,
      gestureVisualAnchor,
      gestureDiagnosticTrace,
      gesturePointer,
      wristRollPoseClassification,
      wristRollLock,
      creatureSplitState,
      ordinaryPinchState,
      controlPinchState,
      cameraShutdownState,
      cameraReframing,
      gestureIntentArbiter,
      handRoles,
      lockRequest,
      unlockRequest,
      handLandmarkFrame,
      multiHandLandmarkFrame,
      handLandmarkerError,
      handLandmarkerStatus,
      openPalmClassification,
      pinchClassification,
      pointPoseClassification,
      display,
      adaptiveSettings,
      smoothedGesture,
    ],
  );

  return {
    camera,
    classification: smoothedGesture,
    pointer: gesturePointer,
    splitVisual: creatureSplitVisual,
    ordinaryPinch: ordinaryPinchState,
    controlPinch: controlPinchState,
    cameraShutdown: cameraShutdownState,
    cameraReframing,
    wristRollLock,
    lockRequest,
    unlockRequest,
    visualAnchor: gestureVisualAnchor,
    diagnostics,
  };
}

function sameCameraShutdownGestureState(
  left: CameraShutdownGestureState,
  right: CameraShutdownGestureState,
): boolean {
  return (
    left.phase === right.phase &&
    left.candidateSinceMs === right.candidateSinceMs &&
    left.lastBothFistsAtMs === right.lastBothFistsAtMs &&
    left.releasedSinceMs === right.releasedSinceMs &&
    left.holdMs === right.holdMs &&
    left.eventSequence === right.eventSequence &&
    left.handTrackIds?.[0] === right.handTrackIds?.[0] &&
    left.handTrackIds?.[1] === right.handTrackIds?.[1] &&
    left.lastEvent?.id === right.lastEvent?.id
  );
}

function sameControlPinchState(
  left: ControlPinchState,
  right: ControlPinchState,
): boolean {
  return (
    left.phase === right.phase &&
    left.controlHandTrackId === right.controlHandTrackId &&
    left.candidateSinceMs === right.candidateSinceMs &&
    left.missingSinceMs === right.missingSinceMs &&
    left.lastSeenAtMs === right.lastSeenAtMs &&
    left.normalizedDistance === right.normalizedDistance &&
    left.pressThreshold === right.pressThreshold &&
    left.releaseThreshold === right.releaseThreshold &&
    left.eventSequence === right.eventSequence &&
    left.lastEvent?.id === right.lastEvent?.id
  );
}

function sameWristRollLockState(
  left: WristRollLockState,
  right: WristRollLockState,
): boolean {
  return (
    left.phase === right.phase &&
    left.roll?.id === right.roll?.id &&
    left.rotationDegrees === right.rotationDegrees &&
    left.holdUntil === right.holdUntil
  );
}

function isSameGesturePointer(
  left: GesturePointerSample | null,
  right: GesturePointerSample | null,
): boolean {
  if (left == null || right == null) {
    return left === right;
  }

  return (
    left.phase === right.phase &&
    left.handTrackId === right.handTrackId &&
    left.display.displayId === right.display.displayId &&
    left.sourceFrameId === right.sourceFrameId &&
    Math.abs(left.display.x - right.display.x) < 0.5 &&
    Math.abs(left.display.y - right.display.y) < 0.5 &&
    Math.abs(left.confidence - right.confidence) < 0.01
  );
}

function sameGestureClassification(
  left: GestureClassification,
  right: GestureClassification,
): boolean {
  return (
    left.label === right.label &&
    left.phase === right.phase &&
    Math.abs(left.confidence - right.confidence) < 0.01 &&
    Math.abs(left.holdMs - right.holdMs) < 50 &&
    Math.abs(left.cooldownRemainingMs - right.cooldownRemainingMs) < 50
  );
}

function appendPinchIntentCandidate({
  candidates,
  intent,
  previousState,
  rawClassification,
  rawTrackId,
  eligible,
}: {
  candidates: GestureIntentCandidate[];
  intent: "ordinary_pinch" | "control_pinch";
  previousState: ControlPinchState;
  rawClassification: PinchClassification;
  rawTrackId: string | null;
  eligible: boolean;
}): void {
  if (
    previousState.phase !== "idle" &&
    previousState.controlHandTrackId != null
  ) {
    candidates.push({
      intent,
      trackId: previousState.controlHandTrackId,
      confidence: rawClassification.confidence,
      lifecycle: "active",
      sourceFrameId: rawClassification.sourceFrameId,
    });
    return;
  }

  if (
    eligible &&
    rawTrackId != null &&
    rawClassification.label === "pinch"
  ) {
    candidates.push({
      intent,
      trackId: rawTrackId,
      confidence: rawClassification.confidence,
      lifecycle: "candidate",
      sourceFrameId: rawClassification.sourceFrameId,
    });
  }
}

function appendWristRollIntentCandidate(
  candidates: GestureIntentCandidate[],
  state: WristRollLockControllerState,
): void {
  if (
    state.lock.phase !== "rolling" &&
    state.lock.phase !== "locked" &&
    state.lock.phase !== "unlocking" &&
    state.pendingRoll == null &&
    state.pendingUntwist == null
  ) {
    return;
  }

  const trackId =
    state.pendingRoll?.handTrackId ??
    state.pendingUntwist?.handTrackId ??
    state.lock.roll?.handTrackId ??
    state.baseline?.handTrackId ??
    null;
  if (trackId == null) {
    return;
  }

  candidates.push({
    intent: "wrist_roll",
    trackId,
    confidence:
      state.pendingRoll?.confidence ??
      state.pendingUntwist?.confidence ??
      state.lock.roll?.confidence ??
      1,
    lifecycle: "active",
    sourceFrameId:
      state.pendingRoll?.sourceFrameIds[
        state.pendingRoll.sourceFrameIds.length - 1
      ] ??
      state.pendingUntwist?.sourceFrameIds[
        state.pendingUntwist.sourceFrameIds.length - 1
      ] ??
      state.lock.roll?.sourceFrameIds[
        state.lock.roll.sourceFrameIds.length - 1
      ],
  });
}

function appendCameraShutdownIntentCandidates(
  candidates: GestureIntentCandidate[],
  state: CameraShutdownGestureState,
): void {
  if (
    (state.phase !== "holding" && state.phase !== "recognized") ||
    state.handTrackIds == null
  ) {
    return;
  }

  for (const trackId of state.handTrackIds) {
    candidates.push({
      intent: "camera_shutdown",
      trackId,
      confidence: 1,
      lifecycle: "active",
    });
  }
}

function createSelectedGestureCandidate({
  arbitration,
  pointerHandTrackId,
  rawPinch,
  rawOpenPalm,
  sourceFrameId,
}: {
  arbitration: GestureIntentArbiterSnapshot;
  pointerHandTrackId: string | null;
  rawPinch: PinchClassification;
  rawOpenPalm: OpenPalmClassification;
  sourceFrameId: number;
}): Pick<
  GestureClassification,
  "label" | "confidence" | "sourceFrameId"
> {
  if (
    isGestureIntentSelected(
      arbitration,
      "ordinary_pinch",
      pointerHandTrackId,
    )
  ) {
    const selected = arbitration.selected.find(
      (candidate) =>
        candidate.trackId === pointerHandTrackId &&
        candidate.intent === "ordinary_pinch",
    );
    return {
      label: "pinch",
      confidence: Math.max(rawPinch.confidence, selected?.confidence ?? 0),
      sourceFrameId: rawPinch.sourceFrameId ?? selected?.sourceFrameId,
    };
  }

  if (
    rawOpenPalm.label === "open_palm" &&
    isGestureIntentSelected(arbitration, "open_palm", pointerHandTrackId)
  ) {
    return rawOpenPalm;
  }

  return {
    label: "none",
    confidence: 0,
    sourceFrameId,
  };
}

function sameGestureIntentArbiterSnapshot(
  left: GestureIntentArbiterSnapshot,
  right: GestureIntentArbiterSnapshot,
): boolean {
  return (
    ownerSignature(left) === ownerSignature(right) &&
    selectedSignature(left) === selectedSignature(right) &&
    suppressionSignature(left) === suppressionSignature(right)
  );
}

function ownerSignature(snapshot: GestureIntentArbiterSnapshot): string {
  return snapshot.owners
    .map(
      (owner) =>
        `${owner.trackId}:${owner.intent}:${owner.lifecycle}`,
    )
    .join("|");
}

function selectedSignature(snapshot: GestureIntentArbiterSnapshot): string {
  return snapshot.selected
    .map(
      (candidate) =>
        `${candidate.trackId}:${candidate.intent}:${candidate.lifecycle ?? "candidate"}`,
    )
    .join("|");
}

function suppressionSignature(snapshot: GestureIntentArbiterSnapshot): string {
  return snapshot.suppressed
    .map(
      (suppression) =>
        `${suppression.trackId}:${suppression.intent}:${suppression.reason}:${suppression.winner}`,
    )
    .join("|");
}
