# Open Items and Risks

## Highest-Priority Open Item

### Manual Live Acceptance — PENDING

The semantic repair, target-visual cleanup, hold-to-talk state handling, gesture experience repair Phases 1–3, deterministic regressions, and production installation are complete at their automated gates. Current installed-app behavior is not proven because manual commands and gestures are intentionally user-owned.

Required remaining work:

1. Confirm Right Option records only while held and stops/submits immediately on release.
2. Confirm a release during capture startup cannot leave recording active.
3. Verify several different commands on a fixed screen resolve to distinct, correct controls.
4. Verify rejected targets show no ring and accepted targets show only the rotating target-centered ring.
5. Inspect raw answer, original box, grounding verdict, transform, and rejection reason in Debug for any failure.
6. Verify the intended installed/main artifact, not only the dev app.
7. Verify `Invite collaborators` shows its target immediately with the access/editing warning.
8. Verify a strong-risk test shows no ring before `Show target`, reveals only the ring afterward, and performs no application action.
9. Verify a frozen pointer plus “Explain this” produces a passive explanation for only that current control, with no click and no target ring.
10. Verify no-lock, stale-screen, equally near candidate, and explicit pointer/speech conflict cases clarify safely; verify spoken output waits for the microphone and respects mute.
11. Verify the top Controls `Camera + Gestures` switch starts and stops both together, including permission and retry states.
12. Verify an explicit positive voice command turns the combined capability on without starting visual guidance.
13. Verify holding two closed fists for two seconds turns the capability off once, while one fist, point, open palm, and pinch do not.
14. Verify the calmer pointer can still reach intended controls and a control pinch held through lock validation records without flicker.
15. Verify brief hand loss recovers while prolonged removal clears visible gesture state instead of freezing it.
16. Verify the two split lobes remain connected by a thin liquid strand while moving, recovering, and merging; reduced motion must keep a static visible strand.

## Known Bugs and Product Failures

### Accuracy

- Different commands have selected the same `plus icon` or unrelated region.
- Generic labels have been displayed as if they were meaningful targets.
- A model result can be structurally valid while semantically wrong.
- Deterministic generic-label, evidence, semantic, different-region, render-gate, and bounds checks pass.
- A manual screenshot after the Right Option repair showed a 12% vision refusal on a visible Spotify control. The confidence was not mis-scaled; the prompt wrongly required an exact structured candidate for coordinate-only controls. That policy is repaired and covered by 16 verifier tests, but live acceptance of the rebuilt app remains pending.
- A later Debug trace showed the correct 98% `Create playlist (+) button` answer rejected because candidate-backed verification kept only OCR text `+` and lost object `collection`. Guarded combined evidence repairs that inverse failure and expands verifier coverage to 20 tests; live acceptance remains pending.
- A subsequent Debug trace showed the correct 99% `Recently played tab` answer rejected because `see` was not interpreted as read-only navigation and the target phrase did not supply `media`. Contextual navigation/media-history semantics repair the failure; verifier coverage is now 22 tests and intent coverage 9 tests, with unrelated recent-profile and playback-action controls rejected.
- A later Debug trace showed the correct 96% `Invite collaborators` target rejected as structurally invalid because provider normalization and the safety validator disagreed about `permission_change`. Shared risk normalization and a two-tier warning/reveal policy repair the failure; provider policy passes 41/41 focused tests and target verification/render gating passes 23/23.
- Post-repair live acceptance is still `UNKNOWN`.

### Coordinates

- Target boxes have appeared offset by several pixels.
- Shared coordinate/source-aware verification code and tests now exist, but installed runtime acceptance is `UNKNOWN`.
- Risk is highest when active-window crop pixels, backing scale, overlay points, and provider coordinates are mixed.

### Dev/Main Drift

- The installed app has previously shown behavior from an older build after the dev app was updated.
- The installed app was built from the same source later committed through `de7d2b6`, including strict current-image-only grounding; it does not embed a commit identifier.
- Multiple running Toki processes can invalidate runtime observations.

### macOS Permissions

