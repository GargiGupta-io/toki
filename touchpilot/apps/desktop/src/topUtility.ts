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
const EXPANDED_SURFACE_WIDTH = 424;
const EXPANDED_SURFACE_HEIGHT = 344;
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
  const left = (viewport.width - EXPANDED_SURFACE_WIDTH) / 2;
  const right = left + EXPANDED_SURFACE_WIDTH;
  const bottom =
    EXPANDED_SURFACE_TOP +
    EXPANDED_SURFACE_HEIGHT +
    EXPANDED_SURFACE_EXIT_PADDING;

  return (
    point.x >= left - EXPANDED_SURFACE_EXIT_PADDING &&
    point.x <= right + EXPANDED_SURFACE_EXIT_PADDING &&
    point.y >= 0 &&
    point.y <= bottom
  );
}
