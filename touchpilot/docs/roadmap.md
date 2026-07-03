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
- Step 10 result: the known-screen provider test used OCR candidates and returned a useful real target for `> Find and fix a bug in @filename` at `9,809 235x17`.
- Step 11 result: live desktop guidance requests include macOS Vision OCR candidates in the real-provider path.
- Step 12 result: live desktop real-guidance smoke reaches the local provider from the running app, but the returned target is not accurate enough yet.
- Step 13 result: native cursor tracking is implemented for macOS. The overlay now prefers the Rust `native_cursor_position` command and falls back to Tauri cursor polling on unsupported platforms.
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
- OCR-backed known-screen targeting has one useful local provider verdict.
- Next: visually verify puck proximity around screen edges, menu bar, and Dock before continuing accuracy/safety work.
- Build a candidate UI map from visible text, accessibility nodes, and bounding boxes.
- Ask the provider to choose from structured candidates instead of raw pixels only.
- Keep the useful/wrong verdict in Debug as the acceptance gate.
- Done when one known-screen target is useful and the failure mode is recorded.

## Phase 10.7: Browser And Provider Accuracy Upgrade

- Goal: improve target accuracy before Phase 11 by testing better development providers and improving browser screen evidence.
- Scope: development only. FreeLLMAPI can be used as a dev provider aggregator, but not as the production provider.
- Step 1: add `freellmapi-dev` provider mode.
- Step 2: run known-screen tests through FreeLLMAPI vision models.
- Step 2 result: FreeLLMAPI is installed locally at `/Users/pumba/tools/freellmapi`, responds on port `3001`, and Gemini became available after adding a provider key. A known-screen request through `freellmapi-dev` returned `real` target `next at 50,390 50x20`; this proves provider reachability, but target usefulness still needs browser/candidate comparison.
- Step 3: compare accuracy against local Ollama.
- Step 3 result: with the same known-screen fixture and auto-candidates disabled, FreeLLMAPI/Gemini returned a validated `real` target, while local Ollama returned normalized `0..1` coordinates and was rejected as `unavailable`.
- Step 4: add browser candidate strategy plan:
  - short term: OCR plus layout heuristics
  - mid term: native macOS AX bridge
  - long term: browser extension companion
- Step 4 result: strategy recorded. Short term ranks OCR/accessibility candidates with layout heuristics, mid term replaces brittle AppleScript traversal with a native macOS AX bridge, and long term adds a browser extension companion for exact DOM targets.
- Step 5: add candidate ranking before provider calls.
- Step 5 result: candidate ranking now runs before known-screen and live desktop provider calls. It prioritizes goal-text matches, clickable roles, button-like boxes, OCR visibility, duplicate penalties, and risky-label flags before sending candidates to the provider.
- Step 6: run browser known-screen tests on Edge/Chrome.
- Step 6 result: browser known-screen testing exposed candidate extraction as the blocker. The ranked provider call can run, but the current macOS Accessibility route only produced coarse browser/window candidates in this session, app-targeted Edge/Chrome were not active process names, Firefox targeting failed through the AppleScript route, and macOS Vision OCR returned `nilError` on the current known-screen PNG even after switching to a safer `CGImageSource` loader. Do not treat browser target accuracy as solved yet.
- Step 7: record which path is reliable enough before Phase 11.
- Step 7 result: no current browser path is reliable enough for product guidance. FreeLLMAPI/Gemini is the best development provider, and ranked candidates are the right request shape, but browser page understanding must improve before Phase 11 can safely protect real actions. Recommended next phase is Phase 10.8: Browser Candidate Extraction, starting with a browser extension companion for exact DOM candidates, while keeping native macOS AX and OCR as fallbacks.

## Phase 10.8: Browser Candidate Extraction