- Screen Recording has historically been reported as untrusted even when System Settings appeared enabled.
- Repeated permission prompts have occurred.
- Bundle identity, executable path, signing identity, and installed app may not have matched during earlier tests.
- The corrected bundle identity/path are known, but the user must grant the freshly reset Input Monitoring, Microphone, Screen Recording, Accessibility, and Camera permissions when required.
- Resolved on 2026-07-19 for local development: `Toki Local Development` is a valid persistent login-keychain identity, and the build now refuses ad-hoc fallback.

### macOS Fullscreen/Spaces

- A normal always-on-top window does not automatically appear across macOS fullscreen Spaces.
- Native active-Space overlay code now exists, but multi-monitor and fullscreen acceptance remain `UNKNOWN`.

### Voice Reliability

- Historical failures included stuck listening, duplicate active capture, empty transcript, and repeated settings prompts.
- Local Whisper has passed an isolated probe.
- Right Option now uses a release-aware state machine with press, release-during-startup, and duplicate-release tests passing.
- The first installed check proved Input Monitoring was denied for the newly signed identity. Dual-signal detection and an explicit missing-access request are installed; Toki's stale permission records were reset.
- Current long-running installed-app reliability is `UNKNOWN` until the user tests it.

### Performance

- The app has historically lagged or appeared stuck during visual/runtime iteration.
- Potential contributors include cursor polling, animation work, capture, OCR/accessibility extraction, Codex CLI startup/model inference, multiple app processes, and debug synchronization.
- No current performance profile exists; root cause is `UNKNOWN`.

### Gesture Runtime

- Gesture foundation exists.
- Current Mac camera/lighting/threshold acceptance is pending.
- The first Step 9 camera-enable attempt crashed because the packaged app lacked `NSCameraUsageDescription`. Two TCC crash reports proved the cause; the source declaration, deterministic manifest regression, release-time bundle guard, rebuild, signing, replacement, and hash verification now pass. Manual retry remains pending.
- Stable two-hand identities, pointer/control roles, and visual-only split/merge are implemented and covered by deterministic tests.
- Secondary-hand pinch hold-to-talk is connected only after a validated pointer lock. Release submits once through the existing voice controller; two seconds of control-hand loss cancels without submission.
- Live two-hand crossing, temporary occlusion, split comfort, and performance are not yet proven across normal installed-app use.
- Pointer-grounded explanation is implemented: approved deictic phrases consume the matching frozen lock once, recapture current combined evidence, refuse ambiguity/conflict/staleness/provider retargeting, and use a separate passive card plus optional post-microphone speech.
- Live control-pinch comfort, microphone startup timing, recovery, explanation grounding, stale-screen refusal, speech timing, mute behavior, and cancellation are not yet proven in the installed app.

## Unfinished Implementation

1. Installed-app semantic-target acceptance matrix.
2. Broad known-screen dataset beyond a few manually tested apps.
3. Browser extension broad live reliability.
4. Multi-step workflow product acceptance after reliable single-step targeting.
5. Click-aware advancement broad cross-platform validation.
6. Final living/liquid visual acceptance and performance tuning.
7. Multi-monitor and fullscreen Spaces acceptance.
8. Gesture manual retest/tuning.
9. Production signing/notarization workflow.
10. Auto-update.
11. Crash reporting/local diagnostics.
12. Secure key storage.
13. Production provider gateway/rate limits.
14. Privacy/permission release documentation.
15. Release QA checklist and beta feedback channel.

## Unverified Assumptions

- The currently installed `/Applications/Toki.app` matches the reproducible signed final Gesture Experience Repair build at executable SHA-256 `fed306fbb7e8e4e566dfc6b9ccd07afa7ccaf39dce4d2a4ec6d8771ccc9dd20a`; exactly one installed process was observed as PID `91133`. Live camera/gesture acceptance is user-owned, and the current repair source is not committed or pushed yet.
- All tests executed in the documented 2026-07-15 repair matrix pass. Unexecuted platform/manual cases remain unknown.
- Codex CLI `0.144.5` is installed and subscription authentication is ready in the development environment.
- FreeLLMAPI is currently running/configured: `UNKNOWN`.
- Screen Recording permission for the exact current Toki executable was reset and awaits user grant.
- Accessibility/Input Monitoring permissions for the exact current Toki executable were reset and await user grant.
- Microphone permission for the exact current Toki executable was reset and awaits user grant.
- Active-window capture excludes Toki's own overlay/utility in every state: `UNKNOWN`.
- Provider coordinates consistently use the documented coordinate space: runtime proof `UNKNOWN`.
- Windows behavior remains green after Mac-focused commits: `UNKNOWN`.
- Linux behavior: `UNKNOWN`.

