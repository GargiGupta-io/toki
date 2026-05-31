# Phase 2 Overlay Prototype Completion

Phase 2 created the first working overlay prototype for TouchPilot. The app is no longer a generic Tauri starter; it now behaves like the beginning of a desktop guidance layer.

## What Exists Now

- Overlay behavior spec in `docs/phase-2-overlay.md`.
- TouchPilot-branded overlay shell.
- Assistant puck with status label and pulse treatment.
- Typed overlay state model.
- Overlay-style Tauri window configuration.
- Fixed-coordinate pointer ring.
- Step bubble attached to the pointer target.
- Pause, resume, and stop controls.
- Debug panel for manually switching states and inspecting target coordinates.

## Verification

These commands passed:

```text
npm run check
npm --workspace @touchpilot/desktop run build
```

## Current Prototype Behavior

The desktop app starts in a guiding state. It shows:

- a status rail,
- a guidance panel,
- a target ring at fixed coordinates,
- a step bubble attached to that target,
- a floating assistant puck,
- pause/resume/stop controls,
- a debug panel for state switching.

Stopping guidance returns the app to idle and hides the active target marker and step bubble. Pausing changes the assistant state while keeping the overlay visible.

## Important Technical Decisions

1. The overlay starts interactive instead of click-through.
   - This keeps debugging simple while controls are still being built.

2. The target ring uses explicit x/y/width/height values.
   - This prepares the UI for future AI-provided coordinates.

3. The debug panel is intentionally separate from production UI.
   - It helps test overlay behavior now and can be hidden or removed later.

4. The Tauri window is configured toward overlay behavior.
   - It is decoration-free, transparent-capable, always-on-top, and resizable.

## Phase 3 Entry Point

Phase 3 should focus on screen capture:

1. Add a native capture API through Tauri/Rust.
2. Capture current display or full screen.
3. Return display dimensions and scale factor.
4. Return cursor position if possible.
5. Show captured metadata in the debug panel.
6. Begin coordinate calibration between screenshot pixels and overlay coordinates.

The main technical risk for Phase 3 is coordinate mismatch between screenshot capture and overlay rendering.
