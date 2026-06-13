import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import {
  createInvalidMockGuidance,
  createMockGuidance,
  createRiskyMockGuidance,
  validateGuidanceResult,
} from "@touchpilot/ai";
import type {
  CameraDeviceSummary,
  CameraPermissionState,
  CameraStreamStatus,
  CaptureMetadata,
  CoordinateCalibration,
  GuidanceRequest,
  GuidanceResult,
  GuidanceStep,
  GuidanceValidationIssue,
  GestureActionEvent,
  GestureClassification,
  GestureRuntimeState,
  HandLandmarkFrame,
  ScreenshotCapture,
  ScreenshotMetadata,
  TargetBox,
} from "@touchpilot/shared";
import { probeCameraDevices } from "./cameraDevices";
import { classifyOpenPalmGesture, classifyPinchGesture } from "./gestureClassifier";
import {
  initialGestureSmoothingState,
  smoothGestureCandidate,
} from "./gestureSmoothing";
import { detectHandLandmarksForVideo, getHandLandmarker } from "./handLandmarker";
import {
  getPointerShadowPosition,
  getPuckTargetVector,
} from "./overlayGeometry";
import type {
  PointerShadowPosition,
  PuckTargetVector,
  ViewportMetrics,
} from "./overlayGeometry";
import { getPuckMotionModel } from "./puckMotion";
import type { OverlayState, PuckMotionModel } from "./puckMotion";
import "./App.css";

type GuidanceFixture = "safe" | "risky" | "invalid";

type OverlayStateMeta = {
  label: string;
  title: string;
  description: string;
  tone: "neutral" | "active" | "paused" | "error";
};

type OverlaySnapshot = {
  overlayState: OverlayState;
  hasAcceptedGuidance: boolean;
  isRefreshingCapture: boolean;
  gestureRuntime: GestureRuntimeState;
};

type DebugSnapshot = OverlaySnapshot & {
  guidanceFixture: GuidanceFixture;
  captureMetadata: CaptureMetadata | null;
  screenshotCapture: ScreenshotCapture | null;
  guidanceRequest: GuidanceRequest | null;
  guidanceResult: GuidanceResult | null;
  guidanceIssues: GuidanceValidationIssue[];
  captureError: string | null;
  viewport: ViewportMetrics;
  calibration: CoordinateCalibration;
};

type OverlayCommand =
  | { type: "refresh-capture" }
  | { type: "toggle-pause" }
  | { type: "request-state" }
  | { type: "set-state"; state: OverlayState }
  | { type: "set-guidance-fixture"; fixture: GuidanceFixture }
  | { type: "set-camera-enabled"; enabled: boolean }
  | {
      type: "set-camera-preview-status";
      status: CameraStreamStatus;
      permission: CameraPermissionState;
      error?: string;
    }
  | { type: "set-gesture-classification"; classification: GestureClassification }
  | { type: "set-gestures-enabled"; enabled: boolean };

const overlayWindow = getCurrentWindow();
const currentWindowLabel = overlayWindow.label;

const testTarget = {
  label: "Export",
  x: 640,
  y: 360,
  width: 112,
  height: 48,
  instruction: "Click Export to continue this workflow.",
};

type RenderedGuidanceTarget = TargetBox & {
  instruction: string;
};

const stateMeta: Record<OverlayState, OverlayStateMeta> = {
  idle: {
    label: "Idle",
    title: "Ready to guide the current screen.",
    description:
      "The assistant is waiting for a prompt, voice command, or gesture trigger.",
    tone: "neutral",
  },
  listening: {
    label: "Listening",
    title: "Listening for the user's goal.",
    description: "Voice and gesture controls will connect to this state later.",
    tone: "active",
  },
  thinking: {
    label: "Thinking",
    title: "Reading the screen context.",
    description: "AI guidance will use this state while analyzing screenshots.",
    tone: "active",
  },
  guiding: {
    label: "Guiding",
    title: "Showing the next step.",
    description: "Pointer and step bubble guidance will connect to this state.",
    tone: "active",
  },
  paused: {
    label: "Paused",
    title: "Guidance is paused.",
    description: "The overlay stays visible, but active guidance is suspended.",
    tone: "paused",
  },
  error: {
    label: "Error",
    title: "The overlay needs attention.",
    description: "Errors will appear here when capture or guidance fails.",
    tone: "error",
  },
};

const debugOverlayStates: OverlayState[] = [
  "idle",
  "listening",
  "thinking",
  "guiding",
  "paused",
  "error",
];

const debugGuidanceFixtures: Array<{
  fixture: GuidanceFixture;
  label: string;
}> = [
  { fixture: "safe", label: "Safe" },
  { fixture: "risky", label: "Risky" },
  { fixture: "invalid", label: "Invalid" },
];

function AssistantPuck({
  state,
  motion,
  pointerShadow,
  targetVector,
}: {
  state: OverlayState;
  motion: PuckMotionModel;
  pointerShadow: PointerShadowPosition | null;
  targetVector: PuckTargetVector | null;
}) {
  const meta = stateMeta[state];
  const puckStyle = {
    ...(pointerShadow == null
      ? {}
      : {
          "--puck-shadow-x": `${pointerShadow.x}px`,
          "--puck-shadow-y": `${pointerShadow.y}px`,
        }),
    ...(targetVector == null
      ? {}
      : {
          "--puck-target-x": `${targetVector.x}px`,
          "--puck-target-y": `${targetVector.y}px`,
        }),
  } as CSSProperties;

  return (
    <div
      className={`assistant-puck is-${meta.tone}`}
      data-motion={motion.state}
      data-pointer-shadow={motion.state === "shadow" && pointerShadow ? "active" : "idle"}
      data-target-droplets={motion.canSendTargetDroplets ? "enabled" : "disabled"}
      style={puckStyle}
      aria-label={`TouchPilot is ${meta.label.toLowerCase()}`}
    >
      <span className="puck-orbit" aria-hidden="true" />
      <span className="puck-droplets" aria-hidden="true">
        <span className="puck-droplet puck-droplet-a" />
        <span className="puck-droplet puck-droplet-b" />
        <span className="puck-droplet puck-droplet-c" />
        <span className="puck-droplet puck-droplet-d" />
      </span>
      <span className="puck-core" aria-hidden="true">
        <span className="puck-shadow-form" />
        <span className="puck-shadow-tail" />
      </span>
    </div>
  );
}

