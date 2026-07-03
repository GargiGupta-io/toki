import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import {
  createInvalidMockGuidance,
  createLowConfidenceMockGuidance,
  createMockGuidance,
  createMockWorkflowPlan,
  createRiskyMockGuidance,
  evaluateSafetyPolicy,
  requestRealGuidance,
  validateGuidanceResult,
} from "@toki/ai";
import type {
  CameraDeviceSummary,
  CameraPermissionState,
  CameraStreamStatus,
  CaptureMetadata,
  CoordinateCalibration,
  GuidanceRequest,
  GuidanceProviderMode,
  GuidanceProviderResponse,
  GuidanceResult,
  GuidanceStep,
  GuidanceValidationIssue,
  GestureActionEvent,
  GestureClassification,
  GestureRuntimeState,
  HandLandmarkFrame,
  ScreenshotCapture,
  ScreenshotMetadata,
  ScreenCandidate,
  SafetyPolicyDecision,
  TargetBox,
  VoiceActivationSource,
  VoiceCommandRequest,
  VoiceRuntimeState,
  VoiceTranscript,
  WorkflowRuntimeState,
  WorkflowStep,
  WorkflowVerificationResult,
} from "@toki/shared";
import { probeCameraDevices } from "./cameraDevices";
import { classifyOpenPalmGesture, classifyPinchGesture } from "./gestureClassifier";
import {
  initialGestureSmoothingState,
  smoothGestureCandidate,
} from "./gestureSmoothing";
import { detectHandLandmarksForVideo, getHandLandmarker } from "./handLandmarker";
import {
  startNativeVoiceCapture,
  stopNativeVoiceCapture,
} from "./nativeVoiceCapture";
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
import { collectScreenCandidatesForGuidance } from "./screenCandidates";
import { probeVoiceCapabilities } from "./voiceCapabilities";
import type { VoiceCapabilityProbe } from "./voiceCapabilities";
import { startVoiceRecognition } from "./voiceRecognition";
import type { VoiceRecognitionSession } from "./voiceRecognition";
import { transcribeNativeVoiceCapture } from "./voiceTranscription";
import type { OverlayState, PuckMotionModel } from "./puckMotion";
import "./App.css";

declare global {
  interface Window {
    __tokiRunRealGuidanceSmoke?: (goal?: string) => void;
  }
}

type GuidanceFixture = "safe" | "risky" | "invalid" | "low-confidence";

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
  voiceRuntime: VoiceRuntimeState;
};

type DebugSnapshot = OverlaySnapshot & {
  guidanceProviderMode: GuidanceProviderMode;
  guidanceFixture: GuidanceFixture;
  workflowRuntime: WorkflowRuntimeState;
  captureMetadata: CaptureMetadata | null;
  screenshotCapture: ScreenshotCapture | null;
  guidanceRequest: GuidanceRequest | null;
  guidanceResult: GuidanceResult | null;
  guidanceIssues: GuidanceValidationIssue[];
  guidanceProviderError: string | null;
  safetyDecision: SafetyPolicyDecision | null;
  captureError: string | null;
  viewport: ViewportMetrics;
  calibration: CoordinateCalibration;
};

type OverlayCommand =
  | { type: "refresh-capture" }
  | { type: "run-real-guidance-smoke" }
  | { type: "toggle-pause" }
  | { type: "request-state" }
  | { type: "set-state"; state: OverlayState }
  | { type: "set-guidance-fixture"; fixture: GuidanceFixture }
  | { type: "start-mock-workflow"; goal: string }
  | { type: "clear-workflow" }
  | { type: "advance-workflow-step" }
  | { type: "retreat-workflow-step" }
  | { type: "stop-workflow" }
  | { type: "set-camera-enabled"; enabled: boolean }
  | {
      type: "set-camera-preview-status";
      status: CameraStreamStatus;
      permission: CameraPermissionState;
      error?: string;
    }
  | { type: "set-gesture-classification"; classification: GestureClassification }
  | { type: "set-gestures-enabled"; enabled: boolean }
  | { type: "start-voice-listening"; source: VoiceActivationSource }
  | { type: "submit-voice-listening" }
  | { type: "stop-voice-listening" };

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
  confirmation_required: {
    label: "Confirm",
    title: "Confirmation is required.",
    description: "Review the risky target before allowing guidance.",
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
  "confirmation_required",
  "paused",
  "error",
];

const debugGuidanceFixtures: Array<{
  fixture: GuidanceFixture;
  label: string;
}> = [
  { fixture: "safe", label: "Safe" },
  { fixture: "risky", label: "Risky" },
  { fixture: "low-confidence", label: "Low confidence" },
  { fixture: "invalid", label: "Invalid" },
];

type VoiceStatusTone = "idle" | "listening" | "processing" | "ready" | "error";

type VoiceStatusDetails = {
  tone: VoiceStatusTone;
  label: string;
  message: string;
  visible: boolean;
};

type DebugTab =
  | "runtime"
  | "workflow"
  | "voice"
  | "gesture"
  | "capture"
  | "guidance";

const debugTabs: Array<{ id: DebugTab; label: string }> = [
  { id: "runtime", label: "Runtime" },
  { id: "workflow", label: "Workflow" },
  { id: "voice", label: "Voice" },
  { id: "gesture", label: "Gesture" },
  { id: "capture", label: "Capture" },
  { id: "guidance", label: "Guidance" },
];

function formatCaptureError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();
  const looksPermissionRelated =
    normalizedMessage.includes("no display available") ||
    normalizedMessage.includes("permission") ||
    normalizedMessage.includes("denied") ||
    normalizedMessage.includes("not authorized");

  if (!looksPermissionRelated) {
    return message;
  }

  return `${message}. On macOS, grant Screen Recording permission to Toki or the terminal app, then quit and relaunch it.`;
}

function getVoiceStatusDetails(voiceRuntime: VoiceRuntimeState): VoiceStatusDetails {
  if (voiceRuntime.status === "requesting_microphone") {
    return {
      tone: "processing",
      label: "Mic",
      message: "Requesting microphone",
      visible: true,
    };
  }

  if (voiceRuntime.status === "listening") {
    return {
      tone: "listening",
      label: "Listening",
      message: voiceRuntime.transcript?.text || "Speak now",
      visible: true,
    };
  }

  if (voiceRuntime.status === "transcribing") {
    return {
      tone: "processing",
      label: "Processing",
      message: voiceRuntime.transcript?.text || "Reading command",
      visible: true,
    };
  }

  if (voiceRuntime.status === "command_ready") {
    return {
      tone: "ready",
      label: "Command ready",
      message: voiceRuntime.transcript?.text || "Routing to guidance",
      visible: true,
    };
  }

  if (voiceRuntime.status === "error") {
    return {
      tone: "error",
      label: "Voice unavailable",
      message: voiceRuntime.error || "Speech recognition failed",
      visible: true,
    };
  }

  if (voiceRuntime.status === "cancelled") {
    return {
      tone: "idle",
      label: "Cancelled",
      message: "Voice stopped",
      visible: false,
    };
  }

  return {
    tone: "idle",
    label: "Voice",
    message: "Idle",
    visible: false,
  };
}

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
      data-pointer-shadow={pointerShadow ? "active" : "idle"}
      data-target-droplets={motion.canSendTargetDroplets ? "enabled" : "disabled"}
      style={puckStyle}
      aria-label={`Toki is ${meta.label.toLowerCase()}`}
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

