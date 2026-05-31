# TouchPilot Architecture

TouchPilot is a cross-platform desktop assistant that understands the current screen and guides users through software with visual overlays, voice, and camera gestures.

## Product Loop

```text
user intent
  -> screen capture
  -> screen understanding
  -> safety classification
  -> guided overlay step
  -> user action
  -> screen verification
```

## System Shape

```text
apps/desktop
  React overlay UI
  Tauri desktop shell
  Rust commands

apps/gateway
  model/API proxy
  provider routing
  rate limits

crates/*
  native capture, accessibility, input, gestures, safety, and storage

packages/*
  shared schemas, AI clients, UI components, evals, and design tokens
```

## Early Technical Priorities

1. Keep screenshot coordinates and overlay coordinates aligned.
2. Keep camera gesture processing local by default.
3. Make model responses structured and schema-validated.
4. Treat guidance and automation as separate product layers.
5. Measure target accuracy with evals before broadening workflows.

## First Milestone

The first milestone is not full automation. It is proving that the app can:

1. run as a desktop shell,
2. capture the screen,
3. ask a multimodal model for the next target,
4. draw a pointer at the correct location,
5. pause through an explicit gesture or control.