function PointerRing({ target }: { target: TargetBox }) {
  return (
    <div
      className="pointer-target"
      style={{
        left: target.x,
        top: target.y,
        width: target.width,
        height: target.height,
      }}
      aria-label={`Target marker for ${target.label}`}
    >
      <span className="pointer-pulse" aria-hidden="true" />
      <span className="pointer-crosshair" aria-hidden="true" />
    </div>
  );
}

function StepBubble({
  step,
  target,
}: {
  step: GuidanceStep | null;
  target: RenderedGuidanceTarget;
}) {
  return (
    <aside
      className="step-bubble"
      style={{
        left: target.x + target.width / 2 + 22,
        top: target.y - target.height / 2,
      }}
      aria-label={`Guidance step for ${target.label}`}
    >
      <span className="bubble-anchor" aria-hidden="true" />
      <span className="step-cue-label">{target.label}</span>
      <span className="step-cue-text">{step?.instruction ?? target.instruction}</span>
    </aside>
  );
}

function SettingsPopup({
  overlayState,
  hasAcceptedGuidance,
  isRefreshingCapture,
  gestureRuntime,
  onRefreshCapture,
  onPauseToggle,
  onCameraToggle,
  onGesturesToggle,
  onClose,
}: {
  overlayState: OverlayState;
  hasAcceptedGuidance: boolean;
  isRefreshingCapture: boolean;
  gestureRuntime: GestureRuntimeState;
  onRefreshCapture: () => void;
  onPauseToggle: () => void;
  onCameraToggle: (enabled: boolean) => void;
  onGesturesToggle: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const isPaused = overlayState === "paused";
  const cameraEnabled = gestureRuntime.camera.enabled;
  const gesturesEnabled = gestureRuntime.enabled;

  return (
    <section className="settings-popup" aria-label="TouchPilot settings">
      <div className="settings-popup-header">
        <div>
          <p className="settings-popup-brand">TouchPilot</p>
          <h2>{isPaused ? "Paused" : "Active"}</h2>
        </div>
        <button
          className="settings-close-button"
          type="button"
          onClick={onClose}
          aria-label="Close settings"
        >
          x
        </button>
      </div>

      <div className="settings-chip-row" aria-label="Current runtime status">
        <span className="settings-chip">{stateMeta[overlayState].label}</span>
        <span className="settings-chip settings-chip-muted">
          {hasAcceptedGuidance ? "Target locked" : "Waiting"}
        </span>
      </div>

      <div className="settings-copy">
        <p className="settings-headline">Cursor assistant</p>
      </div>

      <div className="settings-toggle-list" aria-label="Gesture settings">
        <label className="settings-toggle-row">
          <span>
            <strong>Camera</strong>
            <small>{cameraEnabled ? "Ready for gesture setup" : "Off"}</small>
          </span>
          <input
            type="checkbox"
            checked={cameraEnabled}
            onChange={(event) => {
              onCameraToggle(event.currentTarget.checked);
            }}
          />
        </label>
        <label className="settings-toggle-row">
          <span>
            <strong>Gestures</strong>
            <small>{gesturesEnabled ? "Pinch/open palm enabled" : "Disabled"}</small>
          </span>
          <input
            type="checkbox"
            checked={gesturesEnabled}
            disabled={!cameraEnabled}
            onChange={(event) => {
              onGesturesToggle(event.currentTarget.checked);
            }}
          />
        </label>
      </div>

      <div className="settings-actions" aria-label="Settings actions">
        <button
          className="settings-action-button settings-action-button-primary"
          type="button"
          onClick={onRefreshCapture}
          disabled={isRefreshingCapture}
        >
          {isRefreshingCapture ? "Refreshing" : "Refresh screen"}
        </button>
        <button
          className="settings-action-button"
          type="button"
          onClick={onPauseToggle}
        >
          {isPaused ? "Resume" : "Pause"}
        </button>
      </div>
    </section>
  );
}

function getViewportMetrics(): ViewportMetrics {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    updatedAt: new Date().toISOString(),
  };
}

function getCalibration(
  captureMetadata: CaptureMetadata | null,
  viewport: ViewportMetrics,
): CoordinateCalibration {
  const overlayWidth = viewport.width;
  const overlayHeight = viewport.height;
  const displayWidth = captureMetadata?.display.width ?? 0;
  const displayHeight = captureMetadata?.display.height ?? 0;
  const scaleFactor = captureMetadata?.display.scaleFactor ?? 1;

  if (!captureMetadata) {
    return {
      status: "unknown",
      overlayWidth,
      overlayHeight,
      displayWidth,
      displayHeight,
      scaleFactor,
      notes: "Waiting for capture metadata.",
    };
  }

  const sizeMatches = overlayWidth === displayWidth && overlayHeight === displayHeight;
  const scaleMatches = Math.abs(viewport.devicePixelRatio - scaleFactor) < 0.01;

  return {
    status: sizeMatches && scaleMatches ? "aligned" : "needs_check",
    overlayWidth,
    overlayHeight,
    displayWidth,
    displayHeight,
    scaleFactor,
    checkedAt: new Date().toISOString(),
    notes:
      sizeMatches && scaleMatches
        ? "Overlay viewport matches captured display dimensions and scale."
        : `Overlay/display mismatch. Delta ${overlayWidth - displayWidth}, ${
            overlayHeight - displayHeight
          }; DPR ${viewport.devicePixelRatio} vs capture scale ${scaleFactor}.`,
  };
}

