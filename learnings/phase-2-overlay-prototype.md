# TouchPilot Phase 2 Overlay Prototype

> Phase 2 turned the desktop starter app into the first usable TouchPilot overlay prototype with a floating assistant puck, target marker, step bubble, state controls, debug panel, and overlay-style window configuration.

---

## In Plain English

Before this phase, TouchPilot was a working desktop shell, but it still looked and behaved like a normal starter app. Phase 2 made it feel like the beginning of the actual product: something that sits above the desktop and visually guides the user.

The assistant can now show where it wants the user to look, explain the current step, and let the user pause, resume, or stop guidance. The coordinates are still fake, and there is no AI or screen capture yet, but the visual guidance layer exists.

Think of this phase as building the dashboard and pointer system before connecting the engine. The screen marker, step bubble, assistant puck, and debug controls are now in place so future phases can plug in real screen capture and AI output.

---

## What Was Built

### Overlay Behavior Spec

Plain English: We wrote down how the overlay should behave before building the UI.

File:

```text
touchpilot/docs/phase-2-overlay.md
```

The spec defines:

- overlay goal,
- window behavior,
- click handling,
- assistant puck,
- pointer ring,
- step bubble,
- pause/stop controls,
- overlay states,
- debug panel,
- design rules,
- done criteria,
- risks.

Technical detail: This document prevents Phase 2 from drifting into AI, voice, or gesture features too early. It keeps the work focused on the overlay surface.

---

## TouchPilot Shell

Plain English: The app no longer shows the default Tauri demo screen.

Files:

```text
touchpilot/apps/desktop/src/App.tsx
touchpilot/apps/desktop/src/App.css
```

The shell now includes:

- status rail,
- TouchPilot brand mark,
- guidance surface,
- state pill,
- coordinate readout,
- instruction panel.

Technical detail: The React app now renders a custom overlay layout instead of the generated Vite/Tauri logos and greet form.

---

## Assistant Puck

Plain English: The puck is the floating control that represents the assistant.

The puck currently shows:

- circular assistant control,
- status chip,
- animated orbit,
- focus-visible styling.

Why it matters:

- It gives users a clear interaction anchor.
- It will later connect to voice, gesture, prompt, and state transitions.
- It makes the app feel like an assistant layer instead of a settings window.

Technical detail: The puck is currently a React button inside `App.tsx`, styled through CSS in `App.css`.

---

## Overlay State Model

Plain English: The overlay now knows what mode the assistant is in.

States:

```text
idle
listening
thinking
guiding
paused
error
```

Each state has:

- label,
- title,
- description,
- visual tone.

Why it matters:

- The UI no longer relies on hardcoded text.
- Future systems can change the state cleanly.
- The puck, shell, and guidance panel can stay consistent.

Technical detail: A typed state map in `App.tsx` drives labels and descriptions. React state currently controls the active state.

---

## Overlay-Style Window

Plain English: The desktop window is configured more like an overlay than a normal app.

File:

```text
touchpilot/apps/desktop/src-tauri/tauri.conf.json
```

The window now uses:

- larger debug dimensions,
- minimum dimensions,
- no decorations,
- transparency support,
- always-on-top behavior,
- resizable behavior,
- no shadow.

Technical detail: This is still not full click-through overlay behavior. We intentionally kept the app interactive so pause/stop/debug controls can be tested without fighting pointer-event behavior.

---

## Pointer Ring

Plain English: The app can now visually mark a target on the screen.

The fixed target uses:

```text
label: Export
x: 640
y: 360
width: 112
height: 48
```

The marker includes:

- rectangular target ring,
- pulse outline,
- center crosshair,
- explicit coordinate rendering.

Why it matters:

- This is the first version of "the assistant points to something."
- Later, the AI model can output the same style of target object.
- Phase 3 can test whether screen capture coordinates match overlay coordinates.

Technical detail: The pointer is positioned with absolute CSS using explicit `left`, `top`, `width`, and `height`.

---

## Step Bubble

Plain English: The pointer now has an instruction attached to it.

The bubble shows:

- step label,
- target label,
- instruction text,
- anchor notch pointing toward the target.

Why it matters:

- A marker alone is not enough.
- The user needs to know what to do at the marked target.
- This is the beginning of real guided workflow UI.

Technical detail: The bubble is positioned relative to the same target data used by the pointer ring.

---

## Pause, Resume, And Stop

Plain English: The user can control the overlay now.

Current behavior:

- pause changes state to `paused`,
- resume changes state to `guiding`,
- stop changes state to `idle`,
- idle hides the active pointer and bubble.

Why it matters:

- The user always needs control over guidance.
- Pause/stop behavior is part of safety.
- Later gestures can map to these same actions.

Technical detail: These controls are React buttons that update local state.

---

## Debug Panel

Plain English: Developers can manually test overlay states and inspect the target.

The debug panel supports:

- switching to idle,
- switching to listening,
- switching to thinking,
- switching to guiding,
- switching to paused,
- switching to error,
- viewing target label,
- viewing target coordinates,
- viewing target size.

Why it matters:

- It makes the overlay testable before AI is connected.
- It exposes coordinate data clearly.
- It gives future screen-capture work a place to show metadata.

Technical detail: The debug panel receives the active state, target data, and a state setter from `App`.

---

## Verification

Plain English: The overlay prototype builds and passes checks.

Passed:

```text
npm run check
npm --workspace @touchpilot/desktop run build
```

Technical detail:

- TypeScript checks passed across all workspace packages.
- Rust `cargo check --workspace` passed.
- The desktop frontend production build passed.

---

## What Phase 2 Did Not Build

This phase intentionally did not add:

- AI calls,
- screen capture,
- camera gestures,
- voice mode,
- OCR,
- accessibility APIs,
- click-through overlay mode,
- coordinate calibration.

Those are future phases. Phase 2 only created the visual/control surface.

---

## Key Lessons

### Start Interactive Before Click-Through

Plain English: It is easier to debug an overlay when you can still click it.

Technical detail: Full click-through overlays can make controls unusable if implemented too early. The right sequence is interactive overlay first, pass-through behavior later.

### Coordinates Need A Stable Path

Plain English: The target marker should use the same kind of data that the AI will eventually produce.

Technical detail: Rendering from explicit `x/y/width/height` values avoids a layout-only target system and prepares the overlay for model output.

### Debug UI Is Productive Early

Plain English: A small debug panel saves time because states can be tested without wiring every real input.

Technical detail: The debug panel lets us test state visuals, target visibility, and coordinate readouts before screen capture, AI, or gestures exist.

---

## Phase 3 Preview

Plain English: Next, the assistant needs to see the screen.

Phase 3 should build:

1. native screen capture command,
2. display metadata,
3. cursor metadata,
4. debug readout for capture dimensions,
5. first coordinate calibration notes.

The main risk is making sure the screenshot coordinate system and overlay coordinate system match.

---

## Suggested Quiz Questions

1. Why did Phase 2 start with interactive overlay mode instead of click-through mode?
2. Why is the target marker rendered from explicit coordinates?
3. What does the assistant puck represent in the product?
4. What happens when the user presses stop?
5. Why is the debug panel useful before AI is connected?

---

*Generated: 2026-05-31 | Project: TouchPilot | Phase: 2 Overlay Prototype*
