# Current Plan

## Status Rules

- `COMPLETED`: repository documentation, code, tests, or commits provide direct evidence that the planned foundation was implemented.
- `IN PROGRESS`: substantial implementation exists, but the phase's runtime acceptance condition is not met.
- `PENDING`: the roadmap lists the work and repository evidence does not show closure.
- `UNKNOWN`: available repository evidence is insufficient to claim a status.

Implementation complete does not mean product behavior is proven. Manual runtime acceptance is called out separately.

## Core Roadmap

### Phase 1: Repository Foundation — COMPLETED

1. Create monorepo/workspace structure — `COMPLETED`.
2. Add Tauri desktop application — `COMPLETED`.
3. Add React/TypeScript frontend — `COMPLETED`.
4. Add Rust workspace and shared crates — `COMPLETED`.
5. Add shared packages and baseline documentation — `COMPLETED`.

Evidence: current workspace structure under `touchpilot/apps/`, `touchpilot/crates/`, and `touchpilot/packages/`.

### Phase 2: Overlay Prototype — COMPLETED

1. Transparent overlay window — `COMPLETED`.
2. Cursor-adjacent puck — `COMPLETED` foundation.
3. Target ring — `COMPLETED` foundation.
4. Step cue and pause state — `COMPLETED` foundation.
5. Basic settings/debug surface — `COMPLETED`, later split and redesigned.

Evidence: desktop source, Tauri window configuration, and later Phase 8/13A commits.

### Phase 3: Screen Capture Foundation — COMPLETED

1. Capture metadata contract — `COMPLETED`.
2. Display dimensions and scale metadata — `COMPLETED`.
3. Cursor/display calibration direction — `COMPLETED` foundation.
4. Debug capture surface — `COMPLETED`.

Evidence: capture crate, shared contracts, debug capture code, and coordinate-transform work.

### Phase 4: Real Screen Capture — COMPLETED FOUNDATION

1. Windows-first real capture — `COMPLETED`.
2. PNG/base64 payload — `COMPLETED`.
3. Tauri capture commands — `COMPLETED`.
4. Screenshot preview and failure handling — `COMPLETED`.
5. macOS active-window snapshot — `COMPLETED` later.

Evidence: `touchpilot/crates/capture/`, native commands, and commits `ed35752`, `f3c8136`.

### Phase 5: AI Guidance Loop Foundation — COMPLETED FOUNDATION

1. Guidance schemas — `COMPLETED`.
2. Mock guidance client — `COMPLETED`.
3. Screenshot metadata in requests — `COMPLETED`.
4. Mock result drives target ring/cue — `COMPLETED`.
5. Schema/risk/confidence/confirmation validation — `COMPLETED` foundation.

Evidence: shared/AI packages and current provider/runtime contracts.

### Phase 6: Runtime QA and Hardening — COMPLETED FOUNDATION

1. Manual launch checks — `COMPLETED` historically.
2. Overlay/capture checks — `COMPLETED` historically.
3. Screenshot preview checks — `COMPLETED` historically.
4. Guidance runtime checks — `COMPLETED` historically.
5. Findings documented — `COMPLETED` in phase docs/learnings.

Current runtime at HEAD: `UNKNOWN`.

### Phase 7: Fluid Puck Motion First Pass — COMPLETED, SUPERSEDED

1. Motion states — `COMPLETED`.
2. CSS puck/droplet baseline — `COMPLETED`, later archived/superseded.
3. Guidance droplet behavior — `COMPLETED` prototype.
4. Reduced-motion consideration — `COMPLETED` foundation.
5. Initial visual direction — `COMPLETED`.

Evidence: phase docs and archived legacy puck at `touchpilot/docs/archive/phase-13a-legacy-puck/`.

### Phase 8: Cursor-First Runtime Reset — COMPLETED FOUNDATION

