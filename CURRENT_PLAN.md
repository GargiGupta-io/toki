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

## Adaptive Gesture Control Plan — STEP 9 COMPLETE; EXPERIENCE REPAIR AUTOMATED GATES COMPLETE, LIVE ACCEPTANCE PENDING

The detailed design and rationale are preserved in `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md`. Execution uses one step at a time, with a pause for user review after every completed step.

1. Freeze gesture contracts and deterministic landmark fixtures — `COMPLETED` in Gesture Step 1; 7/7 focused tests and all workspace typechecks pass.
2. Extract an always-running gesture runtime independent of Debug — `COMPLETED` in Gesture Step 2; Overlay now owns the camera, hidden video source, MediaPipe loop, smoothing, and legacy action routing while Debug receives sanitized snapshots only.
3. Package MediaPipe assets locally and preserve camera privacy — `COMPLETED` in Gesture Step 3; the exact MediaPipe 0.10.35 WASM loaders/binaries and official float16 hand-landmarker model are checksum-pinned, loaded from packaged application paths, embedded in the signed native app, and covered by a 7/7 offline asset gate. Camera-frame privacy and legacy gesture ownership regressions remain green.
4. Build reliable single-hand pointing with calibration, smoothing, and active-display mapping — `COMPLETED` at the implementation/build gate in Gesture Step 4; a palm-normalized point pose, 140 ms stability hold, configurable personal camera range, mirrored/clamped active-display mapping, dead-zone smoothing, absolute blob positioning, two-second tracking-loss recovery, and immediate permission fallback are covered by 9/9 focused tests. Live comfort/lighting tuning remains user-owned acceptance.
5. Build pointer locking with an immutable snapshot and screen-freshness invalidation — `COMPLETED`, then repaired for live acceptance on 2026-07-18. The active trigger is one deliberate `160 ms` index bend on the same tracked hand, with `120 ms` interruption grace, held-bend latching, stale/moved/wrong-hand refusal, and extension plus `350 ms` cooldown rearming. The immutable coordinate, detached liquid cue, and camera/permission/display/window invalidation remain unchanged. The current focused gate passes 9/9; manual camera comfort remains user-owned acceptance.
6. Add a bounded, resettable local adaptive profile with two-second human grace windows — `COMPLETED` at the implementation/build gate in Gesture Step 6; the three-stage Debug calibration requires 6 approved point samples, 5 approved index-bend samples, and 5 approved pinch-distance samples, keeps samples in memory, persists only versioned median/MAD/count statistics, clamps every derived setting, and restores defaults through Reset. Correct and Wrong gesture are explicit user decisions. Confidence, action mappings, safety, provider verification, permissions, timing grace, and click behavior remain fixed. The focused gate passes 6/6; manual comfort/tuning remains user-owned acceptance.
7. Add stable two-hand identity plus liquid split/merge visuals — `COMPLETED` at the implementation/build gate in Gesture Step 7; the bundled landmark runtime now returns up to two hands, stable track IDs survive detector reordering, crossing, and a two-second loss window, pointer/control roles do not swap while retained, and palm-separation hysteresis drives a reduced-motion-safe liquid split/merge presentation. The control hand has no action authority in this step. The focused gate passes 6/6 and the prior gesture gates remain 43/43; live two-hand comfort/lighting acceptance remains user-owned.
8. Compose a locked pointer with secondary-hand pinch hold-to-talk; release submits exactly once and persistent tracking loss terminates safely — `COMPLETED`, with the live release repair installed on 2026-07-20. A press is accepted only with current lock context and an idle recorder. A deliberate release is latched across missing camera frames for its `180 ms` hold. Two seconds of loss still permits recovery; expiry now ends listening and submits the audio already captured once instead of resetting and discarding it. Ordinary and contextual pinch sessions are detector/track-owned so they cannot terminate each other. Gesture control voice passes 13/13 and voice hold passes 3/3. Manual camera/microphone acceptance remains user-owned.
9. Add pointer-grounded “explain this” using the locked region and current screen evidence — `COMPLETED` at the implementation/build gate in Gesture Step 9. Approved deictic phrases consume the matching frozen lock once, recapture and fingerprint the active window, combine nearby OCR/Accessibility/DOM evidence, and refuse stale, ambiguous, conflicting, generic, unsupported, low-confidence, or moved targets. The provider receives the exact point plus a bounded 160 px focus region through the existing Codex subscription bridge. Results use a separate passive card and optional post-microphone speech with persistent mute; they never click, become guidance targets, or show the verified-target ring. The focused gate passes 9/9, all selected prior regressions and the 120-case corpus remain green, and visual-motion QA remains 18/18. Manual pointer/voice/explanation acceptance remains user-owned.
10. Add later gestures only after the basic composition is reliable — `DEFERRED` while the user-reported gesture experience repair is completed.
11. Run the full regression matrix, rebuild/install/launch, and hand manual gesture acceptance to the user — `COMPLETED` on 2026-07-17. The final integrated gate passes 244/244 automated tests plus all visual/browser/known-screen/typecheck/Rust/provider/build/sign/install checks. The ordered user checklist is `touchpilot/docs/gesture-experience-manual-acceptance.md`.

