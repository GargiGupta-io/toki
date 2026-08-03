import type { VoiceRuntimeState, VoiceRuntimeStatus } from "@toki/shared";
import type { ViewportMetrics } from "./overlayGeometry";

export type TopUtilityMode = "hidden" | "peek" | "expanded";

export type TokiTopStatusMode =
  | "listening"
  | "transcribing"
  | "thinking"
  | "gesture"
  | "ready"
  | "guiding"
  | "warning"
  | "confirming"
  | "paused"
  | "error";

export type TokiTopStatusModel = {
  mode: TokiTopStatusMode;
  label: string;
  message: string;
};

export type TopUtilityModeEvent = {
  mode: TopUtilityMode;
  focused: boolean;
};

export type TopUtilityPoint = {
  x: number;
  y: number;
};

export const TOP_UTILITY_REVEAL_DWELL_MS = 160;
export const TOP_UTILITY_LEAVE_DELAY_MS = 360;
export const TOP_UTILITY_RESULT_NOTICE_MS = 3_000;

/**
 * How long the open panel waits before collapsing itself.
 *
 * Long enough to read the two lines it shows and reach a control, short enough
 * that glancing at it does not leave something hanging over the work. It never
 * fires while a recording is running, a request is out, a warning is waiting to
 * be acknowledged, or the pointer is over the panel -- reading is
 * indistinguishable from inactivity, and vanishing mid-sentence is worse than
 * lingering.
 */
export const TOP_UTILITY_IDLE_COLLAPSE_MS = 5_000;

const TOP_EDGE_TRIGGER_HEIGHT = 20;
const TOP_EDGE_TRIGGER_HALF_WIDTH = 220;
export const TOP_UTILITY_EXPANDED_WIDTH = 400;
export const TOP_UTILITY_EXPANDED_HEIGHT = 218;
const EXPANDED_SURFACE_TOP = 0;
const EXPANDED_SURFACE_EXIT_PADDING = 20;

export function getPassiveTopUtilityMode(
  status: TokiTopStatusModel | null,
): TopUtilityMode {
  return status == null ? "hidden" : "peek";
}

export function isTransientVoiceTopStatus(
  status: VoiceRuntimeStatus,
): boolean {
  return status === "command_ready" || status === "no_speech";
}

export function settleTransientVoiceTopStatus(
  current: VoiceRuntimeState,
  expectedStatus: VoiceRuntimeStatus,
): VoiceRuntimeState {
  if (
    current.status !== expectedStatus ||
    !isTransientVoiceTopStatus(current.status)
  ) {
    return current;
  }

  return {
    ...current,
    enabled: false,
    status: "idle",
    activationSource: undefined,
    pendingCommand: undefined,
    error: undefined,
  };
}

export function isTopUtilityRevealPoint(
  point: TopUtilityPoint,
  viewport: ViewportMetrics,
): boolean {
  const centerX = viewport.width / 2;

  return (
    point.y >= 0 &&
    point.y <= TOP_EDGE_TRIGGER_HEIGHT &&
    Math.abs(point.x - centerX) <= TOP_EDGE_TRIGGER_HALF_WIDTH
  );
}

export function isInsideExpandedTopUtility(
  point: TopUtilityPoint,
  viewport: ViewportMetrics,
): boolean {
  const left = (viewport.width - TOP_UTILITY_EXPANDED_WIDTH) / 2;
  const right = left + TOP_UTILITY_EXPANDED_WIDTH;
  const bottom =
    EXPANDED_SURFACE_TOP +
    TOP_UTILITY_EXPANDED_HEIGHT +
    EXPANDED_SURFACE_EXIT_PADDING;

  return (
    point.x >= left - EXPANDED_SURFACE_EXIT_PADDING &&
    point.x <= right + EXPANDED_SURFACE_EXIT_PADDING &&
    point.y >= 0 &&
    point.y <= bottom
  );
}
