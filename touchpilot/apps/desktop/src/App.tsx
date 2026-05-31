import "./App.css";

type OverlayState = "idle" | "listening" | "thinking" | "guiding" | "paused" | "error";

type OverlayStateMeta = {
  label: string;
  title: string;
  description: string;
  tone: "neutral" | "active" | "paused" | "error";
};

const overlayState: OverlayState = "idle";

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

function App() {
  const meta = stateMeta[overlayState];

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
          <span className="coordinate-readout">Target: 640, 360</span>
        </div>

        <div className="instruction-panel">
          <p className="eyebrow">Next step</p>
          <h2>{meta.title}</h2>
          <p>{meta.description}</p>
        </div>
      </section>

      <AssistantPuck state={overlayState} />
    </main>
  );
}

export default App;
