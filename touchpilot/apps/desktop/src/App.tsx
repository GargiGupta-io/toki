import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createMockGuidance } from "@touchpilot/ai";
import type {
  CaptureMetadata,
  CoordinateCalibration,
  GuidanceResult,
  ScreenshotCapture,
} from "@touchpilot/shared";
import "./App.css";

type OverlayState = "idle" | "listening" | "thinking" | "guiding" | "paused" | "error";

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

function AssistantPuck({ state }: { state: OverlayState }) {
  const meta = stateMeta[state];

  return (
    <button
      className={`assistant-puck is-${meta.tone}`}
      type="button"
      aria-label={`TouchPilot is ${meta.label.toLowerCase()}`}
    >
      <span className="puck-orbit" aria-hidden="true" />
      <span className="puck-core">TP</span>
      <span className="puck-status">
        <span className="puck-status-dot" aria-hidden="true" />
        {meta.label}
      </span>
    </button>
  );
}

function PointerRing({ target }: { target: typeof testTarget }) {
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

function StepBubble({ target }: { target: typeof testTarget }) {
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
      <p>{target.instruction}</p>
    </aside>
  );
}

function DebugPanel({
  currentState,
  target,
  captureMetadata,
  screenshotCapture,
  calibration,
  captureError,
  isRefreshingCapture,
  onStateChange,
  onRefreshCapture,
}: {
  currentState: OverlayState;
  target: typeof testTarget;
  captureMetadata: CaptureMetadata | null;
  screenshotCapture: ScreenshotCapture | null;
  calibration: CoordinateCalibration;
  captureError: string | null;
  isRefreshingCapture: boolean;
  onStateChange: (state: OverlayState) => void;
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
          <dd>{target.label}</dd>
        </div>
        <div>
          <dt>X/Y</dt>
          <dd>
            {target.x}, {target.y}
          </dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>
            {target.width} x {target.height}
          </dd>
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

function getCalibration(captureMetadata: CaptureMetadata | null): CoordinateCalibration {
  const overlayWidth = window.innerWidth;
  const overlayHeight = window.innerHeight;
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

  return {
    status: sizeMatches ? "aligned" : "needs_check",
    overlayWidth,
    overlayHeight,
    displayWidth,
    displayHeight,
    scaleFactor,
    checkedAt: new Date().toISOString(),
    notes: sizeMatches
      ? "Overlay viewport matches captured display dimensions."
      : "Overlay viewport differs from captured display dimensions.",
  };
}

function App() {
  const [overlayState, setOverlayState] = useState<OverlayState>("guiding");
  const [captureMetadata, setCaptureMetadata] = useState<CaptureMetadata | null>(null);
  const [screenshotCapture, setScreenshotCapture] = useState<ScreenshotCapture | null>(null);
  const [guidanceResult, setGuidanceResult] = useState<GuidanceResult | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isRefreshingCapture, setIsRefreshingCapture] = useState(false);
  const meta = stateMeta[overlayState];
  const isPaused = overlayState === "paused";
  const calibration = getCalibration(captureMetadata);

  async function refreshCaptureMetadata() {
    setIsRefreshingCapture(true);
    setCaptureError(null);

    try {
      const [metadata, screenshot] = await Promise.all([
        invoke<CaptureMetadata>("capture_metadata"),
        invoke<ScreenshotCapture>("capture_screenshot"),
      ]);

      setCaptureMetadata(metadata);
      setScreenshotCapture(screenshot);
      setGuidanceResult(
        createMockGuidance({
          goal: "Show me what to click next.",
          screen: {
            display: metadata.display,
            capture: metadata,
            screenshot,
            calibration: getCalibration(metadata),
          },
          previousStep: guidanceResult?.step ?? null,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCaptureError(message);
      setOverlayState("error");
    } finally {
      setIsRefreshingCapture(false);
    }
  }

  useEffect(() => {
    refreshCaptureMetadata();
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
            Target: {testTarget.x}, {testTarget.y}
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

      {overlayState !== "idle" && (
        <>
          <PointerRing target={testTarget} />
          <StepBubble target={testTarget} />
        </>
      )}
      <AssistantPuck state={overlayState} />
      <DebugPanel
        currentState={overlayState}
        target={testTarget}
        captureMetadata={captureMetadata}
        screenshotCapture={screenshotCapture}
        calibration={calibration}
        captureError={captureError}
        isRefreshingCapture={isRefreshingCapture}
        onStateChange={setOverlayState}
        onRefreshCapture={refreshCaptureMetadata}
      />
    </main>
  );
}

export default App;
