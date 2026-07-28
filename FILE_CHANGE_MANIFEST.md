# File Change Manifest

## Manifest Scope

This manifest separates the pre-gesture repair checkpoint from historical work and local-only notes.

- Git baseline before the repair: `d4234bf00104ad973e694fc3564cf98a21a12f30`
- Repair commit range: `315e49e` through `de7d2b6`
- Tracked architecture documentation commit: `71a2ebe`
- Branch: `main`
- Tracked diff before the migration pack: none.
- Staged diff before the migration pack: none.
- Pre-existing untracked path: `touchpilot/learnings/`.
- An exhaustive file-by-file history from repository creation is `UNKNOWN`; Git history remains the authoritative historical manifest.

The 2026-07-15 source, test, script, and tracked documentation repair is committed. The app-only bundle was signed, installed at `/Applications/Toki.app`, and launched for user-owned acceptance. `touchpilot/learnings/` remains deliberately untracked because it contains local prompt history and has not been approved for publication.

## Migration-Pack Files Created

These files are documentation only and belong to neither the dev runtime nor the installed/main runtime.

| Path | Change | Reason | Runtime ownership |
| --- | --- | --- | --- |
| `CODEX_HANDOFF.md` | Added to checkpoint | Current project and handoff state | Neither |
| `CURRENT_PLAN.md` | Added to checkpoint | Reconciled roadmap and statuses | Neither |
| `FILE_CHANGE_MANIFEST.md` | Added to checkpoint | Current/historical file inventory | Neither |
| `COMMAND_AND_TEST_LEDGER.md` | Added to checkpoint | Command and verification history | Neither |
| `DECISIONS_AND_CONSTRAINTS.md` | Added to checkpoint | Requirements and decisions | Neither |
| `OPEN_ITEMS_AND_RISKS.md` | Added to checkpoint | Bugs, blockers, and risks | Neither |

## Current Untracked Files

The learning paths below pre-existed as untracked documentation. References to the retired runtime were removed from them during the zero-reference cleanup, so they must no longer be described as untouched.

### Root Learning Documents

- `touchpilot/learnings/mac-migration-sanity.md`
- `touchpilot/learnings/phase-1-foundation.md`
- `touchpilot/learnings/phase-2-overlay-prototype.md`
- `touchpilot/learnings/phase-3-screen-capture-foundation.md`
- `touchpilot/learnings/phase-4-real-screen-capture.md`
- `touchpilot/learnings/phase-5-ai-guidance-loop.md`
- `touchpilot/learnings/phase-6-runtime-qa-hardening.md`
- `touchpilot/learnings/phase-7-fluid-puck-motion.md`
- `touchpilot/learnings/phase-8-monochrome-overlay-reset.md`
- `touchpilot/learnings/phase-9-gesture-mvp.md`
- `touchpilot/learnings/phase-10-voice-architecture-reset.md`
- `touchpilot/learnings/phase-11-safety-guardrails.md`
- `touchpilot/learnings/phase-12-screen-intelligence.md`
- `touchpilot/learnings/phase-13-multi-step-workflows.md`
- `touchpilot/learnings/phase-13a-living-visual-identity.md`
- `touchpilot/learnings/phase-14-visual-polish.md`
- `touchpilot/learnings/phase-15-evals.md`
- `touchpilot/learnings/phase-16-production-readiness.md`
- `touchpilot/learnings/plan.md`

### Local Notes

- `touchpilot/learnings/local-notes/legacy-clicky-steps.md`
- `touchpilot/learnings/local-notes/operating-rules.md`
- `touchpilot/learnings/local-notes/restored-root/session_prompts.md`
- `touchpilot/learnings/local-notes/restored-root/steps.md`
- `touchpilot/learnings/local-notes/session-prompts.md`
- `touchpilot/learnings/local-notes/touchpilot-steps.md`

`touchpilot/learnings/plan.md` is untracked and must not replace the tracked roadmap without an explicit reconciliation decision. The tracked roadmap is `touchpilot/docs/roadmap.md`.

## Historically Changed Runtime Areas

The following lists the current authoritative areas and why they changed. Use `git log -- <path>` for exact commit-by-commit history.

### Desktop React Runtime — Shared by Dev and Main App

| Path | Purpose of historical changes |
| --- | --- |
| `touchpilot/apps/desktop/src/App.tsx` | Window routing, runtime state, voice/gesture/guidance coordination, settings and debug UI |
| `touchpilot/apps/desktop/src/App.css` | Overlay, utility, debug, puck, cue, and responsive visual styling |
| `touchpilot/apps/desktop/src/visionGuidanceContract.ts` | Provider-neutral prompt, schema, parsing, raw-output preservation, coordinate mapping, and current-image-first evidence instructions |
| `touchpilot/apps/desktop/src/codexVisionProvider.ts` | Temporary Codex-subscription adapter |
| `touchpilot/apps/desktop/src/guidanceProvider.ts` | Provider routing boundary for current and future adapters |
| `touchpilot/apps/desktop/src/voiceHoldController.ts` | Pure hold-to-talk state machine and release-race handling |
| `touchpilot/apps/desktop/src/guidanceAcceptance.ts` | Accepted/rejected guidance render boundary |
| `touchpilot/apps/desktop/src/TokiTopUtilitySurface.tsx` and `.css` | Warning presentation and the guidance-only `Show target` control |
| `touchpilot/apps/desktop/src/topUtility.ts` and `tokiCreatureState.ts` | Warning status type and cursor-anchored hidden-target review state |
| `touchpilot/apps/desktop/src/BlobPuck.tsx` and `TokiCreatureLayer.*` | Puck visuals and target-ring placement/render gating |
| `touchpilot/apps/desktop/src/candidateRanking.ts` | Candidate ranking/selection logic |
| `touchpilot/apps/desktop/src/candidateIntent.ts` | Command/candidate semantic vocabulary, guarded provider-semantic metadata, and contextual read-only navigation/media-history inference |
| `touchpilot/apps/desktop/src/targetVerification.ts` | Structured, vision-only, and guarded combined-evidence acceptance/rejection |
| `touchpilot/apps/desktop/src/overlayGeometry.ts` | Overlay/cursor coordinate helpers |
| `touchpilot/apps/desktop/src/cameraDevices.ts` | Camera discovery |
| `touchpilot/apps/desktop/src/gestureClassifier.ts` | Pinch/open-palm classification |
| `touchpilot/apps/desktop/src/components/` | Product UI and visual runtime components, where present |

