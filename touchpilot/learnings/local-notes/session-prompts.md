# Session Prompts - TouchPilot

---

## 2026-06-11

- User: `next`
- Brief: Completed Phase 8 Step 8.1 by creating the Clicky-style visual acceptance spec and committing it as `b1a2e32`.
- User: `next`
- Brief: Completed Phase 8 Step 8.2 by splitting TouchPilot into overlay, settings, and debug runtime surfaces and committing it as `85b23a1`.
- User: `next`
- Brief: Completed Phase 8 Step 8.3 by blanking overlay/settings native titles, clearing Windows HWND title text, enforcing skip-taskbar behavior, and committing it as `cdc66ca`.
- User: `next`
- Brief: Completed Phase 8 Step 8.4 by making the settings popup compact and transient, with Escape/focus-loss close behavior, and committing it as `6e5ce51`.
- User: `next`
- Brief: Completed Phase 8 Step 8.5 by expanding the separate debug window with state controls, fixture controls, capture metadata, calibration details, screenshot preview, and committing it as `9dd5c7f`.
- User: `next`
- Brief: Completed Phase 8 Step 8.6 by removing legacy overlay panels/debug styles, simplifying the user-facing step cue, and committing it as `c5b4072`.
- User: `next`
- Brief: Completed Phase 10.5 Step 4 by wiring the desktop app to an explicit local guidance provider endpoint and pushing four granular commits through `0eb232e`.
- User: `next`
- Brief: Completed Phase 10.5 Step 5 by running the local smoke provider path, confirming honest unavailable mode, improving Debug discoverability/scrolling, and pushing commits through `99a81e5`.
- User: `Updated Phase 10.5 Remaining Steps ... Ready to start Step 10.5.6?`
- Brief: Completed Phase 10.5 Step 6 by updating Toki and learnings docs so real target accuracy continues before Phase 11, with commits pushed through `7e5eb12` and `e8a6609`.
- User: `next`
- Brief: Completed Phase 10.5 Step 7 by adding smoke-server provider mode config, local retired local vision runtime placeholder mode, tests, docs, and pushing commits through `22481e5` and `237a173`.
- User: `next`
- Brief: Completed Phase 10.5 Step 8 by wiring local retired local vision runtime guidance behind the smoke endpoint, adding focused adapter tests, updating docs, and pushing commits through `c7e0e73` and `b0749ab`.
- User: `next`
- Brief: Completed Phase 10.5 Step 9 by validating provider output before returning targets, adding focused rejection tests, updating docs, and pushing commits through `42a51f3` and `010a8bf`.
- User: `next`
- Brief: Completed Phase 10.5 Step 10 by adding a known-screen guidance smoke runner, documenting the manual useful/wrong flow, noting local provider unavailability, and pushing commits through `cccc7d8` and `4cba107`.
- User: `next`
- Brief: Completed Phase 10.5 Step 11 by documenting the target-accuracy status, noting the pipeline is ready but accuracy is unproven, and recording OCR/accessibility as the escalation path if screenshot-only targets miss.
- User: `next`
- Brief: Completed Phase 10.5 Step 12 by closing Phase 10.5 as provider-pipeline-ready, inserting Phase 10.6 for target accuracy before safety, updating roadmap/learnings, and pushing commits through `f9a8ad8` and `99566bb`.
- User: `next`
- Brief: Completed Phase 10.6 Step 1 by adding a provider readiness check, confirming local retired local vision runtime is not reachable, documenting the setup blocker, and pushing commits through `b1a8cc7` and `f1a4872`.
- User: `next`
- Brief: Completed Phase 10.6 Step 2 by installing/starting retired local vision runtime, pulling `llava:latest`, confirming local provider readiness outside the sandbox, and documenting known-screen accuracy as the next gate.
- User: `next`
- Brief: Completed Phase 10.6 Step 3 by running the known-screen path against local retired local vision runtime, recording the unavailable verdict from invalid provider output, and documenting raw response capture/prompt repair as the next blocker.
- User: `next`
- Brief: Completed Phase 10.6 Step 4 by adding raw provider-output capture, normalized-coordinate rejection, known-screen validation details, and documenting that OCR/accessibility evidence is now the best next accuracy move.
- User: `next`
- Brief: Completed Phase 10.6 Step 5 by adding candidate-assisted guidance, proving one candidate-backed known-screen target can return real guidance, and documenting automatic OCR/accessibility candidate extraction as the next blocker.
- User: `next`
- Brief: Completed Phase 10.6 Step 6 by adding automatic macOS Accessibility candidate extraction for known-screen runs, tests, docs, and learning updates; the real probe ran but returned zero candidates in the current frontmost context.
- User: `next`
- Brief: Completed Phase 10.6 Step 7 by adding an app-targeted macOS candidate probe, surfacing assistive-access permission errors, and documenting that Accessibility permission must be granted before live automatic candidates can be accepted.
- User: `next / done / you run it yourself`
- Brief: Completed Phase 10.6 Step 8 by verifying Accessibility permission, fixing multi-process Edge selection, documenting that Edge still blocks child traversal through `osascript`, and recording OCR/native AX as the next target-accuracy path.
- User: `next / continue`
- Brief: Completed Phase 10.6 Step 9 by adding macOS Vision OCR candidate extraction, wiring it as a known-screen fallback, proving 14 OCR candidates on the known screenshot, and documenting OCR as the next target-accuracy evidence source.
- User: `next`
- Brief: Completed Phase 10.6 Step 10 by running the OCR-backed known-screen provider test, getting a useful real target from local retired local vision runtime, and documenting live desktop candidate wiring as the next step.