## Blockers

1. No embedded record currently identifies the installed application's source commit.
2. Runtime evidence from dev and main apps has been mixed historically.
3. Product accuracy cannot be evaluated without a stable known-screen test and sanitized trace.
4. Codex CLI startup and model latency may still limit productivity; current live timing is not measured.
5. Some applications expose weak accessibility evidence.
6. Broad browser accuracy depends on extension/DOM evidence or a stronger provider.
7. Production cloud-provider work is blocked by backend, budget, credentials, and rate-limit design.
8. The app-only bundle and strict local ad-hoc signature verification pass. DMG presentation packaging and Developer ID/notarized release signing remain open.
9. Durable macOS grants now use the persistent `Toki Local Development` identity. Remaining work is one user-owned fresh approval after the one-time TCC reset and later production Developer ID/notarization.

## Cleanup Still Required

1. Decide whether `touchpilot/learnings/` should be committed, moved to the separate learnings repository, or ignored. It is currently untracked.
2. Reconcile untracked `touchpilot/learnings/plan.md` with tracked `touchpilot/docs/roadmap.md` before treating it as authoritative.
3. Confirm generated build artifacts are ignored before any cleanup.
4. Record the installed app build commit in a visible diagnostics/about surface or build metadata.
5. Ensure only one active Toki process during QA.
6. Consolidate current acceptance commands into a single documented checklist without hiding individual results.
7. Keep archived legacy puck code out of active runtime imports.

## Risks of Rebuilding or Modifying the Wrong App

### Dev App Risk

- A dev-only fix can look successful through HMR but never reach the installed app.
- Dev URLs, permissions, process identities, and bundle behavior can differ from release behavior.
- A dev process can remain alive and be mistaken for the installed app.

### Main App Risk

- Rebuilding/installing without recording the commit loses reproducibility.
- Installing over the existing app can change the executable identity macOS permissions are tied to.
- Unsigned or differently signed builds can trigger permission mismatches.
- Launching the built binary directly from a target directory is not equivalent to launching the installed `.app`.
- Old installed processes can keep old frontend/native code in memory after a new build.

### Shared Source Risk

- `touchpilot/apps/desktop/src/` affects both dev and main builds.
- `touchpilot/apps/desktop/src-tauri/` affects native release behavior and can change permissions/window identity.
- macOS-specific fixes must stay behind platform guards to avoid Windows/Linux regression.
- App-specific heuristics can produce false confidence and break generic behavior.

## Safe Next-Test Boundary

The user, not Codex, performs this acceptance:

1. Confirm no second Toki process is running.
2. Test the newly replaced `/Applications/Toki.app`, not a dev process or stale artifact.
3. Confirm microphone, Screen Recording, and Accessibility against that exact identity.
4. Press and hold Right Option, speak, release, and confirm recording stops immediately.
5. Run a fixed three-command known-screen matrix in any chosen app without moving the window.
6. Confirm accepted/rejected target-ring behavior and export sanitized Debug traces for failures.
7. Compare evidence and identify the first incorrect boundary before more source edits.

## Migration-Pack Worktree Warning

The repository currently contains:

- modified tracked runtime, test, script, and documentation files
- pre-existing untracked `touchpilot/learnings/`, now reconciled for the retired-runtime removal
- six untracked root-level migration Markdown files
- new untracked provider-contract, adapter, hold-state, acceptance, and regression-test files

Source changes, automated tests, app-only production build, signing, replacement of `/Applications/Toki.app`, and application launch were performed. No manual guidance command, commit, or push was performed.

## Latest Living-Visual Acceptance Risk