Exact complete file list under `src/components/`: use `rg --files touchpilot/apps/desktop/src/components` at the next audit. It was not re-enumerated after compaction, so omitted entries are `UNKNOWN`.

### Native Desktop Layer — Shared Build, Platform-Specific Runtime

| Path | Purpose of historical changes |
| --- | --- |
| `touchpilot/apps/desktop/src-tauri/src/lib.rs` | Tauri commands, windows, tray/menu, capture, audio, permissions, native runtime wiring, dual-signal Right Option detection, and Input Monitoring request |
| `touchpilot/apps/desktop/src-tauri/src/macos_overlay.rs` | macOS NSWindow/Space/overlay behavior |
| `touchpilot/apps/desktop/src-tauri/tauri.conf.json` | Product/window/build/bundle configuration |
| `touchpilot/apps/desktop/src-tauri/Info.plist` | macOS bundle/menu-agent metadata |
| `touchpilot/apps/desktop/src-tauri/Cargo.toml` | Native dependencies and features |
| `touchpilot/apps/desktop/src-tauri/capabilities/default.json` | Tauri window capability permissions |

The Windows-specific native branches remain in the shared Rust code. No evidence found in current status indicates they were deleted.

### Browser Extension — Companion Runtime

| Path | Purpose of historical changes |
| --- | --- |
| `touchpilot/apps/browser-extension/` | DOM/browser evidence extraction and bridge integration |

The complete historical per-file list is available through Git and is not reproduced here. The repair checkpoint is summarized below.

### Shared TypeScript Packages

| Path | Purpose of historical changes |
| --- | --- |
| `touchpilot/packages/shared/src/index.ts` | Cross-runtime guidance, trace, target, session, safety, and evidence contracts |
| `touchpilot/packages/ai/` | Provider/guidance abstractions |
| `touchpilot/packages/evals/` | Deterministic evaluation contracts and scoring |
| `touchpilot/packages/design/` | Shared design definitions |
| `touchpilot/packages/ui/` | Shared UI primitives |

### Shared Rust Crates

| Path | Purpose of historical changes |
| --- | --- |
| `touchpilot/crates/accessibility/` | Accessibility evidence adapters |
| `touchpilot/crates/capture/` | Screen/window capture |
| `touchpilot/crates/gestures/` | Gesture-domain logic |
| `touchpilot/crates/input/` | Native input observation |
| `touchpilot/crates/overlay-native/` | Native overlay support |
| `touchpilot/crates/safety/` | Safety policy |
| `touchpilot/crates/storage/` | Local storage/security boundary |

### QA and Build Scripts

| Path | Purpose of historical changes |
| --- | --- |
| `touchpilot/scripts/vision-provider-contract.test.mjs` | Provider-neutral contract, parsing, image mapping, warning-only permission normalization, and strong-risk reveal normalization tests |
| `touchpilot/scripts/voice-hold-controller.test.mjs` | Hold, release-during-startup, and duplicate-release tests |
| `touchpilot/scripts/target-verification.test.mjs` | Source-aware target verification tests, including strict current-image-only, combined-evidence, read-only media-history, and pre/post-acknowledgment render cases |
| `touchpilot/scripts/guidance-provider-check.mjs` | Codex CLI installation/authentication readiness check |
| `touchpilot/scripts/windows-runtime-qa.ps1` | Windows native-window runtime probe |
| `touchpilot/scripts/windows-visual-qa.ps1` | Windows visual screenshot checks |
| `touchpilot/scripts/windows-tauri-build.ps1` | Windows Tauri release build helper |
| `touchpilot/scripts/` | Additional coordinate, provider-image, candidate, planning, visual, Mac, and eval QA scripts |

Recent exact changes can be inspected with:

```bash
git show --stat d4234bf
git show --stat 839f428
git show --stat 55e0612
git show --stat 6fae5d1
git show --stat 34755db
```

## Pre-Gesture Repair Areas

- Desktop runtime: provider routing, Codex bridge, voice hold state, target acceptance, target visuals, candidate intent, structured/current-image verification, guarded combined evidence, contextual read-only/media-history semantics, warning-only safety presentation, the guidance-only strong-risk target reveal gate, and environment types.
- Native runtime: Right Option press/release monitoring and the Codex CLI Tauri command.
- Shared contracts/evals: provider union, validation, fixtures, comparison labels, explicit `vision_control` supporting-evidence typing, and the `sensitive_guidance_warning` policy reason.
- Capture crate: current capture-related tracked edits are preserved as part of the existing accuracy work.
- Scripts/package commands: retired adapter removal, provider readiness check, hold/provider regressions, smoke/planning/verification updates, and visual QA updates.
- Documentation: tracked project docs, this six-file migration pack, untracked local learnings, and the external project learning note were reconciled with the current architecture.
- Deleted runtime/test files: the former local-runtime provider module and its provider-specific test were removed.

## Tracked Documentation Areas

- `touchpilot/docs/roadmap.md`: tracked roadmap.
- `touchpilot/docs/phase-14-visual-polish.md`: visual-polish closure evidence.
- `touchpilot/docs/phase-15-evals.md`: evaluation closure evidence.
- `touchpilot/docs/phase-16-production-readiness.md`: production-readiness plan/status.
- `touchpilot/docs/archive/phase-13a-legacy-puck/`: archived legacy puck implementation/reference.

## Generated Files: Do Not Edit Manually

| Path | Generated by | Rule |
| --- | --- | --- |
| `touchpilot/apps/desktop/dist/` | TypeScript/Vite production build | Never edit; rebuild from source |
| `touchpilot/target/` | Cargo/Tauri builds | Never edit |
| `touchpilot/node_modules/` | npm install | Never edit |
| `touchpilot/apps/desktop/src-tauri/target/` | Cargo if a local target directory is used | Never edit |
| macOS `.app`, `.dmg`, and bundle outputs under Tauri target directories | Tauri bundler | Never edit |
| Windows `.exe`, `.msi`, and NSIS outputs under target directories | Tauri/Cargo bundler | Never edit |

Whether all generated outputs are ignored by Git is `UNKNOWN`; verify `.gitignore` before cleanup. Do not delete build artifacts without explicit approval.

## Latest Living-Visual Delta

