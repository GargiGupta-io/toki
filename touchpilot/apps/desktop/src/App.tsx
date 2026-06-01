import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  createInvalidMockGuidance,
  createMockGuidance,
  createRiskyMockGuidance,
  validateGuidanceResult,
} from "@touchpilot/ai";
import type {
  CaptureMetadata,
  CoordinateCalibration,
  GuidanceRequest,
  GuidanceResult,
  GuidanceStep,
  GuidanceValidationIssue,
  TargetBox,
  ScreenshotCapture,
  ScreenshotMetadata,
} from "@touchpilot/shared";
import { getPuckMotionModel } from "./puckMotion";
import type { OverlayState, PuckMotionModel } from "./puckMotion";
import "./App.css";

type GuidanceFixture = "safe" | "risky" | "invalid";

type ViewportMetrics = {
  width: number;
  height: number;
  devicePixelRatio: number;
  updatedAt: string;
};

type OverlayStateMeta = {
  label: string;
  title: string;
  description: string;
  tone: "neutral" | "active" | "paused" | "error";
};

const overlayStates: OverlayState[] = [
  "idle",
  "listening",
  "thinking",
  "guiding",
  "paused",
  "error",
];

const testTarget = {
  label: "Export",
  x: 640,
  y: 360,
  width: 112,
  height: 48,
  instruction: "Click Export to continue this workflow.",
};

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

function AssistantPuck({
  state,
  motion,
}: {
  state: OverlayState;
  motion: PuckMotionModel;
}) {
  const meta = stateMeta[state];

  return (
    <button
      className={`assistant-puck is-${meta.tone}`}
      data-motion={motion.state}
      data-target-droplets={motion.canSendTargetDroplets ? "enabled" : "disabled"}
      type="button"
      aria-label={`TouchPilot is ${meta.label.toLowerCase()}`}
    >
      <span className="puck-orbit" aria-hidden="true" />
      <span className="puck-droplets" aria-hidden="true">
        <span className="puck-droplet puck-droplet-a" />
        <span className="puck-droplet puck-droplet-b" />
        <span className="puck-droplet puck-droplet-c" />
        <span className="puck-droplet puck-droplet-d" />
      </span>
      <span className="puck-core">TP</span>
      <span className="puck-status">
        <span className="puck-status-dot" aria-hidden="true" />
        {meta.label}
      </span>
    </button>
  );
}

function PointerRing({ target }: { target: TargetBox }) {
  return (
    <div
      className="pointer-target"
      style={{
        left: target.x,
        top: target.y,
        width: target.width,
        height: target.height,
      }}
      aria-label={`Target marker for ${target.label}`}
    >
      <span className="pointer-pulse" aria-hidden="true" />
      <span className="pointer-crosshair" aria-hidden="true" />
    </div>
  );
}

function StepBubble({
  step,
  target,
  guidance,
}: {
  step: GuidanceStep | null;
  target: RenderedGuidanceTarget;
  guidance: GuidanceResult | null;
}) {
  const risk = guidance?.step?.risk ?? "safe_navigation";
  const requiresConfirmation = guidance?.step?.requiresConfirmation ?? false;

  return (
    <aside
      className="step-bubble"
      style={{
        left: target.x + target.width / 2 + 22,
        top: target.y - target.height / 2,
      }}
      aria-label={`Guidance step for ${target.label}`}
    >
      <span className="bubble-anchor" aria-hidden="true" />
      <p className="eyebrow">Step 1</p>
      <h3>{target.label}</h3>
      <p>{step?.instruction ?? target.instruction}</p>
      <div
        className="risk-strip"
        data-confirmation={requiresConfirmation ? "required" : "not-required"}
      >
        <span>{risk}</span>
        <strong>{requiresConfirmation ? "Confirm first" : "No confirmation"}</strong>
      </div>
    </aside>
  );
}

