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

## Phase M0: Mac Migration Sanity

- Treat macOS as the primary product target for the next development stretch.
- Separate real repo changes from Windows-to-Mac checkout churn.
- Verify Node, npm, Rust, Cargo, TypeScript, Rust checks, and desktop web build on Mac.
- Confirm the Tauri dev shell launches on macOS.
- Record Mac-specific runtime warnings before continuing product work.

## Phase M1: macOS Runtime Shell

- Make Toki feel like a macOS menu bar utility.
- Validate settings popup behavior on Mac.
- Validate transparent overlay behavior on Mac.
- Remove Windows-only assumptions from the default runtime path.
- Verify the puck follows the cursor on macOS.

## Phase M2: macOS Capture And Permission Validation

- Test screen capture on Mac.
- Add or record Screen Recording permission behavior.
- Verify capture dimensions.
- Verify Retina/display scale behavior.
- Confirm capture coordinates match overlay coordinates.

## Phase M3: Phase 10 Voice On Mac

- Test native mic capture on Mac.
- Test `OPENAI_API_KEY` transcription from a Mac-launched app process.
- Confirm transcript text drives the guidance loop.
- Fix Mac-specific microphone permission or CPAL issues.

## Phase M4: Clicky Reference Alignment On Mac

- Done: Make Toki menu-bar-first on Mac.
- Done: Improve the menu bar icon with macOS template-icon behavior.
- Done: Auto-open settings on Mac launch so the app is discoverable.
- Done: Position settings near the menu bar instead of centered like a normal app window.
- Done: Keep debug as a separate internal window.
- Done: Tighten transparent overlay QA against the Clicky contract.
- Done: Document the native global push-to-talk target.
- Done: Keep mic capture, transcription, command routing, and guidance activation separated.
- Done: Document the backend/proxy rule for paid API keys.
- Follow-up: Add actual native global Control+Option push-to-talk after Accessibility permission UX is ready.
- Follow-up: Replace the current app icon artwork with a more cursor-like template icon if menu-bar readability is still weak.
- Follow-up: Validate multi-monitor overlay behavior on real Mac displays.

## Phase M5: Gesture Re-Test On Mac

- Done: Add Mac camera enumeration QA.
- Done: Add Mac camera permission QA.
- Done: Add MediaPipe landmark QA with GPU-to-CPU fallback.
- Done: Add pinch gesture QA criteria.
- Done: Add open palm gesture QA criteria.
- Done: Clean up gesture debug readouts.
- Decision: gestures stay debug-first and secondary to voice until manual Mac camera tests prove reliability.
- Follow-up: run real camera/lighting tests and tune thresholds before promoting gestures into the normal user flow.

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