### Gesture Experience Repair — AUTOMATED GATES COMPLETE, MANUAL ACCEPTANCE PENDING

1. Unify Camera + Gestures into one top Controls lifecycle; add explicit local voice-on and a deliberate two-fist privacy shutdown — `COMPLETED` at the implementation/build/install gate on 2026-07-17. The focused suite passes 7/7, selected gesture/voice/privacy/visual regressions remain green, TypeScript and Rust checks pass, and the signed built/installed executables match. Live acceptance is user-owned.
2. Reduce pointer sensitivity, stabilize control-hand pinch hold-to-talk, and clear/recover stale hand state without lag, disappearing, or stuck gesture state — `COMPLETED` at the implementation/build/install gate on 2026-07-17. The focused stability gate passes 4/4, pointing 9/9, control voice 11/11, two-hand 6/6, target lock 8/8, and selected broader gates remain green. Live comfort is user-owned.
3. Keep a visible liquid strand between the two split lobes for the complete split state, including hand motion, recovery, and reduced-motion behavior — `COMPLETED` at the implementation/build/install gate on 2026-07-17. Edge-inset geometry follows both lobes, safely handles overlap, thins with distance, remains visible in the stable split state, and becomes static rather than hidden under reduced motion. The focused strand gate passes 7/7, two-hand 6/6, visual motion 18/18, and selected broader gates remain green. Live visual taste is user-owned.
4. Run the full regression matrix, rebuild/sign/install, ensure exactly one installed process, launch, and hand the manual camera/gesture matrix to the user — `COMPLETED` on 2026-07-17. The final gate passes 244/244 automated TypeScript/Node/Rust tests, 18/18 visual assertions, all browser/AX/OCR/workflow/eval fixtures, TypeScript, Rust test/check/format, provider readiness, production builds, signing, privacy inspection, exact hash comparison, and one-process launch. Live checklist execution remains user-owned.
5. Remove cumulative live pointer lag and visually detach Toki from the fingertip — `COMPLETED` at the implementation/build/install gate on 2026-07-18. The bounded inference cadence is now 24 FPS, pointer derivation occurs in the same inference callback instead of a later React effect, motion-sensitive smoothing reaches `0.54` for deliberate movement, and gesture-owned blob following uses `0.055 s`. The unshifted pointer remains authoritative for locks while the blob is drawn about `57 px` away with edge-aware flipping. One hundred focused gesture/visual assertions, all workspace TypeScript checks, signing, installation, exact hash comparison, and one-process launch pass. Live responsiveness and spacing remain user-owned acceptance.
6. Add a private machine-readable diagnostics bridge so Codex can inspect Toki without user-posted Debug screenshots — `COMPLETED` at the implementation/build/install gate on 2026-07-18. The Overlay exports a sanitized latest snapshot at most every 500 ms, a bounded 160-entry transition history, and one overwritten current capture when available. Audio and inline image data are never written to JSON; secret-shaped fields are redacted; native writes are atomic with private directory/file permissions. `npm run toki:debug` reads the installed app while visual Debug is closed. Sanitizer 3/3, gesture input stability 6/6, runtime ownership 6/6, all workspace typechecks, five native tests, Rust check/format, production builds, signing, installation, strict verification, direct readback, private-permission checks, matching hashes, and exactly one launched process pass. No Toki command or gesture was issued.
7. Replace double-air-tap with one deliberate index bend, stabilize secondary-hand pinch, and increase the creature/fingertip separation — `COMPLETED` at the implementation/build/install gate on 2026-07-18. Locking now requires one stable `160 ms` bend, tolerates `120 ms` interruption, emits once while held, and rearms only after extension plus `350 ms`. Pinch uses track-owned `0.68` distance smoothing, `240 ms` entry interruption grace, `0.15` release hysteresis, and a `180 ms` release hold. Toki is drawn `60 x 48 px` above-right, about `77 px` from the unshifted authoritative pointer before edge correction. The selected repair set passes 87 gesture and 18 visual assertions; all typechecks, native tests, Rust check/format, production builds, signing, replacement, strict verification, matching hashes, one-process launch, and local diagnostics readback pass. Live camera/voice acceptance remains user-owned.

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
10. The camera-to-blob scheduling and interpolation delays have a focused installed repair, but live comfort remains pending. If lag persists, the next evidence should distinguish model inference cost from WebKit rendering/CPU rather than adding more smoothing blindly.
11. Pointer explanations require a fresh active-window recapture, unique current evidence near the frozen point, and a provider answer that leaves that point unchanged. Live camera, ambiguity, stale-screen, speech, and mute behavior remain user-owned acceptance.
12. Installed-runtime failures no longer require visual Debug screenshots. Read `npm run toki:debug` first; use `npm run toki:debug -- --json` only when the concise snapshot and recent transitions are insufficient. A capture path appears only after the user runs a capture/guidance flow.