function VoiceStatusCue({
  voiceRuntime,
  pointerShadow,
}: {
  voiceRuntime: VoiceRuntimeState;
  pointerShadow: PointerShadowPosition | null;
}) {
  const details = getVoiceStatusDetails(voiceRuntime);
  const style =
    pointerShadow == null
      ? undefined
      : ({
          left: pointerShadow.x + 32,
          top: pointerShadow.y + 28,
        } as CSSProperties);

  if (!details.visible || pointerShadow == null) {
    return null;
  }

  return (
    <aside
      className="voice-status-cue"
      data-tone={details.tone}
      style={style}
      aria-label={`Voice status: ${details.label}`}
    >
      <span>{details.label}</span>
      <small>{details.message}</small>
    </aside>
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

function WorkflowStepCue({
  runtime,
  step,
  pointerShadow,
  onPrevious,
  onNext,
  onStop,
}: {
  runtime: WorkflowRuntimeState;
  step: WorkflowStep | null;
  pointerShadow: PointerShadowPosition | null;
  onPrevious: () => void;
  onNext: () => void;
  onStop: () => void;
}) {
  if (runtime.plan == null || step == null || pointerShadow == null) {
    return null;
  }

  const isFirstStep = runtime.currentStepIndex <= 0;
  const isLastStep = runtime.currentStepIndex >= runtime.plan.steps.length - 1;

  return (
    <aside
      className="workflow-step-cue"
      data-confirmation-required={step.requiresConfirmation ? "true" : "false"}
      style={{
        left: pointerShadow.x + 22,
        top: pointerShadow.y + 42,
      }}
      aria-label={`Workflow step ${step.index + 1} of ${runtime.plan.steps.length}`}
    >
      <span className="workflow-step-meta">
        Step {step.index + 1}/{runtime.plan.steps.length}
        {step.requiresConfirmation ? (
          <span className="workflow-step-risk">Confirm first</span>
        ) : null}
      </span>
      <span className="workflow-step-title">{step.title}</span>
      <span className="workflow-step-instruction">{step.instruction}</span>
      <span className="workflow-step-actions" aria-label="Workflow controls">
        <button
          type="button"
          onClick={onPrevious}
          disabled={isFirstStep}
          aria-label="Go to previous workflow step"
        >
          Back
        </button>
        <button type="button" onClick={onNext} aria-label="Continue workflow">
          {isLastStep ? "Done" : "Next"}
        </button>
        <button type="button" onClick={onStop} aria-label="Stop workflow">
          Stop
        </button>
      </span>
    </aside>
  );
}

function ConfirmationBubble({
  decision,
  target,
}: {
  decision: SafetyPolicyDecision;
  target: RenderedGuidanceTarget;
}) {
  return (
    <aside
      className="confirmation-bubble"
      style={{
        left: target.x + target.width / 2 + 22,
        top: target.y - target.height / 2,
      }}
      aria-label={`Confirmation required for ${target.label}`}
    >
      <span className="bubble-anchor" aria-hidden="true" />
      <span className="confirmation-cue-kicker">Confirm first</span>
      <span className="step-cue-label">{target.label}</span>
      <span className="step-cue-text">{decision.message}</span>
    </aside>
  );
}

function SettingsPopup({
  overlayState,
  hasAcceptedGuidance,
  isRefreshingCapture,
  voiceRuntime,
  onRefreshCapture,
  onPauseToggle,
  onVoicePressStart,
  onVoicePressEnd,
  onStartDrag,
  onClose,
}: {
  overlayState: OverlayState;
  hasAcceptedGuidance: boolean;
  isRefreshingCapture: boolean;
  voiceRuntime: VoiceRuntimeState;
  onRefreshCapture: () => void;
  onPauseToggle: () => void;
  onVoicePressStart: () => void;
  onVoicePressEnd: () => void;
  onStartDrag: () => void;
  onClose: () => void;
}) {
  const isPaused = overlayState === "paused";
  const voiceListening =
    voiceRuntime.status === "listening" ||
    voiceRuntime.status === "requesting_microphone" ||
    voiceRuntime.status === "transcribing";
  const voiceStatusDetails = getVoiceStatusDetails(voiceRuntime);
  const settingsStatusText = hasAcceptedGuidance
    ? "Target locked."
    : isPaused
      ? "Paused. Resume when ready."
      : voiceRuntime.status === "command_ready" && voiceRuntime.transcript
        ? `Heard: ${voiceRuntime.transcript.text}`
      : voiceListening
        ? "Listening."
        : "Ready for a command.";

  return (
    <section className="settings-popup" aria-label="Toki settings">
      <div
        className="settings-popup-header"
        onPointerDown={(event) => {
          const target = event.target;
          if (
            event.button === 0 &&
            target instanceof HTMLElement &&
            !target.closest("button,input,label")
          ) {
            onStartDrag();
          }
        }}
      >
        <div className="settings-title-group">
          <span
            className={`settings-status-dot${
              isPaused ? " settings-status-dot-muted" : ""
            }`}
            aria-hidden="true"
          />
          <h2>Toki</h2>
        </div>
        <div className="settings-window-actions">
          <span className="settings-state-label">{isPaused ? "Paused" : "Active"}</span>
          <button
            className="settings-close-button"
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            aria-label="Close settings"
          >
            x
          </button>
        </div>
      </div>

      <div className="settings-separator" />

      <p className="settings-instruction">Hold Space to talk.</p>

      <button
        className="settings-talk-button"
        type="button"
        data-active={voiceListening}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onVoicePressStart();
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }

          onVoicePressEnd();
        }}
        onPointerCancel={onVoicePressEnd}
        onKeyDown={(event) => {
          if (event.repeat) {
            return;
          }

          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onVoicePressStart();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onVoicePressEnd();
          }
        }}
      >
        <span>{voiceListening ? "Listening" : "Push to talk"}</span>
        <small>
          {voiceStatusDetails.visible
            ? voiceStatusDetails.message
            : "Ask what to click next, then release."}
        </small>
      </button>

      <p className="settings-footnote">{settingsStatusText}</p>

      <div className="settings-footer-actions" aria-label="Settings actions">
        <button
          className="settings-footer-button"
          type="button"
          onClick={onRefreshCapture}
          disabled={isRefreshingCapture}
        >
          {isRefreshingCapture ? "Updating" : "Update screen"}
        </button>
        <button
          className="settings-footer-button"
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

type NativeCursorPosition = {
  x: number;
  y: number;
  source: string;
};

async function getOverlayCursorPosition(): Promise<Pick<NativeCursorPosition, "x" | "y">> {
  try {
    return await invoke<NativeCursorPosition>("native_cursor_position");
  } catch {
    return cursorPosition();
  }
}

function getCalibration(
  captureMetadata: CaptureMetadata | null,
  viewport: ViewportMetrics,
  screenshot?: Pick<ScreenshotMetadata, "imageWidth" | "imageHeight"> | null,
): CoordinateCalibration {
  const overlayWidth = viewport.width;
  const overlayHeight = viewport.height;
  const displayWidth = captureMetadata?.display.width ?? 0;
  const displayHeight = captureMetadata?.display.height ?? 0;
  const scaleFactor = captureMetadata?.display.scaleFactor ?? 1;
  const expectedImageWidth = Math.round(displayWidth * scaleFactor);
  const expectedImageHeight = Math.round(displayHeight * scaleFactor);
  const imageMatchesScale =
    screenshot == null ||
    (screenshot.imageWidth === expectedImageWidth &&
      screenshot.imageHeight === expectedImageHeight);

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
  const isAligned = sizeMatches && scaleMatches && imageMatchesScale;

  return {
    status: isAligned ? "aligned" : "needs_check",
    overlayWidth,
    overlayHeight,
    displayWidth,
    displayHeight,
    scaleFactor,
    checkedAt: new Date().toISOString(),
    notes:
      isAligned
        ? "Overlay viewport matches captured display dimensions, DPR, and screenshot pixel scale."
        : `Overlay/display mismatch. Delta ${overlayWidth - displayWidth}, ${
            overlayHeight - displayHeight
          }; DPR ${viewport.devicePixelRatio} vs capture scale ${scaleFactor}; screenshot ${
            screenshot?.imageWidth ?? "unknown"
          }x${screenshot?.imageHeight ?? "unknown"} vs expected ${expectedImageWidth}x${expectedImageHeight}.`,
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

function getScreenshotPayload(screenshot: ScreenshotCapture) {
  return {
    encoding: "base64" as const,
    format: screenshot.format,
    byteLength: screenshot.byteLength,
    imageWidth: screenshot.imageWidth,
    imageHeight: screenshot.imageHeight,
    imageBase64: screenshot.imageBase64,
  };
}

type ScreenshotPayload = ReturnType<typeof getScreenshotPayload>;

const MAX_PROVIDER_SCREENSHOT_EDGE = 1024;
const PROVIDER_SCREENSHOT_JPEG_QUALITY = 0.76;

function estimateBase64ByteLength(imageBase64: string) {
  const padding = imageBase64.endsWith("==") ? 2 : imageBase64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((imageBase64.length * 3) / 4) - padding);
}

function loadScreenshotImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not decode screenshot for provider"));
    image.src = dataUrl;
  });
}

