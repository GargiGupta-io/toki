import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  GestureVoiceContext,
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
import {
  createScreenshotCropFromDisplayRect,
  mapDisplayRectToProviderImage,
} from "./coordinateTransforms";
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
  getGestureActionForClassification,
  useAlwaysOnGestureRuntime,
  type GestureRuntimeDiagnostics,
} from "./gestureRuntime";
import { createPointerLockSnapshot } from "./gestureContracts";
import {
  canStartGestureVoice,
  createGestureVoiceContext,
  createGestureVoiceOwner,
  isGestureVoiceTerminationForOwner,
  type ControlPinchEvent,
  type GestureVoiceDetector,
  type GestureVoiceOwner,
} from "./gestureControlVoice";
import {
  cameraShutdownGesturePolicy,
  classifyCameraGestureVoiceCommand,
  getCameraShutdownSecondsLeft,
  reconcileCameraGestureRuntimeState,
  setCameraGestureRuntimeEnabled,
} from "./gestureCameraControl";
import {
  classifyPointerExplanationCommand,
  explicitObjectConflictsWithLabel,
  getPointerEvidenceDecision,
  hasSpecificPointerEvidenceLabel,
  requestCodexPointerExplanation,
  shouldRoutePointerExplanation,
  type PointerExplanationImageEvidence,
  type PointerExplanationIntent,
  type PointerExplanationState,
} from "./gesturePointerExplanation";
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
import {
  getDetachedGesturePointerShadowPosition,
  getPointerShadowPosition,
  pointerShadowGeometry,
} from "./overlayGeometry";
import {
  createGesturePresentationDiagnostic,
  createGestureWindowValidationDiagnostic,
  type GesturePresentationDiagnostic,
  type GestureWindowValidationDiagnostic,
} from "./gestureDiagnostics";
import {
  createGesturePuckPresentation,
  type GestureLockValidation,
} from "./gesturePuckPresentation";
import type {
  PointerShadowPosition,
  ViewportMetrics,
} from "./overlayGeometry";
import { createGuidanceProviderAdapter } from "./guidanceProvider";
import { createTokiApiClient, type AccountState } from "./tokiApiClient";
import { verifyGuidanceTarget } from "./targetVerification";
import { requireScreenCaptureAccess } from "./captureAccess";
import {
  cameraReframingLabel,
  cameraReframingMessage,
  shouldWarnAboutCameraReframing,
} from "./cameraReframing";
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
import {
  clearTokiDebugExport,
  getTokiDebugExportStatus,
  useTokiDebugExport,
  type TokiDebugExportStatus,
} from "./debugExport";
import {
  loadDiagnosticsSettings,
  normalizeDiagnosticsSettings,
  saveDiagnosticsSettings,
  shouldClearDiagnosticsOnChange,
  type DiagnosticsSettings,
} from "./diagnosticsSettings";
import {
  clearOpenAiKey,
  describeOpenAiKeyStatus,
  getOpenAiKeyStatus,
  setOpenAiKey,
  unknownOpenAiKeyStatus,
  type OpenAiKeyStatus,
} from "./openAiKey";
import { createAuthSession, listenForAuthCallback } from "./authBindings";
import {
  describeAuthState,
  describePlan,
  signedOut,
  type AuthSession,
  type AuthState,
} from "./authSession";
import {
  describeLocalTranscription,
  getOperatorSetting,
  setOperatorSetting,
  whisperBinarySetting,
  whisperModelSetting,
} from "./operatorSettings";
import {
  checkForUpdate,
  describeUpdateState,
  downloadAndInstallUpdate,
  initialUpdateCheckState,
  restartToFinishUpdate,
  type UpdateCheckState,
} from "./appUpdates";
import { transcribeNativeVoiceCapture } from "./voiceTranscription";
import type { OverlayState } from "./puckMotion";
import { BlobPuck } from "./BlobPuck";
import { TokiCreatureLayer } from "./TokiCreatureLayer";
import { TokiTopUtilitySurface } from "./TokiTopUtilitySurface";
import { TokiTaskProgress } from "./TokiTaskProgress";
import { TokiPointerExplanationCard } from "./TokiPointerExplanationCard";
import {
  getPassiveTopUtilityMode,
  isTransientVoiceTopStatus,
  isInsideExpandedTopUtility,
  isTopUtilityRevealPoint,
  settleTransientVoiceTopStatus,
  TOP_UTILITY_RESULT_NOTICE_MS,
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
  pointerExplanation: PointerExplanationState | null;
  pointerExplanationSpeechMuted: boolean;
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
  gesturePresentationDiagnostics: GesturePresentationDiagnostic;
  gestureWindowValidationDiagnostics: GestureWindowValidationDiagnostic | null;
  gestureVoiceContext: GestureVoiceContext | null;
  gestureVoiceLifecycle: GestureVoiceLifecycleDiagnostic;
};