- Automated proof now covers autonomous stationary motion, state gating, reduced motion, accepted-target-only droplet travel, and preservation of the single target ring.
- Product taste remains `UNKNOWN` until the user sees the installed app: the motion may need amplitude/speed tuning on a real desktop background.
- Performance remains `UNKNOWN` under extended use because autonomous liquid motion keeps a small request-animation-frame loop alive. Only two small blob elements are updated, and paused/reduced-motion modes disable the autonomous loop, but installed-app CPU/lag must still be observed.
- The target droplet begins only after target acceptance; processing feedback comes from the blob's stronger thinking deformation while the provider is still working.
- Manual acceptance must confirm: gentle idle dance, stronger listening/thinking behavior, one droplet reaching the verified target, rotating ring only at the accepted target, and no location leak for rejected or unrevealed strong-risk guidance.
- The current installed executable matches the signed build at SHA-256 `ca4809d7f063a6e53b67412e52964e635089fc9ba9026c8b76cad62455415286` and was observed running as PID `84279` after an explicit second launch. PID is runtime-only evidence and will change after relaunch.

## Latest Capture-Integrity and Target-Cue Acceptance Risk

- The old wallpaper-only screenshot path is closed in source and covered at both frontend and native boundaries. The current installed build will refuse guidance instead of calling vision when Screen Recording is untrusted.
- The obsolete ad-hoc records were reset after installing the stable-identity build. The user must grant Screen Recording to this identity once; future local rebuilds now share its certificate-bound requirement.
- The provider should no longer report that a visible app is “only underwater imagery.” If that exact symptom recurs after permission is trusted, export Debug evidence because it would indicate a different pixel/metadata mismatch.
- Wide text and tab targets are now outlined using the entire verified rectangle. Live visual acceptance must confirm the outline surrounds the full label without obscuring it and remains correctly aligned after crop/display mapping.
- Compact icons intentionally retain the circle. Manual acceptance should test one wide label and one icon on the same fixed screen.
- Current built and installed executable SHA-256: `9289d3a776516c88c25ca0d9352d9cb1e6682912832ae615d7ca2522b2a4baf9`. Installed process observed as PID `90673`; the PID will change after relaunch.
- No real Toki command was issued by Codex. No commit or push was made.

## Latest Gesture Experience Repair Risks

- Phase 1 is implementation/build/install complete, but the user has not yet accepted the combined top Controls lifecycle, local voice-on route, or two-fist shutdown in the installed app.
- The installed source is intentionally uncommitted and unpushed. Current signed built/installed executable SHA-256: `fed306fbb7e8e4e566dfc6b9ccd07afa7ccaf39dce4d2a4ec6d8771ccc9dd20a`.
- Pointer motion was reported as too sensitive/high-DPI. Phase 2 added precision damping and a larger dead zone; live comfort remains unverified.
- Control-hand pinch hold-to-talk was reported to flicker and fail to capture reliably. Phase 2 added entry/interruption grace and validation waiting; live capture remains unverified.
- Gesture state was reported to lag or remain stuck after hands left the camera. Phase 2 added visual cleanup and stale-frame expiry; live recovery feel remains unverified.
- The transient split bridge was replaced in Phase 3 by a persistent edge-attached strand with reduced-motion behavior; live appearance remains unverified.
- Manual acceptance must use the single installed Toki process. Codex may rebuild/install/launch after code changes but must not issue voice commands, perform camera gestures, or make the final visual judgment.

## Latest Gesture Input Stability Risks

- Phase 2 is implementation/build/install complete, but pointer feel and pinch capture are inherently live human judgments. The user must confirm the new damping is calmer without feeling sluggish.
- A pinch held while the current lock is checking now waits correctly. A pinch with no lock, an invalid lock, or a busy recorder is intentionally discarded and must be performed again after the context is ready.
- The visible pointer and split positions clear sooner than retained identity. Manual testing must confirm this feels forgiving rather than abrupt when a hand is briefly occluded.
- A genuinely stalled camera now advances empty gesture input after 350 ms. The user should see recovery/cleanup rather than a frozen hand; camera permission and device errors remain separate status paths.
- The contextual control hand still requires a valid double-air-tap lock. Phase 2 does not add single-hand contextual voice or change Right Option hold-to-talk.
- Current signed built/installed executable SHA-256: `b3e1d2d50d2e887bc783772f1782d00718a9394bc672a45a86e1d07fac984b8f`; exactly one installed process was observed as PID `84774`.
- The visual-only persistent strand phase and final regression handoff are complete. The consolidated checklist now awaits user-run results.

## Latest Persistent Split Strand Risks

