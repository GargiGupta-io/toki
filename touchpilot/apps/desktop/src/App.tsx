import { useEffect, useMemo, useRef, useState } from "react";
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
  requiresTargetRevealAcknowledgment,
  validateGuidanceResult,
} from "@toki/ai";
import type {
  ActiveWindowBounds,
  ActiveWindowCaptureSnapshot,
  AdaptiveGestureProfile,
  CaptureMetadata,
  ClickAwareNativeClick,
  ClickAwareRuntimeState,
  CoordinateCalibration,
  DisplayContext,
  GuidanceRequest,
  GuidanceProviderMode,
  GuidanceProviderResponse,
  GuidanceResult,
  GuidanceScreenContext,
  GuidanceSession,
  GuidanceStep,
  GuidanceTrace,
  GuidanceTraceDetail,
  GuidanceTraceSource,
  GuidanceTraceStage,
  GuidanceValidationIssue,
  GestureClassification,
  PointerEvidenceFingerprint,
  PointerLockSnapshot,
  GestureRuntimeState,
  ScreenshotCapture,
  ScreenshotMetadata,
  ScreenCandidate,
  SafetyPolicyDecision,
  RawProviderTarget,
  TargetBox,
  VoiceActivationSource,
  VoiceCommandRequest,
  VoiceRuntimeState,
  WorkflowRuntimeState,
  WorkflowStep,
  WorkflowVerificationResult,
} from "@toki/shared";
import {
  acceptGestureCalibrationCandidate,
  clearAdaptiveGestureProfile,
  createIdleGestureCalibrationSession,
  getGestureCalibrationStageProgress,
  loadAdaptiveGestureProfile,
  offerGestureCalibrationCandidate,
  rejectGestureCalibrationCandidate,
  saveAdaptiveGestureProfile,
  startGestureCalibration,
  type GestureCalibrationCandidate,
  type GestureCalibrationSession,
} from "./gestureAdaptiveProfile";
import { createScreenshotCropFromDisplayRect } from "./coordinateTransforms";
import {
  canRevealGuidanceTarget,
  getAcceptedGuidanceResult,
} from "./guidanceAcceptance";
import {
  beginGuidanceTraceStage,
  createGuidanceTrace,
  createGuidanceTraceId,
  finishGuidanceTraceStage,
  getGuidanceTraceEvent,
} from "./guidanceTrace";
import {
  createSingleStepGuidanceTaskPlan,
  getGuidanceLocalizationContext,
  getGuidanceLocalizationObjective,
} from "./guidanceTaskPlanning";
import {
  isSameGestureVisualAnchor,
  type GestureVisualAnchor,
} from "./gestureVisuals";
import {
  createEmptyGestureRuntimeDiagnostics,
  createInactiveGestureClassification,
  getGestureActionForClassification,
  useAlwaysOnGestureRuntime,
  type GestureRuntimeDiagnostics,
} from "./gestureRuntime";
import { createPointerLockSnapshot } from "./gestureContracts";
import {
  createScreenStateFingerprint,
  getPointerLockInvalidationReason,
  type PointerLockInvalidationReason,
} from "./gestureTargetLock";
import {
  getNativeVoiceCaptureStatus,
  resetNativeVoiceCapture,
  startNativeVoiceCapture,
  stopNativeVoiceCapture,
} from "./nativeVoiceCapture";
import { getPointerShadowPosition, pointerShadowGeometry } from "./overlayGeometry";
import type {
  PointerShadowPosition,
  ViewportMetrics,
} from "./overlayGeometry";
import { createGuidanceProviderAdapter } from "./guidanceProvider";
import { verifyGuidanceTarget } from "./targetVerification";
import { requireScreenCaptureAccess } from "./captureAccess";
import {
  createProviderImagePreparationPlan,
  type ProviderImagePreparationPlan,
} from "./providerImagePreparation";
import { getPuckMotionModel } from "./puckMotion";
import { collectScreenCandidatesForGuidance } from "./screenCandidates";
import { getTokiCreatureState } from "./tokiCreatureState";
import { probeVoiceCapabilities } from "./voiceCapabilities";
import type { VoiceCapabilityProbe } from "./voiceCapabilities";
import {
  createIdleVoiceHoldState,
  transitionVoiceHold,
} from "./voiceHoldController";
import { transcribeNativeVoiceCapture } from "./voiceTranscription";
import type { OverlayState } from "./puckMotion";
import { BlobPuck } from "./BlobPuck";
import { TokiCreatureLayer } from "./TokiCreatureLayer";
import { TokiTopUtilitySurface } from "./TokiTopUtilitySurface";
import { TokiTaskProgress } from "./TokiTaskProgress";
import { TokiPointerLockCue } from "./TokiPointerLockCue";
import {
  getPassiveTopUtilityMode,
  isInsideExpandedTopUtility,
  isTopUtilityRevealPoint,
  TOP_UTILITY_LEAVE_DELAY_MS,
  TOP_UTILITY_REVEAL_DWELL_MS,
  type TokiTopStatusModel,
  type TopUtilityMode,
  type TopUtilityModeEvent,
} from "./topUtility";
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

function setTopUtilityWindowMode(
  mode: TopUtilityMode,
  options: { focus?: boolean } = {},
) {
  return invoke("set_top_utility_mode", {
    request: {
      mode,
      focus: options.focus ?? false,
    },
  });
}

type OverlaySnapshot = {
  overlayState: OverlayState;
  hasAcceptedGuidance: boolean;
  isRefreshingCapture: boolean;
  gestureRuntime: GestureRuntimeState;
  voiceRuntime: VoiceRuntimeState;
  topStatus: TokiTopStatusModel | null;
};

type DebugSnapshot = OverlaySnapshot & {
  gestureDiagnostics: GestureRuntimeDiagnostics;
  adaptiveGestureProfile: AdaptiveGestureProfile | null;
  gestureCalibration: GestureCalibrationSession;
  guidanceTrace: GuidanceTrace | null;
  guidanceProviderMode: GuidanceProviderMode;
  guidanceProviderName: string | null;
  guidanceProviderDebug: GuidanceProviderResponse["debug"] | null;
  guidanceFixture: GuidanceFixture;
  workflowRuntime: WorkflowRuntimeState;
  clickAwareRuntime: ClickAwareRuntimeState;
  captureMetadata: CaptureMetadata | null;
  screenshotCapture: ScreenshotCapture | null;
  guidanceRequest: GuidanceRequest | null;
  guidanceResult: GuidanceResult | null;
  guidanceSession: GuidanceSession | null;
  guidanceIssues: GuidanceValidationIssue[];
  guidanceProviderError: string | null;
  safetyDecision: SafetyPolicyDecision | null;
  captureError: string | null;
  viewport: ViewportMetrics;
  calibration: CoordinateCalibration;
  gesturePointerLock: PointerLockSnapshot | null;
  gesturePointerLockFeedback: GesturePointerLockFeedback;
};

type GesturePointerLockFeedback = {
  validation: "idle" | "checking" | "locked" | "invalidated";
  reason: PointerLockInvalidationReason | null;
  updatedAt: string;
};

type OverlayCommand =
  | {
      type: "refresh-capture";
      goal?: string;
      providerMode?: GuidanceProviderMode;
    }
  | { type: "run-real-guidance-smoke" }
  | { type: "toggle-pause" }
  | { type: "reveal-risky-target" }
  | { type: "request-state" }
  | { type: "set-state"; state: OverlayState }
  | { type: "set-guidance-fixture"; fixture: GuidanceFixture }
  | { type: "start-mock-workflow"; goal: string }
  | { type: "clear-workflow" }
  | { type: "continue-guidance-session" }
  | { type: "advance-workflow-step" }
  | { type: "retreat-workflow-step" }
  | { type: "stop-workflow" }
  | { type: "set-camera-enabled"; enabled: boolean }
  | { type: "refresh-camera-devices" }
  | { type: "set-gestures-enabled"; enabled: boolean }
  | { type: "start-gesture-calibration" }
  | { type: "accept-gesture-calibration-sample" }
  | { type: "reject-gesture-calibration-sample" }
  | { type: "reset-gesture-profile" }
  | { type: "start-voice-listening"; source: VoiceActivationSource }
  | { type: "submit-voice-listening" }
  | { type: "stop-voice-listening" };

type NativeClickMonitorStatus = {
  armed: boolean;
  supported: boolean;
  source: ClickAwareNativeClick["source"];
};

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

const clickAwareHitPadding = 18;

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
  if (message.includes("On macOS, grant Screen Recording permission")) {
    return message;
  }

  const looksPermissionRelated = isCapturePermissionError(message);

  if (!looksPermissionRelated) {
    return message;
  }

  return `${message}. On macOS, grant Screen Recording permission to Toki or the terminal app, then quit and relaunch it.`;
}

function formatTargetBox(target: TargetBox | null | undefined): string {
  return target == null
    ? "None"
    : `${target.x}, ${target.y}, ${target.width} x ${target.height}`;
}

function formatVisionRawTarget(
  trace: NonNullable<GuidanceProviderResponse["debug"]>["vision"] | null | undefined,
): string {
  const raw = trace?.rawTarget;
  if (raw == null) {
    return "None";
  }

  if (raw.centerX != null && raw.centerY != null) {
    return `${Math.round(raw.centerX)}, ${Math.round(raw.centerY)} center`;
  }

  if (raw.x != null && raw.y != null) {
    return `${Math.round(raw.x)}, ${Math.round(raw.y)} top-left`;
  }

  return "Unknown";
}

function formatRawProviderTarget(
  target: RawProviderTarget | null | undefined,
): string {
  if (target == null) {
    return "None";
  }

  const label = target.label?.trim() || "blank label";
  const candidate = target.candidateId ? ` candidate=${target.candidateId}` : "";

  if (target.centerX != null && target.centerY != null) {
    return `${label}: ${Math.round(target.centerX)}, ${Math.round(target.centerY)} center; ${target.width ?? "?"} x ${target.height ?? "?"}${candidate}`;
  }

  if (target.x != null && target.y != null) {
    return `${label}: ${Math.round(target.x)}, ${Math.round(target.y)} top-left; ${target.width ?? "?"} x ${target.height ?? "?"}${candidate}`;
  }

  return `${label}:${candidate || " no rectangle"}`;
}

function isCapturePermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("no display available") ||
    normalizedMessage.includes("screen recording") ||
    normalizedMessage.includes("screen capture") ||
    normalizedMessage.includes("capture_screenshot") ||
    normalizedMessage.includes("not authorized to capture") ||
    normalizedMessage.includes("record this computer")
  );
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecoverableVoiceTranscriptionError(error: unknown): boolean {
  const normalizedMessage = formatErrorMessage(error).toLowerCase();

  return (
    normalizedMessage.includes("no usable audio") ||
    normalizedMessage.includes("empty transcript") ||
    normalizedMessage.includes("blank_audio") ||
    normalizedMessage.includes("inaudible") ||
    normalizedMessage.includes("silence") ||
    normalizedMessage.includes("no speech")
  );
}