## 2026-07-15 Capture-Integrity and Target-Cue Repair — IMPLEMENTED, MANUAL ACCEPTANCE PENDING

1. Prove why Spotify metadata was paired with wallpaper pixels — `COMPLETED`: the ad-hoc rebuild lacked Screen Recording trust and capture incorrectly continued after failed preflight.
2. Fail closed before provider use — `COMPLETED`: TypeScript and native Rust independently reject untrusted capture.
3. Generalize target visuals by rectangle geometry — `COMPLETED`: wide text/tab regions receive a full rounded outline; compact icons retain the circle.
4. Focused regressions — `COMPLETED`: capture access 2/2, cue geometry 4/4, visual QA 17/17, native tests 5/5.
5. Broader verification and release — `COMPLETED`: all workspace TypeScript, Rust check, semantic verifier 23/23, production web build, app release, signing, install, hash match, and launch pass.
6. Installed-app permission and live behavior acceptance — `PENDING`, user-owned. Grant Screen Recording to the exact current `/Applications/Toki.app` if prompted, relaunch, then run the known commands manually.

Current installed executable SHA-256: `46cff0c9124ad14b7845909ac66e514de3c53923935ae873ff77c7261c343719`. This 2026-07-18 installed build includes the camera lifecycle/freshness repairs, same-frame 24 FPS pointer path, responsive motion-sensitive smoothing, the private machine-readable diagnostics bridge, one-bend pointer locking, filtered human-paced pinch, and the larger visual-only creature offset. Exactly one installed process was observed as PID `11734`; live index-bend, contextual pinch, responsiveness, and spacing acceptance remain user-owned.

## 2026-07-19 Gesture Interaction Repair — IMPLEMENTED, MANUAL ACCEPTANCE PENDING

1. Let the visible puck touch all four screen edges by clamping its actual rendered radius instead of an invisible carrier rectangle — `COMPLETED`.
2. Keep Toki visibly separate from the authoritative fingertip with a `100 x 80 px` visual offset and edge redirection — `COMPLETED`.
3. Freeze the main creature and persistent receipt at the copied bend-lock coordinate — `COMPLETED`.
4. Preserve the coordinate as `limited` when Screen Recording evidence is unavailable, while still invalidating proven display/window changes — `COMPLETED`.
5. Route ordinary one-hand pinch and contextual second-hand pinch through separate state machines into the real native hold-to-talk controller — `COMPLETED`.
6. Exclude pinch from bend classification and prevent open-palm pause from colliding with locks, pinches, two-hand interaction, or active voice — `COMPLETED`.
7. Apply the native fullscreen-auxiliary/all-Spaces contract to the interactive top utility — `COMPLETED`.
8. Compact the top utility to `380 x 58 px` passive / `400 x 218 px` expanded and make it pitch black — `COMPLETED`.
9. Rebuild, sign, install, strictly verify, match hashes, stop the old process, and launch one current installed process — `COMPLETED`.
10. User-run live checks for all four edges, persistent bend lock, ordinary pinch hold/release, contextual pinch hold/release, and fullscreen top-panel visibility — `PENDING`, user-owned.

Current installed executable SHA-256: `8b58e1b2719de6cfcd57e5dc2bad1add7ac6fe35169aad85e13de47c632d1a5f`. Exactly one installed process was observed as PID `34312`. No commit or push was made.

## 2026-07-19 Wrist-Roll and Join-Before-Split Repair — INSTALLED, MANUAL ACCEPTANCE PENDING