- Phase 3 is implementation/build/install complete, but visual taste and extended camera performance require the user's live judgment.
- The strand should remain attached to both lobe edges while hands move, become finer at large separation without vanishing, and contract naturally through recovery/merge. Automated geometry and source checks cannot prove that subjective motion feel.
- Reduced-motion mode is covered structurally: the strand remains visible while animation/transitions are disabled. A live macOS reduced-motion check remains user-owned.
- The connection is deliberately visual-only. It does not change split thresholds, hand identity, pointer coordinates, lock state, voice capture, provider routing, target rendering, or clicks.
- Current signed built/installed executable SHA-256: `fed306fbb7e8e4e566dfc6b9ccd07afa7ccaf39dce4d2a4ec6d8771ccc9dd20a`; the final installation was observed as exactly one process, PID `91133`.
- The final regression matrix and consolidated handoff are complete. Manual visual results remain unrecorded. No commit or push has been made.

## Latest Final Regression and Manual-Handoff Risks

- The complete deterministic matrix passes 244/244 automated tests plus every documented visual/browser/known-screen/typecheck/Rust/provider/build/sign/install gate. This reduces regression risk but cannot replace human camera and microphone testing.
- The canonical live matrix is `touchpilot/docs/gesture-experience-manual-acceptance.md`. Its cases remain `NOT RUN` until the user records results.
- Local ad-hoc signing is now rejected. One fresh grant is still required because the installed app migrated to the new persistent certificate identity.
- Live acceptance should stop at the first failure long enough to preserve Debug evidence. Repeated retries can erase the original state transition that identifies the true boundary.
- Current signed built/installed executable SHA-256: `fed306fbb7e8e4e566dfc6b9ccd07afa7ccaf39dce4d2a4ec6d8771ccc9dd20a`; exactly one installed process was observed as PID `91133`.
- Automated implementation is complete. Remaining work is user-owned manual execution, result recording, and case-specific repair only where evidence proves a failure.

## 2026-07-19 Persistent-Lock and Compact-Utility Acceptance Risks

- The repaired build is installed and running, but camera gesture feel cannot be accepted by automated tests. The user must verify edge reach, visual separation, bend persistence, and both pinch modes.
- A `limited` lock deliberately preserves the coordinate when Screen Recording proof is unavailable. Contextual explanation still requires current evidence and may clarify/refuse; retaining the coordinate does not weaken provider grounding or authorize a click.
- Ordinary one-hand pinch now starts real native voice without a lock. Manual acceptance must confirm listening stays active for the full physical hold and submits exactly once on intentional release.
- Contextual pinch requires a retained lock and the other hand. Manual acceptance must confirm pointer-hand motion does not move the frozen blob and brief tracking wobble does not release voice.
- The creature should sit about `128 px` above-right in open space and compress visually near screen edges. Live visual taste may request further spacing, but lock coordinates must remain unshifted.
- The compact pitch-black top utility should appear above fullscreen apps and use only `400 x 218 px` expanded. A fullscreen failure should be diagnosed through the native auxiliary-window inspection rather than by increasing the panel size.
- Current signed built/installed executable SHA-256: `8b58e1b2719de6cfcd57e5dc2bad1add7ac6fe35169aad85e13de47c632d1a5f`; exactly one installed process was observed as PID `34312`.
- No Toki command or gesture was issued by Codex. No commit or push was made.

## 2026-07-19 Single-Creature Lock Acceptance Risks

- The duplicate blue pointer-lock creature is removed. Manual acceptance should verify a wrist-roll lock freezes only the one main Toki and leaves no miniature blue blob or separate lock label.
- The compact top status remains the textual lock receipt. The guidance ring should still appear only after accepted guidance, never merely because a pointer coordinate was locked.
- The immutable coordinate and safety checks are unchanged. If the single creature moves after a successful lock, capture the diagnostics transition before changing wrist-roll thresholds.
- The already diagnosed gesture-voice listener lifecycle can still leave listening active after a release/tracking-loss transition; this single-creature pass did not alter microphone behavior and must not be mistaken for a voice repair.
- Built and installed executables match at `a96fd4ac4376755898e2659d61c3caac60689c40a28349d18025d9679185ac6d`; exactly one installed process was observed as PID `47578`.
- No Toki command or gesture was issued by Codex. No commit or push was made.

