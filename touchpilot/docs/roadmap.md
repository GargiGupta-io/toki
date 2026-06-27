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

## Phase VG: Voice Guidance Quality

Status: Closed as a quality gate.

- Done: Define real guidance acceptance beyond mock target plumbing.
- Done: Show guidance provider mode clearly: mock, real, unavailable.
- Done: Add debug result review for transcript, target, confidence, validation, and tester verdict.
- Done: Confirm screenshot payload and calibration data are ready for real provider calls.
- Done: Add a real provider adapter plan behind the backend/proxy rule.
- Done: Add the controlled real-guidance smoke path.
- Done: Keep mock guidance as a QA fixture, not as product acceptance.

## Phase 10.5: Provider Backend Smoke

- Status: Closed as provider-pipeline-ready, not target-accuracy-complete.
- Done: Define backend/proxy contract for `GuidanceRequest` to `GuidanceResult`.
- Done: Keep paid provider keys out of the desktop app.
- Done: Connect Debug `Real smoke` to a configured provider endpoint.
- Done: prove the local smoke bridge reaches `dev-smoke-server` and preserves `unavailable`.
- Done: add server-side provider mode config such as `local-ollama` or `unavailable`.
- Done: wire a local vision provider adapter behind the smoke endpoint.
- Done: force provider output through strict `GuidanceResult` parsing and validation.
- Done: add a repeatable known-screen runner.
- Done: record target accuracy status, misses, model limits, and escalation rule.
- Treat missing provider as `unavailable`, not mock fallback.
- Decision: target accuracy is unproven because the local provider endpoint was not reachable.
- Decision: do not start safety guardrails yet; move into Phase 10.6 first.

## Phase 10.6: Target Accuracy And Screen Intelligence

- Goal: make real guidance point to the correct target before safety policy work.
- Step 1 result: provider readiness check exists.
- Step 2 result: local Ollama provider is ready on this machine.
- Step 3 result: first known-screen run reached `local-ollama`, but returned `unavailable` because provider output failed strict `GuidanceResult` validation.
- Step 4 result: provider raw output is now exposed on invalid responses, and normalized `0..1` target boxes are rejected as invalid CSS-pixel coordinates.
- Step 5 result: candidate-assisted known-screen guidance returned a real target by anchoring the provider choice to a supplied UI candidate box.
- Step 6 result: known-screen guidance can now collect candidate boxes automatically from macOS Accessibility when permission is available.
- Step 7 result: the macOS candidate probe can list visible apps and target a named app, but live candidate extraction is blocked by macOS Accessibility permission for `osascript` (`-25211` / assistive access denied).
- Step 8 result: after granting Accessibility permission, the probe can inspect Terminal and select the real Microsoft Edge window process, but Edge child traversal returns `Can't get object`, so Edge still yields zero useful candidates through the current `osascript` path.
- Step 9 result: macOS Vision OCR candidate extraction exists and returned 14 text candidates from `/tmp/toki-known-screen.png`, giving browser-like screens a fallback when Accessibility does not expose child elements.
- Done: add `npm run guidance:provider:check` to verify local Ollama readiness.
- Done: install/start Ollama from the official macOS app path.
- Done: pull `llava:latest`.
- Done: verify `npm run guidance:provider:check` reports `[READY] local Ollama provider is reachable`.
- Note: local provider checks may need to run outside the Codex sandbox because sandboxed local network calls to `127.0.0.1:11434` can fail even when Ollama is running.
- Raw screenshot-only targeting failed because `llava:latest` returned normalized coordinates.
- Candidate-assisted targeting works when the request includes a trusted candidate box.
- macOS Accessibility candidate extraction now provides labels, roles, and boxes without manual `TOKI_KNOWN_SCREEN_CANDIDATES`.
- App-targeted candidate probing is wired with `npm run qa:mac:candidates -- --app "Microsoft Edge"`.
- OCR candidate probing is wired with `npm run qa:mac:ocr:candidates -- --image /tmp/toki-known-screen.png --scale 2`.
- Next: run the known-screen provider test with OCR candidates and record whether the returned target is useful or wrong.
- Build a candidate UI map from visible text, accessibility nodes, and bounding boxes.
- Ask the provider to choose from structured candidates instead of raw pixels only.
- Keep the useful/wrong verdict in Debug as the acceptance gate.
- Done when one known-screen target is useful and the failure mode is recorded.

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