- Step 1: build a browser extension companion scaffold for development target accuracy.
- Step 1 result: added `@toki/browser-extension` as a Manifest V3 unpacked extension. It can collect visible DOM candidates from buttons, links, inputs, ARIA labels, and test IDs, then show the first candidates in a small popup for manual QA. It does not yet bridge candidates into the desktop app.
- Step 2: verify extraction on a known browser fixture.
- Step 2 result: added `apps/browser-extension/fixtures/candidate-page.html` and manual acceptance rules for `Create project`, `Delete project`, `Open settings`, `Project name`, `Environment selector`, and `Add notes`. This gives the browser extension a controlled page before testing real SaaS dashboards.
- Step 3: define a local bridge payload Toki can consume.
- Step 3 result: the extension popup can now copy or download a `schemaVersion: 1` browser candidate payload with page URL, title, viewport, and DOM candidates. This is a development handoff shape before a live desktop bridge.
- Step 4: ingest browser candidate payloads in the known-screen provider path.
- Step 4 result: `TOKI_BROWSER_CANDIDATE_PAYLOAD=/path/to/toki-browser-candidates.json npm run guidance:known-screen` now loads browser-extension candidates before manual, Accessibility, or OCR candidates, then ranks them before sending them to the provider.
- Step 5: run a real known-screen provider test using extension DOM candidates.
- Step 5 result: `freellmapi-dev` selected the browser-extension candidate `Create project` from `apps/browser-extension/fixtures/bridge-payload.json` and returned a validated real target at `100,100 120x40`. This proves the provider can choose exact DOM candidates. Caveat: this used a fixture payload file, not a live desktop bridge yet.
- Step 6: add a local live bridge for extension candidates.
- Step 6 result: the guidance smoke server now exposes `POST/GET /api/browser-candidates/latest`, and the extension popup can send the latest browser candidate payload directly to Toki's local dev server. Copy/download remain fallback paths.
- Step 7: make known-screen tests consume the latest live bridge payload automatically.
- Step 7 result: the known-screen runner now checks the live browser-candidate bridge when `TOKI_BROWSER_CANDIDATE_PAYLOAD` is not set. File payloads still take priority, and `TOKI_BROWSER_CANDIDATE_BRIDGE=0` disables automatic bridge lookup. Manual live testing requires restarting the smoke server so `/api/browser-candidates/latest` is available.
- Step 8: restart the smoke server and run the live bridge provider test end to end.
- Step 8 result: after restarting the smoke server with the local FreeLLMAPI unified key, the bridge accepted the extension payload, the known-screen runner consumed it without `TOKI_BROWSER_CANDIDATE_PAYLOAD`, and `freellmapi-dev` returned a validated real target: `Create project at 100,100 120x40`.
- Step 9: make real browser extension QA repeatable.
- Step 9 result: added a localhost fixture server for the extension, because the manifest correctly runs on `http`/`https` pages and should not require `file://` extension permissions. The README now documents the real manual loop: start the fixture server, load the unpacked extension, collect candidates on a normal browser page, send them to the live Toki bridge, then run known-screen guidance without a payload file.
- Step 10: add a bridge QA command for real browser payloads.
- Step 10 result: `npm run qa:browser:candidates` now reads `/api/browser-candidates/latest`, verifies the payload schema, requires an `http`/`https` page URL, rejects the controlled fixture unless `-- --allow-fixture` is passed, and prints the top usable DOM candidates. This gives manual QA a fast answer to "did the extension actually send real page targets?"
- Expose DOM candidates with text, ARIA label, role, bounds, URL, and scroll context.
- Send candidates to Toki using the same candidate shape as OCR/AX.
- Rank DOM candidates before provider calls.
- Re-run known-screen browser tests on Chrome/Edge/Firefox.
- Keep macOS AX and OCR as fallback candidate sources.
- Close when one browser known-screen target is useful from extracted candidates, not raw screenshot guessing.

## Phase 11: Safety And Guardrails