## 2026-07-19 Wrist-Roll and Deliberate-Split Acceptance Risks

- The new production build is installed and running, but only live human testing can confirm that a quarter-to-half wrist turn is comfortable under the user's lighting, camera angle, and range of motion.
- The active threshold is relative `70 degrees` held for `220 ms`; the user may naturally turn roughly 90–180 degrees. Requiring an exact 180-degree pose would be brittle and is intentionally not part of the classifier.
- Pointer position freezes before the roll. Manual acceptance must confirm the persistent marker stays at the pre-turn target rather than following the rotated fingertip.
- A far-apart second hand must leave Toki merged. Manual acceptance must then join both hands until `Split ready`, separate them, and confirm one split without flicker.
- Contextual pinch still requires a retained lock and the control hand. If wrist roll passes but contextual pinch fails, inspect the private diagnostics transition history before changing thresholds.
- The calibration profile keeps its version-1 compatibility field name while the current UI and runtime interpret the approved sample as wrist rotation. A future persisted-schema migration may rename it, but this release avoids invalidating existing local profiles.
- Built and installed executables match at `79742b6e7a1b7dd08bf06f0debf06160e2ad1d30aad2a3a73e9440e78897f820`; exactly one installed process was observed as PID `43794`.
- No Toki command or gesture was issued by Codex. No commit or push was made.

## 2026-07-19 Stable Identity and Edge-Compression Acceptance Risks

- The source, build, signature, install-copy, and two-build identity gates pass, but macOS still requires one user approval for Screen Recording, Microphone, Camera, Accessibility, and Input Monitoring after migrating from the old ad-hoc identity.
- If a permission toggle is enabled yet Debug reports denial after that fresh approval, inspect TCC logs and the installed designated requirement before resetting anything again. Routine rebuilds must not repeat the reset.
- The self-signed `Toki Local Development` certificate is intentionally local. It does not solve distribution trust, Windows signing, Developer ID, notarization, or another developer machine's keychain setup.
- Open-space creature separation remains exactly `100 x 80 px`; only the unavailable edge component fades. Manual testing must confirm the smaller edge/corner distance looks connected without overlapping the fingertip.
- Build A/B identity stability is proven, but the final permission-retention claim requires the next source rebuild after the user grants access. That later rebuild should be tested without any TCC reset.
- Built and installed executable SHA-256 values match at `2edcbc0ab20f60d36a5dc0997f51de131367b968806e729a36ab9595e74fb86e`. The stable installed build runs as PID `55623` with CDHash `ea7176c4e2bc0b94a1d32eaa0c80bd7ff44feba5`. No command, gesture, commit, or push was performed.

## 2026-07-20 Pinch Release and Native Screen-Access Acceptance Risks

- Automated tests prove state transitions, ownership, and native request wiring, but only the user can prove the camera sees their unpinch reliably and that their spoken audio reaches transcription.
- Manual acceptance must test pinch-and-hold, normal unpinch, unpinch followed by brief hand loss, and full hand loss beyond two seconds. Each path must leave listening off and submit at most once.
- Persistent tracking loss now submits whatever was captured instead of discarding it. A transcript can therefore be partial if the hand disappears mid-sentence; this is preferable to silent data loss or a permanently active microphone and remains visible in diagnostics.
- The first real capture after a missing Screen Recording grant should invoke the native macOS prompt. macOS may require one Toki relaunch after approval. A denial must remain a fail-closed guidance blocker.
- If System Settings shows an older enabled toggle but native preflight is false, the app-owned request/result and installed designated requirement are authoritative. Do not reset TCC again unless new evidence proves corruption.
- Old entries remain in the bounded diagnostics history, but the fresh current sequence starts clean and idle. Historical failures must not be mistaken for current runtime state.
- Installed executable SHA-256 is `83eeed91ba94611ce8d907669a88217dbd1c8107bc806436dba5776a10ade251`; CDHash is `7ede33456b09f8320066ca9e6b2e75bb442c5da9`; PID `63321` was running at verification. No TCC reset, command, gesture, commit, or push was performed.

## 2026-07-20 Direct Handoff and One-to-One Pointer Acceptance Risks

