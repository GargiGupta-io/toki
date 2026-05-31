import { useState } from "react";
import "./App.css";

type OverlayState = "idle" | "listening" | "thinking" | "guiding" | "paused" | "error";

type OverlayStateMeta = {
  label: string;
  title: string;
  description: string;
  tone: "neutral" | "active" | "paused" | "error";
};

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

function App() {
  const [overlayState, setOverlayState] = useState<OverlayState>("guiding");
  const meta = stateMeta[overlayState];
  const isPaused = overlayState === "paused";

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
    </main>
  );
}

export default App;