function getVoiceRetryMessage(): string {
  return "I didn't catch that. Hold Option and speak again.";
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

  if (voiceRuntime.status === "no_speech") {
    return {
      tone: "idle",
      label: "Try again",
      message: voiceRuntime.error || getVoiceRetryMessage(),
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

function getTokiTopStatusModel({
  voiceRuntime,
  overlayState,
  isRefreshingCapture,
  guidanceFailure,
  hasAcceptedGuidance,
  targetLabel,
  instruction,
  safetyDecision,
  gestureClassification,
}: {
  voiceRuntime: VoiceRuntimeState;
  overlayState: OverlayState;
  isRefreshingCapture: boolean;
  guidanceFailure: string | null;
  hasAcceptedGuidance: boolean;
  targetLabel: string;
  instruction: string;
  safetyDecision: SafetyPolicyDecision | null;
  gestureClassification: GestureClassification;
}): TokiTopStatusModel | null {
  if (overlayState === "paused") {
    return {
      mode: "paused",
      label: "Toki paused",
      message: "Resume when you're ready",
    };
  }

  if (overlayState === "confirmation_required") {
    return {
      mode: "confirming",
      label: "Sensitive target hidden",
      message:
        safetyDecision?.message ??
        "Choose Show target to reveal the guidance marker. Toki will not click it.",
    };
  }

  const voiceDetails = getVoiceStatusDetails(voiceRuntime);
  if (
    voiceRuntime.status === "requesting_microphone" ||
    voiceRuntime.status === "listening" ||
    voiceRuntime.status === "transcribing"
  ) {
    return {
      mode:
        voiceRuntime.status === "listening"
          ? "listening"
          : voiceRuntime.status === "transcribing"
            ? "transcribing"
            : "thinking",
      label: voiceDetails.label,
      message: voiceDetails.message,
    };
  }

  if (
    gestureClassification.label !== "none" &&
    gestureClassification.phase !== "inactive" &&
    gestureClassification.phase !== "cooldown"
  ) {
    const isPinch = gestureClassification.label === "pinch";
    const isRecognized = gestureClassification.phase === "recognized";

    return {
      mode: "gesture",
      label: isRecognized
        ? "Gesture accepted"
        : isPinch
          ? "Pinch detected"
          : "Open palm detected",
      message: isRecognized
        ? isPinch
          ? "Opening voice capture"
          : "Pausing Toki"
        : isPinch
          ? "Hold to activate"
          : "Hold to pause",
    };
  }

  if (isRefreshingCapture || overlayState === "thinking") {
    return {
      mode: "thinking",
      label: "Finding the next step",
      message: "Reading the active screen",
    };
  }

  if (guidanceFailure != null || overlayState === "error") {
    return {
      mode: "error",
      label: "Guidance unavailable",
      message: guidanceFailure ?? "Toki could not complete this request",
    };
  }

  if (hasAcceptedGuidance) {
    if (safetyDecision?.action === "confirm") {
      return {
        mode: "warning",
        label: "Sensitive target shown",
        message: "Toki is only pointing. Review the action before you click.",
      };
    }

    if (safetyDecision?.reason === "sensitive_guidance_warning") {
      return {
        mode: "warning",
        label: targetLabel,
        message: safetyDecision.message,
      };
    }

    return {
      mode: "guiding",
      label: targetLabel,
      message: instruction,
    };
  }

  if (voiceDetails.visible) {
    return {
      mode: voiceDetails.tone === "error" ? "error" : "ready",
      label: voiceDetails.label,
      message: voiceDetails.message,
    };
  }

  return null;
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

const POINTER_SHADOW_UPDATE_THRESHOLD_PX = 2;

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

function getScreenshotPayload(screenshot: ScreenshotCapture): ScreenshotPayload {
  return {
    encoding: "base64" as const,
    format: screenshot.format,
    byteLength: screenshot.byteLength,
    imageWidth: screenshot.imageWidth,
    imageHeight: screenshot.imageHeight,
    imageBase64: screenshot.imageBase64,
  };
}

type ScreenshotPayload = NonNullable<GuidanceScreenContext["screenshotPayload"]>;
type ScreenCandidateContext = Pick<
  GuidanceScreenContext,
  "candidates" | "candidateSource" | "candidateEvidence" | "candidateError"
>;

function getPreferredAppNameFromGoal(goal: string) {
  const normalized = goal.toLowerCase();
  const knownApps = [
    "spotify",
    "edge",
    "chrome",
    "safari",
    "firefox",
    "finder",
    "claude",
    "basecamp",
    "doppler",
  ];

  return knownApps.find((appName) => normalized.includes(appName)) ?? null;
}

function getScreenshotSignature(screenshot: ScreenshotMetadata | ScreenshotCapture | null) {
  if (screenshot == null) {
    return "none";
  }

  const base = [
    screenshot.source,
    screenshot.format,
    screenshot.imageWidth,
    screenshot.imageHeight,
    screenshot.byteLength,
    screenshot.activeWindow?.appName ?? "",
    screenshot.activeWindow?.title ?? "",
  ].join(":");

  if (!("imageBase64" in screenshot)) {
    return base;
  }

  const sample = `${screenshot.imageBase64.slice(0, 96)}:${screenshot.imageBase64.slice(-96)}`;
  return `${base}:${sample}`;
}

function verifySessionScreenChange(
  session: GuidanceSession,
  screenshot: ScreenshotCapture,
): NonNullable<GuidanceSession["lastVerification"]> {
  const checkedAt = new Date().toISOString();

  if (session.lastScreenshot == null) {
    return {
      status: "changed",
      checkedAt,
      message: "No previous session screenshot was available, so the next step can proceed.",
    };
  }

  const previousSignature = getScreenshotSignature(session.lastScreenshot);
  const nextSignature = getScreenshotSignature(screenshot);

  if (previousSignature === nextSignature) {
    return {
      status: "unchanged",
      checkedAt,
      message: "The screen does not appear to have changed after the last target.",
    };
  }

  return {
    status: "changed",
    checkedAt,
    message: "The screen changed after the last target.",
  };
}

function estimateBase64ByteLength(imageBase64: string) {
  const padding = imageBase64.endsWith("==") ? 2 : imageBase64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((imageBase64.length * 3) / 4) - padding);
}

function renderProviderScreenshotImage(
  image: HTMLImageElement,
  plan: ProviderImagePreparationPlan,
): Omit<ScreenshotPayload, "crop"> | null {
  const canvas = document.createElement("canvas");
  canvas.width = plan.output.imageWidth;
  canvas.height = plan.output.imageHeight;
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const source = plan.sourceGeometry.region;
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    plan.output.imageWidth,
    plan.output.imageHeight,
  );
  const dataUrl = canvas.toDataURL(
    "image/jpeg",
    plan.preprocessing.jpegQuality,
  );
  const [, imageBase64 = ""] = dataUrl.split(",");

  if (!imageBase64) {
    return null;
  }

  return {
    encoding: "base64",
    format: plan.output.format,
    byteLength: estimateBase64ByteLength(imageBase64),
    imageWidth: plan.output.imageWidth,
    imageHeight: plan.output.imageHeight,
    imageBase64,
    sourceGeometry: plan.sourceGeometry,
    preprocessing: plan.preprocessing,
  };
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
  windowBounds?: ActiveWindowBounds | null,
): Promise<ScreenshotPayload> {
  const originalPayload = getScreenshotPayload(screenshot);
  const crop = getActiveWindowCrop(screenshot, windowBounds);

  if (crop != null) {
    const croppedPayload = await getCroppedScreenshotPayload(screenshot, crop);

    if (croppedPayload != null) {
      return croppedPayload;
    }
  }

  const plan = createProviderImagePreparationPlan({
    imageWidth: screenshot.imageWidth,
    imageHeight: screenshot.imageHeight,
    format: screenshot.format,
    byteLength: screenshot.byteLength,
  });

  if (!plan.shouldRender) {
    return {
      ...originalPayload,
      sourceGeometry: plan.sourceGeometry,
      preprocessing: plan.preprocessing,
    };
  }

  try {
    const image = await loadScreenshotImage(
      `data:image/${screenshot.format};base64,${screenshot.imageBase64}`,
    );
    return renderProviderScreenshotImage(image, plan) ?? originalPayload;
  } catch {
    return originalPayload;
  }
}

function getActiveWindowCrop(
  screenshot: ScreenshotCapture,
  windowBounds?: ActiveWindowBounds | null,
) {
  if (windowBounds == null) {
    return null;
  }

  const crop = createScreenshotCropFromDisplayRect(
    windowBounds,
    screenshot.display,
    { width: screenshot.imageWidth, height: screenshot.imageHeight },
  );

  if (crop == null) {
    return null;
  }

  return {
    source: "active_window" as const,
    appName: windowBounds.appName ?? undefined,
    title: windowBounds.title ?? undefined,
    ...crop,
  };
}

function candidateIntersectsRegion(
  candidate: ScreenCandidate,
  region: { x: number; y: number; width: number; height: number },
) {
  const candidateRight = candidate.x + candidate.width;
  const candidateBottom = candidate.y + candidate.height;
  const regionRight = region.x + region.width;
  const regionBottom = region.y + region.height;

  return (
    candidateRight > region.x &&
    candidate.x < regionRight &&
    candidateBottom > region.y &&
    candidate.y < regionBottom
  );
}

function filterCandidateContextForPayload(
  context: ScreenCandidateContext,
  payload: ScreenshotPayload,
  screenshot: ScreenshotCapture,
): ScreenCandidateContext {
  const crop = payload.crop;

  if (crop == null || context.candidates == null || context.candidates.length === 0) {
    return context;
  }

  const screenshotToDisplayX = screenshot.display.width / screenshot.imageWidth;
  const screenshotToDisplayY = screenshot.display.height / screenshot.imageHeight;
  const cropDisplayRegion = {
    x: crop.x * screenshotToDisplayX,
    y: crop.y * screenshotToDisplayY,
    width: crop.width * screenshotToDisplayX,
    height: crop.height * screenshotToDisplayY,
  };
  const filteredCandidates = context.candidates.filter((candidate) =>
    candidateIntersectsRegion(candidate, cropDisplayRegion),
  );

  if (filteredCandidates.length === context.candidates.length) {
    return context;
  }

  const filteredMessage = `Filtered ${
    context.candidates.length - filteredCandidates.length
  } candidate(s) outside the active-window crop.`;

  return {
    ...context,
    candidates: filteredCandidates,
    candidateEvidence: context.candidateEvidence
      ? {
          ...context.candidateEvidence,
          returnedCount: filteredCandidates.length,
        }
      : undefined,
    candidateError: context.candidateError
      ? `${context.candidateError} | ${filteredMessage}`
      : filteredCandidates.length === 0
        ? filteredMessage
        : context.candidateError,
  };
}

async function getCroppedScreenshotPayload(
  screenshot: ScreenshotCapture,
  crop: NonNullable<ReturnType<typeof getActiveWindowCrop>>,
): Promise<ScreenshotPayload | null> {
  try {
    const plan = createProviderImagePreparationPlan({
      imageWidth: screenshot.imageWidth,
      imageHeight: screenshot.imageHeight,
      format: screenshot.format,
      byteLength: screenshot.byteLength,
      crop,
    });
    const image = await loadScreenshotImage(
      `data:image/${screenshot.format};base64,${screenshot.imageBase64}`,
    );
    const payload = renderProviderScreenshotImage(image, plan);

    if (payload == null) {
      return null;
    }

    return {
      ...payload,
      crop,
    };
  } catch {
    return null;
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

function createGuidanceSession(goal: string, now = new Date().toISOString()): GuidanceSession {
  const id = `guidance-${Date.now().toString(36)}`;

  return {
    id,
    originalGoal: goal,
    taskPlan: createSingleStepGuidanceTaskPlan(`${id}-plan`, goal, now),
    currentStepIndex: 0,
    steps: [],
    lastScreenshot: null,
    previousTargets: [],
    completedTargets: [],
    failedTargets: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function getGuidanceSessionContext(session: GuidanceSession): GuidanceRequest["session"] {
  return {
    id: session.id,
    originalGoal: session.originalGoal,
    currentStepIndex: session.currentStepIndex,
    status: session.status,
    previousTargets: session.previousTargets.map((record) => record.target),
    completedTargets: session.completedTargets.map((record) => record.target),
    failedTargets: session.failedTargets.map((record) => record.target),
  };
}

function recordGuidanceSessionResult({
  session,
  result,
  screenshot,
  providerMode,
  allowed,
}: {
  session: GuidanceSession;
  result: GuidanceResult | null | undefined;
  screenshot: ScreenshotMetadata | null;
  providerMode: GuidanceProviderMode;
  allowed: boolean;
}): GuidanceSession {
  const now = new Date().toISOString();
  const step = result?.step ?? null;
  const target = step?.target ?? null;
  const nextStepIndex = target == null ? session.currentStepIndex : session.steps.length;
  const targetRecord =
    target == null
      ? null
      : {
          stepIndex: nextStepIndex,
          recordedAt: now,
          target,
          instruction: step?.instruction,
          confidence: step?.confidence,
          providerMode,
        };

  return {
    ...session,
    currentStepIndex: nextStepIndex,
    steps: step == null ? session.steps : [...session.steps, step],
    lastScreenshot: screenshot,
    previousTargets:
      targetRecord == null ? session.previousTargets : [...session.previousTargets, targetRecord],
    status: allowed && target != null ? "waiting_for_user" : "blocked",
    updatedAt: now,
  };
}

const LOCAL_CANDIDATE_MIN_SCORE = 30;
const LOCAL_OCR_CANDIDATE_MIN_SCORE = 38;

function inferCandidateRisk(candidate: ScreenCandidate): GuidanceStep["risk"] {
  const label = candidate.label.toLowerCase();

  if (/\b(delete|remove|trash|revoke)\b/.test(label)) {
    return "delete";
  }

  if (/\b(pay|payment|purchase|subscribe|checkout)\b/.test(label)) {
    return "payment";
  }

  if (/\b(send|submit|publish|post|share)\b/.test(label)) {
    return "external_send";
  }

  if (/\b(password|token|secret|security)\b/.test(label)) {
    return "security_change";
  }

  if (/\b(permission|privacy|admin|billing|account)\b/.test(label)) {
    return "permission_change";
  }

  return "safe_navigation";
}

function getCandidateScore(candidate: ScreenCandidate): number {
  return candidate.rank?.score ?? 0;
}

function isUsableLocalCandidate(candidate: ScreenCandidate): boolean {
  const score = getCandidateScore(candidate);
  const isOcrOnly = candidate.source === "ocr" || candidate.role === "ocr_text";
  const isNativeCandidate = candidate.source === "accessibility";
  const minScore = isOcrOnly
    ? LOCAL_OCR_CANDIDATE_MIN_SCORE
    : isNativeCandidate
      ? 26
      : LOCAL_CANDIDATE_MIN_SCORE;

  return score >= minScore;
}

function createLocalCandidateGuidance(
  request: GuidanceRequest,
): GuidanceProviderResponse {
  const candidates = request.screen.candidates ?? [];
  const candidate = candidates.find(isUsableLocalCandidate) ?? null;

  if (candidate == null) {
    const topCandidate = candidates[0];
    const detail = topCandidate
      ? ` Top candidate was "${topCandidate.label}" (${topCandidate.source}/${topCandidate.role}) with score ${getCandidateScore(topCandidate)}. Reasons: ${topCandidate.rank?.reasons.join(", ") || "none"}.`
      : request.screen.candidateError
        ? ` Candidate source: ${request.screen.candidateSource ?? "unknown"}. ${request.screen.candidateError}`
        : ` Candidate source: ${request.screen.candidateSource ?? "unknown"}.`;

    return {
      mode: "unavailable",
      error: `No high-confidence local target was found.${detail}`,
      providerName: "local-candidate-ranking",
    };
  }

  const confidence = Math.max(
    0.55,
    Math.min(0.92, getCandidateScore(candidate) / 70),
  );
  const risk = inferCandidateRisk(candidate);
  const result: GuidanceResult = {
    mode: "guide",
    summary: `Local screen candidate selected for: ${getGuidanceLocalizationObjective(request)}`,
    step: {
      instruction: `Click ${candidate.label}.`,
      target: {
        candidateId: candidate.id,
        label: candidate.label,
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
      },
      confidence,
      risk,
      requiresConfirmation: requiresTargetRevealAcknowledgment(risk),
    },
  };
  const validation = validateGuidanceResult(result);

  if (!validation.valid) {
    return {
      mode: "unavailable",
      error: "Local candidate produced an invalid guidance target.",
      validation,
      providerName: "local-candidate-ranking",
    };
  }

  return {
    mode: "real",
    result,
    validation,
    providerName: "local-candidate-ranking",
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

function createDefaultClickAwareRuntimeState(): ClickAwareRuntimeState {
  return {
    enabled: true,
    armed: false,
    permission: "unknown",
    status: "idle",
    hitPadding: clickAwareHitPadding,
    message: "Click-aware advancement is waiting for an active workflow target.",
  };
}

function getTargetCenter(target: TargetBox) {
  return {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };
}

function getClickTargetDistance(click: ClickAwareNativeClick, target: TargetBox) {
  const center = getTargetCenter(target);
  return Math.hypot(click.x - center.x, click.y - center.y);
}

function isClickInsideTarget(
  click: ClickAwareNativeClick,
  target: TargetBox,
  padding: number,
) {
  return (
    click.x >= target.x - padding &&
    click.x <= target.x + target.width + padding &&
    click.y >= target.y - padding &&
    click.y <= target.y + target.height + padding
  );
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

function isSameGestureClassification(
  left: GestureClassification | null | undefined,
  right: GestureClassification | null | undefined,
): boolean {
  if (left == null || right == null) {
    return left === right;
  }

  return (
    left.label === right.label &&
    left.phase === right.phase &&
    Math.abs(left.confidence - right.confidence) < 0.01 &&
    Math.abs(left.holdMs - right.holdMs) < 50 &&
    Math.abs(left.cooldownRemainingMs - right.cooldownRemainingMs) < 50
  );
}

function createEmptyDebugSnapshot(): DebugSnapshot {
  const viewport = getViewportMetrics();
  const gestureRuntime = createDefaultGestureRuntimeState();

  return {
    overlayState: "idle",
    hasAcceptedGuidance: false,
    isRefreshingCapture: false,
    gestureRuntime,
    gestureDiagnostics: createEmptyGestureRuntimeDiagnostics(
      gestureRuntime.thresholds,
    ),
    adaptiveGestureProfile: null,
    gestureCalibration: createIdleGestureCalibrationSession(),
    voiceRuntime: createDefaultVoiceRuntimeState(),
    topStatus: null,
    guidanceTrace: null,
    guidanceProviderMode: "unavailable",
    guidanceProviderName: null,
    guidanceProviderDebug: null,
    guidanceFixture: "safe",
    workflowRuntime: createEmptyWorkflowRuntimeState(),
    clickAwareRuntime: createDefaultClickAwareRuntimeState(),
    captureMetadata: null,
    screenshotCapture: null,
    guidanceRequest: null,
    guidanceResult: null,
    guidanceSession: null,
    guidanceIssues: [],
    guidanceProviderError: null,
    safetyDecision: null,
    captureError: null,
    viewport,
    calibration: getCalibration(null, viewport),
    gesturePointerLock: null,
    gesturePointerLockFeedback: {
      validation: "idle",
      reason: null,
      updatedAt: "1970-01-01T00:00:00.000Z",
    },
  };
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function getGestureCalibrationCandidate(
  session: GestureCalibrationSession,
  diagnostics: GestureRuntimeDiagnostics,
): GestureCalibrationCandidate | null {
  const hand = diagnostics.hand;
  if (
    session.status !== "collecting" ||
    hand == null ||
    hand.confidence < 0.6
  ) {
    return null;
  }

  if (
    session.stage === "point_range" &&
    diagnostics.pointPose.label === "point" &&
    diagnostics.pointPose.pointerTip != null
  ) {
    return {
      stage: "point_range",
      frameId: hand.frameId,
      capturedAt: hand.capturedAt,
      handedness: hand.handedness,
      confidence: hand.confidence,
      point: { ...diagnostics.pointPose.pointerTip },
    };
  }

  if (
    session.stage === "tap_flexion" &&
    diagnostics.airTapPose.indexExtensionRatio != null &&
    diagnostics.airTapPose.foldedFingerCount >= 2
  ) {
    return {
      stage: "tap_flexion",
      frameId: hand.frameId,
      capturedAt: hand.capturedAt,
      handedness: hand.handedness,
      confidence: hand.confidence,
      value: diagnostics.airTapPose.indexExtensionRatio,
    };
  }

  if (
    session.stage === "pinch_distance" &&
    diagnostics.pinch.normalizedDistance != null
  ) {
    return {
      stage: "pinch_distance",
      frameId: hand.frameId,
      capturedAt: hand.capturedAt,
      handedness: hand.handedness,
      confidence: hand.confidence,
      value: diagnostics.pinch.normalizedDistance,
    };
  }

  return null;
}

function OverlayWindowApp() {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [guidanceFixture, setGuidanceFixture] = useState<GuidanceFixture>("safe");
  const [captureMetadata, setCaptureMetadata] = useState<CaptureMetadata | null>(null);
  const [screenshotCapture, setScreenshotCapture] = useState<ScreenshotCapture | null>(null);
  const [guidanceProviderMode, setGuidanceProviderMode] =
    useState<GuidanceProviderMode>("unavailable");
  const [guidanceProviderName, setGuidanceProviderName] = useState<string | null>(null);
  const [guidanceProviderDebug, setGuidanceProviderDebug] =
    useState<GuidanceProviderResponse["debug"] | null>(null);
  const [guidanceTrace, setGuidanceTrace] = useState<GuidanceTrace | null>(null);
  const [guidanceRequest, setGuidanceRequest] = useState<GuidanceRequest | null>(null);
  const [guidanceResult, setGuidanceResult] = useState<GuidanceResult | null>(null);
  const [guidanceSession, setGuidanceSession] = useState<GuidanceSession | null>(null);
  const [guidanceIssues, setGuidanceIssues] = useState<GuidanceValidationIssue[]>([]);
  const [guidanceProviderError, setGuidanceProviderError] = useState<string | null>(
    null,
  );
  const [safetyDecision, setSafetyDecision] = useState<SafetyPolicyDecision | null>(
    null,
  );
  const [riskTargetRevealed, setRiskTargetRevealed] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);
  const [gestureRuntime, setGestureRuntime] = useState<GestureRuntimeState>(() =>
    createDefaultGestureRuntimeState(),
  );
  const [gestureDeviceRefreshToken, setGestureDeviceRefreshToken] = useState(0);
  const [adaptiveGestureProfile, setAdaptiveGestureProfile] =
    useState<AdaptiveGestureProfile | null>(() =>
      loadAdaptiveGestureProfile(getBrowserStorage()),
    );
  const [gestureCalibration, setGestureCalibration] =
    useState<GestureCalibrationSession>(() =>
      createIdleGestureCalibrationSession(new Date().toISOString()),
    );
  const [voiceRuntime, setVoiceRuntime] = useState<VoiceRuntimeState>(() =>
    createDefaultVoiceRuntimeState(),
  );
  const [workflowRuntime, setWorkflowRuntime] = useState<WorkflowRuntimeState>(() =>
    createEmptyWorkflowRuntimeState(),
  );
  const [clickAwareRuntime, setClickAwareRuntime] =
    useState<ClickAwareRuntimeState>(() => createDefaultClickAwareRuntimeState());
  const [viewport, setViewport] = useState<ViewportMetrics>(() => getViewportMetrics());
  const [pointerShadow, setPointerShadow] = useState<PointerShadowPosition | null>(null);
  const [gestureVisualAnchor, setGestureVisualAnchor] =
    useState<GestureVisualAnchor | null>(null);
  const [gesturePointerLock, setGesturePointerLock] =
    useState<PointerLockSnapshot | null>(null);
  const [gesturePointerLockFeedback, setGesturePointerLockFeedback] =
    useState<GesturePointerLockFeedback>({
      validation: "idle",
      reason: null,
      updatedAt: new Date().toISOString(),
    });
  const voiceRuntimeRef = useRef<VoiceRuntimeState>(voiceRuntime);
  const voiceCaptureTimeoutRef = useRef<number | null>(null);
  const voiceSubmitInFlightRef = useRef(false);
  const voiceCapturePhaseRef = useRef<
    "idle" | "starting" | "capturing" | "submitting"
  >("idle");
  const voiceHoldStateRef = useRef(createIdleVoiceHoldState());
  const routedVoiceCommandRef = useRef<string | null>(null);
  const guidanceTraceRef = useRef<GuidanceTrace | null>(null);
  const activeGuidanceTraceStageRef = useRef<GuidanceTraceStage | null>(null);
  const guidanceRefreshInFlightRef = useRef(false);
  const clickAwareAdvanceInFlightRef = useRef(false);
  const capturePermissionBlockRef = useRef<{
    message: string;
    blockedAt: number;
  } | null>(null);
  const captureAccessPreflightRef = useRef<{
    allowed: boolean;
    checkedAt: number;
  } | null>(null);
  const lastPublishedOverlaySnapshotRef = useRef<string | null>(null);
  const lastPublishedDebugSnapshotRef = useRef<string | null>(null);
  const lastGestureClassificationRef = useRef<GestureClassification | null>(null);
  const handledGestureLockRequestRef = useRef<string | null>(null);
  const topStatusRef = useRef<TokiTopStatusModel | null>(null);
  const topUtilityModeRef = useRef<TopUtilityMode>("hidden");
  const topUtilityFocusedRef = useRef(false);
  const topUtilityRevealTimerRef = useRef<number | null>(null);
  const topUtilityLeaveTimerRef = useRef<number | null>(null);
  const gesturePointerDisplay = useMemo<DisplayContext>(
    () => ({
      id: "overlay-active-display",
      width: viewport.width,
      height: viewport.height,
      scaleFactor: viewport.devicePixelRatio,
    }),
    [viewport.devicePixelRatio, viewport.height, viewport.width],
  );
  const alwaysOnGestureRuntime = useAlwaysOnGestureRuntime({
    cameraEnabled: gestureRuntime.camera.enabled,
    gesturesEnabled: gestureRuntime.enabled,
    thresholds: gestureRuntime.thresholds,
    deviceRefreshToken: gestureDeviceRefreshToken,
    display: gesturePointerDisplay,
    adaptiveProfile: adaptiveGestureProfile,
  });
  useEffect(() => {
    const candidate = getGestureCalibrationCandidate(
      gestureCalibration,
      alwaysOnGestureRuntime.diagnostics,
    );
    if (candidate == null) {
      return;
    }

    setGestureCalibration((current) =>
      offerGestureCalibrationCandidate(
        current,
        candidate,
        new Date().toISOString(),
      ),
    );
  }, [
    alwaysOnGestureRuntime.diagnostics.airTapPose.foldedFingerCount,
    alwaysOnGestureRuntime.diagnostics.airTapPose.indexExtensionRatio,
    alwaysOnGestureRuntime.diagnostics.hand,
    alwaysOnGestureRuntime.diagnostics.pinch.normalizedDistance,
    alwaysOnGestureRuntime.diagnostics.pointPose.label,
    alwaysOnGestureRuntime.diagnostics.pointPose.pointerTip,
    gestureCalibration.stage,
    gestureCalibration.status,
  ]);
  const gesturePointerShadow = useMemo(() => {
    const pointer = alwaysOnGestureRuntime.pointer;

    if (
      pointer == null ||
      pointer.display.displayId !== gesturePointerDisplay.id
    ) {
      return null;
    }

    return getPointerShadowPosition(
      pointer.display.x,
      pointer.display.y,
      viewport,
    );
  }, [alwaysOnGestureRuntime.pointer, gesturePointerDisplay.id, viewport]);

  const activeStep = guidanceResult?.step ?? null;
  const acceptedStep =
    activeStep?.target != null &&
    canRevealGuidanceTarget(safetyDecision, riskTargetRevealed)
      ? activeStep
      : null;
  const acceptedTarget = acceptedStep?.target ?? null;
  const currentWorkflowStep =
    workflowRuntime.plan?.steps[workflowRuntime.currentStepIndex] ?? null;
  const workflowTarget = currentWorkflowStep?.target ?? null;
  const clickAwareTarget =
    workflowRuntime.status === "active" &&
    currentWorkflowStep?.kind === "click" &&
    !currentWorkflowStep.requiresConfirmation &&
    workflowTarget != null
      ? workflowTarget
      : null;
  const isClickAwareArmed =
    clickAwareRuntime.enabled &&
    clickAwareTarget != null &&
    !isRefreshingCapture &&
    overlayState !== "paused";
  const hasAcceptedGuidance = acceptedTarget != null || workflowTarget != null;
  const visibleGuidanceFailure =
    !isRefreshingCapture && !hasAcceptedGuidance
      ? captureError ?? guidanceProviderError
      : null;
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
    hasActiveTarget: acceptedTarget != null || workflowTarget != null,
    isRefreshingCapture,
    hasCaptureError: captureError != null,
    guidanceIssueCount: guidanceIssues.length,
  });
  const tokiCreatureState = getTokiCreatureState({
    overlayState,
    hasAcceptedGuidance,
    hasActiveTarget: acceptedTarget != null || workflowTarget != null,
    isRefreshingCapture,
    hasCaptureError: captureError != null,
    guidanceIssueCount: guidanceIssues.length,
    voiceStatus: voiceRuntime.status,
    gestureEnabled: gestureRuntime.enabled,
    gestureLabel: gestureRuntime.currentGesture.label,
    gesturePhase: gestureRuntime.currentGesture.phase,
    gestureVisualAnchor,
    hasWorkflow: workflowRuntime.status === "active",
  });
  const topStatus = getTokiTopStatusModel({
    voiceRuntime,
    overlayState,
    isRefreshingCapture,
    guidanceFailure: visibleGuidanceFailure,
    hasAcceptedGuidance,
    targetLabel: activeTarget.label,
    instruction:
      activeStep?.instruction ?? currentWorkflowStep?.instruction ?? activeTarget.instruction,
    safetyDecision,
    gestureClassification: gestureRuntime.currentGesture,
  });

  function clearTopUtilityTimer(timerRef: { current: number | null }) {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function requestTopUtilityMode(
    mode: TopUtilityMode,
    options: { focus?: boolean } = {},
  ) {
    if (topUtilityModeRef.current === mode && !options.focus) {
      return;
    }

    topUtilityModeRef.current = mode;
    void setTopUtilityWindowMode(mode, options).catch(() => undefined);
  }

  const calibration = useMemo(
    () => getCalibration(captureMetadata, viewport),
    [captureMetadata, viewport],
  );

  useEffect(() => {
    voiceRuntimeRef.current = voiceRuntime;
  }, [voiceRuntime]);

  useEffect(() => {
    const nextCamera = alwaysOnGestureRuntime.camera;
    const runtimeUnavailable =
      nextCamera.status === "disabled" ||
      nextCamera.status === "permission_denied" ||
      nextCamera.status === "no_camera" ||
      nextCamera.status === "error";

    if (runtimeUnavailable) {
      setGestureVisualAnchor(null);
    }

    setGestureRuntime((currentState) => {
      const nextEnabled = runtimeUnavailable ? false : currentState.enabled;
      const nextGesture = runtimeUnavailable
        ? createInactiveGestureClassification()
        : currentState.currentGesture;
      const cameraIsCurrent =
        currentState.camera.enabled === nextCamera.enabled &&
        currentState.camera.permission === nextCamera.permission &&
        currentState.camera.status === nextCamera.status &&
        currentState.camera.devices === nextCamera.devices &&
        currentState.camera.error === nextCamera.error;

      if (
        cameraIsCurrent &&
        nextEnabled === currentState.enabled &&
        isSameGestureClassification(nextGesture, currentState.currentGesture)
      ) {
        return currentState;
      }

      return {
        ...currentState,
        enabled: nextEnabled,
        currentGesture: nextGesture,
        camera: nextCamera,
      };
    });
  }, [alwaysOnGestureRuntime.camera]);

  useEffect(() => {
    const classification = alwaysOnGestureRuntime.classification;

    if (
      isSameGestureClassification(
        lastGestureClassificationRef.current,
        classification,
      )
    ) {
      return;
    }

    lastGestureClassificationRef.current = classification;
    const gestureAction = getGestureActionForClassification(
      classification,
      new Date().toISOString(),
    );

    if (gestureAction?.type === "activate_assistant") {
      setOverlayState("listening");
    }

    if (gestureAction?.type === "pause_assistant") {
      cancelVoiceRuntime();
      setOverlayState("paused");
    }

    setGestureRuntime((currentState) =>
      isSameGestureClassification(currentState.currentGesture, classification) &&
      gestureAction == null
        ? currentState
        : {
            ...currentState,
            currentGesture: classification,
            lastAction: gestureAction ?? currentState.lastAction,
          },
    );
  }, [alwaysOnGestureRuntime.classification]);

  useEffect(() => {
    const nextAnchor = alwaysOnGestureRuntime.visualAnchor;

    setGestureVisualAnchor((currentAnchor) =>
      isSameGestureVisualAnchor(currentAnchor, nextAnchor)
        ? currentAnchor
        : nextAnchor,
    );
  }, [alwaysOnGestureRuntime.visualAnchor]);

  useEffect(() => {
    const request = alwaysOnGestureRuntime.lockRequest;
    if (
      request == null ||
      handledGestureLockRequestRef.current === request.id ||
      request.pointer.display.displayId !== gesturePointerDisplay.id
    ) {
      return;
    }

    handledGestureLockRequestRef.current = request.id;
    const evidence: PointerEvidenceFingerprint = {
      snapshotId: `gesture-screen-${request.id}`,
      capturedAt: request.lockedAt,
      regionHash: [
        gesturePointerDisplay.id,
        gesturePointerDisplay.width,
        gesturePointerDisplay.height,
        gesturePointerDisplay.scaleFactor,
      ].join(":"),
    };
    const lock = createPointerLockSnapshot({
      id: request.id,
      lockedAt: request.lockedAt,
      pointer: request.pointer,
      evidence,
      display: gesturePointerDisplay,
    });

    setGesturePointerLock(lock);
    setGesturePointerLockFeedback({
      validation: "checking",
      reason: null,
      updatedAt: new Date().toISOString(),
    });
  }, [alwaysOnGestureRuntime.lockRequest, gesturePointerDisplay]);

  useEffect(() => {
    if (gesturePointerLock == null) {
      return;
    }
    const lock: PointerLockSnapshot = gesturePointerLock;

    let cancelled = false;
    let timer: number | null = null;
    let expectedActiveWindowId = lock.evidence.activeWindowId ?? null;

    function invalidate(reason: PointerLockInvalidationReason) {
      if (cancelled) {
        return;
      }

      setGesturePointerLock((current) =>
        current?.id === lock.id ? null : current,
      );
      setGesturePointerLockFeedback({
        validation: "invalidated",
        reason,
        updatedAt: new Date().toISOString(),
      });
    }

    async function validateCurrentScreenState() {
      try {
        const [screenCaptureAvailable, activeWindow] = await Promise.all([
          invoke<boolean>("screen_capture_access_status"),
          invoke<ActiveWindowBounds>("frontmost_window_bounds", { appName: null }),
        ]);

        if (cancelled) {
          return;
        }

        const activeWindowId = createScreenStateFingerprint(activeWindow);
        const comparisonLock =
          expectedActiveWindowId == null
            ? lock
            : createPointerLockSnapshot({
                id: lock.id,
                lockedAt: lock.lockedAt,
                pointer: lock.pointer,
                evidence: {
                  ...lock.evidence,
                  activeWindowId: expectedActiveWindowId,
                },
                display: lock.display,
              });
        const invalidationReason = getPointerLockInvalidationReason({
          lock: comparisonLock,
          display: gesturePointerDisplay,
          screenCaptureAvailable,
          activeWindowId,
        });

        if (invalidationReason != null) {
          invalidate(invalidationReason);
          return;
        }

        if (expectedActiveWindowId == null) {
          expectedActiveWindowId = activeWindowId;
          setGesturePointerLock((current) =>
            current?.id === lock.id
              ? createPointerLockSnapshot({
                  id: current.id,
                  lockedAt: current.lockedAt,
                  pointer: current.pointer,
                  evidence: {
                    ...current.evidence,
                    activeWindowId,
                    regionHash: activeWindowId,
                  },
                  display: current.display,
                })
              : current,
          );
          setGesturePointerLockFeedback({
            validation: "locked",
            reason: null,
            updatedAt: new Date().toISOString(),
          });
        }

        timer = window.setTimeout(validateCurrentScreenState, 2_000);
      } catch {
        invalidate("screen_state_unavailable");
      }
    }

    void validateCurrentScreenState();

    return () => {
      cancelled = true;
      if (timer != null) {
        window.clearTimeout(timer);
      }
    };
  }, [gesturePointerLock?.id, gesturePointerDisplay]);

  useEffect(() => {
    const lock = gesturePointerLock;
    if (lock == null) {
      return;
    }

    const invalidationReason = getPointerLockInvalidationReason({
      lock,
      display: gesturePointerDisplay,
      screenCaptureAvailable: true,
      activeWindowId: lock.evidence.activeWindowId ?? "screen-check-pending",
    });
    if (invalidationReason !== "display_changed") {
      return;
    }

    setGesturePointerLock(null);
    setGesturePointerLockFeedback({
      validation: "invalidated",
      reason: invalidationReason,
      updatedAt: new Date().toISOString(),
    });
  }, [
    gesturePointerDisplay.height,
    gesturePointerDisplay.id,
    gesturePointerDisplay.scaleFactor,
    gesturePointerDisplay.width,
    gesturePointerLock,
  ]);

  useEffect(() => {
    if (gesturePointerLock == null) {
      return;
    }

    const cameraUnavailable =
      !gestureRuntime.enabled ||
      alwaysOnGestureRuntime.camera.status !== "active" ||
      alwaysOnGestureRuntime.camera.permission !== "granted";
    if (!cameraUnavailable) {
      return;
    }

    setGesturePointerLock(null);
    setGesturePointerLockFeedback({
      validation: "invalidated",
      reason: "camera_unavailable",
      updatedAt: new Date().toISOString(),
    });
  }, [
    alwaysOnGestureRuntime.camera.permission,
    alwaysOnGestureRuntime.camera.status,
    gesturePointerLock,
    gestureRuntime.enabled,
  ]);

  useEffect(() => {
    const renderEvent = getGuidanceTraceEvent(guidanceTraceRef.current, "render");
    if (acceptedTarget == null || renderEvent?.status !== "pending") {
      return;
    }

    finishTraceStage("render", {
      summary: "Accepted target rendered by the overlay.",
      details: {
        label: acceptedTarget.label,
        x: acceptedTarget.x,
        y: acceptedTarget.y,
        width: acceptedTarget.width,
        height: acceptedTarget.height,
      },
    });
  }, [acceptedTarget]);

  useEffect(() => {
    topStatusRef.current = topStatus;

    if (topUtilityModeRef.current !== "expanded") {
      requestTopUtilityMode(getPassiveTopUtilityMode(topStatus));
    }
  }, [topStatus]);

  const overlaySnapshot = useMemo<OverlaySnapshot>(
    () => ({
      overlayState,
      hasAcceptedGuidance,
      isRefreshingCapture,
      gestureRuntime,
      voiceRuntime,
      topStatus,
    }),
    [
      overlayState,
      hasAcceptedGuidance,
      isRefreshingCapture,
      gestureRuntime,
      voiceRuntime,
      topStatus,
    ],
  );

  const debugSnapshot = useMemo<DebugSnapshot>(
    () => ({
      ...overlaySnapshot,
      gestureDiagnostics: alwaysOnGestureRuntime.diagnostics,
      adaptiveGestureProfile,
      gestureCalibration,
      guidanceTrace,
      guidanceProviderMode,
      guidanceProviderName,
      guidanceProviderDebug,
      guidanceFixture,
      workflowRuntime,
      clickAwareRuntime,
      captureMetadata,
      screenshotCapture,
      guidanceRequest,
      guidanceResult,
      guidanceSession,
      guidanceIssues,
      guidanceProviderError,
      safetyDecision,
      captureError,
      viewport,
      calibration,
      gesturePointerLock,
      gesturePointerLockFeedback,
    }),
    [
      overlaySnapshot,
      alwaysOnGestureRuntime.diagnostics,
      adaptiveGestureProfile,
      gestureCalibration,
      guidanceTrace,
      guidanceProviderMode,
      guidanceProviderName,
      guidanceProviderDebug,
      guidanceFixture,
      workflowRuntime,
      clickAwareRuntime,
      captureMetadata,
      screenshotCapture,
      guidanceRequest,
      guidanceResult,
      guidanceSession,
      guidanceIssues,
      guidanceProviderError,
      safetyDecision,
      captureError,
      viewport,
      calibration,
      gesturePointerLock,
      gesturePointerLockFeedback,
    ],
  );

  async function publishRuntimeSnapshots(
    options: { includeDebug?: boolean; forceDebug?: boolean } = {},
  ) {
    const serializedOverlaySnapshot = JSON.stringify(overlaySnapshot);

    if (serializedOverlaySnapshot !== lastPublishedOverlaySnapshotRef.current) {
      lastPublishedOverlaySnapshotRef.current = serializedOverlaySnapshot;
      await emitTo("settings", "toki://overlay-state", overlaySnapshot).catch(
        () => undefined,
      );
    }

    if (!options.includeDebug) {
      return;
    }

    const serializedDebugSnapshot = JSON.stringify(debugSnapshot);
    if (
      options.forceDebug ||
      serializedDebugSnapshot !== lastPublishedDebugSnapshotRef.current
    ) {
      lastPublishedDebugSnapshotRef.current = serializedDebugSnapshot;
      await emitTo("debug", "toki://debug-state", debugSnapshot).catch(
        () => undefined,
      );
    }
  }

  function getRecentCapturePermissionBlock(): string | null {
    const block = capturePermissionBlockRef.current;
    if (block == null) {
      return null;
    }

    const permissionRetryCooldownMs = 30_000;
    if (Date.now() - block.blockedAt < permissionRetryCooldownMs) {
      return block.message;
    }

    capturePermissionBlockRef.current = null;
    return null;
  }

  async function ensureScreenCaptureAccess() {
    const recentPermissionBlock = getRecentCapturePermissionBlock();
    if (recentPermissionBlock != null) {
      throw new Error(recentPermissionBlock);
    }

    const cachedPreflight = captureAccessPreflightRef.current;
    const preflightCacheMs = 5_000;
    const hasFreshPreflight =
      cachedPreflight != null && Date.now() - cachedPreflight.checkedAt < preflightCacheMs;

    if (!hasFreshPreflight) {
      const hasScreenCaptureAccess = await invoke<boolean>("screen_capture_access_status");
      captureAccessPreflightRef.current = {
        allowed: hasScreenCaptureAccess,
        checkedAt: Date.now(),
      };
    }

    try {
      requireScreenCaptureAccess(captureAccessPreflightRef.current?.allowed === true);
    } catch (error) {
      const message = formatCaptureError(error);
      capturePermissionBlockRef.current = {
        message,
        blockedAt: Date.now(),
      };
      setCaptureError(message);
      throw error;
    }
  }

  async function invokeCaptureCommand<T>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    await ensureScreenCaptureAccess();

    try {
      const result = await invoke<T>(command, args);
      capturePermissionBlockRef.current = null;
      captureAccessPreflightRef.current = {
        allowed: true,
        checkedAt: Date.now(),
      };
      return result;
    } catch (error) {
      if (isCapturePermissionError(error)) {
        const message = formatCaptureError(error);
        capturePermissionBlockRef.current = {
          message,
          blockedAt: Date.now(),
        };
        captureAccessPreflightRef.current = {
          allowed: false,
          checkedAt: Date.now(),
        };
        setCaptureError(message);
      }

      throw error;
    }
  }

  function publishGuidanceTrace(nextTrace: GuidanceTrace) {
    guidanceTraceRef.current = nextTrace;
    setGuidanceTrace(nextTrace);
  }

  function beginTraceStage(stage: GuidanceTraceStage, summary?: string) {
    const currentTrace = guidanceTraceRef.current;
    if (currentTrace == null) {
      return;
    }

    activeGuidanceTraceStageRef.current = stage;
    publishGuidanceTrace(beginGuidanceTraceStage(currentTrace, stage, summary));
  }

  function finishTraceStage(
    stage: GuidanceTraceStage,
    options: {
      status?: "completed" | "failed" | "skipped";
      summary?: string;
      details?: Record<string, GuidanceTraceDetail>;
    } = {},
  ) {
    const currentTrace = guidanceTraceRef.current;
    if (currentTrace == null) {
      return;
    }

    if (activeGuidanceTraceStageRef.current === stage) {
      activeGuidanceTraceStageRef.current = null;
    }
    publishGuidanceTrace(
      finishGuidanceTraceStage(currentTrace, stage, options),
    );
  }

  function startGuidanceTrace(
    goal: string,
    providerMode: GuidanceProviderMode,
    options: {
      traceId?: string;
      source?: GuidanceTraceSource;
      transcript?: string;
      transcriptAt?: string;
    },
  ): GuidanceTrace {
    const startedAt = options.transcriptAt ?? new Date().toISOString();
    let nextTrace = createGuidanceTrace({
      id: options.traceId,
      goal,
      providerMode,
      source: options.source ?? "manual",
      startedAt,
    });
    nextTrace = finishGuidanceTraceStage(nextTrace, "transcript", {
      status: options.transcript ? "completed" : "skipped",
      completedAt: startedAt,
      summary: options.transcript
        ? "Final voice transcript attached to the guidance request."
        : "No voice transcript was used for this guidance request.",
      details: options.transcript == null ? undefined : { text: options.transcript },
    });
    activeGuidanceTraceStageRef.current = null;
    publishGuidanceTrace(nextTrace);
    return nextTrace;
  }

  async function refreshCaptureMetadata(
    goal = "Show me what to click next.",
    providerMode: GuidanceProviderMode = "unavailable",
    traceOptions: {
      traceId?: string;
      source?: GuidanceTraceSource;
      transcript?: string;
      transcriptAt?: string;
    } = {},
  ) {
    const isLiveGuidanceProvider =
      providerMode === "real" || providerMode === "codex-subscription";

    if (guidanceRefreshInFlightRef.current) {
      setGuidanceProviderError(
        "Guidance is already analyzing the screen. Wait for the current request to finish.",
      );
      return;
    }

    const trace = startGuidanceTrace(goal, providerMode, traceOptions);
    guidanceRefreshInFlightRef.current = true;
    setIsRefreshingCapture(true);
    setCaptureError(null);
    setGuidanceProviderError(null);
    setGuidanceProviderMode(providerMode);
    setGuidanceProviderName(null);
    setGuidanceProviderDebug(null);
    setGuidanceIssues([]);
    setSafetyDecision(null);
    setRiskTargetRevealed(false);
    setGuidanceRequest(null);
    setGuidanceResult(null);
    setCaptureMetadata(null);
    setScreenshotCapture(null);
    setOverlayState("thinking");

    try {
      await ensureScreenCaptureAccess();
      const preferredAppName = getPreferredAppNameFromGoal(goal);
      let metadata: CaptureMetadata;
      let screenshot: ScreenshotCapture;
      let windowBounds: ActiveWindowBounds | null = null;

      if (isLiveGuidanceProvider) {
        beginTraceStage(
          "active_window",
          "Resolving the active window and capturing one native snapshot.",
        );
        const snapshot = await invokeCaptureCommand<ActiveWindowCaptureSnapshot>(
          "capture_active_window_snapshot",
          { appName: preferredAppName },
        );
        metadata = snapshot.metadata;
        screenshot = snapshot.screenshot;
        windowBounds = snapshot.window;
        finishTraceStage("active_window", {
          summary: "Active window resolved inside the native capture transaction.",
          details: {
            snapshotId: snapshot.snapshotId,
            appName: snapshot.window.appName ?? "unknown",
            x: snapshot.window.x,
            y: snapshot.window.y,
            width: snapshot.window.width,
            height: snapshot.window.height,
            windowToCaptureDelayMs: snapshot.windowToCaptureDelayMs,
            transactionDurationMs: snapshot.completedAtMs - snapshot.startedAtMs,
          },
        });
        beginTraceStage("screenshot", "Recording the native snapshot payload.");
      } else {
        finishTraceStage("active_window", {
          status: "skipped",
          summary: "Active-window localization is not used by this provider mode.",
        });
        beginTraceStage("screenshot", "Capturing screen metadata and pixels.");
        metadata = await invokeCaptureCommand<CaptureMetadata>("capture_metadata");
        screenshot = await invokeCaptureCommand<ScreenshotCapture>("capture_screenshot");
      }

      setCaptureMetadata(metadata);
      setScreenshotCapture(screenshot);
      finishTraceStage("screenshot", {
        summary: "Screenshot capture completed.",
        details: {
          format: screenshot.format,
          imageWidth: screenshot.imageWidth,
          imageHeight: screenshot.imageHeight,
          byteLength: screenshot.byteLength,
        },
      });
      const screenshotMetadata = getScreenshotMetadata(screenshot);
      const shouldTrackSession = isLiveGuidanceProvider;
      const isContinuingGuidanceSession =
        shouldTrackSession && guidanceSession?.originalGoal === goal;
      const previousGuidanceStep = isContinuingGuidanceSession
        ? guidanceResult?.step ?? null
        : null;
      const nextSession =
        isContinuingGuidanceSession
          ? {
              ...guidanceSession,
              status: "active" as const,
              updatedAt: new Date().toISOString(),
            }
          : shouldTrackSession
            ? createGuidanceSession(goal)
            : null;

      if (nextSession != null) {
        setGuidanceSession(nextSession);
      }

      const localizationContext =
        nextSession == null
          ? null
          : getGuidanceLocalizationContext(
              nextSession.taskPlan,
              nextSession.currentStepIndex,
            );
      const localizationObjective = localizationContext?.objective ?? goal;

      const screenshotPayload =
        isLiveGuidanceProvider
          ? await getProviderScreenshotPayload(screenshot, windowBounds)
          : getScreenshotPayload(screenshot);

      if (isLiveGuidanceProvider && screenshotPayload.crop == null) {
        const message =
          "active window crop was unavailable, so Toki refused to run full-display vision against the desktop";
        throw new Error(
          `${message}. Live guidance needs a trusted active app window crop to avoid targeting the menu bar, dock, desktop icons, or unrelated windows.`,
        );
      }

      const requestCalibration = getCalibration(metadata, viewport, screenshotMetadata);
      beginTraceStage("candidates", "Collecting screen-understanding candidates.");
      const rawCandidateContext =
        isLiveGuidanceProvider
          ? await collectScreenCandidatesForGuidance(
              screenshot,
              metadata.display,
              localizationObjective,
              windowBounds?.appName ?? preferredAppName ?? screenshot.activeWindow?.appName,
            )
          : {
              candidates: [],
              candidateSource: "none" as const,
            };
      const candidateContext =
        isLiveGuidanceProvider
          ? filterCandidateContextForPayload(rawCandidateContext, screenshotPayload, screenshot)
          : rawCandidateContext;
      finishTraceStage("candidates", {
        summary: "Candidate collection completed.",
        details: {
          count: candidateContext.candidates?.length ?? 0,
          rawCount: candidateContext.candidateEvidence?.rawCount ?? 0,
          fusedCount: candidateContext.candidateEvidence?.fusedCount ?? 0,
          source: candidateContext.candidateSource ?? "none",
          hadError: candidateContext.candidateError != null,
          planId: localizationContext?.planId ?? "none",
          objective: localizationObjective,
        },
      });
      const nextGuidanceRequest: GuidanceRequest = {
        traceId: trace.id,
        goal,
        localization: localizationContext ?? undefined,
        screen: {
          display: metadata.display,
          capture: metadata,
          screenshot: screenshotMetadata,
          screenshotPayload,
          calibration: requestCalibration,
          ...candidateContext,
        },
        previousStep: previousGuidanceStep,
        session: nextSession == null ? undefined : getGuidanceSessionContext(nextSession),
      };
      setGuidanceRequest(nextGuidanceRequest);

      if (isLiveGuidanceProvider) {
        const endpoint = import.meta.env.VITE_TOKI_GUIDANCE_ENDPOINT;
        let providerResponse: GuidanceProviderResponse;

        beginTraceStage("provider", "Requesting a guidance decision.");
        const configuredCodexTimeoutMs = Number(
          import.meta.env.VITE_TOKI_CODEX_TIMEOUT_MS,
        );
        const provider = createGuidanceProviderAdapter(providerMode, {
          endpoint,
          localCandidateProvider: createLocalCandidateGuidance,
          codex: {
            model: import.meta.env.VITE_TOKI_CODEX_MODEL,
            timeoutMs:
              Number.isFinite(configuredCodexTimeoutMs) &&
              configuredCodexTimeoutMs > 0
                ? configuredCodexTimeoutMs
                : undefined,
          },
        });
        providerResponse = await provider.request(nextGuidanceRequest);

        providerResponse = verifyGuidanceTarget(
          providerResponse,
          nextGuidanceRequest,
        );

        providerResponse = {
          ...providerResponse,
          traceId: trace.id,
        };
        finishTraceStage("provider", {
          status: providerResponse.error == null ? "completed" : "failed",
          summary:
            providerResponse.error ??
            (providerResponse.result?.step?.target
              ? "Provider returned a target decision."
              : "Provider returned without a target."),
          details: {
            mode: providerResponse.mode,
            providerName: providerResponse.providerName ?? "unknown",
            hasTarget: providerResponse.result?.step?.target != null,
          },
        });

        const providerTarget = providerResponse.result?.step?.target ?? null;
        const mappedTarget = providerResponse.debug?.vision?.mappedFinal ?? providerTarget;
        finishTraceStage("mapping", {
          status: mappedTarget == null ? "skipped" : "completed",
          summary:
            mappedTarget == null
              ? "No provider coordinates were available to map."
              : providerResponse.debug?.vision?.mappedFinal
                ? "Vision coordinates mapped into display points."
                : "Provider target was already expressed in display points.",
          details:
            mappedTarget == null
              ? undefined
              : {
                  label: mappedTarget.label,
                  x: mappedTarget.x,
                  y: mappedTarget.y,
                  width: mappedTarget.width,
                  height: mappedTarget.height,
                },
        });

        setGuidanceProviderMode(providerResponse.mode);
        setGuidanceProviderName(providerResponse.providerName ?? null);
        setGuidanceProviderDebug(providerResponse.debug ?? null);
        setGuidanceProviderError(providerResponse.error ?? null);
        setGuidanceIssues(providerResponse.validation?.issues ?? []);
        beginTraceStage("validation", "Applying schema and safety validation.");
        const nextSafetyDecision = evaluateSafetyPolicy({
          provider: providerResponse,
          minConfidence: 0.7,
        });
        const providerValidationPassed = providerResponse.validation?.valid ?? false;
        const acceptedGuidanceResult = getAcceptedGuidanceResult(
          providerResponse,
          nextSafetyDecision,
        );
        const guidanceAllowed = acceptedGuidanceResult != null;

        finishTraceStage("validation", {
          status: providerValidationPassed && guidanceAllowed ? "completed" : "failed",
          summary: nextSafetyDecision.message,
          details: {
            valid: providerValidationPassed,
            issueCount: providerResponse.validation?.issues.length ?? 0,
            safetyAction: nextSafetyDecision.action,
            targetVerification:
              providerResponse.debug?.targetVerification?.status ?? "not_run",
            evidenceSource:
              providerResponse.debug?.targetVerification?.source ?? "none",
            clickPoint:
              providerResponse.debug?.targetVerification?.clickPoint == null
                ? "none"
                : `${providerResponse.debug.targetVerification.clickPoint.x},${providerResponse.debug.targetVerification.clickPoint.y}`,
          },
        });

        setSafetyDecision(nextSafetyDecision);

        if (nextSession != null) {
          setGuidanceSession(
            recordGuidanceSessionResult({
              session: nextSession,
              result: acceptedGuidanceResult,
              screenshot: screenshotMetadata,
              providerMode: providerResponse.mode,
              allowed: guidanceAllowed,
            }),
          );
        }

        if (guidanceAllowed) {
          if (providerTarget == null) {
            finishTraceStage("render", {
              status: "skipped",
              summary: "The accepted response did not contain a visual target.",
            });
          } else {
            beginTraceStage("render", "Committing the accepted target to overlay state.");
          }
          setGuidanceResult(acceptedGuidanceResult);
          setRiskTargetRevealed(nextSafetyDecision.action !== "confirm");
          setOverlayState(
            nextSafetyDecision.action === "confirm"
              ? "confirmation_required"
              : "guiding",
          );
          if (nextSafetyDecision.action === "confirm") {
            requestTopUtilityMode("expanded", { focus: true });
          }
        } else {
          finishTraceStage("render", {
            status: "skipped",
            summary: "Guidance was refused before target rendering.",
          });
          setGuidanceResult(null);
          setRiskTargetRevealed(false);
          setGuidanceProviderError(nextSafetyDecision.message);
          setOverlayState(nextSafetyDecision.action === "clarify" ? "idle" : "error");
        }
        return;
      }

      if (providerMode === "unavailable") {
        finishTraceStage("provider", {
          status: "skipped",
          summary: "No guidance provider was configured for this request.",
        });
        finishTraceStage("mapping", {
          status: "skipped",
          summary: "No provider target was available to map.",
        });
        finishTraceStage("validation", {
          status: "skipped",
          summary: "Validation was skipped because no provider ran.",
        });
        finishTraceStage("render", {
          status: "skipped",
          summary: "No target was rendered.",
        });
        setGuidanceProviderMode("unavailable");
        setGuidanceProviderName("none");
        setGuidanceProviderDebug(null);
        setGuidanceProviderError(
          "No guidance provider is active. Configure a real provider or run a debug fixture.",
        );
        setGuidanceIssues([]);
        setSafetyDecision(null);
        setGuidanceResult(null);
        setRiskTargetRevealed(false);
        setOverlayState("idle");
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
      beginTraceStage("provider", "Running the selected mock fixture.");
      const validation = validateGuidanceResult(nextGuidance);
      const providerResponse: GuidanceProviderResponse = validation.valid
        ? {
            mode: "mock",
            traceId: trace.id,
            result: nextGuidance,
            validation,
            providerName: "mock-fixture",
          }
        : {
            mode: "mock",
            traceId: trace.id,
            validation,
            providerName: "mock-fixture",
          };
      finishTraceStage("provider", {
        summary: "Mock fixture returned a deterministic response.",
        details: {
          mode: providerResponse.mode,
          providerName: providerResponse.providerName ?? "mock-fixture",
          hasTarget: nextGuidance.step?.target != null,
        },
      });
      const mockTarget = nextGuidance.step?.target ?? null;
      finishTraceStage("mapping", {
        status: mockTarget == null ? "skipped" : "completed",
        summary:
          mockTarget == null
            ? "The mock response did not include a target."
            : "Mock target was already expressed in display points.",
        details:
          mockTarget == null
            ? undefined
            : {
                label: mockTarget.label,
                x: mockTarget.x,
                y: mockTarget.y,
                width: mockTarget.width,
                height: mockTarget.height,
              },
      });
      beginTraceStage("validation", "Applying schema and safety validation.");
      const nextSafetyDecision = evaluateSafetyPolicy({
        provider: providerResponse,
        minConfidence: 0.7,
      });
      const mockGuidanceAllowed =
        nextSafetyDecision.action === "allow" ||
        nextSafetyDecision.action === "confirm";
      finishTraceStage("validation", {
        status: validation.valid && mockGuidanceAllowed ? "completed" : "failed",
        summary: nextSafetyDecision.message,
        details: {
          valid: validation.valid,
          issueCount: validation.issues.length,
          safetyAction: nextSafetyDecision.action,
        },
      });

      setGuidanceIssues(validation.issues);
      setGuidanceProviderName(providerResponse.providerName ?? "mock-fixture");
      setGuidanceProviderDebug(providerResponse.debug ?? null);
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
        if (mockTarget == null) {
          finishTraceStage("render", {
            status: "skipped",
            summary: "The accepted mock response did not contain a visual target.",
          });
        } else {
          beginTraceStage("render", "Committing the mock target to overlay state.");
        }
        setGuidanceResult(nextGuidance);
        setRiskTargetRevealed(nextSafetyDecision.action !== "confirm");
        setOverlayState(
          nextSafetyDecision.action === "confirm"
            ? "confirmation_required"
            : "guiding",
        );
        if (nextSafetyDecision.action === "confirm") {
          requestTopUtilityMode("expanded", { focus: true });
        }
      } else {
        finishTraceStage("render", {
          status: "skipped",
          summary: "Mock guidance was refused before target rendering.",
        });
        setGuidanceResult(null);
        setRiskTargetRevealed(false);
        setOverlayState(nextSafetyDecision.action === "clarify" ? "idle" : "error");
      }
    } catch (error) {
      const formattedError = formatCaptureError(error);
      const activeTraceStage = activeGuidanceTraceStageRef.current;
      if (activeTraceStage != null) {
        finishTraceStage(activeTraceStage, {
          status: "failed",
          summary: formattedError,
        });
      }
      (
        [
          "active_window",
          "screenshot",
          "candidates",
          "provider",
          "mapping",
          "validation",
          "render",
        ] as const
      ).forEach((stage) => {
        if (getGuidanceTraceEvent(guidanceTraceRef.current, stage) == null) {
          finishTraceStage(stage, {
            status: "skipped",
            summary: `Skipped after ${activeTraceStage ?? "capture"} failed.`,
          });
        }
      });
      setCaptureError(formattedError);
      if (isLiveGuidanceProvider) {
        setGuidanceProviderMode("unavailable");
        setGuidanceProviderName("none");
      }
      setGuidanceProviderDebug(null);
      setGuidanceSession((currentSession) =>
        currentSession == null
          ? currentSession
          : {
              ...currentSession,
              status: "error",
              updatedAt: new Date().toISOString(),
            },
      );
      setGuidanceRequest(null);
      setGuidanceIssues([]);
      setSafetyDecision(null);
      setGuidanceResult(null);
      setRiskTargetRevealed(false);
      setOverlayState("error");
    } finally {
      setIsRefreshingCapture(false);
      guidanceRefreshInFlightRef.current = false;
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
      await ensureScreenCaptureAccess();
      const metadata = await invokeCaptureCommand<CaptureMetadata>("capture_metadata");
      const screenshot = await invokeCaptureCommand<ScreenshotCapture>("capture_screenshot");

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

  async function continueGuidanceSession() {
    if (guidanceSession == null) {
      setGuidanceProviderError("No active guidance session is available.");
      return;
    }

    if (guidanceSession.status !== "waiting_for_user") {
      setGuidanceProviderError(
        `Guidance session is ${guidanceSession.status}; it is not waiting for a click.`,
      );
      return;
    }

    setIsRefreshingCapture(true);
    setCaptureError(null);
    setGuidanceProviderError(null);

    try {
      await ensureScreenCaptureAccess();
      const metadata = await invokeCaptureCommand<CaptureMetadata>("capture_metadata");
      const screenshot = await invokeCaptureCommand<ScreenshotCapture>("capture_screenshot");
      const verification = verifySessionScreenChange(guidanceSession, screenshot);

      setCaptureMetadata(metadata);
      setScreenshotCapture(screenshot);

      if (verification.status !== "changed") {
        setGuidanceSession({
          ...guidanceSession,
          status: "blocked",
          lastVerification: verification,
          updatedAt: verification.checkedAt ?? new Date().toISOString(),
        });
        setGuidanceProviderError(verification.message ?? "Screen change was not verified.");
        setOverlayState("idle");
        return;
      }

      setGuidanceSession({
        ...guidanceSession,
        status: "active",
        lastVerification: verification,
        updatedAt: verification.checkedAt ?? new Date().toISOString(),
      });
    } catch (error) {
      const message = formatCaptureError(error);
      setCaptureError(message);
      setGuidanceSession({
        ...guidanceSession,
        status: "error",
        lastVerification: {
          status: "blocked",
          checkedAt: new Date().toISOString(),
          message,
        },
        updatedAt: new Date().toISOString(),
      });
      setOverlayState("error");
      return;
    } finally {
      setIsRefreshingCapture(false);
    }

    await refreshCaptureMetadata(guidanceSession.originalGoal, "codex-subscription", {
      source: "session",
    });
  }

  async function advanceActiveWorkflowStep() {
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
  }

  function cancelVoiceRuntime() {
    clearVoiceCaptureTimeout();
    voiceSubmitInFlightRef.current = false;
    voiceCapturePhaseRef.current = "idle";
    voiceHoldStateRef.current = transitionVoiceHold(
      voiceHoldStateRef.current,
      "cancel",
    ).state;
    routedVoiceCommandRef.current = null;
    void resetNativeVoiceCapture().catch(() => undefined);
    const nextVoiceRuntime: VoiceRuntimeState = {
      ...createDefaultVoiceRuntimeState(),
      status: "cancelled",
    };
    voiceRuntimeRef.current = nextVoiceRuntime;
    setVoiceRuntime(nextVoiceRuntime);
  }

  function clearVoiceCaptureTimeout() {
    if (voiceCaptureTimeoutRef.current == null) {
      return;
    }

    window.clearTimeout(voiceCaptureTimeoutRef.current);
    voiceCaptureTimeoutRef.current = null;
  }

  function scheduleVoiceCaptureTimeout() {
    clearVoiceCaptureTimeout();

    voiceCaptureTimeoutRef.current = window.setTimeout(() => {
      voiceCaptureTimeoutRef.current = null;
      if (!voiceRuntimeRef.current.enabled || voiceSubmitInFlightRef.current) {
        return;
      }

      emitTo("overlay", "toki://overlay-command", {
        type: "submit-voice-listening",
      } satisfies OverlayCommand).catch(() => undefined);
    }, 10_000);
  }

  async function submitActiveVoiceCapture() {
    if (voiceCapturePhaseRef.current === "starting") {
      return;
    }

    if (
      voiceCapturePhaseRef.current !== "capturing" ||
      voiceSubmitInFlightRef.current
    ) {
      return;
    }

    const activeVoiceRuntime = voiceRuntimeRef.current;
    clearVoiceCaptureTimeout();
    voiceSubmitInFlightRef.current = true;
    voiceCapturePhaseRef.current = "submitting";

    const transcribingVoiceRuntime: VoiceRuntimeState = {
      ...activeVoiceRuntime,
      status: "transcribing",
    };
    voiceRuntimeRef.current = transcribingVoiceRuntime;
    setVoiceRuntime(transcribingVoiceRuntime);

    try {
      const captureStatus = await getNativeVoiceCaptureStatus().catch(() => null);

      if (captureStatus?.status !== "capturing") {
        const idleVoiceRuntime: VoiceRuntimeState = {
          ...voiceRuntimeRef.current,
          enabled: false,
          permission:
            voiceRuntimeRef.current.permission === "unknown"
              ? "granted"
              : voiceRuntimeRef.current.permission,
          status: "idle",
          error: undefined,
        };
        voiceRuntimeRef.current = idleVoiceRuntime;
        setVoiceRuntime(idleVoiceRuntime);
        setOverlayState((currentState) =>
          currentState === "listening" ? "idle" : currentState,
        );
        return;
      }

      const capture = await stopNativeVoiceCapture();
      const transcription = await transcribeNativeVoiceCapture(capture);

      if (transcription.status === "ready") {
        const traceId = createGuidanceTraceId();
        const tracedTranscript = {
          ...transcription.transcript,
          traceId,
        };
        const pendingCommand: VoiceCommandRequest = {
          text: tracedTranscript.text,
          source: activeVoiceRuntime.activationSource ?? "settings",
          createdAt: new Date().toISOString(),
          traceId,
        };
        const readyVoiceRuntime: VoiceRuntimeState = {
          ...voiceRuntimeRef.current,
          enabled: false,
          permission: "granted",
          status: "command_ready",
          transcript: tracedTranscript,
          pendingCommand,
          error: undefined,
        };
        voiceRuntimeRef.current = readyVoiceRuntime;
        setVoiceRuntime(readyVoiceRuntime);
      } else {
        const isRetryable = isRecoverableVoiceTranscriptionError(
          transcription.error,
        );
        const failedVoiceRuntime: VoiceRuntimeState = {
          ...voiceRuntimeRef.current,
          enabled: false,
          permission: isRetryable
            ? "granted"
            : voiceRuntimeRef.current.permission,
          status: isRetryable ? "no_speech" : "error",
          error: isRetryable ? getVoiceRetryMessage() : transcription.error,
        };
        voiceRuntimeRef.current = failedVoiceRuntime;
        setVoiceRuntime(failedVoiceRuntime);
      }
    } catch (error) {
      const message = formatErrorMessage(error);
      const isRetryable = isRecoverableVoiceTranscriptionError(message);
      const failedVoiceRuntime: VoiceRuntimeState = {
        ...voiceRuntimeRef.current,
        enabled: false,
        permission: isRetryable ? "granted" : "error",
        status: isRetryable ? "no_speech" : "error",
        error: isRetryable ? getVoiceRetryMessage() : message,
      };
      voiceRuntimeRef.current = failedVoiceRuntime;
      setVoiceRuntime(failedVoiceRuntime);
    } finally {
      clearVoiceCaptureTimeout();
      await resetNativeVoiceCapture().catch(() => undefined);
      voiceSubmitInFlightRef.current = false;
      voiceCapturePhaseRef.current = "idle";
      voiceHoldStateRef.current = transitionVoiceHold(
        voiceHoldStateRef.current,
        "submission_finished",
      ).state;
      setOverlayState((currentState) =>
        currentState === "listening" ? "idle" : currentState,
      );
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
    let lastPointerShadow: PointerShadowPosition | null = null;

    function updateTopUtility(position: Pick<NativeCursorPosition, "x" | "y">) {
      if (
        topUtilityModeRef.current === "expanded" &&
        topUtilityFocusedRef.current
      ) {
        clearTopUtilityTimer(topUtilityRevealTimerRef);
        clearTopUtilityTimer(topUtilityLeaveTimerRef);
        return;
      }

      if (isTopUtilityRevealPoint(position, viewport)) {
        clearTopUtilityTimer(topUtilityLeaveTimerRef);

        if (
          topUtilityModeRef.current !== "expanded" &&
          topUtilityRevealTimerRef.current == null
        ) {
          topUtilityRevealTimerRef.current = window.setTimeout(() => {
            topUtilityRevealTimerRef.current = null;
            requestTopUtilityMode("expanded");
          }, TOP_UTILITY_REVEAL_DWELL_MS);
        }

        return;
      }

      clearTopUtilityTimer(topUtilityRevealTimerRef);

      if (
        topUtilityModeRef.current === "expanded" &&
        isInsideExpandedTopUtility(position, viewport)
      ) {
        clearTopUtilityTimer(topUtilityLeaveTimerRef);
        return;
      }

      if (topUtilityLeaveTimerRef.current == null) {
        topUtilityLeaveTimerRef.current = window.setTimeout(() => {
          topUtilityLeaveTimerRef.current = null;
          requestTopUtilityMode(getPassiveTopUtilityMode(topStatusRef.current));
        }, TOP_UTILITY_LEAVE_DELAY_MS);
      }
    }

    function updateCursorShadow(position: Pick<NativeCursorPosition, "x" | "y">) {
      updateTopUtility(position);

      const nextPointerShadow =
        viewport.width <= 240 && viewport.height <= 240
          ? {
              x: Math.max(
                pointerShadowGeometry.margin,
                (viewport.width - pointerShadowGeometry.width) / 2,
              ),
              y: Math.max(
                pointerShadowGeometry.margin,
                (viewport.height - pointerShadowGeometry.height) / 2,
              ),
            }
          : getPointerShadowPosition(position.x, position.y, viewport);

      if (!disposed) {
        if (
          lastPointerShadow == null ||
          Math.abs(nextPointerShadow.x - lastPointerShadow.x) >=
            POINTER_SHADOW_UPDATE_THRESHOLD_PX ||
          Math.abs(nextPointerShadow.y - lastPointerShadow.y) >=
            POINTER_SHADOW_UPDATE_THRESHOLD_PX
        ) {
          lastPointerShadow = nextPointerShadow;
          setPointerShadow(nextPointerShadow);
        }
      }
    }

    void getOverlayCursorPosition()
      .then(updateCursorShadow)
      .catch(() => undefined);

    let unlistenCursor: (() => void) | null = null;
    let unlistenMode: (() => void) | null = null;

    listen<NativeCursorPosition>("toki://native-cursor", (event) => {
      updateCursorShadow(event.payload);
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }

        unlistenCursor = cleanup;
      })
      .catch(() => undefined);

    listen<TopUtilityModeEvent>("toki://top-utility-mode", (event) => {
      topUtilityModeRef.current = event.payload.mode;
      topUtilityFocusedRef.current = event.payload.focused;
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }

        unlistenMode = cleanup;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      clearTopUtilityTimer(topUtilityRevealTimerRef);
      clearTopUtilityTimer(topUtilityLeaveTimerRef);
      unlistenCursor?.();
      unlistenMode?.();
    };
  }, [viewport]);

  useEffect(() => {
    const mode = hasAcceptedGuidance || workflowRuntime.status === "active" ? "guidance" : "puck";

    invoke("set_overlay_surface_mode", {
      request: { mode },
    }).catch(() => undefined);
  }, [hasAcceptedGuidance, workflowRuntime.status]);

  useEffect(() => {
    let disposed = false;

    invoke<NativeClickMonitorStatus>("native_click_monitor_set_armed", {
      request: { armed: isClickAwareArmed },
    })
      .then((status) => {
        if (disposed) {
          return;
        }

        setClickAwareRuntime((currentState) => ({
          ...currentState,
          armed: status.armed,
          permission: status.supported ? "ready" : "unsupported",
          status: status.armed ? "armed" : "idle",
          targetId: status.armed ? currentWorkflowStep?.id : undefined,
          targetLabel: status.armed ? clickAwareTarget?.label : undefined,
          message: status.armed
            ? "Click-aware advancement is watching the current target."
            : status.supported
              ? "Click-aware advancement is waiting for an active workflow target."
              : "Native click observation is not supported on this platform yet.",
        }));
      })
      .catch((error) => {
        if (disposed) {
          return;
        }

        setClickAwareRuntime((currentState) => ({
          ...currentState,
          armed: false,
          permission: "error",
          status: "error",
          message: formatCaptureError(error),
        }));
      });

    return () => {
      disposed = true;

      if (isClickAwareArmed) {
        invoke("native_click_monitor_set_armed", {
          request: { armed: false },
        }).catch(() => undefined);
      }
    };
  }, [clickAwareTarget?.label, currentWorkflowStep?.id, isClickAwareArmed]);

  useEffect(() => {
    let unlistenNativeClick: (() => void) | undefined;

    listen<ClickAwareNativeClick>("toki://native-click", async (event) => {
      const click = event.payload;
      const target = clickAwareTarget;
      const activeStepId = currentWorkflowStep?.id;

      if (clickAwareAdvanceInFlightRef.current) {
        return;
      }

      if (!isClickAwareArmed || target == null || activeStepId == null) {
        setClickAwareRuntime((currentState) => ({
          ...currentState,
          lastClick: click,
          status: "disabled",
          message: "Native click ignored because no workflow target is armed.",
        }));
        return;
      }

      const distanceFromCenter = getClickTargetDistance(click, target);
      const hit = isClickInsideTarget(click, target, clickAwareHitPadding);
      const checkedAt = new Date().toISOString();

      if (!hit) {
        setClickAwareRuntime((currentState) => ({
          ...currentState,
          lastClick: click,
          lastHit: {
            status: "miss",
            targetId: activeStepId,
            targetLabel: target.label,
            distanceFromCenter,
            checkedAt,
          },
          status: "miss",
          message: "Click missed the active target, so Toki did not advance.",
        }));
        return;
      }

      clickAwareAdvanceInFlightRef.current = true;
      setClickAwareRuntime((currentState) => ({
        ...currentState,
        lastClick: click,
        lastHit: {
          status: "hit",
          targetId: activeStepId,
          targetLabel: target.label,
          distanceFromCenter,
          checkedAt,
        },
        status: "advancing",
        message: "Click matched the active target. Recapturing before advancing.",
      }));

      try {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 300);
        });
        await advanceActiveWorkflowStep();
      } finally {
        clickAwareAdvanceInFlightRef.current = false;
      }
    })
      .then((cleanup) => {
        unlistenNativeClick = cleanup;
      })
      .catch(() => {
        unlistenNativeClick = undefined;
      });

    return () => {
      unlistenNativeClick?.();
    };
  }, [clickAwareTarget, currentWorkflowStep?.id, isClickAwareArmed, workflowRuntime]);

  useEffect(() => {
    void publishRuntimeSnapshots();
  }, [overlaySnapshot]);

  useEffect(() => {
    void publishRuntimeSnapshots({ includeDebug: true });
  }, [debugSnapshot]);

  useEffect(() => {
    window.__tokiRunRealGuidanceSmoke = (goal = "Show me what to click next.") => {
      void refreshCaptureMetadata(goal, "codex-subscription", { source: "debug" });
    };

    return () => {
      delete window.__tokiRunRealGuidanceSmoke;
    };
  }, [viewport, guidanceFixture, guidanceResult]);

  useEffect(() => {
    let unlistenCommand: (() => void) | undefined;

    listen<OverlayCommand>("toki://overlay-command", async (event) => {
      if (event.payload.type === "refresh-capture") {
        await refreshCaptureMetadata(
          event.payload.goal,
          event.payload.providerMode ?? "unavailable",
        );
        return;
      }

      if (event.payload.type === "run-real-guidance-smoke") {
        await refreshCaptureMetadata("Show me what to click next.", "real", {
          source: "debug",
        });
        return;
      }

      if (event.payload.type === "toggle-pause") {
        cancelVoiceRuntime();
        setOverlayState((currentState) =>
          currentState === "paused" ? "guiding" : "paused",
        );
        return;
      }

      if (event.payload.type === "reveal-risky-target") {
        if (
          safetyDecision?.action !== "confirm" ||
          guidanceResult?.step?.target == null
        ) {
          return;
        }

        setRiskTargetRevealed(true);
        setOverlayState("guiding");
        requestTopUtilityMode("peek");
        return;
      }

      if (event.payload.type === "request-state") {
        await publishRuntimeSnapshots({ includeDebug: true, forceDebug: true });
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

      if (event.payload.type === "continue-guidance-session") {
        await continueGuidanceSession();
        return;
      }

      if (event.payload.type === "advance-workflow-step") {
        await advanceActiveWorkflowStep();
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

        if (!enabled) {
          setGestureVisualAnchor(null);
        }

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

      if (event.payload.type === "refresh-camera-devices") {
        setGestureDeviceRefreshToken((currentToken) => currentToken + 1);
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

      if (event.payload.type === "start-gesture-calibration") {
        setGestureCalibration(startGestureCalibration(new Date().toISOString()));
        return;
      }

      if (event.payload.type === "accept-gesture-calibration-sample") {
        const now = new Date().toISOString();
        const result = acceptGestureCalibrationCandidate({
          session: gestureCalibration,
          now,
          profileId:
            adaptiveGestureProfile?.profileId ??
            `gesture-profile-${crypto.randomUUID()}`,
          existingProfile: adaptiveGestureProfile,
        });
        setGestureCalibration(result.session);
        if (result.profile != null) {
          saveAdaptiveGestureProfile(getBrowserStorage(), result.profile);
          setAdaptiveGestureProfile(result.profile);
        }
        return;
      }

      if (event.payload.type === "reject-gesture-calibration-sample") {
        setGestureCalibration((current) =>
          rejectGestureCalibrationCandidate(current, new Date().toISOString()),
        );
        return;
      }

      if (event.payload.type === "reset-gesture-profile") {
        clearAdaptiveGestureProfile(getBrowserStorage());
        setAdaptiveGestureProfile(null);
        setGestureCalibration(
          createIdleGestureCalibrationSession(new Date().toISOString()),
        );
        return;
      }

      if (event.payload.type === "start-voice-listening") {
        if (voiceCapturePhaseRef.current !== "idle") {
          return;
        }

        clearVoiceCaptureTimeout();
        voiceSubmitInFlightRef.current = false;
        voiceCapturePhaseRef.current = "starting";
        if (event.payload.source === "hotkey") {
          const holdTransition = transitionVoiceHold(
            voiceHoldStateRef.current,
            "press",
          );
          if (holdTransition.effect !== "start_capture") {
            voiceCapturePhaseRef.current = "idle";
            return;
          }
          voiceHoldStateRef.current = holdTransition.state;
        }
        routedVoiceCommandRef.current = null;
        const requestingVoiceRuntime: VoiceRuntimeState = {
          enabled: true,
          permission: "unknown",
          status: "requesting_microphone",
          activationSource: event.payload.source,
        };
        voiceRuntimeRef.current = requestingVoiceRuntime;
        setVoiceRuntime(requestingVoiceRuntime);
        setOverlayState("listening");

        try {
          await resetNativeVoiceCapture().catch(() => undefined);

          if (
            event.payload.source === "hotkey" &&
            (!voiceHoldStateRef.current.held ||
              voiceHoldStateRef.current.releasePending)
          ) {
            voiceCapturePhaseRef.current = "idle";
            voiceHoldStateRef.current = transitionVoiceHold(
              voiceHoldStateRef.current,
              "capture_aborted",
            ).state;
            const idleVoiceRuntime: VoiceRuntimeState = {
              ...requestingVoiceRuntime,
              enabled: false,
              permission: "granted",
              status: "idle",
            };
            voiceRuntimeRef.current = idleVoiceRuntime;
            setVoiceRuntime(idleVoiceRuntime);
            setOverlayState("idle");
            return;
          }

          await startNativeVoiceCapture();
          voiceCapturePhaseRef.current = "capturing";
          const listeningVoiceRuntime: VoiceRuntimeState = {
            ...voiceRuntimeRef.current,
            permission: "granted",
            status: "listening",
            transcript: undefined,
            pendingCommand: undefined,
            error: undefined,
          };
          voiceRuntimeRef.current = listeningVoiceRuntime;
          setVoiceRuntime(listeningVoiceRuntime);

          if (event.payload.source === "hotkey") {
            const holdTransition = transitionVoiceHold(
              voiceHoldStateRef.current,
              "capture_started",
            );
            voiceHoldStateRef.current = holdTransition.state;
            if (holdTransition.effect === "submit_capture") {
              await submitActiveVoiceCapture();
            }
          } else {
            scheduleVoiceCaptureTimeout();
          }
        } catch (error) {
          clearVoiceCaptureTimeout();
          await resetNativeVoiceCapture().catch(() => undefined);
          voiceCapturePhaseRef.current = "idle";
          voiceHoldStateRef.current = transitionVoiceHold(
            voiceHoldStateRef.current,
            "capture_failed",
          ).state;
          const failedVoiceRuntime: VoiceRuntimeState = {
            ...voiceRuntimeRef.current,
            enabled: false,
            permission: "error",
            status: "error",
            error: formatErrorMessage(error),
          };
          voiceRuntimeRef.current = failedVoiceRuntime;
          setVoiceRuntime(failedVoiceRuntime);
          setOverlayState((currentState) =>
            currentState === "listening" ? "idle" : currentState,
          );
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
        if (voiceHoldStateRef.current.phase !== "idle") {
          const holdTransition = transitionVoiceHold(
            voiceHoldStateRef.current,
            "release",
          );
          voiceHoldStateRef.current = holdTransition.state;
          if (holdTransition.effect !== "submit_capture") {
            return;
          }
        }
        await submitActiveVoiceCapture();

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
  }, [
    overlaySnapshot,
    debugSnapshot,
    viewport,
    guidanceResult,
    workflowRuntime,
    safetyDecision,
  ]);

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
    void refreshCaptureMetadata(command.text, "codex-subscription", {
      traceId: command.traceId,
      source: "voice",
      transcript: command.text,
      transcriptAt: voiceRuntime.transcript?.updatedAt ?? command.createdAt,
    }).finally(() => {
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
      data-creature-mode={tokiCreatureState.mode}
      data-creature-anchor={tokiCreatureState.anchor}
      data-creature-tone={tokiCreatureState.tone}
      data-creature-energy={tokiCreatureState.energy}
      aria-label="Toki overlay"
    >
      <TokiTaskProgress runtime={workflowRuntime} />
      <TokiCreatureLayer
        state={tokiCreatureState}
        target={hasAcceptedGuidance ? activeTarget : null}
      >
        <TokiPointerLockCue
          lock={gesturePointerLock}
          validation={
            gesturePointerLockFeedback.validation === "checking"
              ? "checking"
              : gesturePointerLockFeedback.validation === "locked"
                ? "locked"
                : null
          }
        />
        <BlobPuck
          creatureState={tokiCreatureState}
          motion={puckMotion}
          pointerShadow={gesturePointerShadow ?? pointerShadow}
          pointerSource={gesturePointerShadow == null ? "cursor" : "gesture"}
          target={hasAcceptedGuidance ? activeTarget : null}
        />
      </TokiCreatureLayer>
    </main>
  );
}

function SettingsWindowApp() {
  const [utilityMode, setUtilityMode] = useState<TopUtilityMode>("hidden");
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [hasAcceptedGuidance, setHasAcceptedGuidance] = useState(false);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);
  const [voiceRuntime, setVoiceRuntime] = useState<VoiceRuntimeState>(() =>
    createDefaultVoiceRuntimeState(),
  );
  const [topStatus, setTopStatus] = useState<TokiTopStatusModel | null>(null);
  const isSpaceVoiceHeldRef = useRef(false);
  const utilityModeRef = useRef<TopUtilityMode>("hidden");
  const topStatusRef = useRef<TokiTopStatusModel | null>(null);

  function collapseTopUtility() {
    void setTopUtilityWindowMode(
      getPassiveTopUtilityMode(topStatusRef.current),
    ).catch(() => undefined);
  }

  function startSettingsDrag() {
    overlayWindow
      .startDragging()
      .catch(() => undefined);
  }

  useEffect(() => {
    let unlistenState: (() => void) | undefined;
    let unlistenMode: (() => void) | undefined;

    listen<OverlaySnapshot>("toki://overlay-state", (event) => {
      setOverlayState(event.payload.overlayState);
      setHasAcceptedGuidance(event.payload.hasAcceptedGuidance);
      setIsRefreshingCapture(event.payload.isRefreshingCapture);
      setVoiceRuntime(event.payload.voiceRuntime);
      topStatusRef.current = event.payload.topStatus;
      setTopStatus(event.payload.topStatus);
    })
      .then((cleanup) => {
        unlistenState = cleanup;
      })
      .catch(() => {
        unlistenState = undefined;
      });

    listen<TopUtilityModeEvent>("toki://top-utility-mode", (event) => {
      utilityModeRef.current = event.payload.mode;
      setUtilityMode(event.payload.mode);
    })
      .then((cleanup) => {
        unlistenMode = cleanup;
      })
      .catch(() => {
        unlistenMode = undefined;
      });

    emitTo("overlay", "toki://overlay-command", {
      type: "request-state",
    } satisfies OverlayCommand).catch(() => undefined);

    return () => {
      unlistenState?.();
      unlistenMode?.();
    };
  }, []);

  useEffect(() => {
    let unlistenFocus: (() => void) | undefined;

    overlayWindow
      .onFocusChanged((event) => {
        if (!event.payload && utilityModeRef.current === "expanded") {
          collapseTopUtility();
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
        collapseTopUtility();
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

  const isPaused = overlayState === "paused";
  const voiceActive =
    voiceRuntime.status === "listening" ||
    voiceRuntime.status === "requesting_microphone" ||
    voiceRuntime.status === "transcribing";
  const voiceStatusDetails = getVoiceStatusDetails(voiceRuntime);
  const idleStatusText = hasAcceptedGuidance
    ? "Target locked."
    : isPaused
      ? "Paused. Resume when ready."
      : voiceRuntime.status === "command_ready" && voiceRuntime.transcript
        ? `Heard: ${voiceRuntime.transcript.text}`
        : voiceActive
          ? "Listening."
          : "Ready for a command.";

  return (
    <main
      className="settings-shell"
      data-mode={utilityMode}
      aria-label="Toki top utility"
    >
      {utilityMode !== "hidden" && (
        <TokiTopUtilitySurface
          mode={utilityMode}
          status={topStatus}
          isPaused={isPaused}
          isBusy={isRefreshingCapture}
          voiceActive={voiceActive}
          voiceLabel={voiceActive ? "Listening" : "Push to talk"}
          voiceMessage={
            voiceStatusDetails.visible
              ? voiceStatusDetails.message
              : "Press and hold as a fallback."
          }
          idleStatusText={idleStatusText}
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
          onRevealTarget={() => {
            emitTo("overlay", "toki://overlay-command", {
              type: "reveal-risky-target",
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
          onClose={collapseTopUtility}
        />
      )}
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
  const [voiceProbe, setVoiceProbe] = useState<VoiceCapabilityProbe | null>(null);
  const [voiceProbeStatus, setVoiceProbeStatus] = useState<
    "idle" | "probing" | "requesting" | "ready" | "unsupported" | "error"
  >("idle");
  const [voiceProbeError, setVoiceProbeError] = useState<string | null>(null);
  const gestureDiagnostics = snapshot.gestureDiagnostics;
  const cameraDevices = gestureDiagnostics.cameraDevices;
  const cameraProbeStatus = gestureDiagnostics.cameraProbeStatus;
  const cameraProbeError = gestureDiagnostics.cameraProbeError;
  const cameraRuntimeStatus = gestureDiagnostics.cameraStatus;
  const cameraRuntimeError = gestureDiagnostics.cameraError;
  const handLandmarkerStatus = gestureDiagnostics.handLandmarkerStatus;
  const handLandmarkerError = gestureDiagnostics.handLandmarkerError;
  const handLandmarkSummary = gestureDiagnostics.hand;
  const pinchClassification = gestureDiagnostics.pinch;
  const openPalmClassification = gestureDiagnostics.openPalm;
  const pointPoseClassification = gestureDiagnostics.pointPose;
  const gesturePointer = gestureDiagnostics.pointer;
  const airTapPose = gestureDiagnostics.airTapPose;
  const doubleAirTap = gestureDiagnostics.doubleAirTap;
  const gesturePointerLock = snapshot.gesturePointerLock;
  const gesturePointerLockFeedback = snapshot.gesturePointerLockFeedback;
  const smoothedGesture = gestureDiagnostics.smoothedGesture;
  const gestureCalibration = snapshot.gestureCalibration;
  const gestureCalibrationProgress = getGestureCalibrationStageProgress(
    gestureCalibration,
  );
  const adaptiveGestureSettings = gestureDiagnostics.adaptiveSettings;
  const cameraLabelsMayBeHidden =
    cameraProbeStatus === "ready" &&
    cameraDevices.length > 0 &&
    cameraDevices.every((device) => /^Camera \d+$/.test(device.label));
  const screenshot = snapshot.screenshotCapture;
  const guidanceStep = snapshot.guidanceResult?.step ?? null;
  const target = guidanceStep?.target ?? null;
  const visionTrace = snapshot.guidanceProviderDebug?.vision ?? null;
  const providerOutput = snapshot.guidanceProviderDebug?.providerOutput ?? null;
  const targetVerificationTrace =
    snapshot.guidanceProviderDebug?.targetVerification ?? null;
  const guidanceTraceEvents = snapshot.guidanceTrace?.events ?? [];
  const guidanceGoal =
    snapshot.guidanceRequest?.goal ??
    snapshot.voiceRuntime.transcript?.text ??
    "No goal submitted";
  const guidanceScreen = snapshot.guidanceRequest?.screen ?? null;
  const guidancePayload = guidanceScreen?.screenshotPayload ?? null;
  const guidanceCandidateCount = guidanceScreen?.candidates?.length ?? 0;
  const guidanceCandidateSource = guidanceScreen?.candidateSource ?? "none";
  const guidanceCandidateEvidence = guidanceScreen?.candidateEvidence ?? null;
  const guidanceCandidates = guidanceScreen?.candidates?.slice(0, 8) ?? [];
  const guidancePayloadSize = guidancePayload
    ? `${(guidancePayload.byteLength / 1024 / 1024).toFixed(2)} MB`
    : "Missing";
  const guidancePayloadRegion = guidancePayload?.crop
    ? `${guidancePayload.crop.appName ?? "active app"} ${
        guidancePayload.crop.title ? `"${guidancePayload.crop.title}" ` : ""
      }${guidancePayload.crop.width} x ${guidancePayload.crop.height} @ ${guidancePayload.crop.x}, ${guidancePayload.crop.y}`
    : guidancePayload
      ? "Full display fallback"
      : "Missing";
  const guidancePayloadPlan = guidancePayload
    ? guidancePayload.preprocessing
      ? `${guidancePayload.preprocessing.strategy}; ${Math.round(
          guidancePayload.preprocessing.scaleX * 100,
        )}% x ${Math.round(guidancePayload.preprocessing.scaleY * 100)}%${
          guidancePayload.preprocessing.jpegQuality == null
            ? ""
            : `; JPEG ${Math.round(guidancePayload.preprocessing.jpegQuality * 100)}%`
        }`
      : "Legacy payload metadata"
    : "Capture required";
  const guidanceBlocker =
    snapshot.captureError != null
      ? `Capture: ${snapshot.captureError}`
      : snapshot.guidanceProviderError != null
        ? `Provider: ${snapshot.guidanceProviderError}`
      : snapshot.safetyDecision?.action === "block"
        ? `Safety: ${snapshot.safetyDecision.message}`
      : snapshot.guidanceIssues.length > 0
        ? `Validation: ${snapshot.guidanceIssues[0]?.path} ${snapshot.guidanceIssues[0]?.message}`
      : guidanceScreen?.candidateError != null && guidanceCandidateCount === 0
        ? `Candidates: ${guidanceScreen.candidateError}`
      : target == null
        ? "No accepted target yet"
        : "Target accepted";
  const guidanceInputQuality =
    guidancePayload == null
      ? "No screenshot payload"
      : guidancePayload.crop == null
        ? "Full display fallback"
        : `Active-window crop: ${guidancePayload.crop.appName ?? "unknown app"}`;
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
    sendOverlayCommand({ type: "refresh-capture", providerMode: "mock" });
  }

  function testRealGuidanceSmoke() {
    setGuidanceTesterVerdict("untested");
    sendOverlayCommand({ type: "run-real-guidance-smoke" });
  }

  function testCodexVisionGuidance() {
    setGuidanceTesterVerdict("untested");
    sendOverlayCommand({
      type: "refresh-capture",
      goal: "Show me what to click next.",
      providerMode: "codex-subscription",
    });
  }

  function startMockWorkflow(goal: string) {
    sendOverlayCommand({
      type: "start-mock-workflow",
      goal,
    });
  }

  function refreshVoiceCapabilities() {
    setVoiceProbeStatus("probing");
    setVoiceProbeError(null);

    probeVoiceCapabilities()
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
    refreshVoiceCapabilities();

    return () => {
      unlistenState?.();
    };
  }, []);

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
                <dt>Click aware</dt>
                <dd>
                  {snapshot.clickAwareRuntime.armed
                    ? "Armed"
                    : snapshot.clickAwareRuntime.status}
                </dd>
              </div>
              <div>
                <dt>Click target</dt>
                <dd>{snapshot.clickAwareRuntime.targetLabel ?? "None"}</dd>
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
              <div>
                <dt>Last click</dt>
                <dd>
                  {snapshot.clickAwareRuntime.lastClick
                    ? `${Math.round(snapshot.clickAwareRuntime.lastClick.x)}, ${Math.round(
                        snapshot.clickAwareRuntime.lastClick.y,
                      )}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Last hit</dt>
                <dd>
                  {snapshot.clickAwareRuntime.lastHit
                    ? `${snapshot.clickAwareRuntime.lastHit.status} (${Math.round(
                        snapshot.clickAwareRuntime.lastHit.distanceFromCenter,
                      )}px)`
                    : "None"}
                </dd>
              </div>
            </dl>
            <p className="debug-muted">
              {snapshot.clickAwareRuntime.message ??
                "Click-aware advancement only watches while a workflow target is armed."}
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
                Start native capture
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
              {debugVoiceStatusDetails.message}. Debug uses the same native
              microphone path as Option.
            </p>
          </section>

          <section className="debug-section">
            <h2>Voice Capabilities</h2>
            <div className="debug-section-header-row">
              <span>{voiceProbeStatus}</span>
              <button
                type="button"
                onClick={() => {
                  refreshVoiceCapabilities();
                }}
                disabled={voiceProbeStatus === "probing"}
              >
                {voiceProbeStatus === "probing" ? "Probing" : "Probe"}
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
                  sendOverlayCommand({ type: "refresh-camera-devices" });
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
            <h2>Camera Runtime</h2>
            <div className="debug-section-header-row">
              <span>{cameraRuntimeStatus}</span>
              <span>
                {snapshot.gestureRuntime.camera.enabled ? "camera enabled" : "camera off"}
              </span>
            </div>
            <dl>
              <div>
                <dt>Owner</dt>
                <dd>{gestureDiagnostics.owner}</dd>
              </div>
              <div>
                <dt>Permission</dt>
                <dd>{gestureDiagnostics.cameraPermission}</dd>
              </div>
              <div>
                <dt>Preview</dt>
                <dd>{gestureDiagnostics.previewVisible ? "Visible" : "Hidden"}</dd>
              </div>
              <div>
                <dt>Raw frames</dt>
                <dd>
                  {gestureDiagnostics.rawCameraFramesShared
                    ? "Shared with Debug"
                    : "Local only"}
                </dd>
              </div>
            </dl>
            <p className="debug-muted">
              The persistent overlay runtime processes a detached local video stream.
              Debug receives state snapshots only, so closing this window does not stop
              gesture recognition.
            </p>
            {cameraRuntimeStatus === "permission_denied" ? (
              <p className="debug-muted">
                Camera permission is denied. On macOS, enable Camera access for
                Toki or the terminal app in System Settings, then quit and relaunch.
              </p>
            ) : cameraRuntimeStatus === "no_camera" ? (
              <p className="debug-muted">
                No usable camera was found. Toki remains available through tray and
                manual controls.
              </p>
            ) : cameraRuntimeStatus === "disabled" ? (
              <p className="debug-muted">
                Camera is off. No camera frames are captured or processed.
              </p>
            ) : null}
            {cameraRuntimeError ? (
              <p className="debug-muted">{cameraRuntimeError}</p>
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
                <dt>Assets</dt>
                <dd>
                  {gestureDiagnostics.handLandmarkerAssetMode === "bundled"
                    ? "Bundled locally"
                    : gestureDiagnostics.handLandmarkerAssetMode}
                </dd>
              </div>
              <div>
                <dt>Frame</dt>
                <dd>{handLandmarkSummary?.frameId ?? "None"}</dd>
              </div>
              <div>
                <dt>Hand</dt>
                <dd>{handLandmarkSummary?.handedness ?? "None"}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>
                  {handLandmarkSummary
                    ? handLandmarkSummary.confidence.toFixed(2)
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Landmarks</dt>
                <dd>{handLandmarkSummary?.landmarkCount ?? 0}</dd>
              </div>
            </dl>
            {handLandmarkerError ? (
              <p className="debug-muted">{handLandmarkerError}</p>
            ) : null}
            {handLandmarkerStatus === "loading" ? (
              <p className="debug-muted">
                Loading the bundled MediaPipe runtime and hand model from Toki.
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
                <h3>Point</h3>
                <dl>
                  <div>
                    <dt>Pose</dt>
                    <dd>{pointPoseClassification.label}</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{gesturePointer?.phase ?? pointPoseClassification.phase}</dd>
                  </div>
                  <div>
                    <dt>Index ratio</dt>
                    <dd>
                      {pointPoseClassification.indexExtensionRatio == null
                        ? "None"
                        : pointPoseClassification.indexExtensionRatio.toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt>Folded fingers</dt>
                    <dd>
                      {pointPoseClassification.foldedFingerCount} /{" "}
                      {pointPoseClassification.requiredFoldedFingerCount}
                    </dd>
                  </div>
                  <div>
                    <dt>Mapped point</dt>
                    <dd>
                      {gesturePointer
                        ? `${Math.round(gesturePointer.display.x)}, ${Math.round(
                            gesturePointer.display.y,
                          )}`
                        : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Display</dt>
                    <dd>
                      {gestureDiagnostics.pointerDisplay.width} ×{" "}
                      {gestureDiagnostics.pointerDisplay.height}
                    </dd>
                  </div>
                </dl>
                <p className="debug-muted">
                  Hold one index finger extended with the other three fingers folded.
                  Toki maps the stable fingertip across the active display and keeps the
                  last point for up to two seconds during brief tracking loss.
                </p>
              </div>

              <div className="debug-recognition-card">
                <h3>Air-tap lock</h3>
                <dl>
                  <div>
                    <dt>Pose</dt>
                    <dd>{airTapPose.label}</dd>
                  </div>
                  <div>
                    <dt>Tap phase</dt>
                    <dd>{doubleAirTap.phase}</dd>
                  </div>
                  <div>
                    <dt>First tap</dt>
                    <dd>{doubleAirTap.firstTap?.id ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Second tap</dt>
                    <dd>{doubleAirTap.secondTap?.id ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Lock state</dt>
                    <dd>{gesturePointerLockFeedback.validation}</dd>
                  </div>
                  <div>
                    <dt>Locked point</dt>
                    <dd>
                      {gesturePointerLock
                        ? `${Math.round(gesturePointerLock.pointer.display.x)}, ${Math.round(
                            gesturePointerLock.pointer.display.y,
                          )}`
                        : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Screen proof</dt>
                    <dd>
                      {gesturePointerLock?.evidence.activeWindowId ??
                        gesturePointerLockFeedback.reason ??
                        "None"}
                    </dd>
                  </div>
                </dl>
                <p className="debug-muted">
                  Flex and return the pointing index twice within two seconds. The
                  detached blue drop marks the copied coordinate; it is not a verified
                  guidance target and never clicks anything.
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
            <div className="debug-section-header-row">
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({
                    type: "set-camera-enabled",
                    enabled: !snapshot.gestureRuntime.camera.enabled,
                  });
                }}
              >
                {snapshot.gestureRuntime.camera.enabled
                  ? "Turn camera off"
                  : "Turn camera on"}
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({
                    type: "set-gestures-enabled",
                    enabled: !snapshot.gestureRuntime.enabled,
                  });
                }}
                disabled={!snapshot.gestureRuntime.camera.enabled}
              >
                {snapshot.gestureRuntime.enabled
                  ? "Disable gestures"
                  : "Enable gestures"}
              </button>
            </div>
            <dl>
              <div>
                <dt>Runtime owner</dt>
                <dd>{gestureDiagnostics.owner}</dd>
              </div>
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
              <div>
                <dt>Profile</dt>
                <dd>
                  {adaptiveGestureSettings.source === "adaptive_profile"
                    ? adaptiveGestureSettings.profileId
                    : "Default bounded settings"}
                </dd>
              </div>
              <div>
                <dt>Fixed baseline</dt>
                <dd>X 0.12–0.88 / Y 0.08–0.72 / tap 1.30 / pinch 0.34</dd>
              </div>
              <div>
                <dt>Point range</dt>
                <dd>
                  X {gestureDiagnostics.pointerCalibration.cameraMinX.toFixed(2)}–
                  {gestureDiagnostics.pointerCalibration.cameraMaxX.toFixed(2)} / Y{" "}
                  {gestureDiagnostics.pointerCalibration.cameraMinY.toFixed(2)}–
                  {gestureDiagnostics.pointerCalibration.cameraMaxY.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>Tap / pinch</dt>
                <dd>
                  {adaptiveGestureSettings.tapFlexionRatioThreshold.toFixed(2)} /{" "}
                  {adaptiveGestureSettings.pinchDistanceThreshold.toFixed(2)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="debug-section debug-section-wide">
            <h2>Adaptive Gesture Calibration</h2>
            <div className="debug-section-header-row">
              <span>{gestureCalibration.status}</span>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({ type: "start-gesture-calibration" });
                }}
                disabled={
                  !snapshot.gestureRuntime.camera.enabled ||
                  !snapshot.gestureRuntime.enabled ||
                  gestureCalibration.status === "reviewing"
                }
              >
                {gestureCalibration.status === "idle" ? "Start" : "Restart"}
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({
                    type: "accept-gesture-calibration-sample",
                  });
                }}
                disabled={gestureCalibration.pending == null}
              >
                Correct
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({
                    type: "reject-gesture-calibration-sample",
                  });
                }}
                disabled={gestureCalibration.pending == null}
              >
                Wrong gesture
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({ type: "reset-gesture-profile" });
                }}
                disabled={
                  snapshot.adaptiveGestureProfile == null &&
                  gestureCalibration.status === "idle"
                }
              >
                Reset
              </button>
            </div>
            <p>{gestureCalibration.instruction}</p>
            <dl>
              <div>
                <dt>Stage</dt>
                <dd>{gestureCalibration.stage}</dd>
              </div>
              <div>
                <dt>Stage progress</dt>
                <dd>
                  {gestureCalibration.stage === "complete"
                    ? "Complete"
                    : `${gestureCalibrationProgress.accepted} / ${gestureCalibrationProgress.required}`}
                </dd>
              </div>
              <div>
                <dt>Accepted total</dt>
                <dd>{gestureCalibration.acceptedCount}</dd>
              </div>
              <div>
                <dt>Rejected total</dt>
                <dd>{gestureCalibration.rejectedCount}</dd>
              </div>
              <div>
                <dt>Pending sample</dt>
                <dd>
                  {gestureCalibration.pending?.point
                    ? `${gestureCalibration.pending.point.x.toFixed(3)}, ${gestureCalibration.pending.point.y.toFixed(3)}`
                    : gestureCalibration.pending?.value != null
                      ? gestureCalibration.pending.value.toFixed(3)
                      : "Move into the instructed pose"}
                </dd>
              </div>
              <div>
                <dt>Preferred hand</dt>
                <dd>
                  {snapshot.adaptiveGestureProfile?.preferredPointerHand ??
                    "Learned after completion"}
                </dd>
              </div>
            </dl>
            <p className="debug-muted">
              Every sample requires an explicit Correct decision. Wrong gesture
              discards the sample. Toki stores only the completed median and
              variation values locally—never camera frames or hand landmarks. Reset
              immediately restores the fixed defaults.
            </p>
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
              <button
                type="button"
                onClick={testCodexVisionGuidance}
                disabled={snapshot.isRefreshingCapture}
              >
                Codex vision
              </button>
              <button
                type="button"
                onClick={() => {
                  sendOverlayCommand({ type: "continue-guidance-session" });
                }}
                disabled={
                  snapshot.isRefreshingCapture ||
                  snapshot.guidanceSession?.status !== "waiting_for_user"
                }
              >
                Continue
              </button>
            </div>
            <dl>
              <div>
                <dt>Trace</dt>
                <dd>{snapshot.guidanceTrace?.id ?? "None"}</dd>
              </div>
              <div>
                <dt>Trace source</dt>
                <dd>{snapshot.guidanceTrace?.source ?? "None"}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{snapshot.guidanceProviderMode}</dd>
              </div>
              <div>
                <dt>Decision source</dt>
                <dd>{snapshot.guidanceProviderName ?? "None"}</dd>
              </div>
              <div>
                <dt>Blocker</dt>
                <dd>{guidanceBlocker}</dd>
              </div>
              <div>
                <dt>Input</dt>
                <dd>{guidanceInputQuality}</dd>
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
                <dt>Summary</dt>
                <dd>{snapshot.guidanceResult?.summary ?? snapshot.guidanceProviderError ?? "None"}</dd>
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
                <dt>Plan source</dt>
                <dd>{snapshot.guidanceSession?.taskPlan.source ?? "None"}</dd>
              </div>
              <div>
                <dt>Original task</dt>
                <dd>{snapshot.guidanceRequest?.localization?.originalGoal ?? "None"}</dd>
              </div>
              <div>
                <dt>Localization step</dt>
                <dd>
                  {snapshot.guidanceRequest?.localization
                    ? `${snapshot.guidanceRequest.localization.currentStepIndex + 1} / ${snapshot.guidanceRequest.localization.totalSteps}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Current objective</dt>
                <dd>{snapshot.guidanceRequest?.localization?.objective ?? "None"}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>{snapshot.guidanceSession?.id ?? "None"}</dd>
              </div>
              <div>
                <dt>Session status</dt>
                <dd>{snapshot.guidanceSession?.status ?? "None"}</dd>
              </div>
              <div>
                <dt>Session step</dt>
                <dd>
                  {snapshot.guidanceSession
                    ? `${snapshot.guidanceSession.currentStepIndex + 1}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Session check</dt>
                <dd>{snapshot.guidanceSession?.lastVerification?.status ?? "None"}</dd>
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
                <dd>{formatTargetBox(target)}</dd>
              </div>
              <div>
                <dt>Vision mode</dt>
                <dd>{visionTrace?.coordinateMode ?? "None"}</dd>
              </div>
              <div>
                <dt>Raw vision</dt>
                <dd>{formatVisionRawTarget(visionTrace)}</dd>
              </div>
              <div>
                <dt>Raw provider answer</dt>
                <dd>{providerOutput?.rawAnswer ?? "None"}</dd>
              </div>
              <div>
                <dt>Raw provider target</dt>
                <dd>{formatRawProviderTarget(providerOutput?.target)}</dd>
              </div>
              <div>
                <dt>Raw provider reason</dt>
                <dd>{providerOutput?.reason ?? "None"}</dd>
              </div>
              <div>
                <dt>Raw provider confidence</dt>
                <dd>
                  {providerOutput?.confidence == null
                    ? "None"
                    : `${Math.round(providerOutput.confidence * 100)}%`}
                </dd>
              </div>
              <div>
                <dt>Mapped raw</dt>
                <dd>{formatTargetBox(visionTrace?.mappedBeforeTighten)}</dd>
              </div>
              <div>
                <dt>Original rectangle</dt>
                <dd>{formatTargetBox(targetVerificationTrace?.inputTarget)}</dd>
              </div>
              <div>
                <dt>Target verification</dt>
                <dd>{targetVerificationTrace?.status ?? "None"}</dd>
              </div>
              <div>
                <dt>Interpreted action</dt>
                <dd>{targetVerificationTrace?.commandIntent.action ?? "None"}</dd>
              </div>
              <div>
                <dt>Interpreted object</dt>
                <dd>{targetVerificationTrace?.commandIntent.object ?? "None"}</dd>
              </div>
              <div>
                <dt>Evidence source</dt>
                <dd>{targetVerificationTrace?.source ?? "None"}</dd>
              </div>
              <div>
                <dt>Evidence match</dt>
                <dd>{targetVerificationTrace?.match ?? "None"}</dd>
              </div>
              <div>
                <dt>Verified candidate</dt>
                <dd>{targetVerificationTrace?.candidateId ?? "None"}</dd>
              </div>
              <div>
                <dt>Supporting evidence</dt>
                <dd>
                  {targetVerificationTrace?.supportingEvidence
                    ? `${targetVerificationTrace.supportingEvidence.source}:${targetVerificationTrace.supportingEvidence.candidateId} “${targetVerificationTrace.supportingEvidence.resolvedLabel}”; actions=${targetVerificationTrace.supportingEvidence.matchedActions.join("+") || "none"}; objects=${targetVerificationTrace.supportingEvidence.matchedObjects.join("+") || "none"}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Grounding</dt>
                <dd>
                  {targetVerificationTrace
                    ? `${targetVerificationTrace.groundingVerdict}: ${targetVerificationTrace.groundingScore} / ${targetVerificationTrace.groundingThreshold}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Click point</dt>
                <dd>
                  {targetVerificationTrace?.clickPoint
                    ? `${targetVerificationTrace.clickPoint.x}, ${targetVerificationTrace.clickPoint.y}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Verification reasons</dt>
                <dd>{targetVerificationTrace?.reasons.join(", ") ?? "None"}</dd>
              </div>
              <div>
                <dt>Final rectangle</dt>
                <dd>{formatTargetBox(targetVerificationTrace?.verifiedTarget)}</dd>
              </div>
              <div>
                <dt>Exact rejection</dt>
                <dd>
                  {targetVerificationTrace?.status === "rejected"
                    ? targetVerificationTrace.reasons[
                        targetVerificationTrace.reasons.length - 1
                      ] ?? snapshot.guidanceProviderError ?? "Rejected"
                    : snapshot.guidanceProviderError ?? "None"}
                </dd>
              </div>
            </dl>
            {guidanceTraceEvents.length > 0 ? (
              <ol className="debug-candidate-list">
                {guidanceTraceEvents.map((event, index) => (
                  <li key={`${event.stage}-${index}`}>
                    <div>
                      <strong>
                        {index + 1}. {event.stage}
                      </strong>
                      <span>{event.summary ?? "No summary"}</span>
                    </div>
                    <div>
                      <span>{event.status}</span>
                      <span>{event.durationMs ?? 0} ms</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            <div className="debug-result-review">
              <div>
                <span>Target</span>
                <strong>{target?.label ?? "None"}</strong>
              </div>
              <div>
                <span>Coordinates</span>
                <strong>
                  {formatTargetBox(target)}
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
            {snapshot.guidanceSession ? (
              <p className="debug-muted">
                Session remembers {snapshot.guidanceSession.previousTargets.length} target(s)
                for "{snapshot.guidanceSession.originalGoal}".
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
                <dt>Provider Image</dt>
                <dd>
                  {guidancePayload
                    ? `${guidancePayload.imageWidth} x ${guidancePayload.imageHeight}`
                    : "Missing"}
                </dd>
              </div>
              <div>
                <dt>Region</dt>
                <dd>{guidancePayloadRegion}</dd>
              </div>
              <div>
                <dt>Calibration</dt>
                <dd>{guidanceScreen?.calibration?.status ?? "Missing"}</dd>
              </div>
              <div>
                <dt>Preparation</dt>
                <dd>{guidancePayloadPlan}</dd>
              </div>
              <div>
                <dt>Candidates</dt>
                <dd>
                  {guidanceCandidateCount} from {guidanceCandidateSource}
                </dd>
              </div>
              <div>
                <dt>Candidate Fusion</dt>
                <dd>
                  {guidanceCandidateEvidence
                    ? `${guidanceCandidateEvidence.rawCount} raw / ${guidanceCandidateEvidence.validCount} valid / ${guidanceCandidateEvidence.fusedCount} fused / ${guidanceCandidateEvidence.returnedCount} returned`
                    : "Not recorded"}
                </dd>
              </div>
              <div>
                <dt>Evidence Sources</dt>
                <dd>
                  {guidanceCandidateEvidence
                    ? `AX ${guidanceCandidateEvidence.sourceCounts.accessibility}, OCR ${guidanceCandidateEvidence.sourceCounts.ocr}, DOM ${guidanceCandidateEvidence.sourceCounts.dom}, manual ${guidanceCandidateEvidence.sourceCounts.manual}, unknown ${guidanceCandidateEvidence.sourceCounts.unknown}`
                    : "Not recorded"}
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