## 2026-07-10 - Compact utility accepted

**Prompt:** yep fixed lets move to the next step

**Action:** Confirmed the compact 224-pixel top-utility geometry, recorded the Phase 13A learning update, and prepared Step 1 for its granular commit before starting the accuracy baseline.

## 2026-07-10 - Guidance trace baseline

**Prompt:** yep fixed lets move to the next step

**Action:** Completed Accuracy Stabilization Step 2 by adding one trace ID across transcript, active-window lookup, screenshot capture, candidate collection, provider output, coordinate mapping, validation, and rendering. Added sanitized success/refusal fixtures, Guidance debug visibility, passing typechecks/build, and relaunched the dev app without changing target-selection behavior.

## 2026-07-10 - Atomic active-window snapshot

**Prompt:** next / okay where were we at lets continue from there

**Action:** Completed Accuracy Stabilization Step 3 by replacing three separately timed live-capture calls with one native snapshot contract carrying the window, exact screenshot-derived metadata, snapshot identity, and timing provenance. Added a focused Rust invariant test, pushed three granular code commits, and updated the existing Phase 4 learning document.

## 2026-07-10 - Coordinate transform contract

**Prompt:** okay where were we at lets continue from there

**Action:** Completed Accuracy Stabilization Step 4 by replacing duplicated coordinate formulas with one pure transform contract covering Retina display points, screenshot pixels, active-window crops, provider image pixels, and overlay coordinates. Added six deterministic tests, preserved existing selection and target-tightening behavior, pushed four granular code commits, and updated the Phase 12 learning document.

## 2026-07-11 - Provider image quality

**Prompt:** next / continue

**Action:** Completed Accuracy Stabilization Step 5 by replacing the 1024px/0.76 provider-image path with one tested 1536px/0.90 preparation policy. Preserved original screenshot geometry, crop region, resize scale, and encoding metadata; added Debug visibility; passed image, coordinate, guidance, typecheck, and build verification; and pushed four granular code commits plus the Phase 12 learning update.

## 2026-07-11 - Live candidate fusion

**Prompt:** next / continue

**Action:** Completed Accuracy Stabilization Step 6 by preserving the combined macOS Accessibility and Vision OCR evidence, running it through the shared fusion boundary before the unchanged intent ranker, retaining full per-candidate provenance, and exposing raw, valid, fused, returned, and per-source counts in Debug. Added four focused tests, passed AI, guidance, TypeScript, Rust, and build checks, pushed seven file-level code commits, and updated the existing Phase 12 learning document.

## 2026-07-11 - Intent-aware candidate ranking

**Prompt:** next

**Action:** Completed Accuracy Stabilization Step 7 by replacing narrow create-specific bonuses with a generic action/object intent scorer. The live ranker now uses labels plus selected AX/DOM metadata, penalizes incompatible actions, understands natural phrases such as add collaborators, and prevents play from matching playlist. Added six focused tests, passed fusion, guidance, TypeScript, and build checks, pushed four granular code commits, and updated the existing Phase 12 learning document.

## 2026-07-11 - Task planning and target localization

**Prompt:** next

**Action:** Completed Accuracy Stabilization Step 8 by separating the user's original task from the current screen-localization objective. Added a shared task-plan contract, a one-step compatibility fallback, current-objective candidate ranking and retired local vision runtime prompting, Debug visibility, six focused tests, granular code commits, and an update to the existing Phase 12 learning document.

## 2026-07-11 - Source-aware target verification

**Prompt:** next

**Action:** Completed Accuracy Stabilization Step 9 by adding a post-provider, pre-safety verification boundary. Toki now validates exact candidate ids, conservatively links nearby structured evidence, derives source-specific click points, refuses stale or unusable targets, records a full Debug receipt, passes focused and regression suites, and saves the work as five file-level code commits plus the Phase 12 learning update.
