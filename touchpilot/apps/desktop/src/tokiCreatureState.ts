import type { GestureLabel, GesturePhase, VoiceRuntimeStatus } from "@toki/shared";
import {
  getGestureVisualResponse,
  type GestureVisualAnchor,
  type GestureVisualResponse,
} from "./gestureVisuals";
import type { OverlayState } from "./puckMotion";

export type TokiCreatureMode =
  | "idle"
  | "listening"
  | "thinking"
  | "guiding"
  | "confirming"
  | "paused"
  | "error";

export type TokiCreatureAnchor = "cursor" | "target" | "gesture" | "status";
export type TokiCreatureTone =
  | "calm"
  | "attentive"
  | "working"
  | "focused"
  | "blocked";

export type TokiCreatureInput = {
  overlayState: OverlayState;
  hasAcceptedGuidance: boolean;
  hasActiveTarget: boolean;
  isRefreshingCapture: boolean;
  hasCaptureError: boolean;
  guidanceIssueCount: number;
  voiceStatus: VoiceRuntimeStatus;
  gestureEnabled: boolean;
  gestureLabel: GestureLabel;
  gesturePhase: GesturePhase;
  gestureVisualAnchor: GestureVisualAnchor | null;
  hasWorkflow: boolean;
};

export type TokiCreatureState = {
  mode: TokiCreatureMode;
  anchor: TokiCreatureAnchor;
  tone: TokiCreatureTone;
  statusLabel: string | null;
  energy: number;
  shouldPulse: boolean;
  shouldStretchTowardTarget: boolean;
  shouldShowAura: boolean;
  gesture: GestureVisualResponse;
  reason: string;
};

export function getTokiCreatureState(input: TokiCreatureInput): TokiCreatureState {
  const hasRejectedGuidance = input.guidanceIssueCount > 0;
  const hasGuidanceTarget =
    input.hasAcceptedGuidance || input.hasActiveTarget || input.hasWorkflow;
  const gesture = getGestureVisualResponse({
    label: input.gestureLabel,
    phase: input.gesturePhase,
    anchor: input.gestureVisualAnchor,
  });

  if (
    input.hasCaptureError ||
    hasRejectedGuidance ||
    input.overlayState === "error" ||
    input.voiceStatus === "error"
  ) {
    return {
      mode: "error",
      anchor: "status",
      tone: "blocked",
      statusLabel: "ERROR",
      energy: 0.55,
      shouldPulse: false,
      shouldStretchTowardTarget: false,
      shouldShowAura: true,
      gesture,
      reason: "error-or-rejected-guidance",
    };
  }

  if (input.overlayState === "paused") {
    return {
      mode: "paused",
      anchor: "status",
      tone: "calm",
      statusLabel: "PAUSED",
      energy: 0.15,
      shouldPulse: false,
      shouldStretchTowardTarget: false,
      shouldShowAura: false,
      gesture,
      reason: "runtime-paused",
    };
  }

  if (input.voiceStatus === "listening" || input.overlayState === "listening") {
    return {
      mode: "listening",
      anchor: "cursor",
      tone: "attentive",
      statusLabel: "LISTENING",
      energy: 0.7,
      shouldPulse: true,
      shouldStretchTowardTarget: false,
      shouldShowAura: true,
      gesture,
      reason: "voice-listening",
    };
  }

  if (input.voiceStatus === "transcribing") {
    return {
      mode: "thinking",
      anchor: "cursor",
      tone: "working",
      statusLabel: "TRANSCRIBING",
      energy: 0.8,
      shouldPulse: true,
      shouldStretchTowardTarget: false,
      shouldShowAura: true,
      gesture,
      reason: "voice-transcribing",
    };
  }

  if (input.isRefreshingCapture || input.overlayState === "thinking") {
    return {
      mode: "thinking",
      anchor: "cursor",
      tone: "working",
      statusLabel: "THINKING",
      energy: 0.8,
      shouldPulse: true,
      shouldStretchTowardTarget: false,
      shouldShowAura: true,
      gesture,
      reason: "processing-input",
    };
  }

  if (input.overlayState === "confirmation_required") {
    return {
      mode: "confirming",
      anchor: "target",
      tone: "focused",
      statusLabel: "CONFIRM",
      energy: 0.65,
      shouldPulse: true,
      shouldStretchTowardTarget: false,
      shouldShowAura: true,
      gesture,
      reason: "confirmation-required",
    };
  }

  if (hasGuidanceTarget || input.overlayState === "guiding") {
    return {
      mode: "guiding",
      anchor: "target",
      tone: "focused",
      statusLabel: "GUIDING",
      energy: 0.9,
      shouldPulse: false,
      shouldStretchTowardTarget: true,
      shouldShowAura: true,
      gesture,
      reason: "target-guidance-active",
    };
  }

  if (input.gestureEnabled && gesture.active) {
    return {
      mode: "listening",
      anchor: "gesture",
      tone: "attentive",
      statusLabel: "GESTURE",
      energy: input.gesturePhase === "recognized" ? 0.85 : 0.6,
      shouldPulse: true,
      shouldStretchTowardTarget: false,
      shouldShowAura: true,
      gesture,
      reason: "gesture-active",
    };
  }

  if (input.voiceStatus === "command_ready") {
    return {
      mode: "thinking",
      anchor: "cursor",
      tone: "working",
      statusLabel: "THINKING",
      energy: 0.65,
      shouldPulse: true,
      shouldStretchTowardTarget: false,
      shouldShowAura: true,
      gesture,
      reason: "voice-command-ready",
    };
  }

  return {
    mode: "idle",
    anchor: "cursor",
    tone: "calm",
    statusLabel: null,
    energy: 0.3,
    shouldPulse: false,
    shouldStretchTowardTarget: false,
    shouldShowAura: false,
    gesture,
    reason: "idle",
  };
}