function getScreenshotMetadata(screenshot: ScreenshotCapture): ScreenshotMetadata {
  return {
    source: screenshot.source,
    display: screenshot.display,
    cursor: screenshot.cursor,
    activeWindow: screenshot.activeWindow,
    capturedAt: screenshot.capturedAt,
    format: screenshot.format,
    byteLength: screenshot.byteLength,
    imageWidth: screenshot.imageWidth,
    imageHeight: screenshot.imageHeight,
  };
}

function createDefaultGestureRuntimeState(): GestureRuntimeState {
  return {
    enabled: false,
    camera: {
      enabled: false,
      permission: "unknown",
      status: "idle",
      devices: [],
    },
    thresholds: {
      minDetectionConfidence: 0.6,
      pinchHoldMs: 180,
      openPalmHoldMs: 220,
      cooldownMs: 700,
      maxHands: 1,
    },
    currentGesture: {
      label: "none",
      phase: "inactive",
      confidence: 0,
      holdMs: 0,
      cooldownRemainingMs: 0,
    },
  };
}

function createInactiveGestureClassification(): GestureClassification {
  return createDefaultGestureRuntimeState().currentGesture;
}

function createEmptyDebugSnapshot(): DebugSnapshot {
  const viewport = getViewportMetrics();

  return {
    overlayState: "idle",
    hasAcceptedGuidance: false,
    isRefreshingCapture: false,
    gestureRuntime: createDefaultGestureRuntimeState(),
    guidanceFixture: "safe",
    captureMetadata: null,
    screenshotCapture: null,
    guidanceRequest: null,
    guidanceResult: null,
    guidanceIssues: [],
    captureError: null,
    viewport,
    calibration: getCalibration(null, viewport),
  };
}

