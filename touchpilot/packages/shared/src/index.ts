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
    | "vision_control"
    | "manual";
  source?: "accessibility" | "ocr" | "dom" | "manual";
  rank?: {
    position?: number;
    score: number;
    /**
     * How much of the score came from matching the request, rather than from
     * being a plausible-looking control.
     *
     * Kept apart because the two answer different questions, and only the
     * second one -- "is this anything to do with what was asked" -- justifies a
     * place in a list of twenty. When every candidate scores the same, the
     * ordering is arbitrary, and something other than arbitrary has to decide.
     */
    relevance?: number;
    reasons: string[];
  };
  metadata?: Record<string, string | number | boolean | null>;
};

export type TargetEvidenceSource =
  | "dom"
  | "accessibility"
  | "ocr"
  | "manual"
  | "vision";

export type GuidanceCommandIntent = {
  objective: string;
  action: string | null;
  object: string | null;
  actions: string[];
  objects: string[];
};

export type TargetSupportingEvidence = {
  candidateId: string;
  label: string;
  resolvedLabel: string;
  role: ScreenCandidate["role"];
  source: TargetEvidenceSource;
  semanticText: string;
  matchedActions: string[];
  matchedObjects: string[];
  rankScore?: number;
  rankReasons: string[];
};

export type TargetVerificationTrace = {
  status: "accepted" | "rejected";
  source: TargetEvidenceSource;
  match: "candidate_id" | "spatial_candidate" | "vision_only";
  candidateId?: string;
  candidateRole?: ScreenCandidate["role"];
  clickPoint?: {
    x: number;
    y: number;
  };
  inputTarget: TargetBox;
  verifiedTarget?: TargetBox;
  commandIntent: GuidanceCommandIntent;
  supportingEvidence?: TargetSupportingEvidence;
  groundingScore: number;
  groundingThreshold: number;
  groundingVerdict: "grounded" | "rejected";
  reasons: string[];
};

export type RawProviderTarget = {
  candidateId?: string;
  x?: number;
  y?: number;
  centerX?: number;
  centerY?: number;
  width?: number;
  height?: number;
  label?: string;
};

