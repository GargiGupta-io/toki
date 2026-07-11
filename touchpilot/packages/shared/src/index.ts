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
  candidateId?: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenCandidate = TargetBox & {
  id: string;
  role:
    | "accessibility_element"
    | "ocr_text"
    | "dom_button"
    | "dom_link"
    | "dom_input"
    | "dom_select"
    | "dom_textarea"
    | "dom_candidate"
    | "manual";
  source?: "accessibility" | "ocr" | "dom" | "manual";
  rank?: {
    position?: number;
    score: number;
    reasons: string[];
  };
  metadata?: Record<string, string | number | boolean | null>;
};

export type ScreenCandidateEvidence = {
  rawCount: number;
  validCount: number;
  fusedCount: number;
  returnedCount: number;
  sourceCounts: {
    accessibility: number;
    ocr: number;
    dom: number;
    manual: number;
    unknown: number;
  };
};

export type BrowserCandidatePayload = {
  schemaVersion: 1;
  source: "browser-extension";
  capturedAt: string;
  page: {
    url: string;
    title: string;
  };
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    devicePixelRatio: number;
  };
  candidates: ScreenCandidate[];
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

export type GuidanceSessionStatus =
  | "active"
  | "waiting_for_user"
  | "blocked"
  | "completed"
  | "error";

export type GuidanceSessionTargetRecord = {
  stepIndex: number;
  recordedAt: string;
  target: TargetBox;
  instruction?: string;
  confidence?: number;
  providerMode?: GuidanceProviderMode;
};

export type GuidanceSessionContext = {
  id: string;
  originalGoal: string;
  currentStepIndex: number;
  status: GuidanceSessionStatus;
  previousTargets: TargetBox[];
  completedTargets: TargetBox[];
  failedTargets: TargetBox[];
};

export type GuidanceSessionVerification = {
  status: "untested" | "changed" | "unchanged" | "blocked";
  checkedAt?: string;
  message?: string;
};

export type GuidanceSession = {
  id: string;
  originalGoal: string;
  currentStepIndex: number;
  steps: GuidanceStep[];
  lastScreenshot?: ScreenshotMetadata | null;
  previousTargets: GuidanceSessionTargetRecord[];
  completedTargets: GuidanceSessionTargetRecord[];
  failedTargets: GuidanceSessionTargetRecord[];
  status: GuidanceSessionStatus;
  lastVerification?: GuidanceSessionVerification;
  createdAt: string;
  updatedAt: string;
};

