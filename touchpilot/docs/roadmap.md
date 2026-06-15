# Roadmap

## Phase 1: Repo And Foundation

- Create monorepo.
- Scaffold Tauri v2 desktop app.
- Add Rust workspace crates.
- Add shared package placeholders.
- Add baseline docs.
- Add shared schemas.
- Add build/lint scripts.
- Verify the app launches or builds.

## Phase 2: Overlay Prototype

- Transparent always-on-top overlay.
- Floating assistant puck.
- Pointer ring at test coordinates.
- Step bubble.
- Pause and stop controls.
- Basic settings panel.

## Phase 3: Screen Capture

- Full-screen capture.
- Display metadata.
- Cursor position.
- Active window context.
- Coordinate calibration.

## Phase 4: AI Guidance Loop

- AI provider abstraction.
- Screenshot plus prompt request.
- Structured guidance response.
- Target overlay rendering.
- Invalid-output fallback.

## Phase 5: Gesture MVP

- Camera permission flow.
- Local hand landmark detection.
- Pinch gesture for voice/input activation.
- Open palm gesture for pause.
- Confidence smoothing and cooldowns.

## Phase 6: Voice MVP

- Voice-first command input.
- No user-facing text command prompt.
- Push-to-talk or toggle-to-talk.
- Minimal listening state near the puck/settings.
- Transcription into the guidance loop.
- Debug-only text command fallback for QA.
- Gesture-triggered voice mode after the voice loop works.
- Stop/interruption command.

## Phase 7: Safety And Guardrails

- Risk classifier.
- Policy engine.
- Confirmation sheet.
- Private mode.
- Debug logs.

## Phase 8: Screen Intelligence Upgrade

- OCR.
- Accessibility tree adapters.
- Unified UI element map.
- Region selection.
- Confidence scoring.

## Phase 9: Multi-Step Workflows

- Task plans.
- Step verification.
- Next/back controls.
- Screen change detection.
- Completion detection.

## Phase 10: Visual Polish

- Refined overlay design system.
- `react-three-fiber` guidance visuals.
- Selective `liquid-glass-js` surfaces.
- Brand/onboarding visuals.

## Phase 11: Evals

- Screenshot dataset.
- Target annotations.
- Coordinate scoring.
- Risk classification scoring.
- Prompt/model regression tracking.

## Phase 12: Production Readiness

- Auto-update.
- Signing.
- Crash reporting.
- Secure key storage.
- Gateway rate limits.
- Privacy policy.
- Installers.