export type RawProviderOutputTrace = {
  rawAnswer?: string;
  label?: string;
  reason?: string;
  confidence?: number;
  risk?: RiskClass;
  target?: RawProviderTarget;
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

export type GuidanceTaskPlanSource =
  | "single_step_fallback"
  | "planner"
  | "workflow";

export type GuidanceTaskPlanStep = {
  id: string;
  index: number;
  objective: string;
};

export type GuidanceTaskPlan = {
  id: string;
  originalGoal: string;
  source: GuidanceTaskPlanSource;
  steps: GuidanceTaskPlanStep[];
  createdAt: string;
};

export type GuidanceLocalizationContext = {
  planId: string;
  originalGoal: string;
  currentStepId: string;
  currentStepIndex: number;
  totalSteps: number;
  objective: string;
};

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
  taskPlan: GuidanceTaskPlan;
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
  localization?: GuidanceLocalizationContext;
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

export type GuidanceProviderMode =
  | "mock"
  | "real"
  | "gemini"
  | "unavailable";

export type GuidanceProviderRequest = GuidanceRequest;

/**
 * One offer, when Toki could not find what was asked for.
 *
 * Carries a real target rather than a name, so accepting one costs nothing:
 * the box is already located and can be pointed at immediately, without asking
 * the model a second question about a screen it has already read.
 */
export type GuidanceSuggestion = {
  target: TargetBox;
  /** One short sentence, written to the person, on why this might be it. */
  reason?: string;
};

export type GuidanceProviderResponse = {
  mode: GuidanceProviderMode;
  traceId?: string;
  result?: GuidanceResult;
  error?: string;
  validation?: GuidanceValidationResult;
  providerName?: string;
  /**
   * Whether this failure is worth asking somebody else about.
   *
   * "I will not" and "I cannot" are different sentences. A service refusing
   * because somebody is signed out or unsubscribed is a decision, and routing
   * around it would hand out what has not been paid for. A service that cannot
   * answer -- misconfigured, unreachable, out of credentials -- has not decided
   * anything, and reporting "Toki cannot see your screen" while a working key
   * sits unused is simply wrong.
   */
  canFallBack?: boolean;
  /**
   * What else is on screen, when the asked-for thing is not.
   *
   * Present only on a failure that knows why it failed. Somebody who has just
   * opened an application does not know its words for things, so "that is not
   * here" is a dead end where "that is not here, but these three are and one of
   * them is probably what you meant" is an answer.
   */
  suggestions?: GuidanceSuggestion[];
  debug?: {
    providerOutput?: RawProviderOutputTrace;
    targetVerification?: TargetVerificationTrace;
    vision?: {
      coordinateMode: "candidate" | "center" | "top_left";
      rawTarget?: RawProviderTarget;
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
  | "sensitive_guidance_warning"
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

export type HandTrackId = string;

export type GestureHandRole = "unassigned" | "pointer" | "control";

export type TrackedHandLandmarkFrame = HandLandmarkFrame & {
  trackId: HandTrackId;
  sequence: number;
  trackingConfidence: number;
  lastSeenAt: string;
};

export type MultiHandLandmarkFrame = {
  frameId: number;
  capturedAt: string;
  sourceWidth: number;
  sourceHeight: number;
  mirrored: boolean;
  hands: TrackedHandLandmarkFrame[];
};

export type NormalizedGesturePoint = {
  x: number;
  y: number;
};

export type DisplayGesturePoint = {
  displayId: string;
  x: number;
  y: number;
};

export type PointerPosePhase = "inactive" | "candidate" | "active" | "recovering";

export type GesturePointerSample = {
  handTrackId: HandTrackId;
  phase: PointerPosePhase;
  normalized: NormalizedGesturePoint;
  display: DisplayGesturePoint;
  confidence: number;
  sourceFrameId: number;
  capturedAt: string;
};

export type AirTapPhase =
  | "idle"
  | "pressing"
  | "released"
  | "armed"
  | "locked"
  | "cooldown"
  | "cancelled";

export type AirTapCycle = {
  id: string;
  handTrackId: HandTrackId;
  pressedAt: string;
  releasedAt: string;
  sourceFrameIds: number[];
  confidence: number;
};

export type DoubleAirTapState = {
  phase: AirTapPhase;
  firstTap?: AirTapCycle;
  secondTap?: AirTapCycle;
  graceUntil?: string;
};

export type PointerEvidenceFingerprint = {
  snapshotId: string;
  capturedAt: string;
  activeWindowId?: string;
  captureId?: string;
  candidateId?: string;
  regionHash?: string;
};

export type PointerLockStatus = "locked" | "stale" | "invalidated";

export type PointerLockSnapshot = {
  readonly id: string;
  readonly status: "locked";
  readonly lockedAt: string;
  readonly pointer: Readonly<GesturePointerSample>;
  readonly evidence: Readonly<PointerEvidenceFingerprint>;
  readonly display: Readonly<{
    id: string;
    width: number;
    height: number;
    scaleFactor: number;
  }>;
};

export type GestureDerivedStatistic = {
  median: number;
  medianAbsoluteDeviation: number;
  sampleCount: number;
};

export type GestureTimingPolicy = {
  humanGraceMs: number;
  doubleTapMaxGapMs: number;
  trackingLossGraceMs: number;
  lockFreshnessMaxAgeMs: number;
};

export type AdaptiveGestureProfile = {
  version: 1;
  profileId: string;
  createdAt: string;
  updatedAt: string;
  preferredPointerHand: Handedness;
  timing: GestureTimingPolicy;
  pointRangeX: GestureDerivedStatistic;
  pointRangeY: GestureDerivedStatistic;
  tapFlexion: GestureDerivedStatistic;
  pinchDistance: GestureDerivedStatistic;
};

export type GestureInteractionMode =
  | "disabled"
  | "idle"
  | "pointing"
  | "tap_armed"
  | "target_locked"
  | "voice_held"
  | "explaining"
  | "paused"
  | "recovering"
  | "error";

export type GestureInteractionState = {
  version: 1;
  mode: GestureInteractionMode;
  handRoles: Partial<Record<HandTrackId, GestureHandRole>>;
  pointer: GesturePointerSample | null;
  tap: DoubleAirTapState;
  lock: PointerLockSnapshot | null;
  activeProfileId: string | null;
  lastTransitionAt: string;
  recoveryDeadline?: string;
  error?: string;
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

export type GestureVoiceContext = {
  readonly sessionId: string;
  readonly controlHandTrackId: HandTrackId;
  readonly startedAt: string;
  readonly lock: PointerLockSnapshot;
};

export type VoiceCommandRequest = {
  text: string;
  source: VoiceActivationSource | "debug_text";
  createdAt: string;
  traceId?: string;
  gestureContext?: GestureVoiceContext;
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
  bundleIdentifier?: string | null;
  ownerProcessId?: number | null;
  windowNumber?: number | null;
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