1. Replace the unreliable index-bend lock with a same-hand relative wrist roll — `COMPLETED`.
2. Freeze the last stable pointer before rotation so the lock cannot drift with the turning hand — `COMPLETED`.
3. Require at least `70 degrees` for `220 ms`, with `450 ms` interruption grace, `2,000 ms` sequence grace, one-shot latching, and return-to-point plus `350 ms` rearm — `COMPLETED`.
4. Expose wrist-roll pose, degrees, phase, roll ID, lock status, and user-facing `Locking target` feedback — `COMPLETED`.
5. Keep Toki merged when a second hand merely appears; require `240 ms` joined, visible `Split ready`, then `180 ms` separated — `COMPLETED`.
6. Preserve working ordinary/contextual pinch voice, pointer mapping, immutable locks, edge reach, fullscreen utility, permissions, and no-click boundaries — `COMPLETED`.
7. Update deterministic tests, acceptance documents, DeepLearn record, diagnostics reader, and migration pack — `COMPLETED`.
8. Build, sign, install, strictly verify, compare hashes, launch exactly one installed process, and read live diagnostics — `COMPLETED`.
9. User checks wrist-roll comfort/recognition, persistent pre-roll lock, far-second-hand no-op, join-then-separate split, and contextual pinch voice — `PENDING`, user-owned.

Current installed executable SHA-256: `79742b6e7a1b7dd08bf06f0debf06160e2ad1d30aad2a3a73e9440e78897f820`. Exactly one installed process was observed as PID `43794`. No commit or push was made.

## 2026-07-19 Single-Creature Lock Repair — INSTALLED, MANUAL ACCEPTANCE PENDING

1. Remove the separate blue pointer-lock creature and label — `COMPLETED`.
2. Keep exactly one main `BlobPuck` on screen and freeze it at the immutable copied coordinate after lock — `COMPLETED`.
3. Preserve top-status lock feedback, lock validation, split behavior, target coordinates, provider grounding, guidance-only target ring, and no-click boundaries — `COMPLETED`.
4. Add a regression requiring one `BlobPuck` and rejecting `TokiPointerLockCue` — `COMPLETED`, 9/9.
5. Run visual-motion and all workspace TypeScript checks — `COMPLETED`, 18/18 and pass.
6. Build, sign, install, strictly verify, compare hashes, and launch exactly one installed process — `COMPLETED`.
7. User confirms wrist-roll lock leaves one frozen main creature and no miniature blue lock creature — `PENDING`, user-owned.

Current installed executable SHA-256: `a96fd4ac4376755898e2659d61c3caac60689c40a28349d18025d9679185ac6d`. Exactly one installed process was observed as PID `47578`. No commit or push was made.

## 2026-07-19 Stable Local Identity and Edge Compression — INSTALLED, ONE-TIME GRANTS/MANUAL ACCEPTANCE PENDING

1. Create/reuse `Toki Local Development` in the login keychain — `COMPLETED`.
2. Require certificate signing, reject ad-hoc signing and `cdhash`-only designated requirements, and stop re-signing the installed copy — `COMPLETED`.
3. Build/sign A and record CDHash/requirement — `COMPLETED`, `10ced93909a8e41f9e3e49cb0d4777a8c10f9200`.
4. Replace edge redirection with per-axis compression while preserving `100 x 80 px` open-space spacing and the authoritative point — `COMPLETED`, pointing 11/11.
5. Build/sign changed build B and prove the requirement is identical while CDHash changes — `COMPLETED`, B is `ea7176c4e2bc0b94a1d32eaa0c80bd7ff44feba5`.
6. Run lock, visual, privacy/signing, typecheck, syntax, and diff gates — `COMPLETED`.
7. Copy/verify `/Applications/Toki.app`, reset obsolete TCC rows once, and launch — `COMPLETED`, built/installed SHA-256 `2edcbc0ab20f60d36a5dc0997f51de131367b968806e729a36ab9595e74fb86e`, PID `55623`.
8. User approves the fresh stable identity and checks open-space/edge spacing — `PENDING`, user-owned.

No command, gesture, commit, or push was performed. The separate performance audit remains next only after this manual permission/visual check.

## 2026-07-20 Pinch Release and Screen Recording Request — INSTALLED, MANUAL ACCEPTANCE PENDING