- Step 1: write the safety contract and acceptance criteria.
- Step 1 result: added `docs/phase-11-safety-guardrails.md` with the policy goal, risk classes, confirmation gate, step plan, acceptance criteria, and non-goals. Phase 11 starts from the rule that Toki may guide, but the user stays in control and risky guidance must be confirmed before it renders as normal guidance.
- Step 2: add shared policy decision types.
- Step 2 result: added shared safety policy types in `@toki/shared`: `SafetyPolicyAction`, `SafetyPolicyReason`, `SafetyPolicyDecision`, and `SafetyPolicyInput`. The policy vocabulary is now `allow`, `confirm`, `clarify`, and `block`, but runtime behavior has not changed yet.
- Step 3: add the policy engine.
- Step 3 result: added `evaluateSafetyPolicy()` in `@toki/ai`. The pure policy gate blocks unavailable/invalid provider results, clarifies missing or low-confidence targets, confirms risky actions, and allows safe navigation/form-entry guidance.
- Step 4: add policy tests.
- Step 4 result: added `@toki/ai` tests for every policy outcome: safe/form allow, risky/unknown confirm, low-confidence/missing-target clarify, and unavailable/invalid block.
- Step 5: route provider results through policy.
- Step 5 result: real-provider responses now run through `evaluateSafetyPolicy()` before the overlay accepts them. Allowed guidance renders normally, confirmation-required guidance enters `confirmation_required`, clarify decisions hide the target, block decisions enter error, and Debug receives the safety action/reason.
- Step 6: add confirmation UI.
- Step 6 result: confirmation-required guidance now renders a compact "Confirm first" cue instead of the normal step bubble. The target marker can stay visible for review, but the puck does not animate it as ordinary safe guidance.
- Step 7: show safety decisions in Debug.
- Step 7 result: Debug now includes a Safety Review section showing policy action, reason, risk, confirmation requirement, message, and details.
- Step 8: run manual safety QA.
- Step 8 result: added a low-confidence fixture, routed mock fixtures through the same policy gate, and documented manual safety QA in `docs/phase-11-safety-qa.md`. Debug can now test allow, confirm, clarify, and block without requiring a live provider.
- Step 9: update docs and learning notes.
- Step 9 result: updated the active safety docs and learning note with the actual Phase 11 behavior: real provider results and mock fixtures share one policy gate, safe guidance can render, risky guidance confirms, weak guidance clarifies, and invalid/unavailable guidance blocks.
- Step 10: close Phase 11 or escalate browser metadata.
- Step 10 result: Phase 11 is closed as the safety-foundation phase. Risky guidance is confirmation-gated, weak guidance clarifies, invalid/unavailable guidance blocks, Debug explains decisions, and Toki still does not click automatically. Browser target accuracy remains Phase 12 screen-intelligence work.

## Phase 12: Screen Intelligence Upgrade

- Goal: improve target accuracy by building a stronger screen-evidence layer before guidance reaches the provider.
- Active plan: `docs/phase-12-screen-intelligence.md`.
- Step 1: write the screen-intelligence contract and acceptance criteria.
- Step 1 result: added `docs/phase-12-screen-intelligence.md` with the phase goal, evidence sources, tradeoffs, steps, acceptance criteria, and non-goals. Phase 12 starts from the rule that raw screenshots are not enough: Toki should combine browser DOM candidates, OCR boxes, Accessibility nodes, manual fixtures, and screenshot geometry into one stronger element map.
- Step 2: inventory current candidate sources.
- Step 2 result: documented the current candidate inventory in `docs/phase-12-screen-intelligence.md`: browser-extension DOM candidates, live browser bridge payloads, manual known-screen candidates, macOS Accessibility probes, macOS Vision OCR probes, desktop live OCR candidates, and first-pass candidate ranking. The decision is to build on the existing `ScreenCandidate` contract instead of adding another isolated format.
- Step 3: add a unified element schema.
- Step 3 result: expanded the shared `UiElement` schema in `@toki/shared` so Phase 12 can represent fused screen elements with source provenance, role, label, bounds, confidence, visibility, interactability, risk hints, ranking metadata, and links back to source candidate IDs. `ScreenCandidate` remains the compatibility shape for existing provider requests.
- Step 4: add a candidate fusion layer.
- Step 4 result: added `fuseScreenCandidates()` in `@toki/ai`. It converts existing candidates into `UiElement[]`, filters invalid boxes, preserves source provenance, marks interactable/risky hints, and merges obvious duplicate observations across sources.
- Step 5: improve candidate ranking.
- Step 5 result: improved known-screen and desktop candidate ranking with source trust, exact label matches, weak-region penalties, hidden/disabled penalties, and stronger geometry/role scoring. Broad browser/window candidates should now lose to trusted DOM/manual click targets when labels match.
- Step 6: run browser known-screen QA.
- Step 6 result: added `npm run qa:browser:known-screen` and expanded the browser-extension fixture payload to six HTTP-page DOM candidates. The deterministic QA now proves ranking selects the expected browser target for `Create project`, `Open settings`, `Add notes`, and `Delete project` without requiring a provider, screenshot, or live browser.
- Step 7: run OCR/AX fallback QA.
- Step 7 result: added `npm run qa:fallback:known-screen`, which verifies the fallback path using only Accessibility and OCR candidates. It proves Accessibility can win for real controls such as `Download` and `Search`, while OCR can still provide a useful text target such as `Invite` when browser DOM candidates are unavailable.
- Step 8: update provider prompts to prefer candidate IDs.
- Step 8 result: provider prompts now require candidate selection when ranked candidates exist. The expected provider output is a `candidateId`, not invented coordinates, and the smoke adapter anchors the result back to the chosen candidate's exact label and box.
- Step 9: add Debug screen-intelligence view.
- Step 9 result: Debug Guidance now shows the selected target's `candidateId` and the top ranked candidates from the latest request, including label, id, role, box, score, and ranking reasons.
- Step 10: record accuracy notes.
- Step 10 result: recorded the current accuracy state. Browser DOM fixture QA and OCR/AX fallback QA pass, candidate-id prompting is safer than raw coordinate guessing, and Debug can explain ranking. Real product accuracy is still not proven until live browser-extension payloads are tested on real dashboards with a provider.
- Step 11: close Phase 12 or escalate to browser-extension-first screen understanding.
- Step 11 result: Phase 12 is closed as the screen-intelligence foundation. Product-grade target accuracy is explicitly escalated to future browser-extension-first live dashboard QA/provider evaluation, not claimed as solved here.