| Path | Status | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/BlobCursor.tsx` | Committed in `69156bc` | Keeps the puck alive while stationary through bounded drift, deformation, and organic radius changes; honors reduced motion inside the frame loop |
| `touchpilot/apps/desktop/src/BlobPuck.tsx` | Committed in `69156bc` | Defines per-mode liquid energy, consumes the existing droplet safety gate, and calculates accepted-target travel geometry |
| `touchpilot/apps/desktop/src/BlobPuck.css` | Added in `69156bc` | Draws the single transient target droplet and release glint with a reduced-motion fallback |
| `touchpilot/apps/desktop/src/App.tsx` | Committed in `fdbb118` | Passes the accepted target into `BlobPuck` and includes workflow targets in safe motion gating |
| `touchpilot/scripts/visual-motion-qa.mjs` | Committed in `69156bc` | Asserts stationary liquid motion, reduced-motion handling, accepted-target-only droplet rendering, and preservation of target visual ownership |
| `touchpilot/scripts/puck-motion.test.mjs` | Added in `69156bc` | Proves accepted, rejected, hidden/missing, and processing droplet boundaries |
| `touchpilot/package.json` | Committed in `de7d2b6` | Adds `test:puck-motion` |
| `/Users/pumba/Documents/Codex/clicky/semantic-grounding-and-target-visuals.md` | Modified outside repository | Updates the existing deep-learning record for liquid motion and target travel |

Generated `dist/`, `target/`, and `.app` outputs were rebuilt but remain generated artifacts and must not be committed as source.

## Gesture Step 7 Two-Hand Split/Merge Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/handLandmarker.ts` | Modified | Raises bundled local inference from one to at most two current hands |
| `touchpilot/apps/desktop/src/gestureHandTracking.ts` | Added | Assigns stable velocity-assisted track IDs, deterministic order, and two-second retained histories |
| `touchpilot/apps/desktop/src/gestureTwoHand.ts` | Added | Preserves pointer/control roles and owns split/merge hold thresholds, hysteresis, recovery, and visual mapping |
| `touchpilot/apps/desktop/src/gestureRuntime.ts` | Modified | Feeds only the retained pointer hand to all existing action classifiers and publishes sanitized multi-hand/split diagnostics |
| `touchpilot/apps/desktop/src/App.tsx` | Modified | Enables two-hand runtime configuration, passes visual split state to the puck, and exposes stable roles in Debug |
| `touchpilot/apps/desktop/src/BlobPuck.tsx` | Modified | Renders two hand-following liquid lobes and a transient separation/rejoin bridge without adding an action path |
| `touchpilot/apps/desktop/src/BlobPuck.css` | Modified | Adds split/merge/recovery transitions and reduced-motion fallbacks |
| `touchpilot/scripts/gesture-two-hand.test.mjs` | Added | Covers two-hand limits, identity/order/crossing, recovery, role stability, hysteresis, bounds, and no-action behavior |
| `touchpilot/scripts/visual-motion-qa.mjs` | Modified | Locks the visual-only liquid split and reduced-motion boundary |
| `touchpilot/package.json` | Modified | Adds `test:gesture-two-hand` |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records Step 7 behavior, boundaries, verification, installed hash, and next step |

Generated production frontend/native outputs and `/Applications/Toki.app` were rebuilt and replaced but remain outside tracked source. `touchpilot/learnings/` remains pre-existing and untracked.

## Gesture Step 9 Frozen Pointer Explanation Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gesturePointerExplanation.ts` | Added in `0adb06a` | Recognizes deictic explanation intent, preserves ordinary voice, disambiguates current evidence, invokes the existing subscription vision bridge, and rejects moved, generic, unsupported, conflicting, stale, ambiguous, or low-confidence targets |
| `touchpilot/apps/desktop/src/App.tsx` | Committed in `09e0ae4` | Consumes the frozen lock once, recaptures/revalidates the active window, gathers combined evidence, maps the exact point/focus region, coordinates provider state/speech, and exposes Debug diagnostics without entering generic guidance rendering |
| `touchpilot/apps/desktop/src/TokiPointerExplanationCard.tsx` | Added in `1deec2c` | Passive processing/grounded/clarification card anchored beside the frozen point |
| `touchpilot/apps/desktop/src/TokiPointerExplanationCard.css` | Added in `1deec2c` | Pointer-transparent card presentation and reduced-motion behavior |
| `touchpilot/apps/desktop/src/TokiTopUtilitySurface.tsx` | Committed in `6ccf27a` | Adds the persistent spoken-pointer-explanation mute control |
| `touchpilot/apps/desktop/src/TokiTopUtilitySurface.css` | Committed in `6ccf27a` | Styles the compact mute control without changing normal overlay target visuals |
| `touchpilot/scripts/gesture-pointer-explanation.test.mjs` | Added in `ca04de0` | Covers approved phrases, routing, evidence uniqueness, provider/result defenses, bridge payload, no side effects, and App revalidation/render boundaries |
| `touchpilot/package.json` | Committed in `ca04de0` | Adds `test:gesture-pointer-explanation` |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records Step 9 behavior, evidence/provider boundaries, verification, installed hash, and next step |
| `/Users/pumba/Documents/Codex/clicky/steps.md` | Modified outside repository | Records the one-step completion and manual acceptance checklist |

Generated production frontend/native outputs and `/Applications/Toki.app` were rebuilt and replaced but remain outside tracked source. `touchpilot/learnings/` remains pre-existing and untracked and was not modified or staged.

## Post-Step-9 Camera Privacy Crash Repair Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src-tauri/Info.plist` | Modified, uncommitted | Adds the required `NSCameraUsageDescription` explaining local gesture tracking and frame non-retention |
| `touchpilot/scripts/macos-sign-app.sh` | Modified, uncommitted | Refuses to sign or install a final macOS bundle missing Camera, Microphone, or Screen Recording usage descriptions |
| `touchpilot/scripts/macos-privacy-usage-descriptions.test.mjs` | Added, uncommitted | Verifies meaningful source descriptions and that the release guard runs before signing |
| `touchpilot/package.json` | Modified, uncommitted | Adds `test:macos-privacy` |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the TCC crash mechanism, release pattern, repair gates, and new installed hash |
| `/Users/pumba/Documents/Codex/clicky/steps.md` | Modified outside repository | Records the manual failure and repair beneath Step 9 |

Generated production outputs and `/Applications/Toki.app` were rebuilt/replaced but remain outside source control. `touchpilot/learnings/` remains untouched and untracked.