1. Visual acceptance specification — `COMPLETED`.
2. Overlay/settings/debug surface split — `COMPLETED`.
3. Native chrome cleanup — `COMPLETED`.
4. Transient settings popup — `COMPLETED`, later redesigned.
5. Separate Debug window — `COMPLETED`.
6. Cursor-first monochrome runtime — `COMPLETED`.
7. Puck baseline fix — `COMPLETED`, later superseded.
8. Cursor/coordinate QA — `COMPLETED` foundation.
9. Runtime QA script — `COMPLETED`.
10. Visual screenshot QA — `COMPLETED`.
11. Faster build scripts — `COMPLETED`.
12. Checks — `COMPLETED` historically; current HEAD `UNKNOWN`.
13. Docs/learnings — `COMPLETED` historically.
14. Granular commits — `COMPLETED` historically.

### Phase 9: Gesture MVP — COMPLETED FOUNDATION, MANUAL RETEST PENDING

1. Camera permission/device discovery — `COMPLETED` foundation.
2. MediaPipe hand landmarks — `COMPLETED` foundation.
3. Pinch classification — `COMPLETED`.
4. Open-palm classification — `COMPLETED`.
5. Activation/pause routing — `COMPLETED` foundation.
6. Smoothing/cooldowns — `COMPLETED` foundation.
7. Camera-off behavior — `COMPLETED`.
8. Manual Mac lighting/threshold tuning — `PENDING`.

Dependency: camera permission and real-device testing.

### Phase 10: Voice and Guidance Runtime — IN PROGRESS AT PRODUCT LEVEL

1. Right Option hold-to-talk runtime — `COMPLETED` implementation and deterministic state-machine tests; manual installed-app acceptance `PENDING`.
2. Native microphone capture — `COMPLETED`.
3. WAV encoding — `COMPLETED`.
4. Local Whisper transcription — `COMPLETED` and historically probed successfully.
5. Transcript-to-guidance routing — `COMPLETED` foundation.
6. Stop/interruption and debug state — `COMPLETED` foundation.
7. Reliable global trigger across all environments — macOS Right Option implementation `COMPLETED`; release-during-startup and duplicate-release regressions pass; manual acceptance remains `PENDING`.
8. Product-grade target accuracy — `IN PROGRESS`; addressed by Phases 10.5–10.8 and current accuracy work.

### Phase 10.5: Provider Pipeline Readiness — COMPLETED AS INFRASTRUCTURE

1. Real provider plan — `COMPLETED`.
2. Provider mode configuration — `COMPLETED`.
3. Provider-neutral vision contract and adapter router — `COMPLETED`.
4. Temporary Codex-subscription vision adapter — `COMPLETED`; CLI installation and authentication check passes.
5. Strict response parsing/validation — `COMPLETED` foundation.
6. Known-screen smoke path — `COMPLETED` foundation.
7. Accuracy notes — `COMPLETED`.
8. Close/escalate decision — `COMPLETED`: manual accuracy acceptance remains required rather than claimed solved.

### Phase 10.6: Target Accuracy and Screen Intelligence — IN PROGRESS AT PRODUCT LEVEL

1. OCR candidate extraction — `COMPLETED` foundation.
2. Accessibility candidate extraction — `COMPLETED` foundation; useful coverage varies by app/permission.
3. Candidate ranking — `COMPLETED` foundation.
4. Known-screen tests — `COMPLETED` foundation.
5. Live generic-app accuracy — `IN PROGRESS`.

### Phase 10.7: Browser and Provider Accuracy Upgrade — COMPLETED FOUNDATION

1. FreeLLMAPI development provider mode — `COMPLETED` foundation.
2. Known-screen FreeLLMAPI tests — `COMPLETED` setup; exact current service availability `UNKNOWN`.
3. Retired provider comparison — `COMPLETED` historically; its runtime and references are removed from the current project.
4. Browser strategy plan: OCR/layout, native AX, extension — `COMPLETED`.
5. Candidate-ranking layer — `COMPLETED` foundation.
6. Browser known-screen tests — `COMPLETED` foundation.
7. Reliability decision — `COMPLETED`: browser extension/evidence path required.

