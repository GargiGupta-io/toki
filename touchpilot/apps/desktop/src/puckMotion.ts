export type OverlayState =
  | "idle"
  | "listening"
  | "thinking"
  | "guiding"
  | "paused"
  | "error";

export type PuckMotionState =
  | "shadow"
  | "forming"
  | "thinking"
  | "guiding"
  | "paused"
  | "error";

export type PuckMotionInput = {
  overlayState: OverlayState;
  hasAcceptedGuidance: boolean;
  hasActiveTarget: boolean;
  isRefreshingCapture: boolean;
  hasCaptureError: boolean;
  guidanceIssueCount: number;
};

export type PuckMotionModel = {
  state: PuckMotionState;
  canSendTargetDroplets: boolean;
};

export function getPuckMotionModel(input: PuckMotionInput): PuckMotionModel {
  const hasRejectedGuidance = input.guidanceIssueCount > 0;
  const hasSafeTarget =
    input.hasAcceptedGuidance &&
    input.hasActiveTarget &&
    !input.isRefreshingCapture &&
    !input.hasCaptureError &&
    !hasRejectedGuidance;

  if (input.hasCaptureError || hasRejectedGuidance || input.overlayState === "error") {
    return {
      state: "error",
      canSendTargetDroplets: false,
    };
  }

  if (input.overlayState === "paused") {
    return {
      state: "paused",
      canSendTargetDroplets: false,
    };
  }

  if (input.isRefreshingCapture || input.overlayState === "thinking") {
    return {
      state: "thinking",
      canSendTargetDroplets: false,
    };
  }

  if (input.overlayState === "guiding" && hasSafeTarget) {
    return {
      state: "guiding",
      canSendTargetDroplets: true,
    };
  }

  if (input.overlayState === "listening") {
    return {
      state: "forming",
      canSendTargetDroplets: false,
    };
  }

  return {
    state: "shadow",
    canSendTargetDroplets: false,
  };
}