## Gesture Step 8 Locked Control-Hand Voice Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gestureControlVoice.ts` | Added | Pure stable control-pinch lifecycle, adaptive press and hysteretic release, two-second recovery/cancel, lock gate, and immutable gesture voice receipt |
| `touchpilot/apps/desktop/src/gestureRuntime.ts` | Modified | Feeds only the stable control hand into the new pure controller and publishes sanitized control diagnostics while legacy classifiers remain pointer-only |
| `touchpilot/apps/desktop/src/App.tsx` | Modified | Requires a validated pointer lock, freezes it at voice press, reuses the existing hold controller, submits once on release, cancels on persistent loss/invalidation, and shows Debug state |
| `touchpilot/packages/shared/src/index.ts` | Modified | Adds the immutable gesture voice context to the voice command request contract |
| `touchpilot/scripts/gesture-control-voice.test.mjs` | Added | Covers lock gating, hysteresis, event deduplication, immutable receipt, recovery/cancel, hand ownership, voice composition, and side-effect boundaries |
| `touchpilot/package.json` | Modified | Adds `test:gesture-control-voice` |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records Step 8 behavior, reasoning, safety boundaries, verification, installed hash, and next step |

Generated production frontend/native outputs and `/Applications/Toki.app` were rebuilt and replaced but remain outside tracked source. `touchpilot/learnings/` remains pre-existing and untracked.

## Gesture Step 6 Adaptive-Profile Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gestureAdaptiveProfile.ts` | Added | Versioned local profile storage, explicit guided calibration state, robust median/MAD derivation, and bounded runtime settings |
| `touchpilot/apps/desktop/src/gestureClassifier.ts` | Modified | Accepts the clamped active pinch threshold while preserving the fixed default |
| `touchpilot/apps/desktop/src/gestureTargetLock.ts` | Modified | Accepts the clamped active air-tap flexion threshold while preserving the fixed default |
| `touchpilot/apps/desktop/src/gestureRuntime.ts` | Modified | Applies one derived profile to pointer mapping, pinch, and tap classifiers and publishes sanitized active settings |
| `touchpilot/apps/desktop/src/App.tsx` | Modified | Owns profile/session state, persists only completed statistics, and adds Debug Start/Correct/Wrong gesture/Reset controls |
| `touchpilot/scripts/gesture-adaptive-profile.test.mjs` | Added | Covers explicit approval, rejection, versioning, privacy, reset, robust statistics, hard clamps, and classifier application |
| `touchpilot/package.json` | Modified | Adds `test:gesture-adaptive-profile` |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the Step 6 implementation, boundaries, verification, build hash, and next step |

Generated production frontend/native outputs and `/Applications/Toki.app` were rebuilt and replaced but remain outside tracked source. `touchpilot/learnings/` remains pre-existing and untracked.

## 2026-07-15 Capture-Integrity and Target-Cue Repair

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/captureAccess.ts` | Added in `0942e2c` | Shared fail-closed Screen Recording trust guard and actionable error message |
| `touchpilot/apps/desktop/src/App.tsx` | Committed in `fdbb118` | Enforces capture preflight denial instead of swallowing or overwriting it |
| `touchpilot/apps/desktop/src-tauri/src/lib.rs` | Committed in `0942e2c` | Refuses native pixel capture when macOS Screen Recording preflight is false; adds native regression |
| `touchpilot/apps/desktop/src/targetCueGeometry.ts` | Added in `69156bc` | Geometry-only policy for wide region outline versus compact circle |
| `touchpilot/apps/desktop/src/TokiStatusRing.tsx` | Committed in `69156bc` | Renders the full rounded target region or compact circular cue |
| `touchpilot/apps/desktop/src/TokiStatusRing.css` | Committed in `69156bc` | Adds region outline animation and reduced-motion behavior |
| `touchpilot/apps/desktop/src/TokiCreatureLayer.tsx` | Committed in `69156bc` | Passes verified target width/height into the cue renderer |
| `touchpilot/scripts/capture-access.test.mjs` | Added in `0942e2c` | Tests trusted and denied frontend capture gates |
| `touchpilot/scripts/target-cue-geometry.test.mjs` | Added in `69156bc` | Tests wide text/tab and compact icon cue selection |
| `touchpilot/scripts/visual-motion-qa.mjs` | Committed in `69156bc` | Verifies full region wiring, compact-circle preservation, and reduced motion |
| `touchpilot/package.json` | Committed in `de7d2b6` | Adds focused capture-access and target-cue test commands |
| `/Users/pumba/Documents/Codex/clicky/semantic-grounding-and-target-visuals.md` | Modified outside repository | Records capture-integrity root cause, geometry cue policy, tests, and installed checkpoint |

Generated release artifacts were rebuilt and installed but remain non-source outputs. The source repair is committed; generated artifacts are not committed.

## 2026-07-17 Gesture Experience Repair Phase 1 Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gestureCameraControl.ts` | Added, uncommitted | Pure atomic Camera + Gestures state, explicit positive voice-on classification, closed-fist classification, and two-fist privacy-shutdown timing |
| `touchpilot/apps/desktop/src/gestureFixtures.ts` | Modified, uncommitted | Adds a deterministic closed-fist landmark fixture |
| `touchpilot/apps/desktop/src/gestureRuntime.ts` | Modified, uncommitted | Advances/reset shutdown state, publishes sanitized progress, and retries camera start on device refresh |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Routes top Controls, voice-on, and shutdown through one atomic helper; removes competing Debug enable controls |
| `touchpilot/apps/desktop/src/TokiTopUtilitySurface.tsx` | Modified, uncommitted | Adds the combined top Controls switch and real lifecycle/error messaging |
| `touchpilot/apps/desktop/src/TokiTopUtilitySurface.css` | Modified, uncommitted | Fits the combined control and status into the compact top utility window |
| `touchpilot/scripts/gesture-camera-control.test.mjs` | Added, uncommitted | Covers atomic state, voice positives/negatives, gesture collision boundaries, hold/grace/cooldown, and UI ownership |
| `touchpilot/package.json` | Modified, uncommitted | Adds `test:gesture-camera-control` |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the product contract, implementation pattern, gotchas, verification, hash, and next phase |
| `/Users/pumba/Documents/Codex/clicky/steps.md` | Modified outside repository | Records the completed repair checkpoint and user-owned manual check |

The production app was rebuilt, signed, installed, strictly verified, and launched as one process. Signed built/installed executable SHA-256: `ba70cd998aba2e4f1588a49698ca95e74151f5f3da2d477376a28d68f71b6e76`. No Toki command or gesture, commit, or push was performed.