### Phase 10.8: Browser Extension Companion — COMPLETED FOUNDATION

1. Extension scaffold — `COMPLETED`.
2. DOM evidence payload — `COMPLETED`.
3. Fixture/live bridge — `COMPLETED`.
4. Provider known-screen test — `COMPLETED` foundation.
5. Broad live-browser reliability — `PENDING` product proof.

### Phase 11: Safety and Guardrails — COMPLETED FOUNDATION

1. Risk policy engine — `COMPLETED`.
2. Warning versus target-reveal behavior — `COMPLETED` foundation: account/permission guidance shows with a warning; strong-risk guidance requires `Show target`.
3. Destructive/sensitive action handling — `COMPLETED` foundation; reveal state never executes or clicks.
4. Private mode/local logs — `COMPLETED` foundation.
5. Low-confidence refusal — `COMPLETED` foundation.
6. Broad policy acceptance testing — `PENDING` product proof.

### Phase 12: Screen Intelligence Upgrade — COMPLETED FOUNDATION, ACCURACY ESCALATED

1. OCR — `COMPLETED` foundation.
2. Accessibility adapters — `COMPLETED` foundation.
3. Unified element map/candidates — `COMPLETED` foundation.
4. Model-target matching — `COMPLETED` foundation.
5. Ranking improvements — `COMPLETED` foundation.
6. Region selection — `COMPLETED` foundation.
7. Product-grade accuracy — `IN PROGRESS`.

### Phase 13: Multi-Step Workflows — COMPLETED FOUNDATION

1. Guidance session contract — `COMPLETED`.
2. Goal/current-step/previous-target memory — `COMPLETED` foundation.
3. Recapture and continue loop — `COMPLETED` foundation.
4. Screen-change verification — `COMPLETED` foundation.
5. Completion state — `COMPLETED` foundation.
6. Broad automatic workflow reliability — `PENDING` product proof.

### Phase 13.5: Click-Aware Advancement — COMPLETED FOUNDATION

1. Native/global click observation strategy — `COMPLETED` foundation.
2. Target-region hit verification — `COMPLETED` foundation.
3. Debounce/false-trigger mitigation — `COMPLETED` foundation.
4. Recapture after accepted click — `COMPLETED` foundation.
5. Broad cross-platform validation — `PENDING`.

### Phase 13A: Living Visual Identity — IN PROGRESS AT ACCEPTANCE LEVEL

1. Visual personality/contract — `COMPLETED`.
2. Legacy puck archived — `COMPLETED`.
3. Living creature layer — `COMPLETED`.
4. Runtime states: idle/listening/thinking/guiding/error — `COMPLETED` foundation.
5. Voice/gesture/guidance reaction wiring — `COMPLETED` foundation.
6. Native cursor blob tuning — `COMPLETED` foundation.
7. Unified top utility surface/tabs — `COMPLETED` foundation.
8. Target-travel and final liquid polish — `IN PROGRESS` acceptance.
9. Performance/lag acceptance — `IN PROGRESS`.

### Phase 14: Visual Polish — COMPLETED IMPLEMENTATION GATE

1. Visual QA criteria — `COMPLETED`.
2. Motion/reduced-motion/performance guardrails — `COMPLETED`.
3. Manual real-screen taste check — `PENDING` final product acceptance.

Evidence: `touchpilot/docs/phase-14-visual-polish.md` states implementation/QA closure while retaining manual review.

### Phase 15: Evaluation Harness — COMPLETED FOUNDATION

1. Dataset/fixture format — `COMPLETED`.
2. Expected target annotations — `COMPLETED`.
3. Center/IoU/distance scoring — `COMPLETED`.
4. Risk/confidence metrics — `COMPLETED` foundation.
5. Eval CLI/reports — `COMPLETED` foundation.
6. Large representative screenshot dataset — `PENDING`.

Evidence: `touchpilot/docs/phase-15-evals.md` records deterministic eval closure.