1. Preserve an intentional `releasing` pinch through missing hand frames and emit one release after the existing `180 ms` hold — `COMPLETED`.
2. End a gesture-owned voice session only from its matching ordinary/contextual detector and track — `COMPLETED`.
3. Convert persistent tracking loss after the `2,000 ms` recovery grace into one submission of already captured speech so listening cannot remain stuck and audio is not discarded — `COMPLETED`.
4. Keep startup prompt-free, then call native `CGRequestScreenCaptureAccess` only when a real capture preflight is false — `COMPLETED`.
5. Preserve fail-closed capture, target grounding, coordinates, visual behavior, permissions outside this request, and no-click behavior — `COMPLETED`.
6. Run focused voice/capture/gesture/privacy gates plus TypeScript and Rust verification — `COMPLETED`.
7. Rebuild, reuse the persistent identity, install without re-signing, strictly verify, and launch exactly one installed process — `COMPLETED`; PID `63321`, SHA-256 `83eeed91ba94611ce8d907669a88217dbd1c8107bc806436dba5776a10ade251`.
8. User pinches and holds, speaks, unpinches, confirms one submission, then accepts the native Screen Recording prompt on the first real guidance request and relaunches once if macOS requires it — `PENDING`, user-owned.

No TCC reset, Toki command, gesture, commit, or push was performed.

## 2026-07-27 Gesture Polish Phases 1–6 — AUTOMATED GATES COMPLETE, LIVE ACCEPTANCE PENDING

1. Add bounded private frame diagnostics and deterministic production-pointer replay — `COMPLETED`.
2. Replace frame-rate-dependent pointer smoothing with elapsed-time one-to-one filtering — `COMPLETED`.
3. Make a live lock authoritative over split presentation so exactly one main creature shows checking, locked, or limited feedback — `COMPLETED`.
4. Bind lock validation to the real frontmost window under the frozen point, with stable window identity and point-aware receipts — `COMPLETED`.
5. Harden ordinary/contextual pinch-to-talk with physical interruption grace, valid-hold-time accumulation, detector/track/event ownership, native attempt generation, and native session verification — `COMPLETED`.
6. Run the final performance, package-footprint, complete regression, release, and installation audit — `COMPLETED`.
7. User executes the ordered live camera, pointer, wrist-roll, split, pinch, voice, and guidance matrix — `PENDING`, user-owned.

Phase 6 production verification: the idle liquid loop is bounded to `30 FPS` without delaying active pointer/target updates, and MediaPipe loads only when camera ownership requests it. The installed app is `30.89 MiB`; web dist is `40.27 MiB`; production JavaScript is `0.58 MiB`; CSS is `0.03 MiB`; and offline MediaPipe is `39.65 MiB`, all within enforced budgets. The complete automated gate passes 240 root tests, 33 AI tests, 5 Rust tests, all deterministic browser/known-screen/AX-OCR/workflow/eval fixtures, provider readiness, visual-motion 19/19, typechecks, builds, signing, installation, footprint enforcement, and replay. Built and installed executable SHA-256 values match at `f7dbda8ecb5be43cc5a033cc8ad039c8d8b9699696118b51825193a38c5d527c`; installed CDHash `102050a23efbe8aa9ee30fd70407cb0b4adbe14c`; the certificate-rooted designated requirement is unchanged; exactly one installed process was observed as PID `8596`. Fresh diagnostics are idle with Camera + Gestures off. No Toki command, gesture, commit, or push was performed.

## 2026-07-20 Direct Pinch Handoff and Full-Frame Pointer Mapping — INSTALLED, MANUAL ACCEPTANCE PENDING

1. Prove whether the stuck session came from gesture recognition or voice delivery — `COMPLETED`; diagnostics show a correct same-track release while voice stayed listening.
2. Remove the local `emitTo` round trip from ordinary/contextual pinch while keeping one shared recorder lifecycle — `COMPLETED`.
3. Preserve the Tauri command listener for real cross-window commands only — `COMPLETED`.
4. Replace reduced-range amplified mapping with full camera `[0, 1]` to display `[0, 1]`, horizontal mirror only — `COMPLETED`.
5. Prevent adaptive calibration from shrinking the pointer mapping range — `COMPLETED`.
6. Retune response to `0.0025` dead zone, `0.82` alpha, `0.60` minimum scale, `0.04` full-response distance, and `0.025 s` lead follow — `COMPLETED`.
7. Run focused gesture voice, pointing, stability, adaptive, hold, runtime, TypeScript, and diff gates — `COMPLETED`.
8. Rebuild, reuse the persistent signing identity, copy without re-signing, strictly verify, launch, and read fresh diagnostics — `COMPLETED`; PID `66966`, SHA-256 `da7e81aa51aa06ca5c86220ded651c5abb164c1976dc6ebef269590931485bd7`.
9. User confirms full-frame pointer feel and pinch-hold/unpinch one-time submission — `PENDING`, user-owned.

No TCC reset, Toki command, gesture, commit, or push was performed.