## 2026-07-17 Gesture Experience Repair Phase 2 Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gesturePointing.ts` | Modified, uncommitted | Adds lower/motion-sensitive pointer gain, a larger precision dead zone, and short visible recovery while preserving internal two-second recovery |
| `touchpilot/apps/desktop/src/gestureControlVoice.ts` | Modified, uncommitted | Adds press eligibility, entry hysteresis, and brief interruption grace without weakening held release/tracking-loss safety |
| `touchpilot/apps/desktop/src/gestureSmoothing.ts` | Modified, uncommitted | Preserves an in-progress held gesture through 120 ms of detector dropout |
| `touchpilot/apps/desktop/src/gestureFrameFreshness.ts` | Added, uncommitted | Skips duplicate video frames and emits empty derived input after a stalled timestamp |
| `touchpilot/apps/desktop/src/gestureRuntime.ts` | Modified, uncommitted | Integrates frame freshness and lock-context pinch arming without restarting the camera effect on lock changes |
| `touchpilot/apps/desktop/src/gestureTwoHand.ts` | Modified, uncommitted | Separates short split-visual recovery from longer retained hand identity |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Keeps a control press pending while its current pointer lock is checking and suppresses false legacy listening state during contextual control pinch |
| `touchpilot/scripts/gesture-input-stability.test.mjs` | Added, uncommitted | Covers duplicate/stalled camera frames, gesture dropout, pointer precision defaults, validation wait, and runtime wiring |
| `touchpilot/scripts/gesture-pointing.test.mjs` | Modified, uncommitted | Covers visible-pointer cleanup with retained internal recovery |
| `touchpilot/scripts/gesture-control-voice.test.mjs` | Modified, uncommitted | Covers entry wobble and lock-context arming |
| `touchpilot/scripts/gesture-two-hand.test.mjs` | Modified, uncommitted | Covers the short visual recovery deadline |
| `touchpilot/scripts/gesture-target-lock.test.mjs` | Modified, uncommitted | Uses the retained internal pointer, matching production lock behavior after visible cleanup |
| `touchpilot/package.json` | Modified, uncommitted | Adds `test:gesture-input-stability` |

The production app was rebuilt, signed, installed, strictly verified, and observed as one process. Signed built/installed executable SHA-256: `b3e1d2d50d2e887bc783772f1782d00718a9394bc672a45a86e1d07fac984b8f`. No Toki command or gesture, commit, or push was performed.

## 2026-07-17 Gesture Experience Repair Phase 3 Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gestureSplitStrand.ts` | Added, uncommitted | Computes overlap-safe edge-to-edge strand position, rotation, length, and distance-scaled thickness with no input/action authority |
| `touchpilot/apps/desktop/src/BlobPuck.tsx` | Modified, uncommitted | Applies current two-lobe geometry and marks the visual strand persistent for every live split phase |
| `touchpilot/apps/desktop/src/BlobPuck.css` | Modified, uncommitted | Keeps the strand visible while fully split, adds a liquid highlight/pulse, follows motion, and preserves a visible static reduced-motion fallback |
| `touchpilot/scripts/gesture-split-strand.test.mjs` | Added, uncommitted | Covers horizontal/diagonal attachment, distance thinning, overlap safety, persistence, reduced motion, and no action/provider authority |
| `touchpilot/scripts/visual-motion-qa.mjs` | Modified, uncommitted | Locks stable-split persistence, visual-only ownership, and reduced-motion behavior |
| `touchpilot/package.json` | Modified, uncommitted | Adds `test:gesture-split-strand` |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Documents the visual geometry, authority boundary, tests, build hash, and next phase |
| `/Users/pumba/Documents/Codex/clicky/steps.md` | Modified outside repository | Records the completed phase and user-owned manual check |

The production app was rebuilt, signed, installed, strictly verified, and observed as exactly one process. Signed built/installed executable SHA-256: `fed306fbb7e8e4e566dfc6b9ccd07afa7ccaf39dce4d2a4ec6d8771ccc9dd20a`. No Toki command or gesture, commit, or push was performed.

## 2026-07-17 Gesture Experience Repair Phase 4 Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/docs/gesture-experience-manual-acceptance.md` | Added, uncommitted | Provides the canonical ordered live matrix with explicit expected results and first-failure evidence fields |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the integrated deterministic gate, manual-vs-automated boundary, final build evidence, and checklist |
| `/Users/pumba/Documents/Codex/clicky/steps.md` | Modified outside repository | Records Phase 4 completion and the exact user handoff |
| Root migration pack | Modified, uncommitted | Reconciles the final 244-test gate, reproducible install hash, process identity, and remaining user-owned acceptance |

No runtime source changed in Phase 4. The unchanged combined Phase 1–3 source rebuilt reproducibly. The production app was signed, installed, strictly verified, and observed as exactly one process. Signed built/installed executable SHA-256: `fed306fbb7e8e4e566dfc6b9ccd07afa7ccaf39dce4d2a4ec6d8771ccc9dd20a`. No Toki command or gesture, commit, or push was performed.

## 2026-07-18 Local Diagnostics Bridge Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/debugExport.ts` | Added, uncommitted | Queues lightweight live state, sanitizes only on a bounded flush, omits binary payloads, redacts secret-shaped fields, and reports native export status |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Connects the Overlay snapshot/transition/capture export and displays local diagnostics status in visual Debug |
| `touchpilot/apps/desktop/src-tauri/src/lib.rs` | Modified, uncommitted | Atomically writes private bounded `latest.json`, `history.ndjson`, and one overwritten current capture under Tauri app data |
| `touchpilot/scripts/read-toki-debug.mjs` | Added, uncommitted | Gives Codex a concise terminal reader plus an optional full JSON mode while visual Debug stays closed |
| `touchpilot/scripts/debug-export.test.mjs` | Added, uncommitted | Verifies binary omission, secret redaction, useful identifier retention, and circular-object safety |
| `touchpilot/package.json` | Modified, uncommitted | Adds `test:debug-export` and `toki:debug` commands |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records architecture, privacy/performance rules, tests, installation evidence, and the new no-screenshot debugging workflow |
| Root migration pack | Modified, uncommitted | Records the bridge, complete verification ledger, installed hash, process identity, and remaining manual acceptance |

The production app was rebuilt, signed, installed, strictly verified, and observed as exactly one process. Signed built/installed executable SHA-256: `97adea5bdf566ffcfe420b6a02e54ebf06eb6364ef8add7d112111b10b1acb19`. `npm run toki:debug` read the installed Overlay state with visual Debug closed. No Toki command or gesture, commit, or push was performed.

