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