### Phase 16: Production Readiness — IN PROGRESS

1. Production-readiness plan — `COMPLETED`.
2. Release-build inventory — `COMPLETED`.
3. App identity/metadata — `COMPLETED`.
4. Signing/notarization workflow — `PENDING`.
5. Auto-update — `PENDING`.
6. Crash reporting/local diagnostics — `PENDING`.
7. Secure key storage — `PENDING`.
8. Backend gateway/rate limits — `PENDING`.
9. Privacy/permission documentation — `PENDING`.
10. Release QA checklist — `PENDING`.
11. Beta feedback channel — `PENDING`.
12. Phase closure — `PENDING`.

## macOS Migration Phases

### M0: Mac Migration Sanity — COMPLETED FOUNDATION

1. Reconcile worktree/dependencies — `COMPLETED` historically.
2. Typecheck/build on Mac — `COMPLETED` for the pre-gesture repair checkpoint; app-only production bundle passes.
3. Launch Tauri dev app — `COMPLETED` historically.
4. Declare Mac primary product-feel platform — `COMPLETED`.

### M1: macOS Runtime Shell — COMPLETED FOUNDATION

1. Menu-bar utility behavior — `COMPLETED`.
2. Settings/top utility behavior — `COMPLETED` foundation.
3. Transparent overlay behavior — `COMPLETED` foundation.
4. Remove Windows-only default assumptions — `COMPLETED` foundation.

### M2: macOS Capture and Permission — COMPLETED FOUNDATION, RUNTIME RISK REMAINS

1. Screen capture on Mac — `COMPLETED` foundation.
2. Screen Recording permission flow — `COMPLETED` foundation.
3. Capture/overlay coordinate comparison — `COMPLETED` foundation.
4. Stable installed-build permission identity — `IN PROGRESS` acceptance; recurring historical trust prompts were reported.

### M3: Voice on Mac — COMPLETED FOUNDATION

1. Native mic capture — `COMPLETED`.
2. Local Whisper transcription — `COMPLETED`.
3. Transcript drives guidance — `COMPLETED` foundation.
4. Mac permission/CPAL fixes — `COMPLETED` foundation.

### M4: Clicky Alignment — COMPLETED FOUNDATION

1. Menu-bar-first model — `COMPLETED`.
2. Compact custom panel behavior — `COMPLETED` foundation.
3. Transparent click-through overlay — `COMPLETED` foundation.
4. Push-to-talk architecture — `COMPLETED` foundation.
5. Capture/transcription/command separation — `COMPLETED`.
6. Backend/proxy rule for paid keys — `COMPLETED` decision.
7. Native global shortcut after Accessibility UX — `PENDING` final UX choice/validation.
8. Multi-monitor/fullscreen Spaces validation — `PENDING` acceptance.

### M5: Gesture Re-Test — COMPLETED QA SCAFFOLD, MANUAL TESTING PENDING

1. Camera enumeration — `COMPLETED` foundation.
2. MediaPipe landmark check — `COMPLETED` foundation.
3. Pinch/open-palm retest — `PENDING` current manual proof.
4. Threshold/lighting tuning — `PENDING`.

## Current Accuracy and Overlay Stabilization Work — IMPLEMENTED, MANUAL ACCEPTANCE PENDING