## 2026-07-18 Single-Bend Lock and Pinch-Stability Delta — SUPERSEDED BY 2026-07-19 WRIST ROLL

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gestureTargetLock.ts` | Modified, uncommitted | Replaces the active double-air-tap controller with one stable index bend, interruption grace, held-bend latching, extension/cooldown rearm, and immutable-point safety |
| `touchpilot/apps/desktop/src/gestureRuntime.ts` | Modified, uncommitted | Advances the new bend controller and publishes privacy-safe bend pose/phase diagnostics |
| `touchpilot/apps/desktop/src/gestureControlVoice.ts` | Modified, uncommitted | Adds track-owned pinch-distance smoothing, stronger press interruption grace, release hysteresis, and deliberate release hold |
| `touchpilot/apps/desktop/src/overlayGeometry.ts` | Modified, uncommitted | Moves only the rendered creature `60 x 48 px` above-right while preserving authoritative pointer and lock coordinates |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Uses the new bend runtime fields and updates Debug/calibration/user-facing lock instructions |
| `touchpilot/apps/desktop/src/gestureAdaptiveProfile.ts` | Modified, uncommitted | Updates calibration language from air tap to intentional index bend |
| `touchpilot/scripts/gesture-target-lock.test.mjs` | Modified, uncommitted | Covers one-bend classification, hold, interruption, stale point, ownership, screen invalidation, and no-click behavior |
| `touchpilot/scripts/gesture-control-voice.test.mjs` | Modified, uncommitted | Covers the filtered pinch and noisy single-open-frame regression |
| `touchpilot/scripts/gesture-pointing.test.mjs` | Modified, uncommitted | Locks the larger visible creature/fingertip gap |
| `touchpilot/scripts/gesture-contracts.test.mjs` | Modified, uncommitted | Updates active fixture expectations to index-bend locking |
| `touchpilot/scripts/gesture-adaptive-profile.test.mjs` | Modified, uncommitted | Uses the active index-bend classifier during calibration coverage |
| `touchpilot/scripts/read-toki-debug.mjs` | Modified, uncommitted | Prints index-bend pose, phase, and bend ID from the local diagnostics bridge |
| `touchpilot/docs/manual-command-acceptance-matrix.md` | Modified, uncommitted | Updates pointer/gesture command cases to the single-bend contract |
| `touchpilot/docs/gesture-experience-manual-acceptance.md` | Modified, uncommitted | Updates live bend-lock/voice instructions and the installed build hash |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Preserves the new gesture contract, timing rationale, verification, installed hash, and user-owned acceptance boundary |
| Root migration pack | Modified, uncommitted | Reconciles the repaired behavior, exact verification ledger, changed files, installed hash, and process identity |

The production app was rebuilt, signed, installed, strictly verified, and observed as exactly one process. Signed built/installed executable SHA-256: `46cff0c9124ad14b7845909ac66e514de3c53923935ae873ff77c7261c343719`. `npm run toki:debug` read the new index-bend and pinch schema while visual Debug was closed. No Toki command or gesture, commit, or push was performed.

## 2026-07-19 Persistent-Lock, Dual-Pinch, Edge, and Compact-Utility Delta

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/overlayGeometry.ts` | Modified, uncommitted | Creates a `100 x 80 px` detached gesture offset, redirects separation near edges, and exports actual-radius center clamping |
| `touchpilot/apps/desktop/src/BlobPuck.tsx` | Modified, uncommitted | Clamps the visible puck itself so it can touch all display boundaries |
| `touchpilot/apps/desktop/src/gestureTargetLock.ts` | Modified, uncommitted | Prevents a thumb/index pinch from being accepted as an index bend and exposes the derived measurement |
| `touchpilot/apps/desktop/src/gestureControlVoice.ts` | Modified, uncommitted | Accepts both fully validated and limited-but-retained lock receipts for contextual voice |
| `touchpilot/apps/desktop/src/gestureRuntime.ts` | Modified, uncommitted | Owns independent ordinary and contextual pinch controllers plus their diagnostics |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Freezes the main creature at a lock, retains limited locks, starts real ordinary pinch voice, and guards gesture collisions |
| `touchpilot/apps/desktop/src/TokiPointerLockCue.tsx` and `.css` | Modified, uncommitted | Keeps persistent locked/limited feedback with distinct warning treatment |
| `touchpilot/apps/desktop/src/topUtility.ts` | Modified, uncommitted | Uses the compact `400 x 218 px` expanded geometry and matching top-edge hit area |
| `touchpilot/apps/desktop/src/TokiTopUtilitySurface.tsx` and `.css` | Modified, uncommitted | Presents the compact top-attached identity and literal pitch-black surface |
| `touchpilot/apps/desktop/src-tauri/src/lib.rs` | Modified, uncommitted | Uses compact window dimensions and reapplies the native auxiliary contract after each mode change |
| `touchpilot/apps/desktop/src-tauri/src/macos_overlay.rs` | Modified, uncommitted | Shares the screen-saver-level, all-Spaces, fullscreen-auxiliary contract with the top utility while preserving peek/expanded mouse policy |
| `touchpilot/apps/desktop/src-tauri/tauri.conf.json` | Modified, uncommitted | Sets the initial settings window to `400 x 218 px` |
| `touchpilot/scripts/read-toki-debug.mjs` | Modified, uncommitted | Reports ordinary and contextual pinch state independently |
| Gesture/visual regression scripts | Modified, uncommitted | Cover edge contact, 128 px separation, limited-lock persistence, dual pinch ownership, collision guards, fullscreen auxiliary behavior, and compact pitch-black styling |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the final behavior, architecture, verification, installed hash, and manual boundary |
| Root migration pack | Modified, uncommitted | Reconciles this checkpoint across handoff, plan, file manifest, test ledger, decisions, and risks |

The production app was rebuilt, signed, installed, strictly verified, and launched as one installed process. Signed built/installed executable SHA-256: `8b58e1b2719de6cfcd57e5dc2bad1add7ac6fe35169aad85e13de47c632d1a5f`; PID `34312` was observed. No Toki command or gesture, commit, or push was performed.

