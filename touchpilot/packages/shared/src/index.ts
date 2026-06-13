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

export type CameraPermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported"
  | "error";

export type CameraDeviceKind = "rgb" | "ir" | "depth" | "virtual" | "unknown";

export type CameraDeviceSummary = {
  id: string;
  label: string;
  kind: CameraDeviceKind;
  isDefault: boolean;
};

export type CameraStreamStatus =
  | "idle"
  | "requesting_permission"
  | "active"
  | "disabled"
  | "permission_denied"
  | "no_camera"
  | "error";

export type CameraRuntimeState = {
  enabled: boolean;
  permission: CameraPermissionState;
  status: CameraStreamStatus;
  selectedDeviceId?: string;
  devices: CameraDeviceSummary[];
  error?: string;
};

export type HandLandmarkIndex =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;

export type HandLandmarkName =
  | "wrist"
  | "thumb_cmc"
  | "thumb_mcp"
  | "thumb_ip"
  | "thumb_tip"
  | "index_mcp"
  | "index_pip"
  | "index_dip"
  | "index_tip"
  | "middle_mcp"
  | "middle_pip"
  | "middle_dip"
  | "middle_tip"
  | "ring_mcp"
  | "ring_pip"
  | "ring_dip"
  | "ring_tip"
  | "pinky_mcp"
  | "pinky_pip"
  | "pinky_dip"
  | "pinky_tip";

export type Handedness = "left" | "right" | "unknown";

export type HandLandmarkPoint = {
  index: HandLandmarkIndex;
  name: HandLandmarkName;
  x: number;
  y: number;
  z?: number;
};

export type HandLandmarkFrame = {
  frameId: number;
  capturedAt: string;
  handedness: Handedness;
  confidence: number;
  landmarks: HandLandmarkPoint[];
};

export type GestureLabel = "none" | "pinch" | "open_palm";

export type GesturePhase =
  | "inactive"
  | "candidate"
  | "holding"
  | "recognized"
  | "cooldown";

export type GestureThresholds = {
  minDetectionConfidence: number;
  pinchHoldMs: number;
  openPalmHoldMs: number;
  cooldownMs: number;
  maxHands: number;
};

export type GestureClassification = {
  label: GestureLabel;
  phase: GesturePhase;
  confidence: number;
  holdMs: number;
  cooldownRemainingMs: number;
  sourceFrameId?: number;
};

export type GestureActionType = "activate_assistant" | "pause_assistant" | "cancel_assistant";

export type GestureActionEvent = {
  type: GestureActionType;
  gesture: Exclude<GestureLabel, "none">;
  confidence: number;
  firedAt: string;
  sourceFrameId?: number;
};

export type GestureRuntimeState = {
  enabled: boolean;
  camera: CameraRuntimeState;
  thresholds: GestureThresholds;
  currentGesture: GestureClassification;
  lastAction?: GestureActionEvent;
};

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