function OverlayWindowApp() {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [guidanceFixture, setGuidanceFixture] = useState<GuidanceFixture>("safe");
  const [captureMetadata, setCaptureMetadata] = useState<CaptureMetadata | null>(null);
  const [screenshotCapture, setScreenshotCapture] = useState<ScreenshotCapture | null>(null);
  const [guidanceRequest, setGuidanceRequest] = useState<GuidanceRequest | null>(null);
  const [guidanceResult, setGuidanceResult] = useState<GuidanceResult | null>(null);
  const [guidanceIssues, setGuidanceIssues] = useState<GuidanceValidationIssue[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);
  const [gestureRuntime, setGestureRuntime] = useState<GestureRuntimeState>(() =>
    createDefaultGestureRuntimeState(),
  );
  const [viewport, setViewport] = useState<ViewportMetrics>(() => getViewportMetrics());
  const [pointerShadow, setPointerShadow] = useState<PointerShadowPosition | null>(null);

  const activeStep = guidanceResult?.step ?? null;
  const acceptedStep = activeStep?.target != null ? activeStep : null;
  const acceptedTarget = acceptedStep?.target ?? null;
  const hasAcceptedGuidance = acceptedTarget != null;
  const activeTarget: RenderedGuidanceTarget =
    acceptedTarget != null && acceptedStep != null
      ? {
          ...acceptedTarget,
          instruction: acceptedStep.instruction,
        }
      : testTarget;
  const puckMotion = getPuckMotionModel({
    overlayState,
    hasAcceptedGuidance,
    hasActiveTarget: acceptedTarget != null,
    isRefreshingCapture,
    hasCaptureError: captureError != null,
    guidanceIssueCount: guidanceIssues.length,
  });
  const puckTargetVector =
    puckMotion.canSendTargetDroplets && acceptedTarget != null
      ? getPuckTargetVector(acceptedTarget, viewport)
      : null;
  const calibration = useMemo(
    () => getCalibration(captureMetadata, viewport),
    [captureMetadata, viewport],
  );

  const overlaySnapshot = useMemo<OverlaySnapshot>(
    () => ({
      overlayState,
      hasAcceptedGuidance,
      isRefreshingCapture,
      gestureRuntime,
    }),
    [overlayState, hasAcceptedGuidance, isRefreshingCapture, gestureRuntime],
  );

  const debugSnapshot = useMemo<DebugSnapshot>(
    () => ({
      ...overlaySnapshot,
      guidanceFixture,
      captureMetadata,
      screenshotCapture,
      guidanceRequest,
      guidanceResult,
      guidanceIssues,
      captureError,
      viewport,
      calibration,
    }),
    [
      overlaySnapshot,
      guidanceFixture,
      captureMetadata,
      screenshotCapture,
      guidanceRequest,
      guidanceResult,
      guidanceIssues,
      captureError,
      viewport,
      calibration,
    ],
  );

  async function publishRuntimeSnapshots() {
    await emitTo("settings", "touchpilot://overlay-state", overlaySnapshot).catch(
      () => undefined,
    );
    await emitTo("debug", "touchpilot://debug-state", debugSnapshot).catch(
      () => undefined,
    );
  }

  async function refreshCaptureMetadata() {
    setIsRefreshingCapture(true);
    setCaptureError(null);
    setGuidanceIssues([]);
    setGuidanceRequest(null);
    setGuidanceResult(null);
    setCaptureMetadata(null);
    setScreenshotCapture(null);
    setOverlayState("thinking");

    try {
      const [metadata, screenshot] = await Promise.all([
        invoke<CaptureMetadata>("capture_metadata"),
        invoke<ScreenshotCapture>("capture_screenshot"),
      ]);

      setCaptureMetadata(metadata);
      setScreenshotCapture(screenshot);
      const nextGuidanceRequest: GuidanceRequest = {
        goal: "Show me what to click next.",
        screen: {
          display: metadata.display,
          capture: metadata,
          screenshot: getScreenshotMetadata(screenshot),
          calibration: getCalibration(metadata, viewport),
        },
        previousStep: guidanceResult?.step ?? null,
      };
      const nextGuidance =
        guidanceFixture === "invalid"
          ? createInvalidMockGuidance(nextGuidanceRequest)
          : guidanceFixture === "risky"
            ? createRiskyMockGuidance(nextGuidanceRequest)
            : createMockGuidance(nextGuidanceRequest);
      const validation = validateGuidanceResult(nextGuidance);

      setGuidanceRequest(nextGuidanceRequest);
      setGuidanceIssues(validation.issues);
      setGuidanceResult(validation.valid ? nextGuidance : null);
      setOverlayState(validation.valid ? "guiding" : "error");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCaptureError(message);
      setGuidanceRequest(null);
      setGuidanceIssues([]);
      setGuidanceResult(null);
      setOverlayState("error");
    } finally {
      setIsRefreshingCapture(false);
    }
  }

  useEffect(() => {
    overlayWindow.setIgnoreCursorEvents(true).catch(() => undefined);
    overlayWindow.setFocusable(false).catch(() => undefined);
  }, []);

  useEffect(() => {
    function handleResize() {
      setViewport(getViewportMetrics());
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function syncCursorShadow() {
      try {
        const position = await cursorPosition();

        if (!disposed) {
          setPointerShadow(getPointerShadowPosition(position.x, position.y, viewport));
        }
      } catch {
        return;
      }
    }

    void syncCursorShadow();
    const timer = window.setInterval(() => {
      void syncCursorShadow();
    }, 32);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [viewport]);

  useEffect(() => {
    void publishRuntimeSnapshots();
  }, [overlaySnapshot, debugSnapshot]);

  useEffect(() => {
    let unlistenCommand: (() => void) | undefined;

    listen<OverlayCommand>("touchpilot://overlay-command", async (event) => {
      if (event.payload.type === "refresh-capture") {
        await refreshCaptureMetadata();
        return;
      }

      if (event.payload.type === "toggle-pause") {
        setOverlayState((currentState) =>
          currentState === "paused" ? "guiding" : "paused",
        );
        return;
      }

      if (event.payload.type === "request-state") {
        await publishRuntimeSnapshots();
      }

      if (event.payload.type === "set-state") {
        setOverlayState(event.payload.state);
        return;
      }

      if (event.payload.type === "set-guidance-fixture") {
        setGuidanceFixture(event.payload.fixture);
        return;
      }

      if (event.payload.type === "set-camera-enabled") {
        const enabled = event.payload.enabled;

        setGestureRuntime((currentState) => ({
          ...currentState,
          enabled: enabled ? currentState.enabled : false,
          currentGesture: enabled
            ? currentState.currentGesture
            : createInactiveGestureClassification(),
          camera: {
            ...currentState.camera,
            enabled,
            status: enabled ? "idle" : "disabled",
            permission: enabled ? currentState.camera.permission : "unknown",
            error: undefined,
          },
        }));
        return;
      }

      if (event.payload.type === "set-camera-preview-status") {
        const { status, permission, error } = event.payload;

        setGestureRuntime((currentState) => ({
          ...currentState,
          enabled:
            status === "active" || status === "requesting_permission"
              ? currentState.enabled
              : false,
          currentGesture:
            status === "active" || status === "requesting_permission"
              ? currentState.currentGesture
              : createInactiveGestureClassification(),
          camera: {
            ...currentState.camera,
            permission,
            status,
            error,
          },
        }));
        return;
      }

      if (event.payload.type === "set-gesture-classification") {
        const { classification } = event.payload;
        let gestureAction: GestureActionEvent | undefined;

        if (classification.phase === "recognized" && classification.label === "pinch") {
          gestureAction = {
            type: "activate_assistant",
            gesture: "pinch",
            confidence: classification.confidence,
            firedAt: new Date().toISOString(),
            sourceFrameId: classification.sourceFrameId,
          };
          setOverlayState("listening");
        }

        if (
          classification.phase === "recognized" &&
          classification.label === "open_palm"
        ) {
          gestureAction = {
            type: "pause_assistant",
            gesture: "open_palm",
            confidence: classification.confidence,
            firedAt: new Date().toISOString(),
            sourceFrameId: classification.sourceFrameId,
          };
          setOverlayState("paused");
        }

        setGestureRuntime((currentState) => ({
          ...currentState,
          currentGesture: classification,
          lastAction: gestureAction ?? currentState.lastAction,
        }));
        return;
      }

      if (event.payload.type === "set-gestures-enabled") {
        const enabled = event.payload.enabled;

        setGestureRuntime((currentState) => ({
          ...currentState,
          enabled,
          currentGesture: enabled
            ? currentState.currentGesture
            : {
                label: "none",
                phase: "inactive",
                confidence: 0,
                holdMs: 0,
                cooldownRemainingMs: 0,
              },
        }));
        return;
      }
    })
      .then((cleanup) => {
        unlistenCommand = cleanup;
      })
      .catch(() => {
        unlistenCommand = undefined;
      });

    return () => {
      unlistenCommand?.();
    };
  }, [overlaySnapshot, debugSnapshot, viewport, guidanceResult]);

  return (
    <main
      className={`overlay-shell is-${stateMeta[overlayState].tone}`}
      aria-label="TouchPilot overlay"
    >
      {overlayState !== "idle" && hasAcceptedGuidance && (
        <>
          <PointerRing target={activeTarget} />
          <StepBubble step={activeStep} target={activeTarget} />
        </>
      )}
      <AssistantPuck
        state={overlayState}
        motion={puckMotion}
        pointerShadow={pointerShadow}
        targetVector={puckTargetVector}
      />
    </main>
  );
}

function SettingsWindowApp() {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [hasAcceptedGuidance, setHasAcceptedGuidance] = useState(false);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);
  const [gestureRuntime, setGestureRuntime] = useState<GestureRuntimeState>(() =>
    createDefaultGestureRuntimeState(),
  );

  function hideSettings() {
    overlayWindow.hide().catch(() => undefined);
  }

  useEffect(() => {
    let unlistenState: (() => void) | undefined;

    listen<OverlaySnapshot>("touchpilot://overlay-state", (event) => {
      setOverlayState(event.payload.overlayState);
      setHasAcceptedGuidance(event.payload.hasAcceptedGuidance);
      setIsRefreshingCapture(event.payload.isRefreshingCapture);
      setGestureRuntime(event.payload.gestureRuntime);
    })
      .then((cleanup) => {
        unlistenState = cleanup;
      })
      .catch(() => {
        unlistenState = undefined;
      });

    emitTo("overlay", "touchpilot://overlay-command", {
      type: "request-state",
    } satisfies OverlayCommand).catch(() => undefined);

    return () => {
      unlistenState?.();
    };
  }, []);

  useEffect(() => {
    let unlistenFocus: (() => void) | undefined;

    overlayWindow
      .onFocusChanged((event) => {
        if (!event.payload) {
          hideSettings();
        }
      })
      .then((cleanup) => {
        unlistenFocus = cleanup;
      })
      .catch(() => {
        unlistenFocus = undefined;
      });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        hideSettings();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unlistenFocus?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <main className="settings-shell" aria-label="TouchPilot settings window">
      <SettingsPopup
        overlayState={overlayState}
        hasAcceptedGuidance={hasAcceptedGuidance}
        isRefreshingCapture={isRefreshingCapture}
        gestureRuntime={gestureRuntime}
        onRefreshCapture={() => {
          emitTo("overlay", "touchpilot://overlay-command", {
            type: "refresh-capture",
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onPauseToggle={() => {
          emitTo("overlay", "touchpilot://overlay-command", {
            type: "toggle-pause",
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onCameraToggle={(enabled) => {
          emitTo("overlay", "touchpilot://overlay-command", {
            type: "set-camera-enabled",
            enabled,
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onGesturesToggle={(enabled) => {
          emitTo("overlay", "touchpilot://overlay-command", {
            type: "set-gestures-enabled",
            enabled,
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onClose={() => {
          hideSettings();
        }}
      />
    </main>
  );
}

function DebugWindowApp() {
  const [snapshot, setSnapshot] = useState<DebugSnapshot>(() =>
    createEmptyDebugSnapshot(),
  );
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceSummary[]>([]);
  const [cameraProbeStatus, setCameraProbeStatus] = useState<
    "idle" | "probing" | "ready" | "unsupported" | "error"
  >("idle");
  const [cameraProbeError, setCameraProbeError] = useState<string | null>(null);
  const [cameraPreviewStatus, setCameraPreviewStatus] =
    useState<CameraStreamStatus>("idle");
  const [cameraPreviewError, setCameraPreviewError] = useState<string | null>(null);
  const [handLandmarkerStatus, setHandLandmarkerStatus] = useState<
    "idle" | "loading" | "running" | "no_hand" | "error"
  >("idle");
  const [handLandmarkerError, setHandLandmarkerError] = useState<string | null>(null);
  const [handLandmarkFrame, setHandLandmarkFrame] = useState<HandLandmarkFrame | null>(
    null,
  );
  const [smoothedGesture, setSmoothedGesture] = useState(
    createDefaultGestureRuntimeState().currentGesture,
  );
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const handFrameIdRef = useRef(0);
  const gestureSmoothingStateRef = useRef(initialGestureSmoothingState);
  const pinchClassification = useMemo(
    () =>
      classifyPinchGesture(
        handLandmarkFrame,
        snapshot.gestureRuntime.thresholds,
      ),
    [handLandmarkFrame, snapshot.gestureRuntime.thresholds],
  );
  const openPalmClassification = useMemo(
    () =>
      classifyOpenPalmGesture(
        handLandmarkFrame,
        snapshot.gestureRuntime.thresholds,
      ),
    [handLandmarkFrame, snapshot.gestureRuntime.thresholds],
  );
  const rawGestureCandidate =
    openPalmClassification.label !== "none" &&
    openPalmClassification.confidence >= pinchClassification.confidence
      ? openPalmClassification
      : pinchClassification;
  const screenshot = snapshot.screenshotCapture;
  const guidanceStep = snapshot.guidanceResult?.step ?? null;
  const target = guidanceStep?.target ?? null;

  function sendOverlayCommand(command: OverlayCommand) {
    emitTo("overlay", "touchpilot://overlay-command", command).catch(() => undefined);
  }

  function reportCameraPreviewStatus(
    status: CameraStreamStatus,
    permission: CameraPermissionState,
    error?: string,
  ) {
    sendOverlayCommand({
      type: "set-camera-preview-status",
      status,
      permission,
      error,
    });
  }

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
      setCameraDevices(devices);
      setCameraProbeStatus("ready");
    } catch (error) {
      setCameraDevices([]);
      setCameraProbeStatus("error");
      setCameraProbeError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    let unlistenState: (() => void) | undefined;

    listen<DebugSnapshot>("touchpilot://debug-state", (event) => {
      setSnapshot(event.payload);
    })
      .then((cleanup) => {
        unlistenState = cleanup;
      })
      .catch(() => {
        unlistenState = undefined;
      });

    emitTo("overlay", "touchpilot://overlay-command", {
      type: "request-state",
    } satisfies OverlayCommand).catch(() => undefined);
    refreshCameraDevices();

    return () => {
      unlistenState?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    const cameraEnabled = snapshot.gestureRuntime.camera.enabled;

    async function startCameraPreview() {
      if (!cameraEnabled) {
        setCameraPreviewStatus("disabled");
        setCameraPreviewError(null);
        setHandLandmarkFrame(null);
        setHandLandmarkerStatus("idle");
        setHandLandmarkerError(null);
        gestureSmoothingStateRef.current = initialGestureSmoothingState;
        setSmoothedGesture(createInactiveGestureClassification());
        reportCameraPreviewStatus("disabled", "unknown");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        const message = "Camera preview is not available in this WebView.";
        setCameraPreviewStatus("error");
        setCameraPreviewError(message);
        reportCameraPreviewStatus("error", "unsupported", message);
        return;
      }

      setCameraPreviewStatus("requesting_permission");
      setCameraPreviewError(null);
      reportCameraPreviewStatus("requesting_permission", "prompt");

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (cameraPreviewRef.current) {
          cameraPreviewRef.current.srcObject = stream;
          await cameraPreviewRef.current.play().catch(() => undefined);
        }

        setCameraPreviewStatus("active");
        reportCameraPreviewStatus("active", "granted");
      } catch (error) {
        const errorName = error instanceof DOMException ? error.name : "";
        const message = error instanceof Error ? error.message : String(error);
        const nextStatus: CameraStreamStatus =
          errorName === "NotAllowedError" || errorName === "SecurityError"
            ? "permission_denied"
            : errorName === "NotFoundError" || errorName === "DevicesNotFoundError"
              ? "no_camera"
              : "error";
        const nextPermission: CameraPermissionState =
          nextStatus === "permission_denied" ? "denied" : "error";

        setCameraPreviewStatus(nextStatus);
        setCameraPreviewError(message);
        setHandLandmarkFrame(null);
        setHandLandmarkerStatus("idle");
        setHandLandmarkerError(null);
        gestureSmoothingStateRef.current = initialGestureSmoothingState;
        setSmoothedGesture(createInactiveGestureClassification());
        reportCameraPreviewStatus(nextStatus, nextPermission, message);
      }
    }

    void startCameraPreview();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());

      if (cameraPreviewRef.current) {
        cameraPreviewRef.current.srcObject = null;
      }
    };
  }, [snapshot.gestureRuntime.camera.enabled]);

  useEffect(() => {
    if (cameraPreviewStatus !== "active") {
      setHandLandmarkerStatus(cameraPreviewStatus === "disabled" ? "idle" : "loading");
      setHandLandmarkFrame(null);
      return;
    }

    let cancelled = false;
    let animationFrame = 0;

    async function runHandLandmarker() {
      setHandLandmarkerStatus("loading");
      setHandLandmarkerError(null);

      try {
        const landmarker = await getHandLandmarker();

        function detectFrame() {
          if (cancelled) {
            return;
          }

          const video = cameraPreviewRef.current;

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
              setHandLandmarkerStatus("no_hand");
            }
          }

          animationFrame = window.requestAnimationFrame(detectFrame);
        }

        detectFrame();
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
  }, [cameraPreviewStatus]);

  useEffect(() => {
    if (!snapshot.gestureRuntime.enabled) {
      gestureSmoothingStateRef.current = initialGestureSmoothingState;
      const inactiveGesture = createDefaultGestureRuntimeState().currentGesture;
      setSmoothedGesture(inactiveGesture);
      sendOverlayCommand({
        type: "set-gesture-classification",
        classification: inactiveGesture,
      });
      return;
    }

    const result = smoothGestureCandidate(
      gestureSmoothingStateRef.current,
      rawGestureCandidate,
      snapshot.gestureRuntime.thresholds,
      performance.now(),
    );

    gestureSmoothingStateRef.current = result.state;
    setSmoothedGesture(result.classification);
    sendOverlayCommand({
      type: "set-gesture-classification",
      classification: result.classification,
    });
  }, [
    rawGestureCandidate.label,
    rawGestureCandidate.confidence,
    rawGestureCandidate.sourceFrameId,
    snapshot.gestureRuntime.enabled,
    snapshot.gestureRuntime.thresholds,
  ]);

  return (
    <main className="debug-shell" aria-label="TouchPilot debug window">
      <section className="debug-window">
        <header className="debug-window-header">
          <div>
            <p>Internal</p>
            <h1>TouchPilot Debug</h1>
          </div>
          <button
            className="debug-close-button"
            type="button"
            onClick={() => {
              overlayWindow.hide().catch(() => undefined);
            }}
          >
            Close
          </button>
        </header>

        <div className="debug-actions">
          <button
            type="button"
            onClick={() => {
              sendOverlayCommand({ type: "refresh-capture" });
            }}
            disabled={snapshot.isRefreshingCapture}
          >
            {snapshot.isRefreshingCapture ? "Refreshing" : "Refresh capture"}
          </button>
          <button
            type="button"
            onClick={() => {
              sendOverlayCommand({ type: "toggle-pause" });
            }}
          >
            {snapshot.overlayState === "paused" ? "Resume overlay" : "Pause overlay"}
          </button>
          <button
            type="button"
            onClick={() => {
              sendOverlayCommand({ type: "request-state" });
            }}
          >
            Sync state
          </button>
        </div>

        <div className="debug-window-grid">
          <section className="debug-section">
            <h2>State Controls</h2>
            <div className="debug-toggle-grid">
              {debugOverlayStates.map((state) => (
                <button
                  key={state}
                  type="button"
                  data-active={snapshot.overlayState === state}
                  onClick={() => {
                    sendOverlayCommand({ type: "set-state", state });
                  }}
                >
                  {stateMeta[state].label}
                </button>
              ))}
            </div>
          </section>

          <section className="debug-section">
            <h2>Fixture Controls</h2>
            <div className="debug-toggle-grid">
              {debugGuidanceFixtures.map((option) => (
                <button
                  key={option.fixture}
                  type="button"
                  data-active={snapshot.guidanceFixture === option.fixture}
                  onClick={() => {
                    sendOverlayCommand({
                      type: "set-guidance-fixture",
                      fixture: option.fixture,
                    });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="debug-section">
            <h2>Camera Devices</h2>
            <div className="debug-section-header-row">
              <span>{cameraProbeStatus}</span>
              <button
                type="button"
                onClick={() => {
                  refreshCameraDevices();
                }}
                disabled={cameraProbeStatus === "probing"}
              >
                {cameraProbeStatus === "probing" ? "Probing" : "Refresh"}
              </button>
            </div>
            {cameraProbeError ? (
              <p className="debug-muted">{cameraProbeError}</p>
            ) : null}
            {cameraDevices.length > 0 ? (
              <ul className="debug-device-list">
                {cameraDevices.map((device) => (
                  <li key={device.id}>
                    <span>{device.label}</span>
                    <small>
                      {device.kind}
                      {device.isDefault ? " / default" : ""}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="debug-muted">No video devices reported yet.</p>
            )}
          </section>

          <section className="debug-section debug-section-wide">
            <h2>Camera Preview</h2>
            <div className="debug-section-header-row">
              <span>{cameraPreviewStatus}</span>
              <span>
                {snapshot.gestureRuntime.camera.enabled ? "camera enabled" : "camera off"}
              </span>
            </div>
            <div className="debug-camera-preview">
              {snapshot.gestureRuntime.camera.enabled ? (
                <video
                  ref={cameraPreviewRef}
                  muted
                  playsInline
                  aria-label="Debug camera preview"
                />
              ) : (
                <p>Turn on Camera in settings to preview the local stream.</p>
              )}
            </div>
            {cameraPreviewStatus === "permission_denied" ? (
              <p className="debug-muted">
                Camera permission is denied. Enable camera access in Windows privacy
                settings before using gestures.
              </p>
            ) : cameraPreviewStatus === "no_camera" ? (
              <p className="debug-muted">
                No usable camera was found. TouchPilot remains available through tray and
                manual controls.
              </p>
            ) : cameraPreviewStatus === "disabled" ? (
              <p className="debug-muted">
                Camera is off. No camera frames are captured or processed.
              </p>
            ) : null}
            {cameraPreviewError ? (
              <p className="debug-muted">{cameraPreviewError}</p>
            ) : null}
          </section>

          <section className="debug-section">
            <h2>Hand Landmarks</h2>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{handLandmarkerStatus}</dd>
              </div>
              <div>
                <dt>Frame</dt>
                <dd>{handLandmarkFrame?.frameId ?? "None"}</dd>
              </div>
              <div>
                <dt>Hand</dt>
                <dd>{handLandmarkFrame?.handedness ?? "None"}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>
                  {handLandmarkFrame
                    ? handLandmarkFrame.confidence.toFixed(2)
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Landmarks</dt>
                <dd>{handLandmarkFrame?.landmarks.length ?? 0}</dd>
              </div>
            </dl>
            {handLandmarkerError ? (
              <p className="debug-muted">{handLandmarkerError}</p>
            ) : null}
          </section>

          <section className="debug-section">
            <h2>Pinch Classifier</h2>
            <dl>
              <div>
                <dt>Label</dt>
                <dd>{pinchClassification.label}</dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{pinchClassification.phase}</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>
                  {pinchClassification.normalizedDistance == null
                    ? "None"
                    : pinchClassification.normalizedDistance.toFixed(3)}
                </dd>
              </div>
              <div>
                <dt>Threshold</dt>
                <dd>{pinchClassification.pinchThreshold.toFixed(3)}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{pinchClassification.confidence.toFixed(2)}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Open Palm Classifier</h2>
            <dl>
              <div>
                <dt>Label</dt>
                <dd>{openPalmClassification.label}</dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{openPalmClassification.phase}</dd>
              </div>
              <div>
                <dt>Fingers</dt>
                <dd>
                  {openPalmClassification.extendedFingerCount} /{" "}
                  {openPalmClassification.requiredExtendedFingers}
                </dd>
              </div>
              <div>
                <dt>Spread</dt>
                <dd>
                  {openPalmClassification.normalizedSpread == null
                    ? "None"
                    : openPalmClassification.normalizedSpread.toFixed(3)}
                </dd>
              </div>
              <div>
                <dt>Threshold</dt>
                <dd>{openPalmClassification.spreadThreshold.toFixed(3)}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{openPalmClassification.confidence.toFixed(2)}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Smoothed Gesture</h2>
            <dl>
              <div>
                <dt>Label</dt>
                <dd>{smoothedGesture.label}</dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{smoothedGesture.phase}</dd>
              </div>
              <div>
                <dt>Hold</dt>
                <dd>{Math.round(smoothedGesture.holdMs)}ms</dd>
              </div>
              <div>
                <dt>Cooldown</dt>
                <dd>{Math.round(smoothedGesture.cooldownRemainingMs)}ms</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{smoothedGesture.confidence.toFixed(2)}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Gesture Action</h2>
            <dl>
              <div>
                <dt>Last action</dt>
                <dd>{snapshot.gestureRuntime.lastAction?.type ?? "None"}</dd>
              </div>
              <div>
                <dt>Gesture</dt>
                <dd>{snapshot.gestureRuntime.lastAction?.gesture ?? "None"}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>
                  {snapshot.gestureRuntime.lastAction
                    ? snapshot.gestureRuntime.lastAction.confidence.toFixed(2)
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Fired</dt>
                <dd>{snapshot.gestureRuntime.lastAction?.firedAt ?? "None"}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Gesture Settings</h2>
            <dl>
              <div>
                <dt>Camera</dt>
                <dd>
                  {snapshot.gestureRuntime.camera.enabled ? "Enabled" : "Disabled"}
                </dd>
              </div>
              <div>
                <dt>Gestures</dt>
                <dd>{snapshot.gestureRuntime.enabled ? "Enabled" : "Disabled"}</dd>
              </div>
              <div>
                <dt>Camera status</dt>
                <dd>{snapshot.gestureRuntime.camera.status}</dd>
              </div>
              <div>
                <dt>Permission</dt>
                <dd>{snapshot.gestureRuntime.camera.permission}</dd>
              </div>
              <div>
                <dt>Cooldown</dt>
                <dd>{snapshot.gestureRuntime.thresholds.cooldownMs}ms</dd>
              </div>
              <div>
                <dt>Current gesture</dt>
                <dd>{snapshot.gestureRuntime.currentGesture.phase}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Runtime</h2>
            <dl>
              <div>
                <dt>State</dt>
                <dd>{stateMeta[snapshot.overlayState].label}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{snapshot.hasAcceptedGuidance ? "Accepted" : "None"}</dd>
              </div>
              <div>
                <dt>Viewport</dt>
                <dd>
                  {snapshot.viewport.width} x {snapshot.viewport.height}
                </dd>
              </div>
              <div>
                <dt>DPR</dt>
                <dd>{snapshot.viewport.devicePixelRatio}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{snapshot.viewport.updatedAt}</dd>
              </div>
              <div>
                <dt>Fixture</dt>
                <dd>{snapshot.guidanceFixture}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Capture</h2>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{snapshot.captureError ?? (screenshot ? "Ready" : "Waiting")}</dd>
              </div>
              <div>
                <dt>Display</dt>
                <dd>
                  {snapshot.captureMetadata
                    ? `${snapshot.captureMetadata.display.width} x ${snapshot.captureMetadata.display.height}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Image</dt>
                <dd>
                  {screenshot
                    ? `${screenshot.imageWidth} x ${screenshot.imageHeight}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Bytes</dt>
                <dd>{screenshot ? screenshot.byteLength : "None"}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{screenshot?.format ?? "None"}</dd>
              </div>
              <div>
                <dt>Cursor</dt>
                <dd>
                  {snapshot.captureMetadata?.cursor
                    ? `${snapshot.captureMetadata.cursor.x}, ${snapshot.captureMetadata.cursor.y}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Active app</dt>
                <dd>{snapshot.captureMetadata?.activeWindow?.appName ?? "None"}</dd>
              </div>
              <div>
                <dt>Window</dt>
                <dd>{snapshot.captureMetadata?.activeWindow?.title ?? "None"}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Guidance</h2>
            <dl>
              <div>
                <dt>Request</dt>
                <dd>{snapshot.guidanceRequest ? "Present" : "None"}</dd>
              </div>
              <div>
                <dt>Risk</dt>
                <dd>{guidanceStep?.risk ?? "None"}</dd>
              </div>
              <div>
                <dt>Confirm</dt>
                <dd>{guidanceStep?.requiresConfirmation ? "Required" : "Not required"}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{snapshot.guidanceResult?.mode ?? "None"}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>
                  {guidanceStep ? `${Math.round(guidanceStep.confidence * 100)}%` : "None"}
                </dd>
              </div>
              <div>
                <dt>Validation</dt>
                <dd>
                  {snapshot.guidanceIssues.length === 0
                    ? "No issues"
                    : `${snapshot.guidanceIssues.length} issue(s)`}
                </dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{target?.label ?? "None"}</dd>
              </div>
              <div>
                <dt>Box</dt>
                <dd>
                  {target
                    ? `${target.x}, ${target.y}, ${target.width} x ${target.height}`
                    : "None"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Calibration</h2>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{snapshot.calibration.status}</dd>
              </div>
              <div>
                <dt>Overlay</dt>
                <dd>
                  {snapshot.calibration.overlayWidth} x{" "}
                  {snapshot.calibration.overlayHeight}
                </dd>
              </div>
              <div>
                <dt>Display</dt>
                <dd>
                  {snapshot.calibration.displayWidth} x{" "}
                  {snapshot.calibration.displayHeight}
                </dd>
              </div>
              <div>
                <dt>Scale</dt>
                <dd>{snapshot.calibration.scaleFactor}</dd>
              </div>
            </dl>
            <p>{snapshot.calibration.notes}</p>
          </section>
        </div>

        {snapshot.guidanceIssues.length > 0 && (
          <section className="debug-section debug-section-wide">
            <h2>Validation Issues</h2>
            <ul>
              {snapshot.guidanceIssues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  <strong>{issue.path}</strong>: {issue.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {screenshot && (
          <figure className="debug-screenshot-preview">
            <img
              src={`data:image/${screenshot.format};base64,${screenshot.imageBase64}`}
              alt="Latest screen capture preview"
            />
            <figcaption>Latest capture preview</figcaption>
          </figure>
        )}
      </section>
    </main>
  );
}

function App() {
  if (currentWindowLabel === "settings") {
    return <SettingsWindowApp />;
  }

  if (currentWindowLabel === "debug") {
    return <DebugWindowApp />;
  }

  return <OverlayWindowApp />;
}

export default App;
