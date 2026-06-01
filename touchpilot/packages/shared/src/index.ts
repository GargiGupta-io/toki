export type RiskClass =
  | "safe_navigation"
  | "form_entry"
  | "external_send"
  | "delete"
  | "payment"
  | "security_change"
  | "account_change"
  | "permission_change"
  | "unknown_risky";

export type AssistantState =
  | "idle"
  | "listening"
  | "thinking"
  | "guiding"
  | "waiting_for_user"
  | "confirmation_required"
  | "paused"
  | "done"
  | "error";

export type TargetBox = {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GuidanceStep = {
  instruction: string;
  target?: TargetBox;
  confidence: number;
  risk: RiskClass;
  requiresConfirmation: boolean;
};

export type GuidanceResult = {
  mode: "guide" | "answer" | "clarify";
  summary: string;
  step?: GuidanceStep;
};

export type GuidanceScreenContext = {
  display: DisplayContext;
  capture?: CaptureMetadata;
  screenshot?: ScreenshotMetadata;
  calibration?: CoordinateCalibration;
};

export type GuidanceRequest = {
  goal: string;
  screen: GuidanceScreenContext;
  previousStep?: GuidanceStep | null;
};

export type GuidanceValidationIssue = {
  path: string;
  message: string;
};

export type GuidanceValidationResult = {
  valid: boolean;
  issues: GuidanceValidationIssue[];
};

export type GestureCommand =
  | { type: "toggle_voice"; confidence: number }
  | { type: "pause"; confidence: number }
  | { type: "cancel"; confidence: number }
  | { type: "next_step"; confidence: number }
  | { type: "previous_step"; confidence: number }
  | { type: "confirm"; confidence: number };

export type DisplayContext = {
  id: string;
  width: number;
  height: number;
  scaleFactor: number;
};

export type CursorContext = {
  x: number;
  y: number;
};

export type ActiveWindowContext = {
  title?: string;
  appName?: string;
};

export type ScreenContext = {
  imageBase64?: string;
  display: DisplayContext;
  cursor?: CursorContext;
  activeWindow?: ActiveWindowContext;
};

export type ScreenshotFormat = "png" | "jpeg";

export type CaptureSource = "full_screen" | "active_display" | "active_window" | "region";

export type CaptureMetadata = {
  source: CaptureSource;
  display: DisplayContext;
  cursor?: CursorContext;
  activeWindow?: ActiveWindowContext;
  capturedAt: string;
};

export type ScreenshotMetadata = CaptureMetadata & {
  format: ScreenshotFormat;
  byteLength: number;
  imageWidth: number;
  imageHeight: number;
};

export type ScreenshotCapture = ScreenshotMetadata & {
  imageBase64: string;
};

export type CalibrationStatus =
  | "unknown"
  | "needs_check"
  | "aligned"
  | "scale_mismatch"
  | "origin_mismatch";

export type CoordinateCalibration = {
  status: CalibrationStatus;
  overlayWidth: number;
  overlayHeight: number;
  displayWidth: number;
  displayHeight: number;
  scaleFactor: number;
  checkedAt?: string;
  notes?: string;
};

export type UiElementSource = "vision" | "ocr" | "accessibility" | "dom";

export type UiElement = {
  id: string;
  source: UiElementSource;
  role?: string;
  label?: string;
  bounds: Bounds;
  confidence: number;
};