## Phase 13: Multi-Step Workflows

- Task plans.
- Step verification.
- Next/back controls.
- Screen change detection.
- Completion detection.
- Step 1 result: added `docs/phase-13-multi-step-workflows.md`, defining the workflow contract, product rule, plan shape, step list, acceptance criteria, non-goals, and tradeoffs. Phase 13 starts with manual guidance only: Toki can plan, point, verify, and advance, but it still does not click or type for the user.
- Step 2 result: added shared workflow types in `@toki/shared` for plans, steps, statuses, verification expectations, verification results, and runtime state.
- Step 3 result: added `createMockWorkflowPlan()` in `@toki/ai` with deterministic plans for create project, open settings, and export/download report. Unknown goals return `null`.
- Step 4 result: wired `WorkflowRuntimeState` into the desktop overlay runtime and Debug snapshot. Debug can now start or clear a deterministic mock workflow, while the user overlay remains unchanged until overlay step controls are added.
- Step 5 result: added a compact overlay workflow cue with current step number, title, instruction, and Back/Next/Stop controls. Workflow targets can now drive the ring and puck target vector.
- Step 6 result: added a dedicated Debug Workflow tab with mock workflow starters, current-step navigation, plan summary, blocked reason, verification status, and active-step highlighting.
- Step 7 result: added a first workflow verification stub. Workflow Next now captures the screen, checks expected labels/roles against Phase 12 candidates, and blocks instead of advancing when verification fails.
- Step 8 result: added `npm run qa:workflow:known-screen` and `docs/phase-13-workflow-qa.md`. Controlled workflow QA passes for next, back, blocked, and completed behavior, and the browser fixture role mismatch for `Environment selector` was corrected.
- Step 9 result: workflow steps now inherit Phase 11 safety rules. Risky workflow steps require confirmation, the controlled delete-project workflow proves delete-risk metadata, runtime Next blocks confirmation-required steps, and the overlay cue shows a compact confirmation marker.
- Step 10 result: Phase 13 is closed as the controlled multi-step workflow foundation. Schema, mock planning, runtime state, Debug inspection, overlay step cues, next/back/stop, candidate verification, workflow QA, and safety gating are in place. Live arbitrary dashboard accuracy remains a future browser/provider QA problem, not a Phase 13 claim.

## Phase 14: Visual Polish