## 2026-07-19 Wrist-Roll Lock and Deliberate-Split Files

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gestureTargetLock.ts` | Replaced, uncommitted | Implements baseline-relative 3D wrist-roll classification, pre-roll point freeze, timing/grace, one-shot latch, rearm, ownership, and invalidation |
| `touchpilot/apps/desktop/src/gestureRuntime.ts` | Modified, uncommitted | Publishes wrist-roll pose/controller state instead of index-bend runtime state |
| `touchpilot/apps/desktop/src/gestureFixtures.ts` | Modified, uncommitted | Generates deterministic 3D wrist-rotation landmark sequences |
| `touchpilot/apps/desktop/src/gestureTwoHand.ts` | Modified, uncommitted | Adds joined, armed, separated sequence semantics and prevents split on second-hand entry |
| `touchpilot/apps/desktop/src/gestureAdaptiveProfile.ts` | Modified, uncommitted | Updates calibration guidance while retaining the version-1 compatibility schema |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Wires wrist-roll state, transition diagnostics, Debug fields, and `Locking target` / `Split ready` feedback |
| `touchpilot/scripts/gesture-target-lock.test.mjs` | Rewritten, uncommitted | Covers palm orientation, pre-roll freeze, thresholds, grace, ownership, latching, invalidation, and no-click behavior |
| `touchpilot/scripts/gesture-two-hand.test.mjs` | Modified, uncommitted | Covers far-hand no-op and join-arm-separate split behavior |
| `touchpilot/scripts/gesture-adaptive-profile.test.mjs` | Modified, uncommitted | Covers wrist-roll calibration compatibility |
| `touchpilot/scripts/read-toki-debug.mjs` | Modified, uncommitted | Reads wrist-roll pose, degrees, phase, roll ID, and current lock |
| `touchpilot/docs/gesture-experience-manual-acceptance.md` | Modified, uncommitted | Replaces bend checks and adds deliberate split/no-op acceptance cases |
| `touchpilot/docs/manual-command-acceptance-matrix.md` | Modified, uncommitted | Reconciles pointer explanation and gesture acceptance language |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the superseded bend design, new state machines, thresholds, evidence, and release result |
| Root migration pack | Modified, uncommitted | Reconciles handoff, plan, manifest, ledger, decisions, and risks |

Production signing/install verification passed. Built and installed executable SHA-256: `79742b6e7a1b7dd08bf06f0debf06160e2ad1d30aad2a3a73e9440e78897f820`; PID `43794` was the sole installed process at verification. No gesture, Toki command, commit, or push was performed.

## 2026-07-19 Single-Creature Lock Files

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Removes the independent lock-cue render while retaining the single main creature's immutable lock position |
| `touchpilot/apps/desktop/src/TokiPointerLockCue.tsx` | Deleted, uncommitted | Removes the duplicate blue lock creature and label |
| `touchpilot/apps/desktop/src/TokiPointerLockCue.css` | Deleted, uncommitted | Removes styling and motion owned only by the deleted duplicate creature |
| `touchpilot/scripts/gesture-target-lock.test.mjs` | Modified, uncommitted | Requires exactly one `BlobPuck`, rejects the deleted cue, and retains coordinate/no-click checks |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Makes one-creature lock feedback a durable design rule and records release evidence |
| Root migration pack | Modified, uncommitted | Reconciles the single-creature checkpoint across handoff, plan, manifest, ledger, decisions, and risks |

Target-lock 9/9, visual motion 18/18, all workspace TypeScript checks, production release, signing, installation, strict verification, hash equality, diagnostics readback, and one-process launch pass. Built and installed executable SHA-256: `a96fd4ac4376755898e2659d61c3caac60689c40a28349d18025d9679185ac6d`; PID `47578` was the sole installed process at verification. No gesture, Toki command, commit, or push was performed.

## 2026-07-19 Stable Local Identity and Edge-Compression Files

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/scripts/macos-bootstrap-signing-identity.sh` | New, uncommitted | Creates/reuses the persistent `Toki Local Development` login-keychain identity with code-signing-only trust/tool access |
| `touchpilot/scripts/macos-sign-app.sh` | Modified, uncommitted | Requires certificate signing, rejects ad-hoc/CDHash-only identity, copies without installed-app re-signing, and verifies requirement/hash equality |
| `touchpilot/scripts/macos-privacy-usage-descriptions.test.mjs` | New/modified, uncommitted | Covers privacy descriptions plus persistent-identity, no-ad-hoc, no-installed-resign, and scoped bootstrap rules |
| `touchpilot/package.json` | Modified, uncommitted | Adds `desktop:bootstrap-signing:mac` |
| `touchpilot/apps/desktop/src/overlayGeometry.ts` | Modified, uncommitted | Removes redirected edge distance and applies independent x/y visual offset fading |
| `touchpilot/scripts/gesture-pointing.test.mjs` | Modified, uncommitted | Proves unchanged open-space spacing, compressed edges/corners, boundary contact, and unchanged target authority |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records signing/TCC mechanics, two-build proof, edge geometry, tests, and one-time grant boundary |
| Root migration pack | Modified, uncommitted | Reconciles the completed identity and geometry checkpoint |

Build A/B CDHashes differ while their certificate-bound designated requirement is identical. Built and installed executable SHA-256 values match at `2edcbc0ab20f60d36a5dc0997f51de131367b968806e729a36ab9595e74fb86e`. The final installed build verifies as `Authority=Toki Local Development` and runs as PID `55623`. No command, gesture, commit, or push was performed.