1. Guidance trace contract/lifecycle/fixtures — `COMPLETED` by commits.
2. One active-window snapshot per request — `COMPLETED` by commits.
3. Shared coordinate transforms — `COMPLETED` by commits/tests added.
4. Provider image preparation/provenance — `COMPLETED` by commits/tests added.
5. Candidate evidence/fusion — `COMPLETED` by commits/tests added.
6. Candidate intent/ranking — `COMPLETED` by commits/tests added.
7. Separate task planning from localization — `COMPLETED` by commits/tests added.
8. Source-aware target verification before safety — `COMPLETED` by commits/tests added.
9. macOS active-Space overlay ordering/menu-agent packaging — `COMPLETED` by commits.
10. Provider-neutral structured vision contract and Codex-subscription adapter — `COMPLETED` in the pre-gesture repair checkpoint.
11. Reject generic target labels — `COMPLETED` deterministic coverage; live acceptance `PENDING`.
12. Require current-evidence grounding — `COMPLETED` deterministic coverage; the current screenshot is primary and structured candidates are supporting evidence when available; live acceptance `PENDING`.
13. Require action/object semantic match — `COMPLETED` deterministic coverage; live acceptance `PENDING`.
14. Tighten box only after grounding — `COMPLETED` pipeline order; live acceptance `PENDING`.
15. Different-command/different-region regression — `COMPLETED` deterministic coverage; final acceptance `PENDING`.
16. Debug raw answer/original box/grounding/rejection visibility — `COMPLETED` implementation; live inspection `PENDING`.
17. Remove square, pulse, crosshair, target glints, and blob-ring decoration — `COMPLETED`; reduced-motion/visual test passes.
18. Move rotating ring to accepted target center and hide it for rejected targets — `COMPLETED` with render-gate regressions; live visual acceptance `PENDING`.
19. Right Option hold-to-talk, including startup/release races, dual native right-side signals, and missing Input Monitoring request — `COMPLETED` implementation/tests; post-reinstall live acceptance `PENDING`.
20. Remove the retired runtime from current source, scripts, configuration, debug, tests, and documentation — `COMPLETED`; repository text audit returns no matches.
21. Corrected app-only production build, ad-hoc signing, strict signature verification, replacement of `/Applications/Toki.app`, Toki-only TCC reset, and post-install launch — `COMPLETED` from the source later committed through `de7d2b6`.
22. Strict current-image-only fallback for icon controls — `COMPLETED`: requires a current localization trace, specific non-generic label, at least 72% confidence, valid geometry, and action/object semantic agreement.
23. Combined evidence for generic/symbolic structured candidates — `COMPLETED`: exact candidate geometry/provenance can combine with specific provider label/reason only at 72% or higher, with a current-image trace and no explicit semantic conflict; 20/20 verifier regressions pass.
24. Read-only navigation and media-history semantics — `COMPLETED`: `see/show/view` normalize to `open`; specific history phrases ground media controls; unrelated recent-profile and playback-action targets remain rejected; verifier 22/22 and intent 9/9.
25. Two-tier safety normalization — `COMPLETED`: `account_change` and `permission_change` are warning-only; external send, delete, payment, security, and unknown risk require target-reveal acknowledgment; the exact 96% collaborator trace and a payment control are regression-covered.
26. Guidance-only `Show target` UI — `COMPLETED`: the accepted strong-risk target is stored for Debug but the ring remains absent until acknowledgment; clicking the control reveals only the marker and cannot execute the target.
27. Installed/main app acceptance matrix — `PENDING`, user-owned; the corrected installed app is launched and awaiting permission grants/manual commands.
28. Autonomous liquid puck motion — `COMPLETED` implementation/automated gate: stationary idle/listening/thinking/guiding states now deform and drift with mode-tuned energy; paused and reduced-motion paths stop autonomous movement.
29. Accepted-target droplet travel — `COMPLETED` implementation/automated gate: one transient droplet can travel only when the existing accepted-guidance motion gate and a visible target are both present.
30. Living-visual installed-app acceptance — `PENDING`, user-owned: confirm the liquid motion is visible and tasteful, processing does not look idle, the droplet reaches the verified target, and rejected/hidden targets remain invisible.

## Adaptive Gesture Control Plan — IN PROGRESS, STEP 3 COMPLETE

The detailed design and rationale are preserved in `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md`. Execution uses one step at a time, with a pause for user review after every completed step.

