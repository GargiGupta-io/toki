import type { ViewportMetrics } from "./overlayGeometry";

export type TopUtilityMode = "hidden" | "peek" | "expanded";

export type TokiTopStatusMode =
  | "listening"
  | "transcribing"
  | "thinking"
  | "gesture"
  | "ready"
  | "guiding"
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

const TOP_EDGE_TRIGGER_HEIGHT = 20;
const TOP_EDGE_TRIGGER_HALF_WIDTH = 220;
export const TOP_UTILITY_EXPANDED_WIDTH = 424;
export const TOP_UTILITY_EXPANDED_HEIGHT = 224;
const EXPANDED_SURFACE_TOP = 30;
const EXPANDED_SURFACE_EXIT_PADDING = 20;

export function getPassiveTopUtilityMode(
  status: TokiTopStatusModel | null,
): TopUtilityMode {
  return status == null ? "hidden" : "peek";
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
