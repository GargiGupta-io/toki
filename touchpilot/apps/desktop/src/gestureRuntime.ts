import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CameraDeviceSummary,
  CameraPermissionState,
  CameraRuntimeState,
  CameraStreamStatus,
  GestureActionEvent,
  GestureClassification,
  GestureThresholds,
  HandLandmarkFrame,
} from "@toki/shared";
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
  detectHandLandmarksForVideo,
  getHandLandmarker,
  handLandmarkerAssetMode,
} from "./handLandmarker";

export type GestureRuntimeOwner = "overlay";
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
  handedness: HandLandmarkFrame["handedness"];
  confidence: number;
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
  hand: HandLandmarkSummary | null;
  pinch: PinchClassification;
  openPalm: OpenPalmClassification;
  smoothedGesture: GestureClassification;
  visualAnchor: GestureVisualAnchor | null;
  updatedAt: string;
};

export type AlwaysOnGestureRuntime = {
  camera: CameraRuntimeState;
  classification: GestureClassification;
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

  if (classification.label === "pinch") {
    return {
      type: "activate_assistant",
      gesture: "pinch",
      confidence: classification.confidence,
      firedAt,
      sourceFrameId: classification.sourceFrameId,
    };
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
    hand: null,
    pinch: classifyPinchGesture(null, thresholds),
    openPalm: classifyOpenPalmGesture(null, thresholds),
    smoothedGesture: createInactiveGestureClassification(),
    visualAnchor: null,
    updatedAt: now,
  };
}

export function useAlwaysOnGestureRuntime({
  cameraEnabled,
  gesturesEnabled,
  thresholds,
  deviceRefreshToken,
}: {
  cameraEnabled: boolean;
  gesturesEnabled: boolean;
  thresholds: GestureThresholds;
  deviceRefreshToken: number;
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
  const [handLandmarkerStatus, setHandLandmarkerStatus] =
    useState<HandLandmarkerStatus>("idle");
  const [handLandmarkerError, setHandLandmarkerError] = useState<string | null>(null);
  const [handLandmarkFrame, setHandLandmarkFrame] =
    useState<HandLandmarkFrame | null>(null);
  const [smoothedGesture, setSmoothedGesture] = useState<GestureClassification>(
    createInactiveGestureClassification,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handFrameIdRef = useRef(0);
  const gestureSmoothingStateRef = useRef(initialGestureSmoothingState);

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
      setHandLandmarkFrame(null);
      setHandLandmarkerStatus("idle");
      setHandLandmarkerError(null);
      gestureSmoothingStateRef.current = initialGestureSmoothingState;
      setSmoothedGesture(createInactiveGestureClassification());
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
        await video.play().catch(() => undefined);
        setCameraStatus("active");
        setCameraPermission("granted");
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
  }, [cameraEnabled]);

  useEffect(() => {
    if (cameraStatus !== "active" || !gesturesEnabled) {
      setHandLandmarkerStatus("idle");
      setHandLandmarkFrame(null);
      setHandLandmarkerError(null);
      return;
    }

    let cancelled = false;
    let animationFrame = 0;
    let lastDetectionAt = 0;
    const detectionIntervalMs = 1_000 / 15;

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
              const frame = detectHandLandmarksForVideo(
                landmarker,
                video,
                handFrameIdRef.current + 1,
              );
              handFrameIdRef.current += 1;

              if (frame) {
                setHandLandmarkFrame(frame);
                setHandLandmarkerStatus("running");
              } else {
                setHandLandmarkFrame(null);
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
  }, [cameraStatus, gesturesEnabled]);

  const pinchClassification = useMemo(
    () => classifyPinchGesture(handLandmarkFrame, thresholds),
    [handLandmarkFrame, thresholds],
  );
  const openPalmClassification = useMemo(
    () => classifyOpenPalmGesture(handLandmarkFrame, thresholds),
    [handLandmarkFrame, thresholds],
  );
  const rawGestureCandidate =
    openPalmClassification.label !== "none" &&
    openPalmClassification.confidence >= pinchClassification.confidence
      ? openPalmClassification
      : pinchClassification;

  useEffect(() => {
    if (!gesturesEnabled) {
      gestureSmoothingStateRef.current = initialGestureSmoothingState;
      setSmoothedGesture(createInactiveGestureClassification());
      return;
    }

    const result = smoothGestureCandidate(
      gestureSmoothingStateRef.current,
      rawGestureCandidate,
      thresholds,
      performance.now(),
    );
    gestureSmoothingStateRef.current = result.state;
    setSmoothedGesture((current) =>
      sameGestureClassification(current, result.classification)
        ? current
        : result.classification,
    );
  }, [
    gesturesEnabled,
    rawGestureCandidate.label,
    rawGestureCandidate.confidence,
    rawGestureCandidate.sourceFrameId,
    thresholds,
  ]);

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
      hand: handLandmarkFrame
        ? {
            frameId: handLandmarkFrame.frameId,
            capturedAt: handLandmarkFrame.capturedAt,
            handedness: handLandmarkFrame.handedness,
            confidence: handLandmarkFrame.confidence,
            landmarkCount: handLandmarkFrame.landmarks.length,
          }
        : null,
      pinch: pinchClassification,
      openPalm: openPalmClassification,
      smoothedGesture,
      visualAnchor: gestureVisualAnchor,
      updatedAt: handLandmarkFrame?.capturedAt ?? new Date().toISOString(),
    }),
    [
      cameraDevices,
      cameraError,
      cameraPermission,
      cameraProbeError,
      cameraProbeStatus,
      cameraStatus,
      gestureVisualAnchor,
      handLandmarkFrame,
      handLandmarkerError,
      handLandmarkerStatus,
      openPalmClassification,
      pinchClassification,
      smoothedGesture,
    ],
  );

  return {
    camera,
    classification: smoothedGesture,
    visualAnchor: gestureVisualAnchor,
    diagnostics,
  };
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