1. Freeze gesture contracts and deterministic landmark fixtures — `COMPLETED` in Gesture Step 1; 7/7 focused tests and all workspace typechecks pass.
2. Extract an always-running gesture runtime independent of Debug — `COMPLETED` in Gesture Step 2; Overlay now owns the camera, hidden video source, MediaPipe loop, smoothing, and legacy action routing while Debug receives sanitized snapshots only.
3. Package MediaPipe assets locally and preserve camera privacy — `COMPLETED` in Gesture Step 3; the exact MediaPipe 0.10.35 WASM loaders/binaries and official float16 hand-landmarker model are checksum-pinned, loaded from packaged application paths, embedded in the signed native app, and covered by a 7/7 offline asset gate. Camera-frame privacy and legacy gesture ownership regressions remain green.
4. Build reliable single-hand pointing with calibration, smoothing, and active-display mapping — `NEXT`.
5. Build double-air-tap target locking with an immutable snapshot and screen-freshness invalidation — `PENDING`.
6. Add a bounded, resettable local adaptive profile with two-second human grace windows — `PENDING`.
7. Add stable two-hand identity plus liquid split/merge visuals — `PENDING`.
8. Compose a locked pointer with secondary-hand pinch hold-to-talk; release submits exactly once and tracking loss cancels safely — `PENDING`.
9. Add pointer-grounded “explain this” using the locked region and current screen evidence — `PENDING`.
10. Add later gestures only after the basic composition is reliable — `PENDING`.
11. Run the full regression matrix, rebuild/install/launch, and hand manual gesture acceptance to the user — `PENDING`.

The command-testing foundation is already committed: `touchpilot/docs/manual-command-acceptance-matrix.md` contains 120 cases across 11 edge-case categories, and `npm run test:command-corpus` validates uniqueness, completeness, and supported parser expectations.

## Remaining Dependencies

1. Installed-app acceptance should use the newly replaced `/Applications/Toki.app`; no dev Toki process should run alongside it.
2. Semantic grounding depends on a fresh active-window snapshot, evidence extraction, provider output, and coordinate provenance from the same request.
3. Box refinement depends on semantic grounding; it must not run first.
4. Multi-step workflow reliability depends on trustworthy single-step target selection.
5. Safety presentation depends on a valid target and risk classification: warning-only risks show immediately, while strong risks require target-reveal acknowledgment.
6. Production release work depends on stable permissions, overlay behavior, voice, and target accuracy.
7. Final visual acceptance depends on performance and active-Space/fullscreen behavior.
8. The temporary Codex adapter depends on an installed and authenticated Codex CLI. The future product provider should be swapped behind the same adapter boundary.
9. Local ad-hoc builds change code identity and invalidate stored macOS grants. A stable Developer ID/development signing identity is required for durable permissions across future binaries.
10. Continuous liquid animation remains a small performance risk until the user observes CPU/lag during normal installed-app use; motion is limited to two small blob elements and disabled for reduced motion.

## 2026-07-15 Capture-Integrity and Target-Cue Repair — IMPLEMENTED, MANUAL ACCEPTANCE PENDING

1. Prove why Spotify metadata was paired with wallpaper pixels — `COMPLETED`: the ad-hoc rebuild lacked Screen Recording trust and capture incorrectly continued after failed preflight.
2. Fail closed before provider use — `COMPLETED`: TypeScript and native Rust independently reject untrusted capture.
3. Generalize target visuals by rectangle geometry — `COMPLETED`: wide text/tab regions receive a full rounded outline; compact icons retain the circle.
4. Focused regressions — `COMPLETED`: capture access 2/2, cue geometry 4/4, visual QA 17/17, native tests 5/5.
5. Broader verification and release — `COMPLETED`: all workspace TypeScript, Rust check, semantic verifier 23/23, production web build, app release, signing, install, hash match, and launch pass.
6. Installed-app permission and live behavior acceptance — `PENDING`, user-owned. Grant Screen Recording to the exact current `/Applications/Toki.app` if prompted, relaunch, then run the known commands manually.

Current installed executable SHA-256: `842d14520c795c4a311a989ce12b0f2c5a6d3b4d13990d056286e1df4920ae7e`. Gesture Step 3 installed-app PID at verification: `25256`.