## 2026-07-20 Pinch Release and Native Screen-Access Request Files

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gestureControlVoice.ts` | Modified, uncommitted | Latches intentional release through missing frames and completes exactly one release after the stability hold |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Isolates ordinary/contextual gesture voice ownership, submits on matching release or persistent loss, and invokes the native permission request after failed preflight |
| `touchpilot/apps/desktop/src-tauri/src/lib.rs` | Modified, uncommitted | Exposes `CGRequestScreenCaptureAccess` through a macOS Tauri command and registers the cross-platform command |
| `touchpilot/scripts/gesture-control-voice.test.mjs` | Modified, uncommitted | Covers release latching, one-time submission, tracking-loss termination, and ordinary/contextual composition |
| `touchpilot/scripts/capture-access.test.mjs` | Modified, uncommitted | Proves preflight-before-request, native CoreGraphics request binding, and command registration |
| `touchpilot/docs/gesture-experience-manual-acceptance.md` | Modified, uncommitted | Replaces the obsolete discard-on-loss rule and adds release-dropout and native permission-prompt checks |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the repaired lifecycle, native request boundary, tests, build identity, and manual acceptance |
| Root migration pack | Modified, uncommitted | Reconciles the current checkpoint across handoff, plan, manifest, ledger, decisions, and risks |

Installed executable SHA-256 is `83eeed91ba94611ce8d907669a88217dbd1c8107bc806436dba5776a10ade251`; CDHash is `7ede33456b09f8320066ca9e6b2e75bb442c5da9`; PID `63321` was running at verification. No TCC reset, command, gesture, commit, or push was performed.

## 2026-07-20 Direct Pinch Handoff and Full-Frame Mapping Files

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Routes local ordinary/contextual pinch directly into shared voice start/submit functions while retaining the listener adapter for external windows |
| `touchpilot/apps/desktop/src/gesturePointing.ts` | Modified, uncommitted | Uses fixed full-frame mapping and faster low-amplification response values |
| `touchpilot/apps/desktop/src/gestureAdaptiveProfile.ts` | Modified, uncommitted | Keeps adaptive gesture measurements but prevents calibration from replacing full-frame pointer ranges |
| `touchpilot/apps/desktop/src/BlobPuck.tsx` | Modified, uncommitted | Shortens gesture-owned lead follow to `0.025 s` |
| `touchpilot/scripts/gesture-control-voice.test.mjs` | Modified, uncommitted | Requires direct local ordinary/contextual voice handoff and rejects an `emitTo` round trip in those effects |
| `touchpilot/scripts/gesture-pointing.test.mjs` | Modified, uncommitted | Covers full-frame corner/center mapping and updated response/follow behavior |
| `touchpilot/scripts/gesture-input-stability.test.mjs` | Modified, uncommitted | Locks the full-frame and precision constants |
| `touchpilot/scripts/gesture-adaptive-profile.test.mjs` | Modified, uncommitted | Proves adapted profiles cannot shrink the pointer mapping range |
| `touchpilot/docs/gesture-experience-manual-acceptance.md` | Modified, uncommitted | Updates the build hash and live full-frame/unpinch checks |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the self-event race, direct local adapter pattern, mapping rules, tests, and installed identity |
| Root migration pack | Modified, uncommitted | Reconciles the new evidence, implementation, build, and remaining manual gates |

Installed executable SHA-256 is `da7e81aa51aa06ca5c86220ded651c5abb164c1976dc6ebef269590931485bd7`; CDHash is `851d10b804875c16520e68fbe2f1a8db636085f1`; PID `66966` was running at verification. No TCC reset, command, gesture, commit, or push was performed.

## 2026-07-27 Gesture Polish Phase 5 Files

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/gestureControlVoice.ts` | Modified, uncommitted | Adds filtered raw distance, entry/release interruption grace, valid-hold-time accounting, and detector/track/event voice ownership |
| `touchpilot/apps/desktop/src/App.tsx` | Modified, uncommitted | Centralizes gesture voice start/submit/cancel, invalidates late native starts, verifies native session ownership, and exposes recorder lifecycle diagnostics |
| `touchpilot/apps/desktop/src/gestureDiagnostics.ts` | New/modified, uncommitted | Adds raw and filtered pinch distance to the bounded private trace |
| `touchpilot/scripts/gesture-control-voice.test.mjs` | Modified, uncommitted | Covers one-frame dropout, sustained contradiction, deliberate release, re-pinch interruption, and ownership isolation |
| `touchpilot/scripts/gesture-diagnostics.test.mjs` | New/modified, uncommitted | Covers the expanded pinch diagnostic schema |
| `touchpilot/scripts/read-toki-debug.mjs` | New/modified, uncommitted | Prints capture/hold phase, owner, native session, last capture, and transition data |
| `touchpilot/docs/gesture-experience-manual-acceptance.md` | New/modified, uncommitted | Adds ordinary voice baseline, noise/re-pinch cases, exact failure evidence, and the current build hash |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the failure boundary, durable ownership/session design, verification, installation, and remaining live checks |
| Root migration pack | Modified, uncommitted | Reconciles Phase 5 across handoff, plan, manifest, ledger, decisions, and risks |

The production app was rebuilt, signed with `Toki Local Development`, copied without re-signing, strictly verified, and launched as exactly one installed process. Built and installed executable SHA-256 values match at `618babc7045e3b7d5f49530d320d1d3a6b74aed900071d246380ae4f5ab06644`; installed CDHash is `587537a0eb8c36c49aff9129a42e8a3cf1c79032`. No Toki command, gesture, commit, or push was performed.

## 2026-07-27 Gesture Polish Phase 6 Files

| Path | State | Purpose |
| --- | --- | --- |
| `touchpilot/apps/desktop/src/BlobCursor.tsx` | Modified, uncommitted | Caps ambient-only liquid deformation at 30 FPS while allowing pointer/target revisions and active settling to render immediately |
| `touchpilot/apps/desktop/src/handLandmarker.ts` | Modified, uncommitted | Lazy-loads MediaPipe Tasks Vision only when the camera requests hand tracking |
| `touchpilot/scripts/runtime-footprint.mjs` | New, uncommitted | Reports installed app/runtime asset footprint, falls back to launchd under restricted process-table access, and optionally enforces explicit package budgets |
| `touchpilot/scripts/performance-budget.test.mjs` | New, uncommitted | Locks the ambient/active-render boundary, camera/diagnostic cadence, lazy vision import, budgets, and read-only footprint behavior |
| `touchpilot/package.json` | Modified, uncommitted | Adds `test:performance-budget` and `toki:footprint` commands |
| `touchpilot/docs/gesture-experience-manual-acceptance.md` | Modified, uncommitted | Advances the build-under-test hash to the final Phase 6 artifact |
| `/Users/pumba/Documents/Codex/clicky/adaptive-gesture-control-and-command-acceptance.md` | Modified outside repository | Records the performance root cause, optimization boundaries, footprint, complete gates, artifact identity, and remaining live acceptance |
| Root migration pack | Modified, uncommitted | Reconciles the final agent-owned phase across handoff, plan, manifest, ledger, decisions, and risks |

The complete deterministic matrix passes 278 automated root/AI/Rust tests plus all documented browser, known-screen, AX/OCR, workflow, eval, provider-readiness, visual-motion, typecheck, build, signing, installation, footprint, and replay gates. Built and installed executable SHA-256 values match at `f7dbda8ecb5be43cc5a033cc8ad039c8d8b9699696118b51825193a38c5d527c`; installed CDHash is `102050a23efbe8aa9ee30fd70407cb0b4adbe14c`; PID `8596` was the sole installed app process at final verification. No Toki command, gesture, commit, or push was performed.
