# Open Items and Risks

## Highest-Priority Open Item

### Manual Live Acceptance — PENDING

The semantic repair, target-visual cleanup, hold-to-talk state handling, deterministic regressions, and app-only production build are complete. Current installed-app behavior is not proven because manual commands are intentionally user-owned.

Required remaining work:

1. Confirm Right Option records only while held and stops/submits immediately on release.
2. Confirm a release during capture startup cannot leave recording active.
3. Verify several different commands on a fixed screen resolve to distinct, correct controls.
4. Verify rejected targets show no ring and accepted targets show only the rotating target-centered ring.
5. Inspect raw answer, original box, grounding verdict, transform, and rejection reason in Debug for any failure.
6. Verify the intended installed/main artifact, not only the dev app.
7. Verify `Invite collaborators` shows its target immediately with the access/editing warning.
8. Verify a strong-risk test shows no ring before `Show target`, reveals only the ring afterward, and performs no application action.

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
- With no valid persistent code-signing identity on this Mac, later ad-hoc rebuilds can invalidate TCC grants again.

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
- Gesture-reactive visual behavior is not proven across normal use.

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

- The currently installed `/Applications/Toki.app` matches the signed build produced from source later committed through `de7d2b6` at executable SHA-256 `9289d3a776516c88c25ca0d9352d9cb1e6682912832ae615d7ca2522b2a4baf9`; it was launched after installation and observed running as PID `90673` at that verification point.
- All tests executed in the documented 2026-07-15 repair matrix pass. Unexecuted platform/manual cases remain unknown.
- Codex CLI `0.144.4` is installed and subscription authentication is ready in the development environment.
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
9. Durable macOS grants across frequent local rebuilds require a stable signing identity; none is currently available in the keychain.

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
- Because local ad-hoc rebuilds can change macOS code identity, the current installed app may require Screen Recording permission again. The user must grant it to Toki and relaunch; durable permission across frequent rebuilds still requires a stable signing identity.
- The provider should no longer report that a visible app is “only underwater imagery.” If that exact symptom recurs after permission is trusted, export Debug evidence because it would indicate a different pixel/metadata mismatch.
- Wide text and tab targets are now outlined using the entire verified rectangle. Live visual acceptance must confirm the outline surrounds the full label without obscuring it and remains correctly aligned after crop/display mapping.
- Compact icons intentionally retain the circle. Manual acceptance should test one wide label and one icon on the same fixed screen.
- Current built and installed executable SHA-256: `9289d3a776516c88c25ca0d9352d9cb1e6682912832ae615d7ca2522b2a4baf9`. Installed process observed as PID `90673`; the PID will change after relaunch.
- No real Toki command was issued by Codex. No commit or push was made.