async function getProviderScreenshotPayload(
  screenshot: ScreenshotCapture,
): Promise<ScreenshotPayload> {
  const originalPayload = getScreenshotPayload(screenshot);
  const longestEdge = Math.max(screenshot.imageWidth, screenshot.imageHeight);

  if (longestEdge <= MAX_PROVIDER_SCREENSHOT_EDGE && screenshot.byteLength <= 2_000_000) {
    return originalPayload;
  }

  try {
    const image = await loadScreenshotImage(
      `data:image/${screenshot.format};base64,${screenshot.imageBase64}`,
    );
    const scale = Math.min(1, MAX_PROVIDER_SCREENSHOT_EDGE / longestEdge);
    const imageWidth = Math.max(1, Math.round(screenshot.imageWidth * scale));
    const imageHeight = Math.max(1, Math.round(screenshot.imageHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      return originalPayload;
    }

    context.drawImage(image, 0, 0, imageWidth, imageHeight);
    const dataUrl = canvas.toDataURL("image/jpeg", PROVIDER_SCREENSHOT_JPEG_QUALITY);
    const [, imageBase64 = ""] = dataUrl.split(",");

    if (!imageBase64) {
      return originalPayload;
    }

    return {
      encoding: "base64",
      format: "jpeg",
      byteLength: estimateBase64ByteLength(imageBase64),
      imageWidth,
      imageHeight,
      imageBase64,
    };
  } catch {
    return originalPayload;
  }
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

function createDefaultVoiceRuntimeState(): VoiceRuntimeState {
  return {
    enabled: false,
    permission: "unknown",
    status: "idle",
  };
}

function createEmptyWorkflowRuntimeState(): WorkflowRuntimeState {
  return {
    status: "idle",
    plan: null,
    currentStepIndex: -1,
    lastVerification: {
      status: "untested",
    },
  };
}

function setWorkflowActiveStep(
  runtime: WorkflowRuntimeState,
  nextStepIndex: number,
): WorkflowRuntimeState {
  if (runtime.plan == null) {
    return runtime;
  }

  const boundedIndex = Math.max(0, Math.min(nextStepIndex, runtime.plan.steps.length - 1));
  const currentStep = runtime.plan.steps[boundedIndex];

  return {
    ...runtime,
    status: currentStep == null ? "completed" : "active",
    currentStepIndex: currentStep?.index ?? -1,
    currentStepId: currentStep?.id,
    lastVerification: {
      status: "untested",
    },
    blockedReason: undefined,
    plan: {
      ...runtime.plan,
      steps: runtime.plan.steps.map((step) => ({
        ...step,
        status:
          step.index < boundedIndex
            ? "completed"
            : step.index === boundedIndex
              ? "active"
              : "pending",
      })),
    },
  };
}

function normalizeWorkflowText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function candidateMatchesWorkflowExpectation(
  candidate: ScreenCandidate,
  expectation: NonNullable<WorkflowStep["expected"]>[number],
): boolean {
  if (
    expectation.type !== "candidate_visible" &&
    expectation.type !== "candidate_absent"
  ) {
    return false;
  }

  if (expectation.role != null && candidate.role !== expectation.role) {
    return false;
  }

  const expectedLabel = normalizeWorkflowText(expectation.label);
  const candidateLabel = normalizeWorkflowText(candidate.label);

  return (
    candidateLabel === expectedLabel ||
    candidateLabel.includes(expectedLabel) ||
    expectedLabel.includes(candidateLabel)
  );
}

function verifyWorkflowStepExpectations(
  step: WorkflowStep,
  candidates: ScreenCandidate[],
): WorkflowVerificationResult {
  const expectations = step.expected ?? [];

  if (expectations.length === 0) {
    return {
      status: "passed",
      checkedAt: new Date().toISOString(),
      message: "No explicit expectations were defined for this step.",
    };
  }

  const matchedCandidateIds: string[] = [];

  for (const expectation of expectations) {
    if (expectation.type === "manual" || expectation.type === "screen_changed") {
      return {
        status: "blocked",
        checkedAt: new Date().toISOString(),
        message: `${expectation.type} verification is not wired yet.`,
        matchedCandidateIds,
      };
    }

    const match = candidates.find((candidate) =>
      candidateMatchesWorkflowExpectation(candidate, expectation),
    );

    if (expectation.type === "candidate_visible") {
      if (match == null) {
        return {
          status: "failed",
          checkedAt: new Date().toISOString(),
          message: `Expected candidate "${expectation.label}" was not visible.`,
          matchedCandidateIds,
        };
      }

      matchedCandidateIds.push(match.id);
    }

    if (expectation.type === "candidate_absent" && match != null) {
      matchedCandidateIds.push(match.id);
      return {
        status: "failed",
        checkedAt: new Date().toISOString(),
        message: `Candidate "${expectation.label}" is still visible.`,
        matchedCandidateIds,
      };
    }
  }

  return {
    status: "passed",
    checkedAt: new Date().toISOString(),
    message: "All candidate expectations passed.",
    matchedCandidateIds,
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
    voiceRuntime: createDefaultVoiceRuntimeState(),
    guidanceProviderMode: "mock",
    guidanceFixture: "safe",
    workflowRuntime: createEmptyWorkflowRuntimeState(),
    captureMetadata: null,
    screenshotCapture: null,
    guidanceRequest: null,
    guidanceResult: null,
    guidanceIssues: [],
    guidanceProviderError: null,
    safetyDecision: null,
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
  const [guidanceProviderMode, setGuidanceProviderMode] =
    useState<GuidanceProviderMode>("mock");
  const [guidanceRequest, setGuidanceRequest] = useState<GuidanceRequest | null>(null);
  const [guidanceResult, setGuidanceResult] = useState<GuidanceResult | null>(null);
  const [guidanceIssues, setGuidanceIssues] = useState<GuidanceValidationIssue[]>([]);
  const [guidanceProviderError, setGuidanceProviderError] = useState<string | null>(
    null,
  );
  const [safetyDecision, setSafetyDecision] = useState<SafetyPolicyDecision | null>(
    null,
  );
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);
  const [gestureRuntime, setGestureRuntime] = useState<GestureRuntimeState>(() =>
    createDefaultGestureRuntimeState(),
  );
  const [voiceRuntime, setVoiceRuntime] = useState<VoiceRuntimeState>(() =>
    createDefaultVoiceRuntimeState(),
  );
  const [workflowRuntime, setWorkflowRuntime] = useState<WorkflowRuntimeState>(() =>
    createEmptyWorkflowRuntimeState(),
  );
  const [viewport, setViewport] = useState<ViewportMetrics>(() => getViewportMetrics());
  const [pointerShadow, setPointerShadow] = useState<PointerShadowPosition | null>(null);
  const voiceSessionRef = useRef<VoiceRecognitionSession | null>(null);
  const routedVoiceCommandRef = useRef<string | null>(null);

  const activeStep = guidanceResult?.step ?? null;
  const acceptedStep = activeStep?.target != null ? activeStep : null;
  const acceptedTarget = acceptedStep?.target ?? null;
  const currentWorkflowStep =
    workflowRuntime.plan?.steps[workflowRuntime.currentStepIndex] ?? null;
  const workflowTarget = currentWorkflowStep?.target ?? null;
  const hasAcceptedGuidance = acceptedTarget != null || workflowTarget != null;
  const activeTarget: RenderedGuidanceTarget =
    acceptedTarget != null && acceptedStep != null
      ? {
          ...acceptedTarget,
          instruction: acceptedStep.instruction,
        }
      : workflowTarget != null && currentWorkflowStep != null
        ? {
            ...workflowTarget,
            instruction: currentWorkflowStep.instruction,
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
  const puckVectorTarget = acceptedTarget ?? workflowTarget;
  const puckTargetVector =
    puckMotion.canSendTargetDroplets && puckVectorTarget != null
      ? getPuckTargetVector(puckVectorTarget, viewport, pointerShadow)
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
      voiceRuntime,
    }),
    [
      overlayState,
      hasAcceptedGuidance,
      isRefreshingCapture,
      gestureRuntime,
      voiceRuntime,
    ],
  );

  const debugSnapshot = useMemo<DebugSnapshot>(
    () => ({
      ...overlaySnapshot,
      guidanceProviderMode,
      guidanceFixture,
      workflowRuntime,
      captureMetadata,
      screenshotCapture,
      guidanceRequest,
      guidanceResult,
      guidanceIssues,
      guidanceProviderError,
      safetyDecision,
      captureError,
      viewport,
      calibration,
    }),
    [
      overlaySnapshot,
      guidanceProviderMode,
      guidanceFixture,
      workflowRuntime,
      captureMetadata,
      screenshotCapture,
      guidanceRequest,
      guidanceResult,
      guidanceIssues,
      guidanceProviderError,
      safetyDecision,
      captureError,
      viewport,
      calibration,
    ],
  );

  async function publishRuntimeSnapshots() {
    await emitTo("settings", "toki://overlay-state", overlaySnapshot).catch(
      () => undefined,
    );
    await emitTo("debug", "toki://debug-state", debugSnapshot).catch(
      () => undefined,
    );
  }

  async function refreshCaptureMetadata(
    goal = "Show me what to click next.",
    providerMode: GuidanceProviderMode = "mock",
  ) {
    setIsRefreshingCapture(true);
    setCaptureError(null);
    setGuidanceProviderError(null);
    setGuidanceProviderMode(providerMode);
    setGuidanceIssues([]);
    setSafetyDecision(null);
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
      const screenshotMetadata = getScreenshotMetadata(screenshot);
      const screenshotPayload =
        providerMode === "real"
          ? await getProviderScreenshotPayload(screenshot)
          : getScreenshotPayload(screenshot);
      const requestCalibration = getCalibration(metadata, viewport, screenshotMetadata);
      const candidateContext =
        providerMode === "real"
          ? await collectScreenCandidatesForGuidance(screenshot, metadata.display, goal)
          : {
              candidates: [],
              candidateSource: "none" as const,
            };
      const nextGuidanceRequest: GuidanceRequest = {
        goal,
        screen: {
          display: metadata.display,
          capture: metadata,
          screenshot: screenshotMetadata,
          screenshotPayload,
          calibration: requestCalibration,
          ...candidateContext,
        },
        previousStep: guidanceResult?.step ?? null,
      };
      setGuidanceRequest(nextGuidanceRequest);

      if (providerMode === "real") {
        const providerResponse = await requestRealGuidance(nextGuidanceRequest, {
          endpoint: import.meta.env.VITE_TOKI_GUIDANCE_ENDPOINT,
        });

        setGuidanceProviderMode(providerResponse.mode);
        setGuidanceProviderError(providerResponse.error ?? null);
        setGuidanceIssues(providerResponse.validation?.issues ?? []);
        const nextSafetyDecision = evaluateSafetyPolicy({
          provider: providerResponse,
          minConfidence: 0.7,
        });

        setSafetyDecision(nextSafetyDecision);

        if (
          nextSafetyDecision.action === "allow" ||
          nextSafetyDecision.action === "confirm"
        ) {
          setGuidanceResult(providerResponse.result ?? null);
          setOverlayState(
            nextSafetyDecision.action === "confirm"
              ? "confirmation_required"
              : "guiding",
          );
        } else {
          setGuidanceResult(null);
          setGuidanceProviderError(nextSafetyDecision.message);
          setOverlayState(nextSafetyDecision.action === "clarify" ? "idle" : "error");
        }
        return;
      }

      const nextGuidance =
        guidanceFixture === "invalid"
          ? createInvalidMockGuidance(nextGuidanceRequest)
          : guidanceFixture === "low-confidence"
            ? createLowConfidenceMockGuidance(nextGuidanceRequest)
          : guidanceFixture === "risky"
            ? createRiskyMockGuidance(nextGuidanceRequest)
            : createMockGuidance(nextGuidanceRequest);
      const validation = validateGuidanceResult(nextGuidance);
      const providerResponse: GuidanceProviderResponse = validation.valid
        ? {
            mode: "mock",
            result: nextGuidance,
            validation,
            providerName: "mock-fixture",
          }
        : {
            mode: "mock",
            validation,
            providerName: "mock-fixture",
          };
      const nextSafetyDecision = evaluateSafetyPolicy({
        provider: providerResponse,
        minConfidence: 0.7,
      });

      setGuidanceIssues(validation.issues);
      setSafetyDecision(nextSafetyDecision);
      setGuidanceProviderError(
        nextSafetyDecision.action === "allow" ||
          nextSafetyDecision.action === "confirm"
          ? null
          : nextSafetyDecision.message,
      );

      if (
        nextSafetyDecision.action === "allow" ||
        nextSafetyDecision.action === "confirm"
      ) {
        setGuidanceResult(nextGuidance);
        setOverlayState(
          nextSafetyDecision.action === "confirm"
            ? "confirmation_required"
            : "guiding",
        );
      } else {
        setGuidanceResult(null);
        setOverlayState(nextSafetyDecision.action === "clarify" ? "idle" : "error");
      }
    } catch (error) {
      setCaptureError(formatCaptureError(error));
      if (providerMode === "real") {
        setGuidanceProviderMode("unavailable");
      }
      setGuidanceRequest(null);
      setGuidanceIssues([]);
      setSafetyDecision(null);
      setGuidanceResult(null);
      setOverlayState("error");
    } finally {
      setIsRefreshingCapture(false);
    }
  }

  async function verifyActiveWorkflowStep(
    runtime: WorkflowRuntimeState,
  ): Promise<WorkflowVerificationResult> {
    const activeStep = runtime.plan?.steps[runtime.currentStepIndex];

    if (activeStep == null) {
      return {
        status: "blocked",
        checkedAt: new Date().toISOString(),
        message: "No active workflow step is available.",
      };
    }

    if (activeStep.requiresConfirmation) {
      return {
        status: "blocked",
        checkedAt: new Date().toISOString(),
        message: `Confirmation required before continuing risky step "${activeStep.title}".`,
      };
    }

    setIsRefreshingCapture(true);
    setCaptureError(null);

    try {
      const [metadata, screenshot] = await Promise.all([
        invoke<CaptureMetadata>("capture_metadata"),
        invoke<ScreenshotCapture>("capture_screenshot"),
      ]);

      setCaptureMetadata(metadata);
      setScreenshotCapture(screenshot);

      const screenshotMetadata = getScreenshotMetadata(screenshot);
      const screenshotPayload = getScreenshotPayload(screenshot);
      const requestCalibration = getCalibration(metadata, viewport, screenshotMetadata);
      const candidateContext = await collectScreenCandidatesForGuidance(
        screenshot,
        metadata.display,
        activeStep.instruction,
      );
      const verificationRequest: GuidanceRequest = {
        goal: activeStep.instruction,
        screen: {
          display: metadata.display,
          capture: metadata,
          screenshot: screenshotMetadata,
          screenshotPayload,
          calibration: requestCalibration,
          ...candidateContext,
        },
        previousStep: guidanceResult?.step ?? null,
      };

      setGuidanceRequest(verificationRequest);

      return verifyWorkflowStepExpectations(
        activeStep,
        candidateContext.candidates ?? [],
      );
    } catch (error) {
      const message = formatCaptureError(error);
      setCaptureError(message);

      return {
        status: "blocked",
        checkedAt: new Date().toISOString(),
        message,
      };
    } finally {
      setIsRefreshingCapture(false);
    }
  }

  function cancelVoiceRuntime() {
    voiceSessionRef.current?.abort();
    voiceSessionRef.current = null;
    routedVoiceCommandRef.current = null;
    setVoiceRuntime({
      ...createDefaultVoiceRuntimeState(),
      status: "cancelled",
    });
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
        const position = await getOverlayCursorPosition();

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
    window.__tokiRunRealGuidanceSmoke = (goal = "Show me what to click next.") => {
      void refreshCaptureMetadata(goal, "real");
    };

    return () => {
      delete window.__tokiRunRealGuidanceSmoke;
    };
  }, [viewport, guidanceFixture, guidanceResult]);

  useEffect(() => {
    let unlistenCommand: (() => void) | undefined;

    listen<OverlayCommand>("toki://overlay-command", async (event) => {
      if (event.payload.type === "refresh-capture") {
        await refreshCaptureMetadata();
        return;
      }

      if (event.payload.type === "run-real-guidance-smoke") {
        await refreshCaptureMetadata("Show me what to click next.", "real");
        return;
      }

      if (event.payload.type === "toggle-pause") {
        cancelVoiceRuntime();
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

      if (event.payload.type === "start-mock-workflow") {
        const plan = createMockWorkflowPlan(event.payload.goal);

        if (plan == null) {
          setWorkflowRuntime({
            status: "blocked",
            plan: null,
            currentStepIndex: -1,
            lastVerification: {
              status: "blocked",
              checkedAt: new Date().toISOString(),
              message: "No mock workflow exists for this goal.",
            },
            blockedReason: "No mock workflow exists for this goal.",
          });
          return;
        }

        setOverlayState("guiding");
        setWorkflowRuntime(
          setWorkflowActiveStep(
            {
              status: "planning",
              plan,
              currentStepIndex: 0,
              lastVerification: {
                status: "untested",
              },
            },
            0,
          ),
        );
        return;
      }

      if (event.payload.type === "clear-workflow") {
        setWorkflowRuntime(createEmptyWorkflowRuntimeState());
        return;
      }

      if (event.payload.type === "advance-workflow-step") {
        const verification = await verifyActiveWorkflowStep(workflowRuntime);

        setWorkflowRuntime((currentState) => {
          if (currentState.plan == null) {
            return currentState;
          }

          if (verification.status !== "passed") {
            return {
              ...currentState,
              status: "blocked",
              lastVerification: verification,
              blockedReason:
                verification.message ?? "Workflow step verification did not pass.",
            };
          }

          const isLastStep =
            currentState.currentStepIndex >= currentState.plan.steps.length - 1;

          if (isLastStep) {
            setOverlayState("idle");
            return {
              ...setWorkflowActiveStep(currentState, currentState.currentStepIndex),
              status: "completed",
              currentStepId: undefined,
              lastVerification: verification,
              blockedReason: undefined,
            };
          }

          setOverlayState("guiding");
          return {
            ...setWorkflowActiveStep(currentState, currentState.currentStepIndex + 1),
            lastVerification: verification,
          };
        });
        return;
      }

      if (event.payload.type === "retreat-workflow-step") {
        setWorkflowRuntime((currentState) =>
          setWorkflowActiveStep(currentState, currentState.currentStepIndex - 1),
        );
        setOverlayState("guiding");
        return;
      }

      if (event.payload.type === "stop-workflow") {
        setWorkflowRuntime((currentState) => ({
          ...createEmptyWorkflowRuntimeState(),
          status: currentState.plan == null ? "idle" : "cancelled",
          plan: currentState.plan,
          currentStepIndex: currentState.currentStepIndex,
          currentStepId: currentState.currentStepId,
          lastVerification: {
            status: "blocked",
            message: "Workflow stopped manually.",
          },
          blockedReason: "Workflow stopped manually.",
        }));
        setOverlayState("idle");
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
          cancelVoiceRuntime();
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

      if (event.payload.type === "start-voice-listening") {
        voiceSessionRef.current?.abort();
        voiceSessionRef.current = null;
        routedVoiceCommandRef.current = null;
        setVoiceRuntime({
          enabled: true,
          permission: "unknown",
          status: "requesting_microphone",
          activationSource: event.payload.source,
        });
        setOverlayState("listening");

        if (event.payload.source !== "debug") {
          try {
            await startNativeVoiceCapture();
            setVoiceRuntime((currentState) => ({
              ...currentState,
              permission: "granted",
              status: "listening",
              transcript: undefined,
              pendingCommand: undefined,
              error: undefined,
            }));
          } catch (error) {
            setVoiceRuntime((currentState) => ({
              ...currentState,
              enabled: false,
              permission: "error",
              status: "error",
              error: error instanceof Error ? error.message : String(error),
            }));
          }
        }

        return;
      }

      if (event.payload.type === "stop-voice-listening") {
        cancelVoiceRuntime();
        setOverlayState((currentState) =>
          currentState === "listening" ? "idle" : currentState,
        );
        return;
      }

      if (event.payload.type === "submit-voice-listening") {
        if (voiceRuntime.activationSource !== "debug") {
          setVoiceRuntime((currentState) => ({
            ...currentState,
            status: "transcribing",
          }));

          try {
            const capture = await stopNativeVoiceCapture();
            const transcription = await transcribeNativeVoiceCapture(capture);

            if (transcription.status === "ready") {
              const pendingCommand: VoiceCommandRequest = {
                text: transcription.transcript.text,
                source: voiceRuntime.activationSource ?? "settings",
                createdAt: new Date().toISOString(),
              };

              setVoiceRuntime((currentState) => ({
                ...currentState,
                enabled: false,
                permission: "granted",
                status: "command_ready",
                transcript: transcription.transcript,
                pendingCommand,
                error: undefined,
              }));
            } else {
              setVoiceRuntime((currentState) => ({
                ...currentState,
                enabled: false,
                status: "error",
                error: transcription.error,
              }));
            }
          } catch (error) {
            setVoiceRuntime((currentState) => ({
              ...currentState,
              enabled: false,
              status: "error",
              error: error instanceof Error ? error.message : String(error),
            }));
          }

          return;
        }

        voiceSessionRef.current?.stop();
        voiceSessionRef.current = null;
        setVoiceRuntime((currentState) =>
          currentState.enabled
            ? {
                ...currentState,
                status:
                  currentState.status === "command_ready"
                    ? "command_ready"
                    : "transcribing",
              }
            : currentState,
        );
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
  }, [overlaySnapshot, debugSnapshot, viewport, guidanceResult, workflowRuntime]);

  useEffect(() => {
    if (!voiceRuntime.enabled || voiceRuntime.activationSource !== "debug") {
      return;
    }

    let session: VoiceRecognitionSession | null = null;

    try {
      session = startVoiceRecognition({
        onStart: () => {
          setVoiceRuntime((currentState) => ({
            ...currentState,
            permission: "granted",
            status: "listening",
            error: undefined,
          }));
        },
        onTranscript: (transcript: VoiceTranscript) => {
          setVoiceRuntime((currentState) => {
            const pendingCommand: VoiceCommandRequest | undefined = transcript.isFinal
              ? {
                  text: transcript.text,
                  source: currentState.activationSource ?? "settings",
                  createdAt: new Date().toISOString(),
                }
              : currentState.pendingCommand;

            return {
              ...currentState,
              status: transcript.isFinal ? "command_ready" : "listening",
              transcript,
              pendingCommand,
              error: undefined,
            };
          });
        },
        onEnd: () => {
          setVoiceRuntime((currentState) =>
            currentState.status === "command_ready"
              ? {
                  ...currentState,
                  enabled: false,
                }
              : {
                  ...currentState,
                  enabled: false,
                  status: "idle",
                },
          );
          voiceSessionRef.current = null;
        },
        onError: (message) => {
          setVoiceRuntime((currentState) => ({
            ...currentState,
            enabled: false,
            permission:
              message.toLowerCase().includes("not allowed") ||
              message.toLowerCase().includes("denied")
                ? "denied"
                : currentState.permission === "unknown"
                  ? "error"
                  : currentState.permission,
            status: "error",
            error: message,
          }));
          voiceSessionRef.current = null;
        },
      });
      voiceSessionRef.current = session;
    } catch (error) {
      setVoiceRuntime((currentState) => ({
        ...currentState,
        enabled: false,
        permission: "unsupported",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    }

    return () => {
      if (voiceSessionRef.current === session) {
        session?.abort();
        voiceSessionRef.current = null;
      }
    };
  }, [voiceRuntime.enabled, voiceRuntime.activationSource]);

  useEffect(() => {
    const command = voiceRuntime.pendingCommand;

    if (voiceRuntime.status !== "command_ready" || command == null) {
      return;
    }

    const commandKey = `${command.createdAt}:${command.text}`;

    if (routedVoiceCommandRef.current === commandKey) {
      return;
    }

    routedVoiceCommandRef.current = commandKey;
    setVoiceRuntime((currentState) => ({
      ...currentState,
      status: "transcribing",
    }));
    void refreshCaptureMetadata(command.text).finally(() => {
      setVoiceRuntime((currentState) =>
        currentState.pendingCommand?.createdAt === command.createdAt
          ? {
              ...currentState,
              status: "command_ready",
            }
          : currentState,
      );
    });
  }, [
    voiceRuntime.status,
    voiceRuntime.pendingCommand,
    viewport,
    guidanceFixture,
    guidanceResult,
  ]);

  return (
    <main
      className={`overlay-shell is-${stateMeta[overlayState].tone}`}
      aria-label="Toki overlay"
    >
      {overlayState !== "idle" && hasAcceptedGuidance && (
        <>
          <PointerRing target={activeTarget} />
          {overlayState === "confirmation_required" && safetyDecision != null ? (
            <ConfirmationBubble decision={safetyDecision} target={activeTarget} />
          ) : (
            <StepBubble step={activeStep} target={activeTarget} />
          )}
        </>
      )}
      <AssistantPuck
        state={overlayState}
        motion={puckMotion}
        pointerShadow={pointerShadow}
        targetVector={puckTargetVector}
      />
      {workflowRuntime.status === "active" ? (
        <WorkflowStepCue
          runtime={workflowRuntime}
          step={currentWorkflowStep}
          pointerShadow={pointerShadow}
          onPrevious={() => {
            emitTo("overlay", "toki://overlay-command", {
              type: "retreat-workflow-step",
            } satisfies OverlayCommand).catch(() => undefined);
          }}
          onNext={() => {
            emitTo("overlay", "toki://overlay-command", {
              type: "advance-workflow-step",
            } satisfies OverlayCommand).catch(() => undefined);
          }}
          onStop={() => {
            emitTo("overlay", "toki://overlay-command", {
              type: "stop-workflow",
            } satisfies OverlayCommand).catch(() => undefined);
          }}
        />
      ) : null}
      <VoiceStatusCue voiceRuntime={voiceRuntime} pointerShadow={pointerShadow} />
    </main>
  );
}

function SettingsWindowApp() {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [hasAcceptedGuidance, setHasAcceptedGuidance] = useState(false);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);
  const [voiceRuntime, setVoiceRuntime] = useState<VoiceRuntimeState>(() =>
    createDefaultVoiceRuntimeState(),
  );
  const isSpaceVoiceHeldRef = useRef(false);

  function hideSettings() {
    invoke("hide_settings_window").catch(() => {
      overlayWindow.hide().catch(() => undefined);
    });
  }

  function startSettingsDrag() {
    overlayWindow
      .startDragging()
      .catch(() => undefined);
  }

  useEffect(() => {
    let unlistenState: (() => void) | undefined;

    listen<OverlaySnapshot>("toki://overlay-state", (event) => {
      setOverlayState(event.payload.overlayState);
      setHasAcceptedGuidance(event.payload.hasAcceptedGuidance);
      setIsRefreshingCapture(event.payload.isRefreshingCapture);
      setVoiceRuntime(event.payload.voiceRuntime);
    })
      .then((cleanup) => {
        unlistenState = cleanup;
      })
      .catch(() => {
        unlistenState = undefined;
      });

    emitTo("overlay", "toki://overlay-command", {
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

    function shouldIgnorePushToTalkShortcut(event: KeyboardEvent) {
      const target = event.target;
      return (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        (target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        hideSettings();
        return;
      }

      if (
        event.code === "Space" &&
        !event.repeat &&
        !isSpaceVoiceHeldRef.current &&
        !shouldIgnorePushToTalkShortcut(event)
      ) {
        event.preventDefault();
        isSpaceVoiceHeldRef.current = true;
        emitTo("overlay", "toki://overlay-command", {
          type: "start-voice-listening",
          source: "settings",
        } satisfies OverlayCommand).catch(() => undefined);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space" && isSpaceVoiceHeldRef.current) {
        event.preventDefault();
        isSpaceVoiceHeldRef.current = false;
        emitTo("overlay", "toki://overlay-command", {
          type: "submit-voice-listening",
        } satisfies OverlayCommand).catch(() => undefined);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      unlistenFocus?.();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <main className="settings-shell" aria-label="Toki settings window">
      <SettingsPopup
        overlayState={overlayState}
        hasAcceptedGuidance={hasAcceptedGuidance}
        isRefreshingCapture={isRefreshingCapture}
        voiceRuntime={voiceRuntime}
        onRefreshCapture={() => {
          emitTo("overlay", "toki://overlay-command", {
            type: "refresh-capture",
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onPauseToggle={() => {
          emitTo("overlay", "toki://overlay-command", {
            type: "toggle-pause",
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onVoicePressStart={() => {
          emitTo("overlay", "toki://overlay-command", {
            type: "start-voice-listening",
            source: "settings",
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onVoicePressEnd={() => {
          emitTo("overlay", "toki://overlay-command", {
            type: "submit-voice-listening",
          } satisfies OverlayCommand).catch(() => undefined);
        }}
        onStartDrag={startSettingsDrag}
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
  const [activeDebugTab, setActiveDebugTab] = useState<DebugTab>("runtime");
  const [guidanceTesterVerdict, setGuidanceTesterVerdict] = useState<
    "untested" | "useful" | "wrong"
  >("untested");
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceSummary[]>([]);
  const [cameraProbeStatus, setCameraProbeStatus] = useState<
    "idle" | "probing" | "ready" | "unsupported" | "error"
  >("idle");
  const [cameraProbeError, setCameraProbeError] = useState<string | null>(null);
  const [voiceProbe, setVoiceProbe] = useState<VoiceCapabilityProbe | null>(null);
  const [voiceProbeStatus, setVoiceProbeStatus] = useState<
    "idle" | "probing" | "requesting" | "ready" | "unsupported" | "error"
  >("idle");
  const [voiceProbeError, setVoiceProbeError] = useState<string | null>(null);
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
  const cameraLabelsMayBeHidden =
    cameraProbeStatus === "ready" &&
    cameraDevices.length > 0 &&
    cameraDevices.every((device) => /^Camera \d+$/.test(device.label));
  const screenshot = snapshot.screenshotCapture;
  const guidanceStep = snapshot.guidanceResult?.step ?? null;
  const target = guidanceStep?.target ?? null;
  const guidanceGoal =
    snapshot.guidanceRequest?.goal ??
    snapshot.voiceRuntime.transcript?.text ??
    "No goal submitted";
  const guidanceScreen = snapshot.guidanceRequest?.screen ?? null;
  const guidancePayload = guidanceScreen?.screenshotPayload ?? null;
  const guidanceCandidateCount = guidanceScreen?.candidates?.length ?? 0;
  const guidanceCandidateSource = guidanceScreen?.candidateSource ?? "none";
  const guidanceCandidates = guidanceScreen?.candidates?.slice(0, 8) ?? [];
  const guidancePayloadSize = guidancePayload
    ? `${(guidancePayload.byteLength / 1024 / 1024).toFixed(2)} MB`
    : "Missing";
  const guidancePayloadPlan = guidancePayload
    ? guidancePayload.byteLength > 2_000_000
      ? "Downscale before provider"
      : "Ready for smoke test"
    : "Capture required";
  const debugVoiceStatusDetails = getVoiceStatusDetails(snapshot.voiceRuntime);
  const currentWorkflowStep =
    snapshot.workflowRuntime.plan?.steps[snapshot.workflowRuntime.currentStepIndex] ??
    null;
  const workflowSteps = snapshot.workflowRuntime.plan?.steps ?? [];

  function sendOverlayCommand(command: OverlayCommand) {
    emitTo("overlay", "toki://overlay-command", command).catch(() => undefined);
  }

  function testGuidanceFixture() {
    setGuidanceTesterVerdict("untested");
    sendOverlayCommand({
      type: "set-guidance-fixture",
      fixture: "safe",
    });
    sendOverlayCommand({ type: "refresh-capture" });
  }

  function testRealGuidanceSmoke() {
    setGuidanceTesterVerdict("untested");
    sendOverlayCommand({ type: "run-real-guidance-smoke" });
  }

  function startMockWorkflow(goal: string) {
    sendOverlayCommand({
      type: "start-mock-workflow",
      goal,
    });
  }

  function refreshVoiceCapabilities(requestMicrophone = false) {
    setVoiceProbeStatus(requestMicrophone ? "requesting" : "probing");
    setVoiceProbeError(null);

    probeVoiceCapabilities({ requestMicrophone })
      .then((result) => {
        setVoiceProbe(result);
        setVoiceProbeStatus(
          result.mediaDevicesSupported || result.speechRecognition.supported
            ? "ready"
            : "unsupported",
        );
        setVoiceProbeError(result.error ?? null);
      })
      .catch((error: unknown) => {
        setVoiceProbeStatus("error");
        setVoiceProbeError(error instanceof Error ? error.message : String(error));
      });
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

    listen<DebugSnapshot>("toki://debug-state", (event) => {
      setSnapshot(event.payload);
    })
      .then((cleanup) => {
        unlistenState = cleanup;
      })
      .catch(() => {
        unlistenState = undefined;
      });

    emitTo("overlay", "toki://overlay-command", {
      type: "request-state",
    } satisfies OverlayCommand).catch(() => undefined);
    refreshVoiceCapabilities(false);
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
    <main className="debug-shell" aria-label="Toki debug window">
      <section className="debug-window">
        <header className="debug-window-header">
          <div>
            <p>Internal</p>
            <h1>Toki Debug</h1>
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

        <div className="debug-tabs" role="tablist" aria-label="Debug sections">
          {debugTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeDebugTab === tab.id}
              data-active={activeDebugTab === tab.id}
              onClick={() => {
                setActiveDebugTab(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="debug-actions">
          <button
            type="button"
            onClick={() => {
              sendOverlayCommand({ type: "request-state" });
            }}
          >
            Sync
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveDebugTab("guidance");
              testRealGuidanceSmoke();
            }}
            disabled={snapshot.isRefreshingCapture}
          >
            Real smoke
          </button>
        </div>

        <div className="debug-window-grid">
          {activeDebugTab === "runtime" ? (
            <>
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
            <p className="debug-muted">
              Pinch recognizes when thumb and index distance drops below the
              threshold, then the smoothed gesture reaches recognized.
            </p>
          </section>

          <section className="debug-section">
            <h2>Workflow Runtime</h2>
            <div className="debug-section-header-row">
              <span>{snapshot.workflowRuntime.status}</span>
              <button
                type="button"
                onClick={() => {
                  startMockWorkflow("Create a new project");
                }}
              >
                Start mock
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({ type: "clear-workflow" });
                }}
                disabled={snapshot.workflowRuntime.status === "idle"}
              >
                Clear
              </button>
            </div>
            <dl>
              <div>
                <dt>Plan</dt>
                <dd>{snapshot.workflowRuntime.plan?.title ?? "None"}</dd>
              </div>
              <div>
                <dt>Step</dt>
                <dd>
                  {currentWorkflowStep != null
                    ? `${currentWorkflowStep.index + 1}. ${currentWorkflowStep.title}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Verification</dt>
                <dd>{snapshot.workflowRuntime.lastVerification?.status ?? "None"}</dd>
              </div>
              <div>
                <dt>Blocked</dt>
                <dd>{snapshot.workflowRuntime.blockedReason ?? "No"}</dd>
              </div>
            </dl>
            <p className="debug-muted">
              This only stores workflow state. Step verification and next/back
              controls are added in later Phase 13 steps.
            </p>
          </section>
            </>
          ) : null}

          {activeDebugTab === "workflow" ? (
            <>
          <section className="debug-section debug-section-wide">
            <h2>Workflow Plan</h2>
            <div className="debug-section-header-row">
              <span>{snapshot.workflowRuntime.status}</span>
              <button
                type="button"
                onClick={() => {
                  startMockWorkflow("Create a new project");
                }}
              >
                Start create project
              </button>
              <button
                type="button"
                onClick={() => {
                  startMockWorkflow("Open settings");
                }}
              >
                Start settings
              </button>
              <button
                type="button"
                onClick={() => {
                  startMockWorkflow("Export report");
                }}
              >
                Start export
              </button>
            </div>
            <dl>
              <div>
                <dt>Plan</dt>
                <dd>{snapshot.workflowRuntime.plan?.title ?? "None"}</dd>
              </div>
              <div>
                <dt>Goal</dt>
                <dd>{snapshot.workflowRuntime.plan?.goal ?? "None"}</dd>
              </div>
              <div>
                <dt>Current step</dt>
                <dd>
                  {currentWorkflowStep != null
                    ? `${currentWorkflowStep.index + 1} / ${workflowSteps.length}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Verification</dt>
                <dd>{snapshot.workflowRuntime.lastVerification?.status ?? "None"}</dd>
              </div>
              <div>
                <dt>Blocked reason</dt>
                <dd>{snapshot.workflowRuntime.blockedReason ?? "None"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{snapshot.workflowRuntime.plan?.createdAt ?? "None"}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section">
            <h2>Current Step</h2>
            <div className="debug-section-header-row">
              <span>{currentWorkflowStep?.status ?? "none"}</span>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({ type: "retreat-workflow-step" });
                }}
                disabled={snapshot.workflowRuntime.currentStepIndex <= 0}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({ type: "advance-workflow-step" });
                }}
                disabled={snapshot.workflowRuntime.plan == null}
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({ type: "stop-workflow" });
                }}
                disabled={snapshot.workflowRuntime.plan == null}
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({ type: "clear-workflow" });
                }}
                disabled={snapshot.workflowRuntime.status === "idle"}
              >
                Clear
              </button>
            </div>
            <dl>
              <div>
                <dt>Title</dt>
                <dd>{currentWorkflowStep?.title ?? "None"}</dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{currentWorkflowStep?.kind ?? "None"}</dd>
              </div>
              <div>
                <dt>Risk</dt>
                <dd>{currentWorkflowStep?.risk ?? "None"}</dd>
              </div>
              <div>
                <dt>Confirm</dt>
                <dd>{currentWorkflowStep?.requiresConfirmation ? "Required" : "No"}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{currentWorkflowStep?.target?.label ?? "None"}</dd>
              </div>
              <div>
                <dt>Instruction</dt>
                <dd>{currentWorkflowStep?.instruction ?? "None"}</dd>
              </div>
            </dl>
            <p className="debug-muted">
              Verification is still manual state only. Step 13.7 connects this
              to candidate checks on the next capture.
            </p>
          </section>

          <section className="debug-section debug-section-wide">
            <h2>Plan Steps</h2>
            {workflowSteps.length > 0 ? (
              <ol className="debug-workflow-steps">
                {workflowSteps.map((step) => (
                  <li
                    key={step.id}
                    data-active={step.id === snapshot.workflowRuntime.currentStepId}
                  >
                    <span className="debug-workflow-step-index">
                      {step.index + 1}
                    </span>
                    <span>
                      <strong>{step.title}</strong>
                      <small>{step.instruction}</small>
                    </span>
                    <span className="debug-workflow-step-status">
                      {step.status}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="debug-muted">
                Start a mock workflow to inspect the full plan.
              </p>
            )}
          </section>
            </>
          ) : null}

          {activeDebugTab === "voice" ? (
            <>
          <section className="debug-section">
            <h2>Voice Runtime</h2>
            <div className="debug-section-header-row">
              <span>{debugVoiceStatusDetails.label}</span>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({
                    type: "start-voice-listening",
                    source: "debug",
                  });
                }}
                disabled={snapshot.voiceRuntime.status === "listening"}
              >
                Start Web Speech
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({ type: "stop-voice-listening" });
                }}
                disabled={
                  !snapshot.voiceRuntime.enabled &&
                  snapshot.voiceRuntime.status !== "command_ready" &&
                  snapshot.voiceRuntime.status !== "transcribing"
                }
              >
                Stop
              </button>
            </div>
            <dl>
              <div>
                <dt>Enabled</dt>
                <dd>{snapshot.voiceRuntime.enabled ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Permission</dt>
                <dd>{snapshot.voiceRuntime.permission}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{snapshot.voiceRuntime.activationSource ?? "None"}</dd>
              </div>
              <div>
                <dt>Transcript</dt>
                <dd>{snapshot.voiceRuntime.transcript?.text ?? "None"}</dd>
              </div>
              <div>
                <dt>Command</dt>
                <dd>{snapshot.voiceRuntime.pendingCommand?.text ?? "None"}</dd>
              </div>
              <div>
                <dt>Error</dt>
                <dd>{snapshot.voiceRuntime.error ?? "None"}</dd>
              </div>
            </dl>
            <p className="debug-muted">
              {debugVoiceStatusDetails.message}. Web Speech is debug-only until
              native microphone capture and cloud transcription are connected.
            </p>
          </section>

          <section className="debug-section">
            <h2>Voice Capabilities</h2>
            <div className="debug-section-header-row">
              <span>{voiceProbeStatus}</span>
              <button
                type="button"
                onClick={() => {
                  refreshVoiceCapabilities(false);
                }}
                disabled={
                  voiceProbeStatus === "probing" || voiceProbeStatus === "requesting"
                }
              >
                {voiceProbeStatus === "probing" ? "Probing" : "Probe"}
              </button>
              <button
                type="button"
                onClick={() => {
                  refreshVoiceCapabilities(true);
                }}
                disabled={
                  voiceProbeStatus === "probing" || voiceProbeStatus === "requesting"
                }
              >
                {voiceProbeStatus === "requesting" ? "Requesting" : "Request mic"}
              </button>
            </div>
            {voiceProbeError ? <p className="debug-muted">{voiceProbeError}</p> : null}
            {voiceProbe ? (
              <>
                <dl>
                  <div>
                    <dt>Permission</dt>
                    <dd>{voiceProbe.microphonePermission}</dd>
                  </div>
                  <div>
                    <dt>Media devices</dt>
                    <dd>{voiceProbe.mediaDevicesSupported ? "Available" : "Missing"}</dd>
                  </div>
                  <div>
                    <dt>getUserMedia</dt>
                    <dd>{voiceProbe.getUserMediaSupported ? "Available" : "Missing"}</dd>
                  </div>
                  <div>
                    <dt>Permissions API</dt>
                    <dd>{voiceProbe.permissionsApiSupported ? "Available" : "Missing"}</dd>
                  </div>
                  <div>
                    <dt>Speech API</dt>
                    <dd>{voiceProbe.speechRecognition.api}</dd>
                  </div>
                  <div>
                    <dt>Checked</dt>
                    <dd>{voiceProbe.checkedAt}</dd>
                  </div>
                </dl>
                {voiceProbe.microphones.length > 0 ? (
                  <ul className="debug-device-list">
                    {voiceProbe.microphones.map((microphone) => (
                      <li key={microphone.id}>
                        <span>{microphone.label}</span>
                        <small>{microphone.isDefault ? "default" : "audio input"}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="debug-muted">No microphone devices reported yet.</p>
                )}
              </>
            ) : (
              <p className="debug-muted">Voice capabilities have not been probed yet.</p>
            )}
          </section>

            </>
          ) : null}

          {activeDebugTab === "gesture" ? (
            <>
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
            {cameraLabelsMayBeHidden ? (
              <p className="debug-muted">
                macOS may hide camera names until camera permission is granted.
              </p>
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

          <section className="debug-section">
            <h2>Safety Review</h2>
            <dl>
              <div>
                <dt>Action</dt>
                <dd>{snapshot.safetyDecision?.action ?? "None"}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{snapshot.safetyDecision?.reason ?? "None"}</dd>
              </div>
              <div>
                <dt>Risk</dt>
                <dd>{snapshot.safetyDecision?.risk ?? guidanceStep?.risk ?? "None"}</dd>
              </div>
              <div>
                <dt>Confirm</dt>
                <dd>
                  {snapshot.safetyDecision?.requiresConfirmation
                    ? "Required"
                    : "Not required"}
                </dd>
              </div>
            </dl>
            <p>
              {snapshot.safetyDecision?.message ??
                "Run real guidance to review the safety policy decision."}
            </p>
            {snapshot.safetyDecision?.details?.length ? (
              <ul>
                {snapshot.safetyDecision.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
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
                Camera permission is denied. On macOS, enable Camera access for
                Toki or the terminal app in System Settings, then quit and relaunch.
              </p>
            ) : cameraPreviewStatus === "no_camera" ? (
              <p className="debug-muted">
                No usable camera was found. Toki remains available through tray and
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
            {handLandmarkerStatus === "loading" ? (
              <p className="debug-muted">
                Loading MediaPipe hand model. Internet access is required for the
                current model URL.
              </p>
            ) : handLandmarkerStatus === "no_hand" ? (
              <p className="debug-muted">
                Model is running. Put one open hand in the camera frame to detect
                landmarks.
              </p>
            ) : null}
          </section>

          <section className="debug-section debug-section-wide">
            <h2>Gesture Recognition</h2>
            <div className="debug-recognition-grid">
              <div className="debug-recognition-card">
                <h3>Pinch</h3>
                <dl>
                  <div>
                    <dt>Label</dt>
                    <dd>{pinchClassification.label}</dd>
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
                <p className="debug-muted">
                  Pinch recognizes when thumb and index distance drops below
                  threshold.
                </p>
              </div>

              <div className="debug-recognition-card">
                <h3>Open Palm</h3>
                <dl>
                  <div>
                    <dt>Label</dt>
                    <dd>{openPalmClassification.label}</dd>
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
                </dl>
                <p className="debug-muted">
                  Open palm recognizes when enough fingers are extended and spread.
                </p>
              </div>

              <div className="debug-recognition-card">
                <h3>Smoothed</h3>
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
                </dl>
              </div>

              <div className="debug-recognition-card">
                <h3>Action</h3>
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
              </div>
            </div>
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

            </>
          ) : null}

          {activeDebugTab === "capture" ? (
            <>
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
            </>
          ) : null}

          {activeDebugTab === "guidance" ? (
            <>
          <section className="debug-section">
            <h2>Guidance</h2>
            <div className="debug-section-header-row">
              <span>{snapshot.guidanceResult ? "ready" : "waiting"}</span>
              <button
                type="button"
                onClick={testGuidanceFixture}
                disabled={snapshot.isRefreshingCapture}
              >
                {snapshot.isRefreshingCapture ? "Testing" : "Test guidance"}
              </button>
              <button
                type="button"
                onClick={testRealGuidanceSmoke}
                disabled={snapshot.isRefreshingCapture}
              >
                Real smoke
              </button>
            </div>
            <dl>
              <div>
                <dt>Provider</dt>
                <dd>{snapshot.guidanceProviderMode}</dd>
              </div>
              <div>
                <dt>Safety</dt>
                <dd>{snapshot.safetyDecision?.action ?? "None"}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{snapshot.safetyDecision?.reason ?? "None"}</dd>
              </div>
              <div>
                <dt>Fixture</dt>
                <dd>{snapshot.guidanceFixture}</dd>
              </div>
              <div>
                <dt>Request</dt>
                <dd>{guidanceGoal}</dd>
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
                <dd>
                  {target?.candidateId
                    ? `${target.label} (${target.candidateId})`
                    : target?.label ?? "None"}
                </dd>
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
            <div className="debug-result-review">
              <div>
                <span>Target</span>
                <strong>{target?.label ?? "None"}</strong>
              </div>
              <div>
                <span>Coordinates</span>
                <strong>
                  {target
                    ? `${target.x}, ${target.y}, ${target.width} x ${target.height}`
                    : "None"}
                </strong>
              </div>
              <div>
                <span>Tester verdict</span>
                <div className="debug-verdict-controls">
                  {(["useful", "wrong"] as const).map((verdict) => (
                    <button
                      key={verdict}
                      type="button"
                      data-active={guidanceTesterVerdict === verdict}
                      onClick={() => setGuidanceTesterVerdict(verdict)}
                    >
                      {verdict}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {snapshot.guidanceProviderMode === "mock" ? (
              <p className="debug-muted">
                Mock guidance proves plumbing only. It is not real screen
                understanding.
              </p>
            ) : null}
            {snapshot.guidanceProviderError ? (
              <p className="debug-muted">
                Provider unavailable: {snapshot.guidanceProviderError}
              </p>
            ) : null}
          </section>

          <section className="debug-section debug-section-wide">
            <h2>Payload Gate</h2>
            <dl>
              <div>
                <dt>Goal</dt>
                <dd>{snapshot.guidanceRequest?.goal ? "Ready" : "Missing"}</dd>
              </div>
              <div>
                <dt>Display</dt>
                <dd>
                  {guidanceScreen
                    ? `${guidanceScreen.display.width} x ${guidanceScreen.display.height}`
                    : "Missing"}
                </dd>
              </div>
              <div>
                <dt>Screenshot</dt>
                <dd>
                  {guidanceScreen?.screenshot
                    ? `${guidanceScreen.screenshot.imageWidth} x ${guidanceScreen.screenshot.imageHeight}`
                    : "Missing"}
                </dd>
              </div>
              <div>
                <dt>Payload</dt>
                <dd>{guidancePayload ? `${guidancePayload.format} ${guidancePayloadSize}` : "Missing"}</dd>
              </div>
              <div>
                <dt>Calibration</dt>
                <dd>{guidanceScreen?.calibration?.status ?? "Missing"}</dd>
              </div>
              <div>
                <dt>Provider Plan</dt>
                <dd>{guidancePayloadPlan}</dd>
              </div>
              <div>
                <dt>Candidates</dt>
                <dd>
                  {guidanceCandidateCount} from {guidanceCandidateSource}
                </dd>
              </div>
              <div>
                <dt>Candidate Error</dt>
                <dd>{guidanceScreen?.candidateError ?? "None"}</dd>
              </div>
            </dl>
          </section>

          <section className="debug-section debug-section-wide">
            <h2>Ranked Candidates</h2>
            {guidanceCandidates.length > 0 ? (
              <ol className="debug-candidate-list">
                {guidanceCandidates.map((candidate, index) => (
                  <li key={candidate.id}>
                    <div>
                      <strong>
                        {index + 1}. {candidate.label}
                      </strong>
                      <span>
                        {candidate.id} / {candidate.role}
                      </span>
                    </div>
                    <div>
                      <span>
                        {candidate.x}, {candidate.y}, {candidate.width} x{" "}
                        {candidate.height}
                      </span>
                      {candidate.rank ? (
                        <span>
                          score {candidate.rank.score}:{" "}
                          {candidate.rank.reasons.join(", ") || "no reasons"}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="debug-muted">
                No candidates were attached to the latest guidance request.
              </p>
            )}
          </section>

            </>
          ) : null}
        </div>

        {activeDebugTab === "guidance" && snapshot.guidanceIssues.length > 0 && (
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