- Live diagnostics proved the old stuck-listening incident crossed the correct release state, so further pinch-threshold changes would address the wrong layer. The remaining live check is whether the direct local handoff now stops and submits promptly in the installed app.
- The full-frame mapping removes reduced-range amplification, but only the user can judge whether their camera framing lets them comfortably reach the useful display area. Do not restore a cropped personal range merely to increase reach; that recreates the high-DPI behavior.
- Smoothing is intentionally responsive (`0.82` maximum alpha) because the one-to-one map already reduces sensitivity. Live judgment must distinguish actual model jitter from intentional hand movement before changing constants again.
- The blob remains visually detached by `100 x 80 px`; its center is not the authoritative target coordinate. Near edges that visual offset compresses, while the mapped fingertip itself remains one-to-one.
- External Tauri commands still depend on the shared listener. This repair deliberately scopes the reliability fix to local gesture events; a future listener-lifecycle redesign should be evidence-driven and separate.
- Fresh diagnostics are clean and idle, but historical stuck-session entries remain in bounded history. Match new failures by timestamp rather than reading an old transition as current state.
- Installed executable SHA-256 is `da7e81aa51aa06ca5c86220ded651c5abb164c1976dc6ebef269590931485bd7`; CDHash is `851d10b804875c16520e68fbe2f1a8db636085f1`; PID `66966` was running at verification. No TCC reset, command, gesture, commit, or push was performed.

## 2026-07-27 Gesture Polish Phase 5 Acceptance Risks

- Automated tests now distinguish a noisy camera frame from a real pinch/unpinch and bind the native recorder to detector, track, event, attempt, and session identity. They cannot prove the user's lighting, camera angle, speech, or physical pinch comfort.
- Manual acceptance must cover ordinary pinch hold/release, contextual pinch after a valid lock, one-frame pose noise while held, a short re-pinch while opening, temporary hand loss, and full tracking loss. Each case must start at most one native session and finish at most once.
- The new private lifecycle fields are the source of truth for a live failure. Capture the timestamp, raw/filtered distance, detector/track/event owner, capture phase, hold phase, release-pending value, native session, duration, and bytes before changing thresholds.
- A zero-byte or zero-duration capture after a recognized press is a recorder/microphone boundary, not evidence to loosen gesture thresholds. A recognized release with capture still listening is an ownership/session boundary.
- The final performance and package-footprint audit is complete. Extended camera-on CPU/thermal behavior and subjective motion feel remain user-owned.
- Current built and installed executable SHA-256 values match at `618babc7045e3b7d5f49530d320d1d3a6b74aed900071d246380ae4f5ab06644`; installed CDHash is `587537a0eb8c36c49aff9129a42e8a3cf1c79032`; exactly one process was observed as PID `2545`.
- No Toki command, gesture, TCC reset, commit, or push was performed.

## 2026-07-27 Gesture Polish Phase 6 Final Acceptance Risks

- All agent-owned Gesture Polish phases and deterministic gates are complete. This does not claim live camera, physical gesture, microphone, transcription, or subjective motion acceptance.
- The camera-off ten-sample CPU mean decreased directionally from about `4.0%` to about `2.9%`, while final settled RSS was roughly `66.7–68.8 MiB`. These short local observations are not a long camera-on thermal, battery, or memory-leak test.
- MediaPipe remains the largest web asset at `39.65 MiB` because Toki keeps its model and three checksum-pinned compatibility WASM variants offline. Removing variants would trade package size for hardware/runtime failures and is not approved.
- Ambient liquid deformation is limited to `30 FPS`, but active pointing and target travel bypass the cap. Manual acceptance must still confirm that the creature looks fluid rather than visually stepped on the user's display.
- The canonical checklist remains `touchpilot/docs/gesture-experience-manual-acceptance.md`. Its live cases remain `NOT RUN` until the user records results, and the first failure should be preserved before retrying.
- Current built and installed executable SHA-256 values match at `f7dbda8ecb5be43cc5a033cc8ad039c8d8b9699696118b51825193a38c5d527c`; installed CDHash is `102050a23efbe8aa9ee30fd70407cb0b4adbe14c`; exactly one installed app process was observed as PID `8596`.
- Fresh diagnostics are idle with Camera + Gestures off. No Toki command, gesture, TCC reset, commit, or push was performed.