- Step 1 result: added `docs/phase-14-visual-polish.md` as the Phase 14 plan. The phase is scoped to cursor-first polish: puck proximity and edge behavior, compact guidance/workflow cues, subtle target rings, settings/menu popup polish, Debug cleanup, optional WebGL/R3F spike only if CSS is not enough, and manual visual QA.
- Step 2 result: refreshed `docs/visual-acceptance.md` for the current Mac-first Toki runtime. The gate now explicitly fails detached puck behavior, edge loss, dashboard-like workflow cues, and unclear safety states, while adding checks for close cursor attachment, target-ring subtlety, workflow cues, and confirmation-required guidance.
- Step 3 result: polished the overlay workflow cue into a smaller cursor-adjacent instruction surface with flatter controls, a compact step meta line, two-line instruction clamping, and a restrained confirmation-required visual state.
- Step 4 result: tightened puck geometry so it sits close to the cursor, flips left/up near screen edges instead of getting lost, and sends target droplet vectors from the actual cursor-following puck position.
- Step 5 result: polished the target marker into a softer corner-ring highlight, removed the old coordinate shift, reduced center-dot/glow weight, and slowed the pulse so guidance looks less mock-like.
- Step 6 result: tightened the settings/menu panel so it feels more like a compact utility popup: smaller inner surface, shorter push-to-talk copy, clearer voice status, and lighter footer actions.
- Step 7 result: cleaned up Debug visually without removing information: denser layout, wider content area, lower-contrast cards, tighter data rows, compact workflow/candidate lists, and sticky tabs for long sections.
- Step 8 result: documented the optional WebGL/R3F spike decision in `docs/phase-14-webgl-r3f-spike.md`. CSS remains the active renderer for now; Three/R3F should only be added if manual visual QA proves CSS cannot deliver the puck/target feel.
- Step 9 result: added `npm run qa:visual:motion` to guard reduced-motion coverage, decorative animation disabling, cursor polling responsiveness, pointer pulse fallback, and compositor-friendly puck motion properties.
- Step 10 result: added `docs/phase-14-manual-visual-qa.md` and `npm run qa:visual:manual` as the human product-feel gate for default runtime, settings/menu panel, target ring, workflow cue, Debug, and reduced-motion review.
- Step 11 result: Phase 14 is closed for implementation and QA guardrails. Closure checks passed for visual motion QA, manual checklist command, and desktop typecheck. Final product-feel acceptance still requires launching Toki and walking through the manual visual QA checklist.
- Refined overlay design system.
- Optional `react-three-fiber` guidance/puck spike with CSS fallback.
- Selective liquid/glass surface polish where it improves product feel.
- Brand/onboarding visuals remain later product work, not the first Phase 14 task.

## Phase 15: Evals

- Step 1 result: added `docs/phase-15-evals.md` as the Phase 15 plan. The phase will create deterministic measurement for target accuracy, candidate ranking, safety classification, workflow verification, optional provider comparison, and regression reporting.
- Step 2 result: added typed eval dataset contracts in `@toki/evals` plus a known-screen baseline dataset covering target, ranking, and safety annotations for safe and risky browser fixture cases.
- Step 3 result: added target scoring helpers in `@toki/evals` for center distance, center hit, IoU, normalized label matching, candidate id matching, and threshold-based pass/fail output.
- Step 4 result: added candidate ranking helpers in `@toki/evals` for expected-candidate lookup, top-1/top-3/max-rank scoring, source breakdown, label mismatch reporting, and missing-candidate failures.
- Step 5 result: added safety scoring helpers in `@toki/evals` that run the real `evaluateSafetyPolicy()` gate and compare actual policy action/risk against expected eval annotations.
- Step 6 result: added `npm run qa:eval:known-screen`, a deterministic eval CLI that loads the known browser fixture, normalizes older candidate roles, scores target/ranking/safety expectations, and reports pass/fail without launching the desktop app.
- Step 7 result: added workflow scoring helpers in `@toki/evals` for verification status, matched candidates, next/back movement, blocked/completed status, and confirmation-required workflow behavior.
- Step 8 result: added provider comparison helpers in `@toki/evals` for mock, local Ollama, FreeLLMAPI dev, and unavailable modes, including pass/fail/skipped results so missing local providers do not break deterministic eval runs.
- Step 9 result: added eval report helpers in `@toki/evals` for summary counts, case-level status, target/ranking/safety/workflow/provider columns, and failure detail formatting.
- Screenshot dataset.
- Target annotations.
- Coordinate scoring.
- Risk classification scoring.
- Prompt/model regression tracking.

## Phase 16: Production Readiness

- Auto-update.
- Signing.
- Crash reporting.
- Secure key storage.
- Gateway rate limits.
- Privacy policy.
- Installers.
