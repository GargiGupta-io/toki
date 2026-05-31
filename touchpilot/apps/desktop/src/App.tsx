import "./App.css";

function AssistantPuck() {
  return (
    <button className="assistant-puck" type="button" aria-label="Open TouchPilot">
      <span className="puck-orbit" aria-hidden="true" />
      <span className="puck-core">TP</span>
      <span className="puck-status">
        <span className="puck-status-dot" aria-hidden="true" />
        Idle
      </span>
    </button>
  );
}

function App() {
  return (
    <main className="overlay-shell" aria-label="TouchPilot overlay prototype">
      <section className="status-rail" aria-label="Assistant status">
        <div className="brand-mark">TP</div>
        <div>
          <p className="eyebrow">TouchPilot</p>
          <h1>Overlay prototype</h1>
        </div>
      </section>

      <section className="guidance-surface" aria-label="Current guidance">
        <div className="surface-header">
          <span className="state-pill">Idle</span>
          <span className="coordinate-readout">Target: 640, 360</span>
        </div>

        <div className="instruction-panel">
          <p className="eyebrow">Next step</p>
          <h2>Ready to guide the current screen.</h2>
          <p>
            The assistant puck, pointer ring, step bubble, and debug controls
            will be layered into this shell during Phase 2.
          </p>
        </div>
      </section>

      <AssistantPuck />
    </main>
  );
}

export default App;