export type GuidanceScreenContext = {
  display: DisplayContext;
  capture?: CaptureMetadata;
  screenshot?: ScreenshotMetadata;
  screenshotPayload?: {
    encoding: "base64";
    format: "png" | "jpeg";
    byteLength: number;
    imageWidth: number;
    imageHeight: number;
    imageBase64: string;
    sourceGeometry?: {
      imageWidth: number;
      imageHeight: number;
      format: "png" | "jpeg";
      region: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
    preprocessing?: {
      strategy: "passthrough" | "crop" | "resize" | "crop_resize" | "reencode";
      scaleX: number;
      scaleY: number;
      maxEdge: number;
      jpegQuality?: number;
    };
    crop?: {
      source: "active_window";
      appName?: string;
      title?: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  calibration?: CoordinateCalibration;
  candidates?: ScreenCandidate[];
  candidateSource?:
    | "manual"
    | "macos-accessibility"
    | "macos-vision-ocr"
    | "browser-extension"
    | "fused"
    | "none"
    | "unsupported"
    | "unavailable";
  candidateEvidence?: ScreenCandidateEvidence;
  candidateError?: string;
};

export type GuidanceRequest = {
  traceId?: string;
  goal: string;
  screen: GuidanceScreenContext;
  previousStep?: GuidanceStep | null;
  session?: GuidanceSessionContext;
};

export type GuidanceValidationIssue = {
  path: string;
  message: string;
};

export type GuidanceValidationResult = {
  valid: boolean;
  issues: GuidanceValidationIssue[];
};

export type GuidanceTraceStage =
  | "transcript"
  | "active_window"
  | "screenshot"
  | "candidates"
  | "provider"
  | "mapping"
  | "validation"
  | "render";

export type GuidanceTraceStageStatus =
  | "pending"
  | "completed"
  | "failed"
  | "skipped";

export type GuidanceTraceSource = "voice" | "manual" | "debug" | "session";

export type GuidanceTraceDetail = string | number | boolean | null;

export type GuidanceTraceEvent = {
  stage: GuidanceTraceStage;
  status: GuidanceTraceStageStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  summary?: string;
  details?: Record<string, GuidanceTraceDetail>;
};

export type GuidanceTrace = {
  schemaVersion: 1;
  id: string;
  goal: string;
  providerMode: GuidanceProviderMode;
  source: GuidanceTraceSource;
  startedAt: string;
  updatedAt: string;
  events: GuidanceTraceEvent[];
};

export type GuidanceProviderMode = "mock" | "real" | "ollama-vision" | "unavailable";

export type GuidanceProviderRequest = GuidanceRequest;

export type GuidanceProviderResponse = {
  mode: GuidanceProviderMode;
  traceId?: string;
  result?: GuidanceResult;
  error?: string;
  validation?: GuidanceValidationResult;
  providerName?: string;
  debug?: {
    vision?: {
      coordinateMode: "center" | "top_left";
      rawTarget?: {
        x?: number;
        y?: number;
        centerX?: number;
        centerY?: number;
        width?: number;
        height?: number;
        label?: string;
      };
      payload?: {
        imageWidth: number;
        imageHeight: number;
        crop?: {
          x: number;
          y: number;
          width: number;
          height: number;
          appName?: string;
          title?: string;
        };
      };
      screenshot?: {
        imageWidth: number;
        imageHeight: number;
      };
      display?: {
        width: number;
        height: number;
      };
      scale?: {
        imageToScreenshotX: number;
        imageToScreenshotY: number;
        screenshotToDisplayX: number;
        screenshotToDisplayY: number;
      };
      mappedBeforeTighten?: TargetBox;
      mappedFinal?: TargetBox;
    };
  };
};

export type WorkflowStepKind =
  | "click"
  | "type"
  | "select"
  | "wait"
  | "confirm"
  | "verify";

export type WorkflowStepStatus =
  | "pending"
  | "active"
  | "waiting_for_user"
  | "verifying"
  | "completed"
  | "blocked"
  | "skipped";

export type WorkflowStatus =
  | "idle"
  | "planning"
  | "active"
  | "paused"
  | "blocked"
  | "completed"
  | "cancelled"
  | "error";

export type WorkflowVerificationExpectation =
  | {
      type: "candidate_visible";
      label: string;
      role?: string;
    }
  | {
      type: "candidate_absent";
      label: string;
      role?: string;
    }
  | {
      type: "screen_changed";
      description: string;
    }
  | {
      type: "manual";
      description: string;
    };

export type WorkflowStep = {
  id: string;
  index: number;
  title: string;
  instruction: string;
  kind: WorkflowStepKind;
  status: WorkflowStepStatus;
  target?: TargetBox;
  expected?: WorkflowVerificationExpectation[];
  risk: RiskClass;
  requiresConfirmation: boolean;
};

export type WorkflowPlan = {
  id: string;
  goal: string;
  title: string;
  createdAt: string;
  steps: WorkflowStep[];
};

export type WorkflowVerificationResult = {
  status: "untested" | "passed" | "failed" | "blocked";
  checkedAt?: string;
  message?: string;
  matchedCandidateIds?: string[];
};

export type WorkflowRuntimeState = {
  status: WorkflowStatus;
  plan: WorkflowPlan | null;
  currentStepIndex: number;
  currentStepId?: string;
  lastVerification?: WorkflowVerificationResult;
  blockedReason?: string;
};

export type ClickAwarePermissionState =
  | "unknown"
  | "ready"
  | "unsupported"
  | "denied"
  | "error";

export type ClickAwareHitStatus =
  | "idle"
  | "armed"
  | "hit"
  | "miss"
  | "advancing"
  | "disabled"
  | "error";

export type ClickAwareNativeClick = {
  x: number;
  y: number;
  button: "left";
  timestampMs: number;
  source: "native-macos-coregraphics" | "unsupported";
};

export type ClickAwareRuntimeState = {
  enabled: boolean;
  armed: boolean;
  permission: ClickAwarePermissionState;
  status: ClickAwareHitStatus;
  targetId?: string;
  targetLabel?: string;
  hitPadding: number;
  lastClick?: ClickAwareNativeClick;
  lastHit?: {
    status: "hit" | "miss";
    targetId?: string;
    targetLabel?: string;
    distanceFromCenter: number;
    checkedAt: string;
  };
  message?: string;
};

export type SafetyPolicyAction = "allow" | "confirm" | "clarify" | "block";

export type SafetyPolicyReason =
  | "safe_navigation"
  | "form_entry_notice"
  | "risky_action"
  | "unknown_risk"
  | "low_confidence"
  | "missing_step"
  | "missing_target"
  | "invalid_target"
  | "provider_unavailable"
  | "validation_failed";

export type SafetyPolicyDecision = {
  action: SafetyPolicyAction;
  reason: SafetyPolicyReason;
  risk: RiskClass;
  requiresConfirmation: boolean;
  message: string;
  details?: string[];
};

export type SafetyPolicyInput = {
  provider: GuidanceProviderResponse;
  minConfidence: number;
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

export type VoicePermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported"
  | "error";

export type VoiceRuntimeStatus =
  | "idle"
  | "requesting_microphone"
  | "listening"
  | "transcribing"
  | "command_ready"
  | "no_speech"
  | "cancelled"
  | "error";

export type VoiceActivationSource = "settings" | "debug" | "gesture" | "hotkey";

export type VoiceTranscript = {
  text: string;
  confidence?: number;
  isFinal: boolean;
  updatedAt: string;
  traceId?: string;
};

export type VoiceCommandRequest = {
  text: string;
  source: VoiceActivationSource | "debug_text";
  createdAt: string;
  traceId?: string;
};

export type VoiceRuntimeState = {
  enabled: boolean;
  permission: VoicePermissionState;
  status: VoiceRuntimeStatus;
  activationSource?: VoiceActivationSource;
  transcript?: VoiceTranscript;
  pendingCommand?: VoiceCommandRequest;
  error?: string;
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

export type ActiveWindowBounds = {
  appName?: string | null;
  title?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
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

export type ActiveWindowCaptureSnapshot = {
  snapshotId: string;
  startedAtMs: number;
  windowObservedAtMs: number;
  captureStartedAtMs: number;
  completedAtMs: number;
  windowToCaptureDelayMs: number;
  window: ActiveWindowBounds;
  metadata: CaptureMetadata;
  screenshot: ScreenshotCapture;
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

export type UiElementSource =
  | "browser-dom"
  | "ocr"
  | "accessibility"
  | "manual"
  | "vision"
  | "screenshot";

export type UiElementRole =
  | ScreenCandidate["role"]
  | "text"
  | "image"
  | "region"
  | "window"
  | "unknown";

export type UiElementProvenance = {
  source: UiElementSource;
  sourceId?: string;
  capturedAt?: string;
  confidence?: number;
  notes?: string;
};

export type UiElementRanking = {
  score: number;
  position?: number;
  reasons: string[];
};

export type UiElement = {
  id: string;
  primarySource: UiElementSource;
  sources: UiElementProvenance[];
  role: UiElementRole;
  label: string;
  alternateLabels?: string[];
  bounds: Bounds;
  confidence: number;
  visible: boolean;
  interactable?: boolean;
  risky?: boolean;
  sourceCandidateIds?: string[];
  rank?: UiElementRanking;
  metadata?: Record<string, string | number | boolean | null>;
};