function DebugPanel({
  currentState,
  target,
  hasAcceptedGuidance,
  captureMetadata,
  screenshotCapture,
  guidanceRequest,
  guidanceResult,
  guidanceFixture,
  calibration,
  viewport,
  guidanceIssues,
  captureError,
  isRefreshingCapture,
  onStateChange,
  onGuidanceFixtureChange,
  onRefreshCapture,
}: {
  currentState: OverlayState;
  target: RenderedGuidanceTarget;
  hasAcceptedGuidance: boolean;
  captureMetadata: CaptureMetadata | null;
  screenshotCapture: ScreenshotCapture | null;
  guidanceRequest: GuidanceRequest | null;
  guidanceResult: GuidanceResult | null;
  guidanceFixture: GuidanceFixture;
  calibration: CoordinateCalibration;
  viewport: ViewportMetrics;
  guidanceIssues: GuidanceValidationIssue[];
  captureError: string | null;
  isRefreshingCapture: boolean;
  onStateChange: (state: OverlayState) => void;
  onGuidanceFixtureChange: (fixture: GuidanceFixture) => void;
  onRefreshCapture: () => void;
}) {
  return (
    <section className="debug-panel" aria-label="Overlay debug controls">
      <div>
        <p className="eyebrow">Debug</p>
        <h2>Overlay test controls</h2>
      </div>

      <button
        className="capture-refresh-button"
        type="button"
        onClick={onRefreshCapture}
        disabled={isRefreshingCapture}
      >
        {isRefreshingCapture ? "Refreshing capture" : "Refresh capture"}
      </button>

      <div className="fixture-switcher" aria-label="Guidance QA fixture">
        <span>Guidance fixture</span>
        <div>
          <button
            className="fixture-button"
            data-active={guidanceFixture === "safe"}
            type="button"
            onClick={() => onGuidanceFixtureChange("safe")}
          >
            Safe
          </button>
          <button
            className="fixture-button"
            data-active={guidanceFixture === "risky"}
            type="button"
            onClick={() => onGuidanceFixtureChange("risky")}
          >
            Risky
          </button>
          <button
            className="fixture-button"
            data-active={guidanceFixture === "invalid"}
            type="button"
            onClick={() => onGuidanceFixtureChange("invalid")}
          >
            Invalid
          </button>
        </div>
      </div>

      <div className="capture-status" data-status={captureError ? "error" : "ok"}>
        <span>{captureError ? "Capture error" : "Capture ready"}</span>
        <p>{captureError ?? "Latest capture request completed without errors."}</p>
      </div>

      <div className="debug-grid" role="group" aria-label="Set overlay state">
        {overlayStates.map((state) => (
          <button
            className="debug-state-button"
            data-active={state === currentState}
            key={state}
            type="button"
            onClick={() => onStateChange(state)}
          >
            {stateMeta[state].label}
          </button>
        ))}
      </div>

      <dl className="debug-readout">
        <div>
          <dt>Target</dt>
          <dd>{hasAcceptedGuidance ? target.label : "None accepted"}</dd>
        </div>
        <div>
          <dt>X/Y</dt>
          <dd>{hasAcceptedGuidance ? `${target.x}, ${target.y}` : "Waiting"}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{hasAcceptedGuidance ? `${target.width} x ${target.height}` : "Waiting"}</dd>
        </div>
      </dl>

      <dl className="capture-readout">
        <div>
          <dt>Display</dt>
          <dd>
            {captureMetadata
              ? `${captureMetadata.display.width} x ${captureMetadata.display.height}`
              : "Waiting"}
          </dd>
        </div>
        <div>
          <dt>Scale</dt>
          <dd>{captureMetadata?.display.scaleFactor ?? "Waiting"}</dd>
        </div>
        <div>
          <dt>Cursor</dt>
          <dd>
            {captureMetadata?.cursor
              ? `${captureMetadata.cursor.x}, ${captureMetadata.cursor.y}`
              : "Unknown"}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{captureMetadata?.source ?? "Waiting"}</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>{captureMetadata?.activeWindow?.title ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{captureMetadata?.capturedAt ?? "Waiting"}</dd>
        </div>
      </dl>

      <dl className="calibration-readout">
        <div>
          <dt>Calibration</dt>
          <dd>{calibration.status}</dd>
        </div>
        <div>
          <dt>Overlay</dt>
          <dd>
            {calibration.overlayWidth} x {calibration.overlayHeight}
          </dd>
        </div>
        <div>
          <dt>Display</dt>
          <dd>
            {calibration.displayWidth} x {calibration.displayHeight}
          </dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{calibration.notes ?? "No notes"}</dd>
        </div>
      </dl>

      <dl className="viewport-readout">
        <div>
          <dt>Viewport</dt>
          <dd>
            {viewport.width} x {viewport.height}
          </dd>
        </div>
        <div>
          <dt>DPR</dt>
          <dd>{viewport.devicePixelRatio}</dd>
        </div>
        <div>
          <dt>Delta</dt>
          <dd>
            {captureMetadata
              ? `${viewport.width - captureMetadata.display.width}, ${
                  viewport.height - captureMetadata.display.height
                }`
              : "Waiting"}
          </dd>
        </div>
        <div>
          <dt>Resized</dt>
          <dd>{viewport.updatedAt}</dd>
        </div>
      </dl>

      <dl className="screenshot-readout">
        <div>
          <dt>Shot size</dt>
          <dd>
            {screenshotCapture
              ? `${screenshotCapture.imageWidth} x ${screenshotCapture.imageHeight}`
              : "Waiting"}
          </dd>
        </div>
        <div>
          <dt>Bytes</dt>
          <dd>{screenshotCapture?.byteLength ?? "Waiting"}</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>{screenshotCapture?.format ?? "Waiting"}</dd>
        </div>
        <div>
          <dt>Image data</dt>
          <dd>{screenshotCapture?.imageBase64 ? "Present" : "Missing"}</dd>
        </div>
      </dl>

      <dl className="guidance-request-readout">
        <div>
          <dt>Goal</dt>
          <dd>{guidanceRequest?.goal ?? "Waiting"}</dd>
        </div>
        <div>
          <dt>Request shot</dt>
          <dd>
            {guidanceRequest?.screen.screenshot
              ? `${guidanceRequest.screen.screenshot.imageWidth} x ${guidanceRequest.screen.screenshot.imageHeight}`
              : "Waiting"}
          </dd>
        </div>
        <div>
          <dt>Request bytes</dt>
          <dd>{guidanceRequest?.screen.screenshot?.byteLength ?? "Waiting"}</dd>
        </div>
        <div>
          <dt>Previous</dt>
          <dd>{guidanceRequest?.previousStep?.target?.label ?? "None"}</dd>
        </div>
      </dl>

      <dl className="guidance-risk-readout">
        <div>
          <dt>Risk</dt>
          <dd>{guidanceResult?.step?.risk ?? "Waiting"}</dd>
        </div>
        <div>
          <dt>Confirm</dt>
          <dd>{guidanceResult?.step?.requiresConfirmation ? "Required" : "Not required"}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>
            {guidanceResult?.step
              ? `${Math.round(guidanceResult.step.confidence * 100)}%`
              : "Waiting"}
          </dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{guidanceResult?.mode ?? "Waiting"}</dd>
        </div>
      </dl>

      {guidanceResult?.step?.requiresConfirmation && (
        <div className="confirmation-warning" role="status">
          <span>Confirmation required</span>
          <p>This guidance touches a risky action and must be approved before execution.</p>
        </div>
      )}

      {!guidanceResult?.step?.requiresConfirmation && guidanceResult && (
        <div className="confirmation-ready" role="status">
          <span>Safe navigation</span>
          <p>This guidance can be shown without a confirmation gate.</p>
        </div>
      )}

      <div className="confirmation-actions" aria-label="Confirmation controls">
        <button
          className="confirmation-button"
          type="button"
          disabled={!guidanceResult?.step?.requiresConfirmation}
        >
          Confirm
        </button>
        <button
          className="confirmation-button confirmation-button-secondary"
          type="button"
          disabled={!guidanceResult?.step?.requiresConfirmation}
        >
          Decline
        </button>
      </div>

      {guidanceIssues.length > 0 && (
        <div className="guidance-issues" role="status">
          <span>Guidance rejected</span>
          <ul>
            {guidanceIssues.map((issue) => (
              <li key={`${issue.path}-${issue.message}`}>
                {issue.path}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {screenshotCapture?.imageBase64 && (
        <figure className="screenshot-preview">
          <img
            src={`data:image/${screenshotCapture.format};base64,${screenshotCapture.imageBase64}`}
            alt="Latest debug screenshot capture"
          />
          <figcaption>Debug screenshot preview</figcaption>
        </figure>
      )}
    </section>
  );
}

function getViewportMetrics(): ViewportMetrics {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    updatedAt: new Date().toISOString(),
  };
}

function getCalibration(
  captureMetadata: CaptureMetadata | null,
  viewport: ViewportMetrics,
): CoordinateCalibration {
  const overlayWidth = viewport.width;
  const overlayHeight = viewport.height;
  const displayWidth = captureMetadata?.display.width ?? 0;
  const displayHeight = captureMetadata?.display.height ?? 0;
  const scaleFactor = captureMetadata?.display.scaleFactor ?? 1;

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

  return {
    status: sizeMatches && scaleMatches ? "aligned" : "needs_check",
    overlayWidth,
    overlayHeight,
    displayWidth,
    displayHeight,
    scaleFactor,
    checkedAt: new Date().toISOString(),
    notes:
      sizeMatches && scaleMatches
        ? "Overlay viewport matches captured display dimensions and scale."
        : `Overlay/display mismatch. Delta ${overlayWidth - displayWidth}, ${
            overlayHeight - displayHeight
          }; DPR ${viewport.devicePixelRatio} vs capture scale ${scaleFactor}.`,
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

function App() {
  const [overlayState, setOverlayState] = useState<OverlayState>("guiding");
  const [guidanceFixture, setGuidanceFixture] = useState<GuidanceFixture>("safe");
  const [captureMetadata, setCaptureMetadata] = useState<CaptureMetadata | null>(null);
  const [screenshotCapture, setScreenshotCapture] = useState<ScreenshotCapture | null>(null);
  const [guidanceRequest, setGuidanceRequest] = useState<GuidanceRequest | null>(null);
  const [guidanceResult, setGuidanceResult] = useState<GuidanceResult | null>(null);
  const [guidanceIssues, setGuidanceIssues] = useState<GuidanceValidationIssue[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);
  const [viewport, setViewport] = useState<ViewportMetrics>(() => getViewportMetrics());
  const meta = stateMeta[overlayState];
  const isPaused = overlayState === "paused";
  const calibration = getCalibration(captureMetadata, viewport);
  const activeStep = guidanceResult?.step ?? null;
  const acceptedStep = activeStep?.target != null ? activeStep : null;
  const acceptedTarget = acceptedStep?.target ?? null;
  const hasAcceptedGuidance = acceptedTarget != null;
  const activeTarget: RenderedGuidanceTarget =
    acceptedTarget != null && acceptedStep != null
      ? {
          ...acceptedTarget,
          instruction: acceptedStep.instruction,
        }
      : testTarget;
  const puckMotion = getPuckMotionModel({
    overlayState,
    hasAcceptedGuidance,
    hasActiveTarget: acceptedTarget != null,
    isRefreshingCapture,
    hasCaptureError: captureError != null,
    guidanceIssueCount: guidanceIssues.length,
  });

  async function refreshCaptureMetadata() {
    setIsRefreshingCapture(true);
    setCaptureError(null);
    setGuidanceIssues([]);
    setGuidanceRequest(null);
    setGuidanceResult(null);
    setCaptureMetadata(null);
    setScreenshotCapture(null);
    setOverlayState("thinking");

    try {
      const [metadata, screenshot] = await Promise.all([
        invoke<CaptureMetadata>("capture_metadata"),
        invoke<ScreenshotCapture>("capture_screenshot"),
      ]);

      setCaptureMetadata(metadata);
      setScreenshotCapture(screenshot);
      const nextGuidanceRequest: GuidanceRequest = {
        goal: "Show me what to click next.",
        screen: {
          display: metadata.display,
          capture: metadata,
          screenshot: getScreenshotMetadata(screenshot),
          calibration: getCalibration(metadata, viewport),
        },
        previousStep: guidanceResult?.step ?? null,
      };
      const nextGuidance =
        guidanceFixture === "invalid"
          ? createInvalidMockGuidance(nextGuidanceRequest)
          : guidanceFixture === "risky"
            ? createRiskyMockGuidance(nextGuidanceRequest)
            : createMockGuidance(nextGuidanceRequest);
      const validation = validateGuidanceResult(nextGuidance);

      setGuidanceRequest(nextGuidanceRequest);
      setGuidanceIssues(validation.issues);
      setGuidanceResult(validation.valid ? nextGuidance : null);
      setOverlayState(validation.valid ? "guiding" : "error");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCaptureError(message);
      setGuidanceRequest(null);
      setGuidanceIssues([]);
      setGuidanceResult(null);
      setOverlayState("error");
    } finally {
      setIsRefreshingCapture(false);
    }
  }

  useEffect(() => {
    refreshCaptureMetadata();
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

  function pauseGuidance() {
    setOverlayState("paused");
  }

  function resumeGuidance() {
    setOverlayState("guiding");
  }

  function stopGuidance() {
    setOverlayState("idle");
  }

  return (
    <main
      className={`overlay-shell is-${meta.tone}`}
      aria-label="TouchPilot overlay prototype"
    >
      <section className="status-rail" aria-label="Assistant status">
        <div className="brand-mark">TP</div>
        <div>
          <p className="eyebrow">TouchPilot</p>
          <h1>Overlay prototype</h1>
        </div>
      </section>

      <section className="guidance-surface" aria-label="Current guidance">
        <div className="surface-header">
          <span className="state-pill">{meta.label}</span>
          <span className="coordinate-readout">
            {hasAcceptedGuidance
              ? `Target: ${activeTarget.x}, ${activeTarget.y}`
              : "Target: none accepted"}
          </span>
        </div>

        <div className="instruction-panel">
          <p className="eyebrow">Next step</p>
          <h2>{meta.title}</h2>
          <p>{meta.description}</p>

          <div className="control-row" aria-label="Overlay controls">
            <button
              className="control-button"
              type="button"
              onClick={isPaused ? resumeGuidance : pauseGuidance}
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              className="control-button control-button-secondary"
              type="button"
              onClick={stopGuidance}
            >
              Stop
            </button>
          </div>
        </div>
      </section>

      {overlayState !== "idle" && hasAcceptedGuidance && (
        <>
          <PointerRing target={activeTarget} />
          <StepBubble step={activeStep} target={activeTarget} guidance={guidanceResult} />
        </>
      )}
      <AssistantPuck state={overlayState} motion={puckMotion} />
      <DebugPanel
        currentState={overlayState}
        target={activeTarget}
        hasAcceptedGuidance={hasAcceptedGuidance}
        captureMetadata={captureMetadata}
        screenshotCapture={screenshotCapture}
        guidanceRequest={guidanceRequest}
        guidanceResult={guidanceResult}
        guidanceFixture={guidanceFixture}
        calibration={calibration}
        viewport={viewport}
        guidanceIssues={guidanceIssues}
        captureError={captureError}
        isRefreshingCapture={isRefreshingCapture}
        onStateChange={setOverlayState}
        onGuidanceFixtureChange={setGuidanceFixture}
        onRefreshCapture={refreshCaptureMetadata}
      />
    </main>
  );
}

export default App;