type GesturePointerLockFeedback = {
  validation: GestureLockValidation;
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
  // Signing in or out happens in Preferences, and the overlay is what makes
  // guidance requests. Re-reading the store on demand would eventually notice a
  // sign-in but never a sign-out, because the overlay's copy stays valid in
  // memory after the stored one is gone.
  | { type: "auth-changed" }
  | { type: "set-camera-gestures-enabled"; enabled: boolean }
  | { type: "refresh-camera-devices" }
  | { type: "start-gesture-calibration" }
  | { type: "accept-gesture-calibration-sample" }
  | { type: "reject-gesture-calibration-sample" }
  | { type: "reset-gesture-profile" }
  | {
      type: "start-voice-listening";
      source: VoiceActivationSource;
      gestureContext?: GestureVoiceContext;
    }
  | { type: "set-pointer-explanation-speech-muted"; muted: boolean }
  | { type: "set-diagnostics-settings"; settings: DiagnosticsSettings }
  | { type: "clear-diagnostics" }
  | { type: "submit-voice-listening" }
  | { type: "stop-voice-listening" };

type NativeClickMonitorStatus = {
  armed: boolean;
  supported: boolean;
  source: ClickAwareNativeClick["source"];
};

type VoiceCapturePhase = "idle" | "starting" | "capturing" | "submitting";

type GestureVoiceCaptureSummary = {
  sessionId: string;
  durationMs: number;
  byteLength: number;
};

type GestureVoiceLifecycleDiagnostic = {
  capturePhase: VoiceCapturePhase;
  holdPhase: ReturnType<typeof createIdleVoiceHoldState>["phase"];
  held: boolean;
  releasePending: boolean;
  owner: GestureVoiceOwner | null;
  nativeSessionId: string | null;
  lastCapture: GestureVoiceCaptureSummary | null;
  lastTransition: string;
  updatedAt: string;
};

function isHeldVoiceActivationSource(source: VoiceActivationSource): boolean {
  return source === "hotkey" || source === "gesture";
}

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
const voiceCaptureStartupTimeoutMs = 5_000;

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
  pointerExplanation,
  guidanceFailure,
  hasAcceptedGuidance,
  targetLabel,
  instruction,
  safetyDecision,
  gestureClassification,
  wristRollLock,
  cameraShutdown,
  cameraReframingActive,
  handLandmarkerFailed,
  splitPhase,
  pointerLock,
  pointerLockFeedback,
}: {
  voiceRuntime: VoiceRuntimeState;
  overlayState: OverlayState;
  isRefreshingCapture: boolean;
  pointerExplanation: PointerExplanationState | null;
  guidanceFailure: string | null;
  hasAcceptedGuidance: boolean;
  targetLabel: string;
  instruction: string;
  safetyDecision: SafetyPolicyDecision | null;
  gestureClassification: GestureClassification;
  wristRollLock: GestureRuntimeDiagnostics["wristRollLock"];
  cameraShutdown: GestureRuntimeDiagnostics["cameraShutdown"];
  cameraReframingActive: boolean;
  handLandmarkerFailed: boolean;
  splitPhase: GestureRuntimeDiagnostics["split"]["phase"];
  pointerLock: PointerLockSnapshot | null;
  pointerLockFeedback: GesturePointerLockFeedback;
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

  // Ranked above even the re-framing warning: if the hand tracking model never
  // loaded, no gesture can be recognised at all, and every other explanation
  // would be misleading.
  //
  // This state was previously visible only in the debug window, which is not
  // shipped, so a model that failed to load looked to a user exactly like a
  // hand Toki could not see. A content security policy that blocked the
  // WebAssembly would fail in precisely this silent way.
  if (handLandmarkerFailed) {
    return {
      mode: "warning",
      label: "Gesture tracking unavailable",
      message:
        "Toki could not start hand tracking. Restart Toki, and if it keeps happening the app may need reinstalling.",
    };
  }

  // Ranked above every gesture state: while the camera is being re-framed, none
  // of them can work, and every other message would be a distraction from the
  // one thing the user has to change.
  if (cameraReframingActive) {
    return {
      mode: "warning",
      label: cameraReframingLabel,
      message: cameraReframingMessage,
    };
  }

  if (cameraShutdown.phase === "holding") {
    const secondsLeft = getCameraShutdownSecondsLeft(cameraShutdown.holdMs);

    return {
      mode: "gesture",
      label: "Turning the camera off",
      message:
        secondsLeft > 0
          ? `Keep both fists closed for ${secondsLeft}s. Open either hand to cancel.`
          : "Release both hands to finish turning the camera off",
    };
  }

  if (pointerExplanation?.status === "processing") {
    return {
      mode: "thinking",
      label: "Explaining locked control",
      message: "Checking the same point against the current screen",
    };
  }

  if (pointerExplanation?.status === "grounded") {
    return {
      mode: pointerExplanation.riskWarning ? "warning" : "ready",
      label: pointerExplanation.label,
      message: pointerExplanation.riskWarning ?? pointerExplanation.message,
    };
  }

  if (pointerExplanation?.status === "clarify") {
    return {
      mode: "warning",
      label: pointerExplanation.label,
      message: pointerExplanation.message,
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

  if (pointerLock != null) {
    if (pointerLockFeedback.validation === "checking") {
      return {
        mode: "gesture",
        label: "Locking target",
        message: "Hold steady while Toki checks the current screen",
      };
    }

    if (wristRollLock.phase === "unlocking") {
      return {
        mode: "gesture",
        label: "Releasing target",
        message: "Keep your hand turned back to let this target go",
      };
    }

    if (pointerLockFeedback.validation === "limited") {
      return {
        mode: "warning",
        label: "Target locked",
        message: "Pinch and hold to speak. Screen access is needed to explain it.",
      };
    }

    return {
      mode: "ready",
      label: "Target locked",
      message: "Pinch and hold with your other hand to speak",
    };
  }

  if (wristRollLock.phase === "rolling") {
    return {
      mode: "gesture",
      label: "Locking target",
      message: "Keep your pointing hand turned for a moment",
    };
  }

  if (splitPhase === "joining") {
    return {
      mode: "gesture",
      label: "Joining Toki",
      message: "Hold both hands together briefly",
    };
  }

  if (splitPhase === "armed") {
    return {
      mode: "gesture",
      label: "Split ready",
      message: "Separate your hands to split Toki",
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
const POINTER_EXPLANATION_FOCUS_SIZE_PX = 160;

function isDisplayPointInsideBounds(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function createPointerExplanationDisplayRegion(
  point: { x: number; y: number },
  display: DisplayContext,
) {
  const size = Math.min(
    POINTER_EXPLANATION_FOCUS_SIZE_PX,
    display.width,
    display.height,
  );
  const x = Math.min(Math.max(point.x - size / 2, 0), display.width - size);
  const y = Math.min(Math.max(point.y - size / 2, 0), display.height - size);

  return { x, y, width: size, height: size };
}

function createProcessingPointerExplanation(
  id: string,
  transcript: string,
  lock: PointerLockSnapshot | null,
): PointerExplanationState {
  return {
    id,
    status: "processing",
    transcript,
    lock,
    label: "Locked control",
    message: "Checking the frozen point against the current screen.",
    confidence: null,
    supportingEvidence: [],
    riskWarning: null,
    reason: null,
    debug: null,
    updatedAt: new Date().toISOString(),
  };
}

function createPointerExplanationClarification({
  id,
  transcript,
  lock,
  label = "Please lock the control again",
  message,
  reason,
  debug = null,
}: {
  id: string;
  transcript: string;
  lock: PointerLockSnapshot | null;
  label?: string;
  message: string;
  reason: string;
  debug?: PointerExplanationState["debug"];
}): PointerExplanationState {
  return {
    id,
    status: "clarify",
    transcript,
    lock,
    label,
    message,
    confidence: null,
    supportingEvidence: [],
    riskWarning: null,
    reason,
    debug,
    updatedAt: new Date().toISOString(),
  };
}

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
      openPalmHoldMs: 650,
      cooldownMs: 700,
      maxHands: 2,
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
    pointerExplanation: null,
    pointerExplanationSpeechMuted: false,
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
    gesturePresentationDiagnostics: createGesturePresentationDiagnostic({
      livePointer: null,
      lockedPointer: null,
      pointerShadow: null,
      lockId: null,
      lockValidation: "idle",
      lockReason: null,
      updatedAt: "1970-01-01T00:00:00.000Z",
    }),
    gestureWindowValidationDiagnostics: null,
    gestureVoiceContext: null,
    gestureVoiceLifecycle: createIdleGestureVoiceLifecycleDiagnostic(),
  };
}

function createIdleGestureVoiceLifecycleDiagnostic(
  updatedAt = "1970-01-01T00:00:00.000Z",
): GestureVoiceLifecycleDiagnostic {
  const hold = createIdleVoiceHoldState();
  return {
    capturePhase: "idle",
    holdPhase: hold.phase,
    held: hold.held,
    releasePending: hold.releasePending,
    owner: null,
    nativeSessionId: null,
    lastCapture: null,
    lastTransition: "idle",
    updatedAt,
  };
}

function createDebugExportTransitionState(snapshot: DebugSnapshot) {
  const gesture = snapshot.gestureDiagnostics;
  const target = snapshot.guidanceResult?.step?.target ?? null;

  return {
    overlay: {
      state: snapshot.overlayState,
      refreshingCapture: snapshot.isRefreshingCapture,
      hasAcceptedGuidance: snapshot.hasAcceptedGuidance,
    },
    camera: {
      enabled: snapshot.gestureRuntime.camera.enabled,
      status: snapshot.gestureRuntime.camera.status,
      permission: snapshot.gestureRuntime.camera.permission,
      error: snapshot.gestureRuntime.camera.error ?? null,
      landmarkerStatus: gesture.handLandmarkerStatus,
      landmarkerError: gesture.handLandmarkerError,
    },
    gesture: {
      enabled: snapshot.gestureRuntime.enabled,
      handCount: gesture.hands.length,
      pointPose: `${gesture.pointPose.label}:${gesture.pointPose.phase}`,
      // The verdict alone cannot distinguish a classifier that is too strict
      // from landmarks that are genuinely unusable. These are the measurements
      // the verdict is computed from: if they hover near their thresholds and
      // dip, the pose logic needs hysteresis on the way out; if they collapse
      // to nonsense alongside an impossible wrist angle, the problem is
      // upstream in inference and no threshold change would help.
      // Which check rejected the frame. "missing_landmark" and "low_confidence"
      // mean the pose was never measured at all, which no threshold change can
      // fix; "not_pointing" means it was measured and judged.
      pointInactiveReason: gesture.pointPose.inactiveReason ?? null,
      pointMetrics:
        gesture.pointPose.indexExtensionRatio == null
          ? null
          : {
              extensionRatio: Number(
                gesture.pointPose.indexExtensionRatio.toFixed(2),
              ),
              pipAngle:
                gesture.pointPose.indexPipAngle == null
                  ? null
                  : Math.round(gesture.pointPose.indexPipAngle),
              dipAngle:
                gesture.pointPose.indexDipAngle == null
                  ? null
                  : Math.round(gesture.pointPose.indexDipAngle),
              folded: gesture.pointPose.foldedFingerCount,
              foldedNeeded: gesture.pointPose.requiredFoldedFingerCount,
              confidence: Number(gesture.pointPose.confidence.toFixed(2)),
            },
      pointerPhase: gesture.pointer?.phase ?? "inactive",
      // The transition history only records a row when this object changes, so
      // a track id that churns has to appear here or the moment the pointer
      // loses its hand is invisible in the trace. `matchedBy` distinguishes the
      // lenient single-hand reacquisition from the stricter general pass, which
      // is the boundary a returning hand is suspected of falling off.
      trackAssignments: gesture.handTrackAssignments
        .map(
          (assignment) =>
            `${assignment.trackId}:${assignment.matchedBy}` +
            (assignment.msSinceTrackLastSeen == null
              ? ""
              : `@${Math.round(assignment.msSinceTrackLastSeen)}ms`) +
            (assignment.matchDistance == null
              ? ""
              : `/${assignment.matchDistance.toFixed(2)}of${assignment.distanceLimit?.toFixed(2)}`),
        )
        .join(" "),
      pointerTrackId: gesture.pointer?.handTrackId ?? null,
      wristRollPose: gesture.wristRollPose.label,
      wristRollDegrees: gesture.wristRollLock.rotationDegrees ?? 0,
      lockPhase: gesture.wristRollLock.phase,
      ordinaryPinchPhase: gesture.ordinaryPinch.phase,
      ordinaryPinchEvent: gesture.ordinaryPinch.lastEvent?.id ?? null,
      controlPinchPhase: gesture.controlPinch.phase,
      controlPinchEvent: gesture.controlPinch.lastEvent?.id ?? null,
      cameraShutdownPhase: gesture.cameraShutdown.phase,
      cameraShutdownEvent: gesture.cameraShutdown.lastEvent?.id ?? null,
      smoothedGesture: `${gesture.smoothedGesture.label}:${gesture.smoothedGesture.phase}`,
    },
    pointerLock: {
      id: snapshot.gesturePointerLock?.id ?? null,
      validation: snapshot.gesturePointerLockFeedback.validation,
      reason: snapshot.gesturePointerLockFeedback.reason,
    },
    pointerLockWindow: {
      lockId: snapshot.gestureWindowValidationDiagnostics?.lockId ?? null,
      result: snapshot.gestureWindowValidationDiagnostics?.result ?? null,
      expectedFingerprint:
        snapshot.gestureWindowValidationDiagnostics?.expectedFingerprint ?? null,
      actualFingerprint:
        snapshot.gestureWindowValidationDiagnostics?.actualFingerprint ?? null,
      expectedWindow:
        snapshot.gestureWindowValidationDiagnostics?.expectedWindow ?? null,
      actualWindow:
        snapshot.gestureWindowValidationDiagnostics?.actualWindow ?? null,
      windowDelta:
        snapshot.gestureWindowValidationDiagnostics?.windowDelta ?? null,
      pointInside:
        snapshot.gestureWindowValidationDiagnostics?.pointInsideActualWindow ??
        null,
      reason: snapshot.gestureWindowValidationDiagnostics?.reason ?? null,
      error: snapshot.gestureWindowValidationDiagnostics?.error ?? null,
    },
    voice: {
      status: snapshot.voiceRuntime.status,
      source: snapshot.voiceRuntime.activationSource ?? null,
      transcriptUpdatedAt: snapshot.voiceRuntime.transcript?.updatedAt ?? null,
      error: snapshot.voiceRuntime.error ?? null,
      capturePhase: snapshot.gestureVoiceLifecycle.capturePhase,
      holdPhase: snapshot.gestureVoiceLifecycle.holdPhase,
      held: snapshot.gestureVoiceLifecycle.held,
      releasePending: snapshot.gestureVoiceLifecycle.releasePending,
      owner: snapshot.gestureVoiceLifecycle.owner,
      nativeSessionId: snapshot.gestureVoiceLifecycle.nativeSessionId,
      lastCapture: snapshot.gestureVoiceLifecycle.lastCapture,
      lastTransition: snapshot.gestureVoiceLifecycle.lastTransition,
    },
    capture: {
      capturedAt: snapshot.screenshotCapture?.capturedAt ?? null,
      appName: snapshot.captureMetadata?.activeWindow?.appName ?? null,
      error: snapshot.captureError,
    },
    guidance: {
      traceId: snapshot.guidanceTrace?.id ?? null,
      providerMode: snapshot.guidanceProviderMode,
      providerName: snapshot.guidanceProviderName,
      providerError: snapshot.guidanceProviderError,
      issueCount: snapshot.guidanceIssues.length,
      safetyAction: snapshot.safetyDecision?.action ?? null,
      targetId: target?.candidateId ?? null,
      targetLabel: target?.label ?? null,
      sessionStatus: snapshot.guidanceSession?.status ?? null,
    },
    pointerExplanation: {
      id: snapshot.pointerExplanation?.id ?? null,
      status: snapshot.pointerExplanation?.status ?? null,
      reason: snapshot.pointerExplanation?.reason ?? null,
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

const POINTER_EXPLANATION_SPEECH_MUTED_KEY =
  "toki.pointer-explanation-speech-muted";

function loadPointerExplanationSpeechMuted(): boolean {
  return getBrowserStorage()?.getItem(POINTER_EXPLANATION_SPEECH_MUTED_KEY) === "true";
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
    diagnostics.wristRollLock.rotationDegrees != null &&
    (diagnostics.wristRollLock.phase === "rolling" ||
      diagnostics.wristRollLock.phase === "locked")
  ) {
    return {
      stage: "tap_flexion",
      frameId: hand.frameId,
      capturedAt: hand.capturedAt,
      handedness: hand.handedness,
      confidence: hand.confidence,
      value: diagnostics.wristRollLock.rotationDegrees / 100,
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
  /**
   * The signed-in session, used to authorise guidance requests.
   *
   * Restored once at launch and held in a ref rather than in state: nothing on
   * screen changes when it refreshes, and re-rendering the overlay for it would
   * interrupt the pointer.
   */
  const authSessionRef = useRef<AuthSession | null>(null);
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [guidanceFixture, setGuidanceFixture] = useState<GuidanceFixture>("safe");
  const [captureMetadata, setCaptureMetadata] = useState<CaptureMetadata | null>(null);
  const [screenshotCapture, setScreenshotCapture] = useState<ScreenshotCapture | null>(null);
  const [guidanceProviderMode, setGuidanceProviderMode] =
    useState<GuidanceProviderMode>("unavailable");
  /** Set when the service says this needs a paid plan, so the offer is shown. */
  const [upgradeRequired, setUpgradeRequired] = useState(false);
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
  const [pointerExplanation, setPointerExplanation] =
    useState<PointerExplanationState | null>(null);
  const [pointerExplanationSpeechMuted, setPointerExplanationSpeechMuted] =
    useState(loadPointerExplanationSpeechMuted);
  const [diagnosticsSettings, setDiagnosticsSettings] =
    useState<DiagnosticsSettings>(loadDiagnosticsSettings);
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
  const [
    gestureWindowValidationDiagnostics,
    setGestureWindowValidationDiagnostics,
  ] = useState<GestureWindowValidationDiagnostic | null>(null);
  const [gestureVoiceContext, setGestureVoiceContext] =
    useState<GestureVoiceContext | null>(null);
  const [gestureVoiceLifecycle, setGestureVoiceLifecycle] =
    useState<GestureVoiceLifecycleDiagnostic>(() =>
      createIdleGestureVoiceLifecycleDiagnostic(new Date().toISOString()),
    );
  const voiceRuntimeRef = useRef<VoiceRuntimeState>(voiceRuntime);
  const voiceCaptureTimeoutRef = useRef<number | null>(null);
  const voiceCaptureStartupTimeoutRef = useRef<number | null>(null);
  const voiceCaptureAttemptRef = useRef(0);
  const voiceSubmitInFlightRef = useRef(false);
  const voiceCapturePhaseRef = useRef<VoiceCapturePhase>("idle");
  const voiceHoldStateRef = useRef(createIdleVoiceHoldState());
  const nativeVoiceSessionRef = useRef<string | null>(null);
  const gestureVoiceContextRef = useRef<GestureVoiceContext | null>(null);
  const gestureVoiceOwnerRef = useRef<GestureVoiceOwner | null>(null);
  const routedVoiceCommandRef = useRef<string | null>(null);
  const pointerExplanationInFlightRef = useRef(false);
  const lastSpokenPointerExplanationRef = useRef<string | null>(null);
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
  const handledGestureUnlockRequestRef = useRef<string | null>(null);
  const handledOrdinaryPinchEventRef = useRef<string | null>(null);
  const handledControlPinchEventRef = useRef<string | null>(null);
  const handledCameraShutdownEventRef = useRef<string | null>(null);
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
    ordinaryVoiceCanStart:
      gesturePointerLock == null &&
      voiceCapturePhaseRef.current === "idle" &&
      !pointerExplanationInFlightRef.current,
    controlVoiceCanStart:
      gesturePointerLock != null &&
      (gesturePointerLockFeedback.validation === "checking" ||
        gesturePointerLockFeedback.validation === "locked" ||
        gesturePointerLockFeedback.validation === "limited"),
  });
  // Restore the sign-in once, at launch. A guidance request made before this
  // finishes simply finds no token and reports that, rather than sending a
  // screenshot on a call that cannot succeed.
  useEffect(() => {
    const session = createAuthSession();
    authSessionRef.current = session;
    void session?.restore();
  }, []);

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
    alwaysOnGestureRuntime.diagnostics.wristRollLock.phase,
    alwaysOnGestureRuntime.diagnostics.wristRollLock.rotationDegrees,
    alwaysOnGestureRuntime.diagnostics.hand,
    alwaysOnGestureRuntime.diagnostics.pinch.normalizedDistance,
    alwaysOnGestureRuntime.diagnostics.pointPose.label,
    alwaysOnGestureRuntime.diagnostics.pointPose.pointerTip,
    gestureCalibration.stage,
    gestureCalibration.status,
  ]);
  const gesturePointerShadow = useMemo(() => {
    const pointer =
      gesturePointerLock?.pointer ?? alwaysOnGestureRuntime.pointer;

    if (
      pointer == null ||
      pointer.display.displayId !== gesturePointerDisplay.id
    ) {
      return null;
    }

    return getDetachedGesturePointerShadowPosition(
      pointer.display.x,
      pointer.display.y,
      viewport,
    );
  }, [
    alwaysOnGestureRuntime.pointer,
    gesturePointerDisplay.id,
    gesturePointerLock,
    viewport,
  ]);
  const gesturePuckPresentation = useMemo(
    () =>
      createGesturePuckPresentation({
        hasPointerLock: gesturePointerLock != null,
        lockValidation: gesturePointerLockFeedback.validation,
        splitVisual: alwaysOnGestureRuntime.splitVisual,
      }),
    [
      alwaysOnGestureRuntime.splitVisual,
      gesturePointerLock,
      gesturePointerLockFeedback.validation,
    ],
  );
  const gesturePresentationDiagnostics = useMemo(
    () =>
      createGesturePresentationDiagnostic({
        livePointer: alwaysOnGestureRuntime.pointer,
        lockedPointer: gesturePointerLock?.pointer ?? null,
        pointerShadow: gesturePointerShadow,
        lockId: gesturePointerLock?.id ?? null,
        lockValidation: gesturePointerLockFeedback.validation,
        lockReason: gesturePointerLockFeedback.reason,
        lockPresentation: gesturePuckPresentation.lockState,
        splitVisualRequested: alwaysOnGestureRuntime.splitVisual != null,
        splitVisualPresented: gesturePuckPresentation.splitVisual != null,
        updatedAt:
          alwaysOnGestureRuntime.diagnostics.updatedAt ??
          gesturePointerLockFeedback.updatedAt,
      }),
    [
      alwaysOnGestureRuntime.diagnostics.updatedAt,
      alwaysOnGestureRuntime.pointer,
      gesturePointerLock,
      gesturePointerLockFeedback,
      gesturePointerShadow,
      gesturePuckPresentation,
    ],
  );

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
  const baseGuidanceFailure =
    !isRefreshingCapture && !hasAcceptedGuidance
      ? captureError ?? guidanceProviderError
      : null;
  // A locked feature is not a broken one, and the message has to say which.
  // The overlay stays out of the way -- no buttons on a transparent window
  // floating over someone's work -- so it names where the control is instead.
  const visibleGuidanceFailure =
    upgradeRequired && baseGuidanceFailure != null
      ? `${baseGuidanceFailure} Open Toki Preferences to upgrade.`
      : baseGuidanceFailure;
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
    pointerExplanation,
    guidanceFailure: visibleGuidanceFailure,
    hasAcceptedGuidance,
    targetLabel: activeTarget.label,
    instruction:
      activeStep?.instruction ?? currentWorkflowStep?.instruction ?? activeTarget.instruction,
    safetyDecision,
    gestureClassification: gestureRuntime.currentGesture,
    wristRollLock: alwaysOnGestureRuntime.wristRollLock,
    cameraShutdown: alwaysOnGestureRuntime.cameraShutdown,
    cameraReframingActive: shouldWarnAboutCameraReframing({
      reframing: alwaysOnGestureRuntime.cameraReframing,
      gesturesEnabled: gestureRuntime.enabled,
      cameraStatus: alwaysOnGestureRuntime.camera.status,
    }),
    // Only worth saying while gestures are meant to be running; otherwise the
    // model has simply not been asked to load yet.
    handLandmarkerFailed:
      gestureRuntime.enabled &&
      alwaysOnGestureRuntime.diagnostics.handLandmarkerStatus === "error",
    splitPhase: alwaysOnGestureRuntime.diagnostics.split.phase,
    pointerLock: gesturePointerLock,
    pointerLockFeedback: gesturePointerLockFeedback,
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
      const nextState = reconcileCameraGestureRuntimeState(
        currentState,
        nextCamera,
      );
      const cameraIsCurrent =
        currentState.camera.enabled === nextCamera.enabled &&
        currentState.camera.permission === nextCamera.permission &&
        currentState.camera.status === nextCamera.status &&
        currentState.camera.devices === nextCamera.devices &&
        currentState.camera.error === nextCamera.error;

      if (
        cameraIsCurrent &&
        nextState.enabled === currentState.enabled &&
        isSameGestureClassification(
          nextState.currentGesture,
          currentState.currentGesture,
        )
      ) {
        return currentState;
      }

      return nextState;
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

    if (
      gestureAction?.type === "pause_assistant" &&
      alwaysOnGestureRuntime.diagnostics.hands.length === 1 &&
      gesturePointerLock == null &&
      alwaysOnGestureRuntime.ordinaryPinch.phase === "idle" &&
      alwaysOnGestureRuntime.controlPinch.phase === "idle" &&
      alwaysOnGestureRuntime.wristRollLock.phase !== "rolling" &&
      voiceCapturePhaseRef.current === "idle"
    ) {
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
    const event = alwaysOnGestureRuntime.ordinaryPinch.lastEvent;
    if (event == null || handledOrdinaryPinchEventRef.current === event.id) {
      return;
    }

    handledOrdinaryPinchEventRef.current = event.id;
    if (event.type === "press") {
      if (
        gesturePointerLock != null ||
        voiceCapturePhaseRef.current !== "idle"
      ) {
        return;
      }

      startGestureVoiceCapture("ordinary", event);
      return;
    }

    const owner = gestureVoiceOwnerRef.current;
    if (
      voiceRuntimeRef.current.activationSource !== "gesture" ||
      !isGestureVoiceTerminationForOwner(owner, "ordinary", event)
    ) {
      return;
    }

    publishGestureVoiceLifecycle(
      event.type === "tracking_lost"
        ? "ordinary_tracking_lost"
        : "ordinary_release",
    );
    void submitVoiceListening();
  }, [
    alwaysOnGestureRuntime.ordinaryPinch.lastEvent?.id,
    gesturePointerLock,
  ]);

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

    window.speechSynthesis?.cancel();
    setPointerExplanation(null);
    setGesturePointerLock(lock);
    setGesturePointerLockFeedback({
      validation: "checking",
      reason: null,
      updatedAt: new Date().toISOString(),
    });
    setGestureWindowValidationDiagnostics(null);
  }, [alwaysOnGestureRuntime.lockRequest, gesturePointerDisplay]);

  useEffect(() => {
    const request = alwaysOnGestureRuntime.unlockRequest;
    if (request == null || handledGestureUnlockRequestRef.current === request.id) {
      return;
    }

    handledGestureUnlockRequestRef.current = request.id;
    if (gesturePointerLock?.id !== request.lockId) {
      return;
    }

    window.speechSynthesis?.cancel();
    setPointerExplanation(null);
    setGesturePointerLock(null);
    setGesturePointerLockFeedback({
      validation: "idle",
      reason: null,
      updatedAt: request.unlockedAt,
    });
    setGestureWindowValidationDiagnostics(null);
  }, [alwaysOnGestureRuntime.unlockRequest, gesturePointerLock?.id]);

  useEffect(() => {
    if (gesturePointerLock == null) {
      return;
    }
    const lock: PointerLockSnapshot = gesturePointerLock;

    let cancelled = false;
    let timer: number | null = null;
    let expectedActiveWindowId = lock.evidence.activeWindowId ?? null;
    let expectedActiveWindow: ActiveWindowBounds | null = null;

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

    function keepLimited(reason: PointerLockInvalidationReason) {
      if (cancelled) {
        return;
      }

      setGesturePointerLockFeedback({
        validation: "limited",
        reason,
        updatedAt: new Date().toISOString(),
      });
    }

    async function validateCurrentScreenState() {
      const checkStartedAtMs = Date.now();
      try {
        const screenCaptureAvailable = await invoke<boolean>(
          "screen_capture_access_status",
        );

        if (cancelled) {
          return;
        }

        if (!screenCaptureAvailable) {
          setGestureWindowValidationDiagnostics(
            createGestureWindowValidationDiagnostic({
              lockId: lock.id,
              checkStartedAtMs,
              checkCompletedAtMs: Date.now(),
              screenCaptureAvailable,
              expectedFingerprint: expectedActiveWindowId,
              actualFingerprint: null,
              expectedWindow: expectedActiveWindow,
              actualWindow: null,
              logicalPoint: lock.pointer.display,
              reason: "screen_capture_unavailable",
            }),
          );
          keepLimited("screen_capture_unavailable");
          timer = window.setTimeout(validateCurrentScreenState, 2_000);
          return;
        }

        let activeWindow: ActiveWindowBounds;
        try {
          activeWindow = await invoke<ActiveWindowBounds>(
            "frontmost_window_bounds",
            {
              appName: null,
              pointX: lock.pointer.display.x,
              pointY: lock.pointer.display.y,
            },
          );
        } catch (error) {
          setGestureWindowValidationDiagnostics(
            createGestureWindowValidationDiagnostic({
              lockId: lock.id,
              checkStartedAtMs,
              checkCompletedAtMs: Date.now(),
              screenCaptureAvailable,
              expectedFingerprint: expectedActiveWindowId,
              actualFingerprint: null,
              expectedWindow: expectedActiveWindow,
              actualWindow: null,
              logicalPoint: lock.pointer.display,
              reason: "screen_state_unavailable",
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          keepLimited("screen_state_unavailable");
          timer = window.setTimeout(validateCurrentScreenState, 2_000);
          return;
        }

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
          activeWindow,
        });
        setGestureWindowValidationDiagnostics(
          createGestureWindowValidationDiagnostic({
            lockId: lock.id,
            checkStartedAtMs,
            checkCompletedAtMs: Date.now(),
            screenCaptureAvailable,
            expectedFingerprint: expectedActiveWindowId,
            actualFingerprint: activeWindowId,
            expectedWindow: expectedActiveWindow,
            actualWindow: activeWindow,
            logicalPoint: lock.pointer.display,
            reason: invalidationReason,
          }),
        );

        if (invalidationReason != null) {
          invalidate(invalidationReason);
          return;
        }

        if (expectedActiveWindowId == null) {
          expectedActiveWindowId = activeWindowId;
          expectedActiveWindow = { ...activeWindow };
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
        }

        setGesturePointerLockFeedback({
          validation: "locked",
          reason: null,
          updatedAt: new Date().toISOString(),
        });
        timer = window.setTimeout(validateCurrentScreenState, 2_000);
      } catch (error) {
        setGestureWindowValidationDiagnostics(
          createGestureWindowValidationDiagnostic({
            lockId: lock.id,
            checkStartedAtMs,
            checkCompletedAtMs: Date.now(),
            screenCaptureAvailable: null,
            expectedFingerprint: expectedActiveWindowId,
            actualFingerprint: null,
            expectedWindow: expectedActiveWindow,
            actualWindow: null,
            logicalPoint: lock.pointer.display,
            reason: "screen_state_unavailable",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        keepLimited("screen_state_unavailable");
        timer = window.setTimeout(validateCurrentScreenState, 2_000);
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
    const event = alwaysOnGestureRuntime.controlPinch.lastEvent;
    if (event == null || handledControlPinchEventRef.current === event.id) {
      return;
    }

    if (event.type === "press") {
      const lock = gesturePointerLock;
      if (lock != null && gesturePointerLockFeedback.validation === "checking") {
        return;
      }

      if (!canStartGestureVoice(
        lock,
        gesturePointerLockFeedback.validation,
        voiceCapturePhaseRef.current,
      )) {
        handledControlPinchEventRef.current = event.id;
        return;
      }

      handledControlPinchEventRef.current = event.id;
      const context = createGestureVoiceContext({
        sessionId: `gesture-voice-${crypto.randomUUID()}`,
        controlHandTrackId: event.controlHandTrackId,
        startedAt: event.firedAt,
        lock,
      });
      startGestureVoiceCapture("control", event, context);
      return;
    }

    handledControlPinchEventRef.current = event.id;
    const activeContext = gestureVoiceContextRef.current;
    const owner = gestureVoiceOwnerRef.current;
    if (
      activeContext == null ||
      activeContext.controlHandTrackId !== event.controlHandTrackId ||
      !isGestureVoiceTerminationForOwner(owner, "control", event)
    ) {
      return;
    }

    publishGestureVoiceLifecycle(
      event.type === "tracking_lost"
        ? "control_tracking_lost"
        : "control_release",
    );
    void submitVoiceListening();
  }, [
    alwaysOnGestureRuntime.controlPinch.lastEvent?.id,
    gesturePointerLock,
    gesturePointerLockFeedback.validation,
  ]);

  useEffect(() => {
    const event = alwaysOnGestureRuntime.cameraShutdown.lastEvent;
    if (
      event == null ||
      handledCameraShutdownEventRef.current === event.id ||
      event.type !== "disable_camera_gestures"
    ) {
      return;
    }

    handledCameraShutdownEventRef.current = event.id;
    setCameraGesturesEnabled(false);
  }, [alwaysOnGestureRuntime.cameraShutdown.lastEvent?.id]);

  useEffect(() => {
    if (
      gestureVoiceContextRef.current == null ||
      gesturePointerLockFeedback.validation !== "invalidated"
    ) {
      return;
    }

    stopVoiceListening();
  }, [gesturePointerLockFeedback.validation]);

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

  useEffect(() => {
    if (!isTransientVoiceTopStatus(voiceRuntime.status)) {
      return;
    }

    const expectedStatus = voiceRuntime.status;
    const timeout = window.setTimeout(() => {
      if (voiceCapturePhaseRef.current !== "idle") {
        return;
      }

      const currentVoiceRuntime = voiceRuntimeRef.current;
      const settledVoiceRuntime = settleTransientVoiceTopStatus(
        currentVoiceRuntime,
        expectedStatus,
      );
      if (settledVoiceRuntime === currentVoiceRuntime) {
        return;
      }

      voiceRuntimeRef.current = settledVoiceRuntime;
      setVoiceRuntime(settledVoiceRuntime);
    }, TOP_UTILITY_RESULT_NOTICE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    voiceRuntime.error,
    voiceRuntime.pendingCommand?.createdAt,
    voiceRuntime.status,
  ]);

  const overlaySnapshot = useMemo<OverlaySnapshot>(
    () => ({
      overlayState,
      hasAcceptedGuidance,
      isRefreshingCapture,
      gestureRuntime,
      voiceRuntime,
      topStatus,
      pointerExplanation,
      pointerExplanationSpeechMuted,
    }),
    [
      overlayState,
      hasAcceptedGuidance,
      isRefreshingCapture,
      gestureRuntime,
      voiceRuntime,
      topStatus,
      pointerExplanation,
      pointerExplanationSpeechMuted,
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
      gesturePresentationDiagnostics,
      gestureWindowValidationDiagnostics,
      gestureVoiceContext,
      gestureVoiceLifecycle,
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
      gesturePresentationDiagnostics,
      gestureWindowValidationDiagnostics,
      gestureVoiceContext,
      gestureVoiceLifecycle,
    ],
  );
  const debugExportTransitionState = useMemo(
    () => createDebugExportTransitionState(debugSnapshot),
    [debugSnapshot],
  );
  useTokiDebugExport({
    snapshot: debugSnapshot,
    transitionState: debugExportTransitionState,
    screenshot: screenshotCapture,
    diagnosticsEnabled: diagnosticsSettings.diagnosticsEnabled,
    screenCapturesEnabled: diagnosticsSettings.screenCapturesEnabled,
  });

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
      let hasScreenCaptureAccess = await invoke<boolean>(
        "screen_capture_access_status",
      );
      if (!hasScreenCaptureAccess) {
        hasScreenCaptureAccess = await invoke<boolean>(
          "request_screen_capture_access",
        );
      }
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

  async function explainFrozenGesturePointer(
    command: VoiceCommandRequest,
    intent: PointerExplanationIntent,
  ) {
    const explanationId = `pointer-explanation-${crypto.randomUUID()}`;
    const lock = command.gestureContext?.lock ?? null;

    if (pointerExplanationInFlightRef.current) {
      setPointerExplanation(
        createPointerExplanationClarification({
          id: explanationId,
          transcript: command.text,
          lock,
          label: "Still reading the previous lock",
          message: "Wait for the current explanation to finish, then lock the next control.",
          reason: "explanation_in_flight",
        }),
      );
      return;
    }

    if (lock == null) {
      setPointerExplanation(
        createPointerExplanationClarification({
          id: explanationId,
          transcript: command.text,
          lock: null,
          message:
            "Point at the control, turn that wrist and hold briefly to lock it, then ask again.",
          reason: "missing_pointer_lock",
        }),
      );
      return;
    }

    pointerExplanationInFlightRef.current = true;
    window.speechSynthesis?.cancel();
    setPointerExplanation(
      createProcessingPointerExplanation(explanationId, command.text, lock),
    );
    setCaptureError(null);
    setOverlayState("thinking");

    const refuse = (
      message: string,
      reason: string,
      label?: string,
      debug?: PointerExplanationState["debug"],
    ) => {
      setPointerExplanation(
        createPointerExplanationClarification({
          id: explanationId,
          transcript: command.text,
          lock,
          label,
          message,
          reason,
          debug,
        }),
      );
    };

    try {
      const snapshot = await invokeCaptureCommand<ActiveWindowCaptureSnapshot>(
        "capture_active_window_snapshot",
        {
          appName: null,
          pointX: lock.pointer.display.x,
          pointY: lock.pointer.display.y,
        },
      );
      const activeWindowId = createScreenStateFingerprint(snapshot.window);
      const invalidationReason = getPointerLockInvalidationReason({
        lock,
        display: gesturePointerDisplay,
        screenCaptureAvailable: true,
        activeWindowId,
        activeWindow: snapshot.window,
      });

      setCaptureMetadata(snapshot.metadata);
      setScreenshotCapture(snapshot.screenshot);

      if (invalidationReason != null) {
        refuse(
          "The active screen changed after you locked the point. Lock the control again on the current screen.",
          invalidationReason,
          "Locked screen changed",
        );
        return;
      }

      const displayPoint = {
        x: lock.pointer.display.x,
        y: lock.pointer.display.y,
      };
      if (!isDisplayPointInsideBounds(displayPoint, snapshot.window)) {
        refuse(
          "The locked point is no longer inside the active app window. Lock the intended control again.",
          "point_outside_active_window",
        );
        return;
      }

      const screenshotPayload = await getProviderScreenshotPayload(
        snapshot.screenshot,
        snapshot.window,
      );
      if (screenshotPayload.crop == null) {
        refuse(
          "I couldn't isolate the active app safely, so I refused to explain a desktop-wide point.",
          "active_window_crop_unavailable",
        );
        return;
      }

      const rawCandidateContext = await collectScreenCandidatesForGuidance(
        snapshot.screenshot,
        snapshot.metadata.display,
        command.text,
        snapshot.window.appName ?? snapshot.screenshot.activeWindow?.appName,
      );
      const candidateContext = filterCandidateContextForPayload(
        rawCandidateContext,
        screenshotPayload,
        snapshot.screenshot,
      );
      const evidenceDecision = getPointerEvidenceDecision(
        candidateContext.candidates ?? [],
        displayPoint,
      );

      if (evidenceDecision.status === "ambiguous") {
        refuse(
          "More than one current control is equally close to the locked point. Lock one control more precisely.",
          "ambiguous_pointer_region",
          "Two controls overlap the lock",
        );
        return;
      }

      const uniqueCandidate =
        evidenceDecision.status === "unique" ? evidenceDecision.candidate : null;
      if (
        uniqueCandidate != null &&
        hasSpecificPointerEvidenceLabel(uniqueCandidate.label) &&
        explicitObjectConflictsWithLabel(
          intent.explicitObject,
          uniqueCandidate.label,
        )
      ) {
        refuse(
          "The control you named does not match the control at the locked point. Lock the named control and try again.",
          "spoken_object_conflict",
          "Speech and pointer disagree",
        );
        return;
      }

      const coordinateContext = {
        display: snapshot.metadata.display,
        screenshot: {
          width: snapshot.screenshot.imageWidth,
          height: snapshot.screenshot.imageHeight,
        },
        providerImage: {
          width: screenshotPayload.imageWidth,
          height: screenshotPayload.imageHeight,
        },
        crop: screenshotPayload.crop,
      };
      const displayFocusRegion = createPointerExplanationDisplayRegion(
        displayPoint,
        snapshot.metadata.display,
      );
      const focusRegion = mapDisplayRectToProviderImage(
        displayFocusRegion,
        coordinateContext,
      );
      const pointRegion = mapDisplayRectToProviderImage(
        {
          x: displayPoint.x - 1,
          y: displayPoint.y - 1,
          width: 2,
          height: 2,
        },
        coordinateContext,
      );

      if (focusRegion == null || pointRegion == null) {
        refuse(
          "The frozen point is outside the current active-app image. Lock it again on the visible app.",
          "point_mapping_unavailable",
        );
        return;
      }

      const structuredEvidence: PointerExplanationImageEvidence | null =
        uniqueCandidate == null ||
        !hasSpecificPointerEvidenceLabel(uniqueCandidate.label)
          ? null
          : (() => {
              const imageRect = mapDisplayRectToProviderImage(
                uniqueCandidate,
                coordinateContext,
              );
              return imageRect == null
                ? null
                : {
                    candidateId: uniqueCandidate.id,
                    label: uniqueCandidate.label,
                    role: uniqueCandidate.role,
                    source: uniqueCandidate.source ?? "unknown",
                    imageRect,
                  };
            })();
      const providerRequest = {
        transcript: command.text,
        intent,
        lock,
        appName: snapshot.window.appName ?? null,
        image: {
          imageBase64: screenshotPayload.imageBase64,
          format: screenshotPayload.format,
          width: screenshotPayload.imageWidth,
          height: screenshotPayload.imageHeight,
        },
        lockedPoint: {
          x: Math.round(pointRegion.x + pointRegion.width / 2),
          y: Math.round(pointRegion.y + pointRegion.height / 2),
        },
        focusRegion: {
          x: Math.round(focusRegion.x),
          y: Math.round(focusRegion.y),
          width: Math.round(focusRegion.width),
          height: Math.round(focusRegion.height),
        },
        structuredEvidence,
      };
      const configuredCodexTimeoutMs = Number(
        import.meta.env.VITE_TOKI_CODEX_TIMEOUT_MS,
      );
      const result = await requestCodexPointerExplanation(providerRequest, {
        model: import.meta.env.VITE_TOKI_CODEX_MODEL,
        timeoutMs:
          Number.isFinite(configuredCodexTimeoutMs) &&
          configuredCodexTimeoutMs > 0
            ? configuredCodexTimeoutMs
            : undefined,
      });

      if (result.status === "clarify") {
        refuse(result.message, result.reason, undefined, result.debug);
        return;
      }

      setPointerExplanation({
        id: explanationId,
        status: "grounded",
        transcript: command.text,
        lock,
        label: result.label,
        message: result.explanation,
        confidence: result.confidence,
        supportingEvidence: result.supportingEvidence,
        riskWarning: result.riskWarning,
        reason: null,
        debug: result.debug,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      refuse(
        `I couldn't recheck the locked point on the current screen: ${formatErrorMessage(
          error,
        )}`,
        "current_screen_unavailable",
      );
    } finally {
      pointerExplanationInFlightRef.current = false;
      setOverlayState((current) =>
        current === "thinking" ? "idle" : current,
      );
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
          {
            appName: preferredAppName,
            pointX: null,
            pointY: null,
          },
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
        const apiClient = createTokiApiClient({
          endpoint,
          session: authSessionRef.current,
        });
        const provider = createGuidanceProviderAdapter(providerMode, {
          endpoint,
          // Present only in a build that has both a service and a sign-in.
          // Without it the older endpoint shape still works for local smoke
          // testing, which is what keeps development possible offline.
          hostedVision: apiClient.configured
            ? {
                send: async (body) => {
                  const reply = await apiClient.vision(body);
                  setUpgradeRequired(reply.kind === "upgrade_required");
                  return reply;
                },
              }
            : undefined,
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

  function isSameGestureVoiceOwner(
    left: GestureVoiceOwner | null,
    right: GestureVoiceOwner | null,
  ) {
    return (
      left != null &&
      right != null &&
      left?.detector === right?.detector &&
      left?.controlHandTrackId === right?.controlHandTrackId &&
      left?.pressEventId === right?.pressEventId
    );
  }

  function publishGestureVoiceLifecycle(
    lastTransition: string,
    options: {
      lastCapture?: GestureVoiceCaptureSummary | null;
    } = {},
  ) {
    const hold = voiceHoldStateRef.current;
    const owner = gestureVoiceOwnerRef.current;
    setGestureVoiceLifecycle((current) => ({
      capturePhase: voiceCapturePhaseRef.current,
      holdPhase: hold.phase,
      held: hold.held,
      releasePending: hold.releasePending,
      owner: owner == null ? null : { ...owner },
      nativeSessionId: nativeVoiceSessionRef.current,
      lastCapture:
        options.lastCapture === undefined
          ? current.lastCapture
          : options.lastCapture,
      lastTransition,
      updatedAt: new Date().toISOString(),
    }));
  }

  function startGestureVoiceCapture(
    detector: GestureVoiceDetector,
    pressEvent: ControlPinchEvent,
    context?: GestureVoiceContext,
  ) {
    if (pressEvent.type !== "press") {
      return;
    }

    const owner = createGestureVoiceOwner(detector, pressEvent);
    gestureVoiceOwnerRef.current = owner;
    gestureVoiceContextRef.current = context ?? null;
    setGestureVoiceContext(context ?? null);
    publishGestureVoiceLifecycle(`${detector}_press`);

    void startVoiceListening("gesture", context).then((started) => {
      if (
        started ||
        !isSameGestureVoiceOwner(gestureVoiceOwnerRef.current, owner)
      ) {
        return;
      }

      clearActiveGestureVoiceContext();
      publishGestureVoiceLifecycle(`${detector}_start_rejected`);
    });
  }

  function clearActiveGestureVoiceContext() {
    gestureVoiceOwnerRef.current = null;
    gestureVoiceContextRef.current = null;
    setGestureVoiceContext(null);
  }

  function setCameraGesturesEnabled(enabled: boolean) {
    if (!enabled) {
      setGestureVisualAnchor(null);
      if (
        gestureVoiceOwnerRef.current != null ||
        gestureVoiceContextRef.current != null
      ) {
        cancelVoiceRuntime();
      }
    } else {
      setGestureDeviceRefreshToken((currentToken) => currentToken + 1);
    }

    setGestureRuntime((currentState) =>
      setCameraGestureRuntimeEnabled(currentState, enabled),
    );
  }

  function cancelVoiceRuntime() {
    clearVoiceCaptureTimeout();
    clearVoiceCaptureStartupTimeout();
    voiceCaptureAttemptRef.current += 1;
    voiceSubmitInFlightRef.current = false;
    voiceCapturePhaseRef.current = "idle";
    voiceHoldStateRef.current = transitionVoiceHold(
      voiceHoldStateRef.current,
      "cancel",
    ).state;
    routedVoiceCommandRef.current = null;
    nativeVoiceSessionRef.current = null;
    clearActiveGestureVoiceContext();
    void resetNativeVoiceCapture().catch(() => undefined);
    const nextVoiceRuntime: VoiceRuntimeState = {
      ...createDefaultVoiceRuntimeState(),
      status: "cancelled",
    };
    voiceRuntimeRef.current = nextVoiceRuntime;
    setVoiceRuntime(nextVoiceRuntime);
    publishGestureVoiceLifecycle("cancelled");
  }

  function clearVoiceCaptureTimeout() {
    if (voiceCaptureTimeoutRef.current == null) {
      return;
    }

    window.clearTimeout(voiceCaptureTimeoutRef.current);
    voiceCaptureTimeoutRef.current = null;
  }

  function clearVoiceCaptureStartupTimeout() {
    if (voiceCaptureStartupTimeoutRef.current == null) {
      return;
    }

    window.clearTimeout(voiceCaptureStartupTimeoutRef.current);
    voiceCaptureStartupTimeoutRef.current = null;
  }

  function scheduleVoiceCaptureStartupTimeout(
    attemptId: number,
    source: VoiceActivationSource,
  ) {
    clearVoiceCaptureStartupTimeout();
    voiceCaptureStartupTimeoutRef.current = window.setTimeout(() => {
      voiceCaptureStartupTimeoutRef.current = null;
      if (
        voiceCaptureAttemptRef.current !== attemptId ||
        voiceCapturePhaseRef.current !== "starting"
      ) {
        return;
      }

      cancelVoiceRuntime();
      const failedVoiceRuntime: VoiceRuntimeState = {
        ...createDefaultVoiceRuntimeState(),
        permission: "error",
        status: "error",
        activationSource: source,
        error: "Microphone capture did not start in time.",
      };
      voiceRuntimeRef.current = failedVoiceRuntime;
      setVoiceRuntime(failedVoiceRuntime);
      setOverlayState((currentState) =>
        currentState === "listening" ? "idle" : currentState,
      );
      publishGestureVoiceLifecycle("startup_timeout");
    }, voiceCaptureStartupTimeoutMs);
  }

  function scheduleVoiceCaptureTimeout() {
    clearVoiceCaptureTimeout();

    voiceCaptureTimeoutRef.current = window.setTimeout(() => {
      voiceCaptureTimeoutRef.current = null;
      if (!voiceRuntimeRef.current.enabled || voiceSubmitInFlightRef.current) {
        return;
      }

      void submitVoiceListening();
    }, 10_000);
  }

  async function startVoiceListening(
    source: VoiceActivationSource,
    context?: GestureVoiceContext,
  ): Promise<boolean> {
    if (pointerExplanationInFlightRef.current) {
      if (source === "gesture") {
        clearActiveGestureVoiceContext();
        publishGestureVoiceLifecycle("start_rejected_explanation");
      }
      return false;
    }

    if (voiceCapturePhaseRef.current !== "idle") {
      if (source === "gesture") {
        publishGestureVoiceLifecycle("start_rejected_busy");
      }
      return false;
    }

    const attemptId = voiceCaptureAttemptRef.current + 1;
    voiceCaptureAttemptRef.current = attemptId;
    clearVoiceCaptureTimeout();
    clearVoiceCaptureStartupTimeout();
    window.speechSynthesis?.cancel();
    setPointerExplanation(null);
    voiceSubmitInFlightRef.current = false;
    voiceCapturePhaseRef.current = "starting";
    const heldActivation = isHeldVoiceActivationSource(source);
    if (source === "gesture") {
      gestureVoiceContextRef.current = context ?? null;
      setGestureVoiceContext(context ?? null);
    }
    if (heldActivation) {
      const holdTransition = transitionVoiceHold(
        voiceHoldStateRef.current,
        "press",
      );
      if (holdTransition.effect !== "start_capture") {
        voiceCapturePhaseRef.current = "idle";
        if (source === "gesture") {
          clearActiveGestureVoiceContext();
          publishGestureVoiceLifecycle("start_rejected_hold_state");
        }
        return false;
      }
      voiceHoldStateRef.current = holdTransition.state;
    }
    routedVoiceCommandRef.current = null;
    const requestingVoiceRuntime: VoiceRuntimeState = {
      enabled: true,
      permission: "unknown",
      status: "requesting_microphone",
      activationSource: source,
    };
    voiceRuntimeRef.current = requestingVoiceRuntime;
    setVoiceRuntime(requestingVoiceRuntime);
    setOverlayState("listening");
    publishGestureVoiceLifecycle("capture_starting");
    scheduleVoiceCaptureStartupTimeout(attemptId, source);

    try {
      await resetNativeVoiceCapture().catch(() => undefined);
      if (voiceCaptureAttemptRef.current !== attemptId) {
        return false;
      }

      if (heldActivation && voiceHoldStateRef.current.phase !== "starting") {
        clearVoiceCaptureStartupTimeout();
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
        if (source === "gesture") {
          clearActiveGestureVoiceContext();
        }
        publishGestureVoiceLifecycle("capture_aborted");
        return false;
      }

      const nativeCapture = await startNativeVoiceCapture();
      if (voiceCaptureAttemptRef.current !== attemptId) {
        await resetNativeVoiceCapture().catch(() => undefined);
        return false;
      }

      clearVoiceCaptureStartupTimeout();
      nativeVoiceSessionRef.current = nativeCapture.sessionId;
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

      if (heldActivation) {
        const holdTransition = transitionVoiceHold(
          voiceHoldStateRef.current,
          "capture_started",
        );
        voiceHoldStateRef.current = holdTransition.state;
        publishGestureVoiceLifecycle("capture_started");
        if (holdTransition.effect === "submit_capture") {
          await submitActiveVoiceCapture();
        }
      } else {
        publishGestureVoiceLifecycle("capture_started");
        scheduleVoiceCaptureTimeout();
      }
      return true;
    } catch (error) {
      clearVoiceCaptureTimeout();
      clearVoiceCaptureStartupTimeout();
      await resetNativeVoiceCapture().catch(() => undefined);
      if (voiceCaptureAttemptRef.current !== attemptId) {
        return false;
      }

      nativeVoiceSessionRef.current = null;
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
      if (source === "gesture") {
        clearActiveGestureVoiceContext();
      }
      publishGestureVoiceLifecycle("capture_failed");
      return false;
    }
  }

  function stopVoiceListening() {
    cancelVoiceRuntime();
    setOverlayState((currentState) =>
      currentState === "listening" ? "idle" : currentState,
    );
  }

  async function submitVoiceListening() {
    if (voiceHoldStateRef.current.phase !== "idle") {
      const holdTransition = transitionVoiceHold(
        voiceHoldStateRef.current,
        "release",
      );
      voiceHoldStateRef.current = holdTransition.state;
      publishGestureVoiceLifecycle(
        holdTransition.state.releasePending
          ? "release_pending"
          : holdTransition.effect === "submit_capture"
            ? "release_submitting"
            : "release_ignored",
      );
      if (holdTransition.effect !== "submit_capture") {
        return;
      }
    }

    await submitActiveVoiceCapture();
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
    const activeGestureContext =
      activeVoiceRuntime.activationSource === "gesture"
        ? gestureVoiceContextRef.current ?? undefined
        : undefined;
    clearVoiceCaptureTimeout();
    clearVoiceCaptureStartupTimeout();
    voiceSubmitInFlightRef.current = true;
    voiceCapturePhaseRef.current = "submitting";
    publishGestureVoiceLifecycle("submission_started");

    const transcribingVoiceRuntime: VoiceRuntimeState = {
      ...activeVoiceRuntime,
      status: "transcribing",
    };
    voiceRuntimeRef.current = transcribingVoiceRuntime;
    setVoiceRuntime(transcribingVoiceRuntime);

    try {
      const captureStatus = await getNativeVoiceCaptureStatus().catch(() => null);
      const expectedSessionId = nativeVoiceSessionRef.current;

      if (
        captureStatus?.status !== "capturing" ||
        (expectedSessionId != null &&
          captureStatus.sessionId !== expectedSessionId)
      ) {
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
      if (
        expectedSessionId != null &&
        capture.sessionId !== expectedSessionId
      ) {
        throw new Error("Native microphone session changed before release.");
      }
      nativeVoiceSessionRef.current = null;
      publishGestureVoiceLifecycle("capture_stopped", {
        lastCapture: {
          sessionId: capture.sessionId,
          durationMs: capture.durationMs,
          byteLength: capture.byteLength,
        },
      });
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
          gestureContext: activeGestureContext,
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
      clearVoiceCaptureStartupTimeout();
      await resetNativeVoiceCapture().catch(() => undefined);
      voiceSubmitInFlightRef.current = false;
      nativeVoiceSessionRef.current = null;
      voiceCapturePhaseRef.current = "idle";
      voiceHoldStateRef.current = transitionVoiceHold(
        voiceHoldStateRef.current,
        "submission_finished",
      ).state;
      clearActiveGestureVoiceContext();
      publishGestureVoiceLifecycle("submission_finished");
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

      if (event.payload.type === "auth-changed") {
        // Drop the in-memory copy so the next guidance request reads the store
        // again. A sign-out has to be noticed here: the token this window holds
        // stays valid until it expires, so without this the overlay would keep
        // making paid requests as a user who has signed out.
        authSessionRef.current?.invalidate();
        setUpgradeRequired(false);
        return;
      }

      if (event.payload.type === "set-camera-gestures-enabled") {
        setCameraGesturesEnabled(event.payload.enabled);
        return;
      }

      if (event.payload.type === "refresh-camera-devices") {
        setGestureDeviceRefreshToken((currentToken) => currentToken + 1);
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

      if (event.payload.type === "set-pointer-explanation-speech-muted") {
        setPointerExplanationSpeechMuted(event.payload.muted);
        getBrowserStorage()?.setItem(
          POINTER_EXPLANATION_SPEECH_MUTED_KEY,
          String(event.payload.muted),
        );
        if (event.payload.muted) {
          window.speechSynthesis?.cancel();
        }
        return;
      }

      if (event.payload.type === "set-diagnostics-settings") {
        const previous = loadDiagnosticsSettings();
        const next = saveDiagnosticsSettings(
          normalizeDiagnosticsSettings(event.payload.settings),
        );
        setDiagnosticsSettings(next);
        // Withdrawing consent has to take the collected files with it,
        // otherwise "off" only means "stops growing".
        if (shouldClearDiagnosticsOnChange(previous, next)) {
          void clearTokiDebugExport().catch(() => undefined);
        }
        return;
      }

      if (event.payload.type === "clear-diagnostics") {
        void clearTokiDebugExport().catch(() => undefined);
        return;
      }

      if (event.payload.type === "start-voice-listening") {
        await startVoiceListening(
          event.payload.source,
          event.payload.gestureContext,
        );
        return;
      }

      if (event.payload.type === "stop-voice-listening") {
        stopVoiceListening();
        return;
      }

      if (event.payload.type === "submit-voice-listening") {
        await submitVoiceListening();
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
    const cameraControlIntent = classifyCameraGestureVoiceCommand(command.text);
    const pointerIntent = classifyPointerExplanationCommand(command.text);
    const shouldExplainPointer = shouldRoutePointerExplanation(
      pointerIntent,
      command.gestureContext != null,
    );
    const routingPromise = cameraControlIntent
      ? Promise.resolve().then(() => {
          setCameraGesturesEnabled(true);
          setOverlayState("idle");
        })
      : shouldExplainPointer && pointerIntent != null
        ? explainFrozenGesturePointer(command, pointerIntent)
        : refreshCaptureMetadata(command.text, "codex-subscription", {
            traceId: command.traceId,
            source: "voice",
            transcript: command.text,
            transcriptAt:
              voiceRuntime.transcript?.updatedAt ?? command.createdAt,
          });

    void routingPromise.finally(() => {
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
    gesturePointerDisplay,
  ]);

  useEffect(() => {
    if (pointerExplanation?.status !== "grounded") {
      return;
    }

    if (pointerExplanationSpeechMuted) {
      lastSpokenPointerExplanationRef.current = pointerExplanation.id;
      window.speechSynthesis?.cancel();
      return;
    }

    if (
      voiceCapturePhaseRef.current !== "idle" ||
      voiceRuntime.status === "requesting_microphone" ||
      voiceRuntime.status === "listening" ||
      voiceRuntime.status === "transcribing" ||
      lastSpokenPointerExplanationRef.current === pointerExplanation.id
    ) {
      return;
    }

    if (
      window.speechSynthesis == null ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      return;
    }

    const speech = new SpeechSynthesisUtterance(
      [
        pointerExplanation.label,
        pointerExplanation.message,
        pointerExplanation.riskWarning,
      ]
        .filter(Boolean)
        .join(". "),
    );
    speech.rate = 1;
    lastSpokenPointerExplanationRef.current = pointerExplanation.id;
    window.speechSynthesis?.cancel();
    window.speechSynthesis?.speak(speech);
  }, [
    pointerExplanation,
    pointerExplanationSpeechMuted,
    voiceRuntime.status,
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
        <TokiPointerExplanationCard
          explanation={pointerExplanation}
          viewport={viewport}
        />
        <BlobPuck
          creatureState={tokiCreatureState}
          motion={puckMotion}
          pointerShadow={gesturePointerShadow ?? pointerShadow}
          pointerSource={
            gesturePointerShadow == null &&
            gesturePuckPresentation.splitVisual == null
              ? "cursor"
              : "gesture"
          }
          splitVisual={gesturePuckPresentation.splitVisual}
          lockState={gesturePuckPresentation.lockState}
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
  const [gestureRuntime, setGestureRuntime] = useState<GestureRuntimeState>(() =>
    createDefaultGestureRuntimeState(),
  );
  const [topStatus, setTopStatus] = useState<TokiTopStatusModel | null>(null);
  const [pointerExplanationSpeechMuted, setPointerExplanationSpeechMuted] =
    useState(false);
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
      setGestureRuntime(event.payload.gestureRuntime);
      setPointerExplanationSpeechMuted(
        event.payload.pointerExplanationSpeechMuted,
      );
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
          pointerExplanationSpeechMuted={pointerExplanationSpeechMuted}
          cameraGesturesEnabled={gestureRuntime.camera.enabled}
          cameraStatus={gestureRuntime.camera.status}
          cameraPermission={gestureRuntime.camera.permission}
          cameraError={gestureRuntime.camera.error ?? null}
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
          onCameraGesturesToggle={() => {
            emitTo("overlay", "toki://overlay-command", {
              type: "set-camera-gestures-enabled",
              enabled: !gestureRuntime.camera.enabled,
            } satisfies OverlayCommand).catch(() => undefined);
          }}
          onPointerExplanationSpeechMuteToggle={() => {
            emitTo("overlay", "toki://overlay-command", {
              type: "set-pointer-explanation-speech-muted",
              muted: !pointerExplanationSpeechMuted,
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
  const [debugExportStatus, setDebugExportStatus] =
    useState<TokiDebugExportStatus | null>(null);
  const [debugExportError, setDebugExportError] = useState<string | null>(null);
  const [diagnosticsSettings, setDiagnosticsSettings] =
    useState<DiagnosticsSettings>(loadDiagnosticsSettings);
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
  const ordinaryPinch = gestureDiagnostics.ordinaryPinch;
  const controlPinch = gestureDiagnostics.controlPinch;
  const openPalmClassification = gestureDiagnostics.openPalm;
  const pointPoseClassification = gestureDiagnostics.pointPose;
  const gesturePointer = gestureDiagnostics.pointer;
  const wristRollPose = gestureDiagnostics.wristRollPose;
  const wristRollLock = gestureDiagnostics.wristRollLock;
  const gestureUnlockRequest = gestureDiagnostics.unlockRequest;
  const gestureIntentArbiter = gestureDiagnostics.intentArbiter;
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

  function applyDiagnosticsSettings(next: DiagnosticsSettings) {
    // The overlay owns the export, so it owns the write to storage and the
    // clearing of any collected files. This window mirrors the value locally
    // so the checkboxes respond immediately rather than after a round trip.
    const normalized = normalizeDiagnosticsSettings(next);
    setDiagnosticsSettings(normalized);
    emitTo("overlay", "toki://overlay-command", {
      type: "set-diagnostics-settings",
      settings: normalized,
    } satisfies OverlayCommand).catch(() => undefined);
  }

  function refreshDebugExportStatus() {
    getTokiDebugExportStatus()
      .then((status) => {
        setDebugExportStatus(status);
        setDebugExportError(null);
      })
      .catch((error: unknown) => {
        setDebugExportError(error instanceof Error ? error.message : String(error));
      });
  }

  useEffect(() => {
    let unlistenState: (() => void) | undefined;
    const debugExportStatusTimer = window.setInterval(
      refreshDebugExportStatus,
      2_000,
    );

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
    refreshDebugExportStatus();

    return () => {
      unlistenState?.();
      window.clearInterval(debugExportStatusTimer);
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
            <h2>Local Diagnostics Export</h2>
            <div className="debug-section-header-row">
              <span>
                {diagnosticsSettings.diagnosticsEnabled
                  ? debugExportStatus?.snapshotExists
                    ? "ready"
                    : "waiting"
                  : "off"}
              </span>
              <button type="button" onClick={refreshDebugExportStatus}>
                Refresh
              </button>
            </div>
            <div className="debug-section-header-row">
              <label>
                <input
                  type="checkbox"
                  checked={diagnosticsSettings.diagnosticsEnabled}
                  onChange={(event) =>
                    applyDiagnosticsSettings({
                      ...diagnosticsSettings,
                      diagnosticsEnabled: event.target.checked,
                    })
                  }
                />{" "}
                Share diagnostics
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={diagnosticsSettings.screenCapturesEnabled}
                  disabled={!diagnosticsSettings.diagnosticsEnabled}
                  onChange={(event) =>
                    applyDiagnosticsSettings({
                      ...diagnosticsSettings,
                      screenCapturesEnabled: event.target.checked,
                    })
                  }
                />{" "}
                Include screen captures
              </label>
              <button
                type="button"
                onClick={() => {
                  emitTo("overlay", "toki://overlay-command", {
                    type: "clear-diagnostics",
                  } satisfies OverlayCommand).catch(() => undefined);
                  window.setTimeout(refreshDebugExportStatus, 250);
                }}
              >
                Clear
              </button>
            </div>
            <dl>
              <div>
                <dt>Latest state</dt>
                <dd>{debugExportStatus?.snapshotPath ?? "Resolving"}</dd>
              </div>
              <div>
                <dt>History</dt>
                <dd>{debugExportStatus?.historyPath ?? "Resolving"}</dd>
              </div>
              <div>
                <dt>Capture</dt>
                <dd>{debugExportStatus?.capturePath ?? "None yet"}</dd>
              </div>
              <div>
                <dt>Last write</dt>
                <dd>
                  {debugExportStatus?.lastSnapshotModifiedMs != null
                    ? new Date(
                        debugExportStatus.lastSnapshotModifiedMs,
                      ).toISOString()
                    : "Waiting"}
                </dd>
              </div>
            </dl>
            <p className="debug-muted">
              {debugExportError ??
                (diagnosticsSettings.diagnosticsEnabled
                  ? diagnosticsSettings.screenCapturesEnabled
                    ? "Writing state and screen captures locally. Binary image and audio payloads are omitted from JSON. Turning diagnostics off deletes everything collected."
                    : "Writing state locally, no screen captures. Binary image and audio payloads are omitted from JSON."
                  : "Off. Nothing is written to disk, and no diagnostics folder is created.")}
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
              <div>
                <dt>Capture / hold</dt>
                <dd>
                  {snapshot.gestureVoiceLifecycle.capturePhase} /{" "}
                  {snapshot.gestureVoiceLifecycle.holdPhase}
                </dd>
              </div>
              <div>
                <dt>Held / release pending</dt>
                <dd>
                  {snapshot.gestureVoiceLifecycle.held ? "Yes" : "No"} /{" "}
                  {snapshot.gestureVoiceLifecycle.releasePending ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt>Gesture owner</dt>
                <dd>
                  {snapshot.gestureVoiceLifecycle.owner == null
                    ? "None"
                    : `${snapshot.gestureVoiceLifecycle.owner.detector} · ${snapshot.gestureVoiceLifecycle.owner.controlHandTrackId}`}
                </dd>
              </div>
              <div>
                <dt>Native session</dt>
                <dd>
                  {snapshot.gestureVoiceLifecycle.nativeSessionId ?? "None"}
                </dd>
              </div>
              <div>
                <dt>Last native capture</dt>
                <dd>
                  {snapshot.gestureVoiceLifecycle.lastCapture == null
                    ? "None"
                    : `${snapshot.gestureVoiceLifecycle.lastCapture.durationMs} ms · ${snapshot.gestureVoiceLifecycle.lastCapture.byteLength} bytes`}
                </dd>
              </div>
              <div>
                <dt>Last lifecycle transition</dt>
                <dd>{snapshot.gestureVoiceLifecycle.lastTransition}</dd>
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
                <dt>Hands</dt>
                <dd>{gestureDiagnostics.hands.length} / 2</dd>
              </div>
              <div>
                <dt>Pointer track</dt>
                <dd>{handLandmarkSummary?.trackId ?? "None"}</dd>
              </div>
              <div>
                <dt>Pointer hand</dt>
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
              <div>
                <dt>Split state</dt>
                <dd>{gestureDiagnostics.split.phase}</dd>
              </div>
              <div>
                <dt>Camera re-framing</dt>
                <dd>
                  {gestureDiagnostics.cameraReframing.active == null
                    ? "Unknown"
                    : gestureDiagnostics.cameraReframing.active
                      ? "Centre Stage ON — breaks hand tracking"
                      : "Off"}
                </dd>
              </div>
              <div>
                <dt>Camera-off gesture</dt>
                <dd>{gestureDiagnostics.cameraShutdown.phase}</dd>
              </div>
              <div>
                <dt>Shutdown hold</dt>
                <dd>
                  {Math.min(
                    gestureDiagnostics.cameraShutdown.holdMs,
                    cameraShutdownGesturePolicy.holdMs,
                  )}
                  ms / {cameraShutdownGesturePolicy.holdMs}ms
                </dd>
              </div>
            </dl>
            {gestureDiagnostics.hands.length > 0 ? (
              <p className="debug-muted">
                {gestureDiagnostics.hands
                  .map(
                    (detectedHand) =>
                      `${detectedHand.trackId}: ${detectedHand.role}, ${detectedHand.handedness}, ${(detectedHand.trackingConfidence * 100).toFixed(0)}% tracking`,
                  )
                  .join(" · ")}
              </p>
            ) : null}
            {handLandmarkerError ? (
              <p className="debug-muted">{handLandmarkerError}</p>
            ) : null}
            {handLandmarkerStatus === "loading" ? (
              <p className="debug-muted">
                Loading the bundled MediaPipe runtime and hand model from Toki.
              </p>
            ) : handLandmarkerStatus === "no_hand" ? (
              <p className="debug-muted">
                Model is running. Put one or two open hands in the camera frame to
                detect landmarks.
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
                <h3>Control hold-to-talk</h3>
                <dl>
                  <div>
                    <dt>Ordinary pinch</dt>
                    <dd>{ordinaryPinch.phase}</dd>
                  </div>
                  <div>
                    <dt>Ordinary event</dt>
                    <dd>{ordinaryPinch.lastEvent?.type ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{controlPinch.phase}</dd>
                  </div>
                  <div>
                    <dt>Control track</dt>
                    <dd>{controlPinch.controlHandTrackId ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Raw / filtered distance</dt>
                    <dd>
                      {controlPinch.rawNormalizedDistance == null
                        ? "None"
                        : controlPinch.rawNormalizedDistance.toFixed(3)}{" "}
                      /{" "}
                      {controlPinch.normalizedDistance == null
                        ? "None"
                        : controlPinch.normalizedDistance.toFixed(3)}
                    </dd>
                  </div>
                  <div>
                    <dt>Press / release</dt>
                    <dd>
                      {controlPinch.pressThreshold.toFixed(3)} /{" "}
                      {controlPinch.releaseThreshold.toFixed(3)}
                    </dd>
                  </div>
                  <div>
                    <dt>Last event</dt>
                    <dd>{controlPinch.lastEvent?.type ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Frozen lock</dt>
                    <dd>{snapshot.gestureVoiceContext?.lock.id ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Recorder lifecycle</dt>
                    <dd>
                      {snapshot.gestureVoiceLifecycle.capturePhase} /{" "}
                      {snapshot.gestureVoiceLifecycle.holdPhase}
                    </dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd>
                      {snapshot.gestureVoiceLifecycle.owner == null
                        ? "None"
                        : `${snapshot.gestureVoiceLifecycle.owner.detector} · ${snapshot.gestureVoiceLifecycle.owner.controlHandTrackId}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Last transition</dt>
                    <dd>{snapshot.gestureVoiceLifecycle.lastTransition}</dd>
                  </div>
                  <div>
                    <dt>Explanation</dt>
                    <dd>{snapshot.pointerExplanation?.status ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Explained label</dt>
                    <dd>{snapshot.pointerExplanation?.label ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Explanation reason</dt>
                    <dd>{snapshot.pointerExplanation?.reason ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>
                      {snapshot.pointerExplanation?.debug?.providerName ?? "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>
                      {snapshot.pointerExplanation?.confidence == null
                        ? "None"
                        : `${Math.round(
                            snapshot.pointerExplanation.confidence * 100,
                          )}%`}
                    </dd>
                  </div>
                  <div>
                    <dt>Current evidence</dt>
                    <dd>
                      {snapshot.pointerExplanation?.supportingEvidence.join(" | ") ||
                        "None"}
                    </dd>
                  </div>
                  <div>
                    <dt>Speech</dt>
                    <dd>
                      {snapshot.pointerExplanationSpeechMuted ? "Muted" : "On"}
                    </dd>
                  </div>
                </dl>
                <p className="debug-muted">
                  With a validated pointer lock, hold the control hand pinch to record.
                  Release submits once; a lost control hand gets two seconds to recover
                  before capture is cancelled without submission. Deictic explanation
                  commands recheck the frozen point on the current screen and never click.
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
                <h3>Wrist-roll lock</h3>
                <dl>
                  <div>
                    <dt>Pose</dt>
                    <dd>{wristRollPose.label}</dd>
                  </div>
                  <div>
                    <dt>Roll phase</dt>
                    <dd>{wristRollLock.phase}</dd>
                  </div>
                  <div>
                    <dt>Rotation</dt>
                    <dd>{Math.round(wristRollLock.rotationDegrees ?? 0)}°</dd>
                  </div>
                  <div>
                    <dt>Roll</dt>
                    <dd>{wristRollLock.roll?.id ?? "None"}</dd>
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
                  <div>
                    <dt>Release</dt>
                    <dd>
                      {wristRollLock.phase === "unlocking"
                        ? `Untwisting, hold until ${wristRollLock.holdUntil ?? "—"}`
                        : gestureUnlockRequest == null
                          ? "None"
                          : `${gestureUnlockRequest.handTrackId} released ${gestureUnlockRequest.lockId}`}
                    </dd>
                  </div>
                </dl>
                <p className="debug-muted">
                  Point normally, then turn the same wrist roughly a quarter-to-half turn
                  and hold briefly. Toki freezes the last stable fingertip coordinate before
                  the turn. Turning that same pointing hand back to its original orientation
                  releases the lock; lowering or opening the hand keeps it. The detached blue
                  drop is not a verified guidance target and never clicks anything.
                </p>
              </div>

              <div className="debug-recognition-card">
                <h3>Intent ownership</h3>
                <dl>
                  <div>
                    <dt>Owners</dt>
                    <dd>
                      {gestureIntentArbiter.owners.length === 0
                        ? "None"
                        : gestureIntentArbiter.owners
                            .map(
                              (owner) =>
                                `${owner.trackId}: ${owner.intent} (${owner.lifecycle})`,
                            )
                            .join(" · ")}
                    </dd>
                  </div>
                  <div>
                    <dt>Suppressed</dt>
                    <dd>
                      {gestureIntentArbiter.suppressed.length === 0
                        ? "None"
                        : gestureIntentArbiter.suppressed
                            .map(
                              (item) =>
                                `${item.trackId}: ${item.intent} → ${item.winner} (${item.reason})`,
                            )
                            .join(" · ")}
                    </dd>
                  </div>
                </dl>
                <p className="debug-muted">
                  Each tracked hand has one gesture owner. Competing readings are
                  recorded here instead of advancing multiple actions.
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
              <span>
                Camera + Gestures: {snapshot.gestureRuntime.camera.enabled &&
                snapshot.gestureRuntime.enabled
                  ? "on"
                  : "off"}
              </span>
              <span>Use the top Controls tab to change this setting.</span>
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
                <dd>X 0.12–0.88 / Y 0.08–0.72 / roll 70° / pinch 0.34</dd>
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
                <dt>Legacy roll profile / pinch</dt>
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

function PreferencesWindowApp() {
  const [keyStatus, setKeyStatus] = useState<OpenAiKeyStatus>(
    unknownOpenAiKeyStatus,
  );
  const [keyDraft, setKeyDraft] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [diagnosticsSettings, setDiagnosticsSettings] =
    useState<DiagnosticsSettings>(loadDiagnosticsSettings);
  const [updateState, setUpdateState] = useState<UpdateCheckState>(
    initialUpdateCheckState,
  );
  const pendingUpdateRef = useRef<Awaited<
    ReturnType<typeof import("@tauri-apps/plugin-updater").check>
  > | null>(null);

  const [whisperBinary, setWhisperBinary] = useState("");
  const [whisperModel, setWhisperModel] = useState("");
  const [whisperError, setWhisperError] = useState<string | null>(null);

  const [authState, setAuthState] = useState<AuthState>(signedOut);
  const [authBusy, setAuthBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [planChecked, setPlanChecked] = useState(false);
  const authRef = useRef<AuthSession | null>(null);

  useEffect(() => {
    const session = createAuthSession();
    authRef.current = session;

    if (session == null) {
      return;
    }

    void session.restore().then(setAuthState);

    // Registered before anything else can finish, because macOS may have
    // launched this window specifically to deliver the callback.
    const stopping = listenForAuthCallback((url) => {
      void session.completeSignIn(url).then((next) => {
        setAuthState(next);
        if (next.status === "signed_in") {
          announceAuthChange();
        }
      });
    });

    return () => {
      void stopping.then((stop) => stop()).catch(() => undefined);
    };
  }, []);

  async function beginSignIn() {
    const session = authRef.current;
    if (session == null) {
      return;
    }
    setAuthBusy(true);
    try {
      setAuthState(await session.signIn());
    } catch (error) {
      setAuthState({ status: "error", message: String(error) });
    } finally {
      setAuthBusy(false);
    }
  }

  /**
   * Read the plan from the service.
   *
   * Run whenever the sign-in changes, and again after returning from Stripe:
   * the webhook that grants access arrives at the service, not at this app, so
   * the only way to see the result of a payment is to ask.
   */
  const refreshAccount = useCallback(async () => {
    const session = authRef.current;
    if (session == null) {
      setAccount(null);
      setPlanChecked(true);
      return;
    }

    const client = createTokiApiClient({
      endpoint: import.meta.env.VITE_TOKI_GUIDANCE_ENDPOINT,
      session,
    });
    setAccount(await client.account());
    setPlanChecked(true);
  }, []);

  useEffect(() => {
    if (authState.status === "signed_in") {
      void refreshAccount();
    } else {
      setAccount(null);
      setPlanChecked(authState.status !== "waiting_for_browser");
    }
  }, [authState.status, refreshAccount]);

  // Payment finishes in the browser and is confirmed to the service by Stripe,
  // not to this app. Coming back to this window is the moment a person expects
  // to see what they just bought, so that is when it is checked again.
  useEffect(() => {
    if (authState.status !== "signed_in") {
      return;
    }

    const onFocus = () => void refreshAccount();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [authState.status, refreshAccount]);

  /**
   * Send someone to Stripe to start or change a subscription.
   *
   * Card details are entered on Stripe's own page in the browser, never inside
   * Toki. That is not only good manners: an app that never sees a card number
   * cannot leak one, and it keeps this project out of the scope of handling
   * card data itself.
   */
  async function openBilling(kind: "checkout" | "manage") {
    const session = authRef.current;
    if (session == null) {
      return;
    }

    setAuthBusy(true);
    setPlanError(null);
    try {
      const client = createTokiApiClient({
        endpoint: import.meta.env.VITE_TOKI_GUIDANCE_ENDPOINT,
        session,
      });
      const result =
        kind === "checkout"
          ? await client.startCheckout()
          : await client.manageSubscription();

      if ("url" in result) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(result.url);
      } else {
        setPlanError(result.error);
      }
    } catch (error) {
      setPlanError(String(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function endSignIn() {
    const session = authRef.current;
    if (session == null) {
      return;
    }
    setAuthBusy(true);
    try {
      setAuthState(await session.signOut());
      announceAuthChange();
    } finally {
      setAuthBusy(false);
    }
  }

  function announceAuthChange() {
    emitTo("overlay", "toki://overlay-command", {
      type: "auth-changed",
    } satisfies OverlayCommand).catch(() => undefined);
  }

  useEffect(() => {
    getOpenAiKeyStatus()
      .then(setKeyStatus)
      .catch(() => setKeyStatus(unknownOpenAiKeyStatus));
    void getOperatorSetting(whisperBinarySetting).then((value) =>
      setWhisperBinary(value ?? ""),
    );
    void getOperatorSetting(whisperModelSetting).then((value) =>
      setWhisperModel(value ?? ""),
    );
  }, []);

  async function saveWhisperPaths() {
    setWhisperError(null);
    try {
      await setOperatorSetting(whisperBinarySetting, whisperBinary);
      await setOperatorSetting(whisperModelSetting, whisperModel);
    } catch (error) {
      setWhisperError(String(error));
    }
  }

  async function runUpdateCheck() {
    setUpdateState({ status: "checking" });
    const { check } = await import("@tauri-apps/plugin-updater");
    const next = await checkForUpdate(async () => {
      const update = await check();
      pendingUpdateRef.current = update;
      return update;
    });
    setUpdateState(next);
  }

  async function installPendingUpdate() {
    const update = pendingUpdateRef.current;
    if (update == null) {
      return;
    }
    setUpdateState(await downloadAndInstallUpdate(update, setUpdateState));
  }

  async function saveKey() {
    setKeyBusy(true);
    setKeyError(null);
    try {
      setKeyStatus(await setOpenAiKey(keyDraft));
      // Clearing the field the moment it is stored keeps the secret from
      // sitting in the DOM for the rest of the session.
      setKeyDraft("");
    } catch (error) {
      setKeyError(String(error));
    } finally {
      setKeyBusy(false);
    }
  }

  async function removeKey() {
    setKeyBusy(true);
    setKeyError(null);
    try {
      setKeyStatus(await clearOpenAiKey());
    } catch (error) {
      setKeyError(String(error));
    } finally {
      setKeyBusy(false);
    }
  }

  function applyDiagnosticsSettings(next: DiagnosticsSettings) {
    const normalized = normalizeDiagnosticsSettings(next);
    setDiagnosticsSettings(normalized);
    emitTo("overlay", "toki://overlay-command", {
      type: "set-diagnostics-settings",
      settings: normalized,
    } satisfies OverlayCommand).catch(() => undefined);
  }

  return (
    <main className="debug-shell" aria-label="Toki preferences">
      {authRef.current != null && (
        <section className="debug-section">
          <h2>Account</h2>
          <p className="debug-muted">{describeAuthState(authState)}</p>
          {authState.status === "signed_in" ? (
            <>
              <p className="debug-muted">
                {planChecked ? describePlan(account) : "Checking your plan…"}
              </p>
              <button type="button" onClick={endSignIn} disabled={authBusy}>
                Sign out
              </button>
              {/*
                Offering "Upgrade" to somebody who already pays is the clearest
                possible sign an app does not know who its customers are, so the
                offer follows what the service actually says. While the plan is
                unknown neither is shown -- guessing wrong in either direction
                is worse than waiting a moment.
              */}
              {planChecked && account != null && !account.entitled ? (
                <button
                  type="button"
                  onClick={() => void openBilling("checkout")}
                  disabled={authBusy}
                >
                  Upgrade to Pro
                </button>
              ) : null}
              {planChecked && account?.hasBillingAccount ? (
                <button
                  type="button"
                  onClick={() => void openBilling("manage")}
                  disabled={authBusy}
                >
                  Manage plan
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void refreshAccount()}
                disabled={authBusy}
              >
                Refresh plan
              </button>
              {planError ? <p className="debug-muted">{planError}</p> : null}
            </>
          ) : (
            <button type="button" onClick={beginSignIn} disabled={authBusy}>
              {authState.status === "waiting_for_browser"
                ? "Waiting for your browser…"
                : "Sign in"}
            </button>
          )}
        </section>
      )}
      <section className="debug-section">
        <h2>Updates</h2>
        <p className="debug-muted">
          {describeUpdateState(updateState) ||
            "Toki checks for updates when you ask it to."}
        </p>
        <div className="debug-section-header-row">
          <button
            type="button"
            disabled={
              updateState.status === "checking" ||
              updateState.status === "downloading"
            }
            onClick={() => void runUpdateCheck()}
          >
            Check for updates
          </button>
          {updateState.status === "available" && (
            <button type="button" onClick={() => void installPendingUpdate()}>
              Install version {updateState.version}
            </button>
          )}
          {updateState.status === "ready" && (
            <button type="button" onClick={() => void restartToFinishUpdate()}>
              Restart now
            </button>
          )}
        </div>
      </section>

      <section className="debug-section">
        <h2>Voice</h2>
        <p className="debug-muted">{describeOpenAiKeyStatus(keyStatus)}</p>
        <label>
          OpenAI API key
          <input
            type="password"
            value={keyDraft}
            placeholder={keyStatus.stored ? "Replace saved key" : "sk-…"}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setKeyDraft(event.target.value)}
          />
        </label>
        <div className="debug-section-header-row">
          <button
            type="button"
            disabled={keyBusy || keyDraft.trim().length === 0}
            onClick={() => void saveKey()}
          >
            {keyStatus.stored ? "Replace key" : "Save key"}
          </button>
          <button
            type="button"
            disabled={keyBusy || !keyStatus.stored}
            onClick={() => void removeKey()}
          >
            Remove key
          </button>
        </div>
        {keyError != null && <p className="debug-muted">{keyError}</p>}
        <p className="debug-muted">
          The key is stored in your macOS Keychain and sent only to OpenAI when
          you use voice. Toki never writes it to diagnostics or logs.
        </p>

        <h2>Local transcription</h2>
        <p className="debug-muted">
          {describeLocalTranscription(
            whisperBinary || null,
            whisperModel || null,
          )}
        </p>
        <label>
          whisper.cpp binary
          <input
            type="text"
            value={whisperBinary}
            placeholder="/absolute/path/to/whisper-cli"
            spellCheck={false}
            onChange={(event) => setWhisperBinary(event.target.value)}
          />
        </label>
        <label>
          Model file
          <input
            type="text"
            value={whisperModel}
            placeholder="/absolute/path/to/ggml-base.en.bin"
            spellCheck={false}
            onChange={(event) => setWhisperModel(event.target.value)}
          />
        </label>
        <div className="debug-section-header-row">
          <button type="button" onClick={() => void saveWhisperPaths()}>
            Save paths
          </button>
        </div>
        {whisperError != null && <p className="debug-muted">{whisperError}</p>}
        <p className="debug-muted">
          Toki never searches for these — a path is used only because you
          entered it. Leave them empty to use OpenAI instead.
        </p>
      </section>

      <section className="debug-section">
        <h2>Diagnostics</h2>
        <p className="debug-muted">
          Off by default. Toki writes nothing to disk unless you turn these on.
        </p>
        <label>
          <input
            type="checkbox"
            checked={diagnosticsSettings.diagnosticsEnabled}
            onChange={(event) =>
              applyDiagnosticsSettings({
                ...diagnosticsSettings,
                diagnosticsEnabled: event.target.checked,
              })
            }
          />{" "}
          Share diagnostics — saves Toki&apos;s internal state locally to help
          with support. Passwords and keys are removed.
        </label>
        <label>
          <input
            type="checkbox"
            checked={diagnosticsSettings.screenCapturesEnabled}
            disabled={!diagnosticsSettings.diagnosticsEnabled}
            onChange={(event) =>
              applyDiagnosticsSettings({
                ...diagnosticsSettings,
                screenCapturesEnabled: event.target.checked,
              })
            }
          />{" "}
          Include screen captures — also saves a picture of your screen. Only
          turn this on if asked to.
        </label>
        <div className="debug-section-header-row">
          <button
            type="button"
            onClick={() => {
              emitTo("overlay", "toki://overlay-command", {
                type: "clear-diagnostics",
              } satisfies OverlayCommand).catch(() => undefined);
            }}
          >
            Delete collected diagnostics
          </button>
        </div>
      </section>
    </main>
  );
}

function App() {
  if (currentWindowLabel === "settings") {
    return <SettingsWindowApp />;
  }

  if (currentWindowLabel === "preferences") {
    return <PreferencesWindowApp />;
  }

  if (currentWindowLabel === "debug") {
    return <DebugWindowApp />;
  }

  return <OverlayWindowApp />;
}

export default App;
