# Codex Handoff

## Repository Identity

- Git repository root: `/Users/pumba/Documents/ Codex Projects/clicky`
- Application workspace: `/Users/pumba/Documents/ Codex Projects/clicky/touchpilot`
- Current branch: `main`
- Pre-gesture repair checkpoint: commits `315e49e` through `71a2ebe` on `main`.
- Baseline before the repair: `d4234bf00104ad973e694fc3564cf98a21a12f30`.
- Upstream state after checkpoint publication: the repair and this migration pack are included on `origin/main`.
- Tracked worktree state before this migration pack: clean.
- Pre-existing untracked state: `touchpilot/learnings/`.
- Installed application source state: the installed executable was built from the same source later committed through `de7d2b6`; the bundle does not yet embed a Git commit identifier.

## Project Objective

Toki is a cross-platform, cursor-adjacent guidance assistant. A user speaks a goal, Toki captures and interprets the current screen, identifies the next UI target, and points to it without taking control of the computer. The normal product surface must feel like an invisible desktop utility, not a chatbot or dashboard.

The intended interaction is:

1. The user presses and holds Right Option; native audio capture starts and remains active only while the key is held.
2. Releasing Right Option stops capture and submits that recording exactly once.
3. Local Whisper converts audio to a transcript.
4. Toki captures the relevant screen or active-window region.
5. OCR, accessibility, browser/DOM, and visual evidence are assembled where available.
6. A guidance provider proposes a target.
7. Validation, grounding, coordinate mapping, and safety policy decide whether the target may be shown.
8. The click-through overlay renders the puck and a target-centered rotating ring only for an accepted target.
9. The user performs the action. Toki must not auto-click.

## Current Architecture

### Workspace

- Desktop application: `touchpilot/apps/desktop/`
- React UI and runtime state: `touchpilot/apps/desktop/src/`
- Tauri/Rust native layer: `touchpilot/apps/desktop/src-tauri/`
- Browser extension: `touchpilot/apps/browser-extension/`
- Shared TypeScript packages: `touchpilot/packages/`
- Shared Rust crates: `touchpilot/crates/`
- QA/build scripts: `touchpilot/scripts/`
- Tracked project documentation: `touchpilot/docs/`
- Archived legacy puck implementation: `touchpilot/docs/archive/phase-13a-legacy-puck/`

### Runtime Surfaces

- Overlay window: transparent, click-through, borderless, focusless, always-on-top guidance surface.
- Top utility/settings window: user controls and voice state in a compact surface.
- Debug window: developer-only diagnostics, provider evidence, capture state, and QA controls.
- Menu bar/tray surface: opens Toki or Debug and provides quit behavior.

### Responsibility Boundaries

- React owns the rendered puck, guidance ring/cue, utility UI, debug UI, and client-side runtime coordination.
- Rust/Tauri owns OS integration such as native windows, active Spaces behavior, cursor position, capture, audio, permissions, menu/tray behavior, and native commands.
- Shared packages define guidance, safety, evaluation, and data contracts.
- Browser extension code provides browser-specific evidence where installed and connected.

## Dev App Versus Main App

These are two different runtime artifacts and must never be treated as interchangeable evidence.

### Dev App

- Start command: `npm run desktop:dev`
- Root script delegates to: `npm --workspace @toki/desktop run tauri dev`
- Tauri development URL: `http://localhost:1420`
- Tauri development hook: `beforeDevCommand = "npm run dev"`
- Uses live source, Vite, and hot module replacement.
- A successful visual/manual result in this app proves only the current source in development mode.

### Main App

- Uses the built frontend from `touchpilot/apps/desktop/dist/` through Tauri's configured `frontendDist`.
- Frontend build hook: `beforeBuildCommand = "npm run build"`.
- macOS release command: `npm run desktop:release:mac`
- macOS signing command: `npm run desktop:sign:mac`
- macOS install command: `npm run desktop:install:mac`
- The installed app can remain stale until it is rebuilt, signed, installed, the old process is stopped, and the installed application is relaunched.
- `/Applications/Toki.app` was replaced on 2026-07-15 with the signed build from the source later committed through `de7d2b6` and launched for user-owned acceptance.

## Work Completed

Repository evidence confirms implementation work in these areas:

- Tauri/React/Rust monorepo and desktop shell.
- Separate overlay, utility/settings, and debug surfaces.
- Native macOS overlay contract and active-Space ordering.
- Menu-agent packaging and compact top utility work.
- Native cursor-following puck foundation and living visual state wiring.
- Native microphone capture and local Whisper transcription path.
- Screen capture, active-window snapshot, and crop contracts.
- Browser-extension bridge foundation.
- Guidance request/result contracts and mock/unavailable/real/provider-adapter modes.
- Provider-neutral vision contract plus a temporary Codex-subscription adapter; a future OpenAI API adapter can replace it without changing capture, grounding, coordinates, or overlay behavior.
- Provider image preparation and provenance.
- OCR/accessibility/browser candidate contracts and fusion/ranking work.
- Candidate intent, task planning, localization, and target verification boundaries.
- Shared coordinate-transform and source-aware click-point tests.
- Safety policy foundation and deterministic evaluation foundation.
- Two-tier guidance safety: account/permission targets show immediately with a warning, while send/delete/payment/security/unknown-risk targets stay hidden until the user chooses `Show target`; this reveals guidance only and never clicks.
- Windows runtime/visual QA scripts and macOS QA scripts.
- Production-readiness inventory and app identity metadata.

The pre-gesture repair adds provider-neutral structured vision output, the Codex-subscription bridge, race-safe hold-to-talk state handling, accepted-target-only ring rendering, capture-integrity enforcement, and deterministic regressions. It is committed in `315e49e` through `de7d2b6`; the architecture documentation is committed in `71a2ebe`.

## Current Runtime Behavior

### Confirmed From Repository

- The configured product name is `Toki`.
- The configured bundle identifier is `app.toki.desktop`.
- The overlay and compact utility windows are configured as transparent and always on top.
- macOS-specific overlay code exists in `touchpilot/apps/desktop/src-tauri/src/macos_overlay.rs`.
- The provider pipeline has no dependency on the retired local runtime. Codex subscription is the temporary vision adapter, with target-verification contracts downstream.
- The native global shortcut observes Right Option only. Press starts capture; release stops/submits, including release-during-startup races.
- Right Option detection now combines the standard right-side key code with Apple's right-Alt device flag. Missing Input Monitoring access is requested explicitly instead of failing silently.
- Rejected targets do not reach the overlay; accepted guidance uses the target-centered rotating ring rather than the former square/pulse/crosshair decorations.
- Current-image evidence is now primary for visual localization. Exact OCR/Accessibility/DOM candidates remain preferred support, but a specific icon control can pass without one only when the current localization trace exists, confidence is at least 72%, geometry is valid, and action/object semantics agree.
- Generic or symbolic structured candidates can now combine their exact current geometry with specific high-confidence provider semantics. This augmentation is forbidden when the structured evidence already expresses a conflicting action or object.
- Read-only commands normalize `see`, `show`, and `view` to the shared `open` action. Narrow UI-context and media-history phrases let controls such as `Recently played tab` ground as `open + media` without app-specific rules or treating generic history as media.
- Provider and local-candidate risk normalization now share one policy helper. `account_change` and `permission_change` are warning-only; strong-risk targets are accepted for Debug but excluded from overlay state and the target ring until the user clicks `Show target` in the top utility.

### Last User-Observed Behavior

- Voice transcription accepted commands.
- A target ring rendered on Spotify.
- Different commands could still select the same or an unrelated region.
- Some outputs used generic labels such as `Vision target`, `button`, `icon`, or `plus icon`.
- Target rectangles could be offset by several pixels.
- Debug could show no current request when state synchronization was missing or stale.
- The installed/main app was previously observed to lag behind the dev app after source changes.
- After the Right Option repair, a manual screenshot showed that the voice request reached vision but clear Spotify guidance was rejected at 12% confidence. The value was not mis-scaled; the prompt had incorrectly required a matching structured candidate for every coordinate-only control.
- After the 12% repair, Debug showed a correct 98% `Create playlist (+) button` answer tied to `ocr-candidate-13` being rejected because verification examined only the OCR label `+` and lost the provider's `playlist/collection` meaning.
- After the combined-evidence repair, Debug showed a correct 99% `Recently played tab` current-image answer rejected because `see` was not interpreted as an action and the target phrase did not supply object `media`.
- A later 96% `Invite collaborators` answer was visually and semantically correct but was rejected as an invalid target because the provider contract always emitted `requiresConfirmation: false` while validation required confirmation for every permission change.

The 12% observation directly triggered the latest current-image grounding repair. Automated checks, app-only production build, signing, and installation pass, but real application behavior remains `UNKNOWN` until the user performs the controlled manual test.

## Next Unfinished Step

The unfinished step is user-owned live acceptance. The implementation and deterministic gates are complete, but neither the new hold gesture nor real-model targeting has been claimed successful without a manual run.

Required acceptance conditions:

1. Reject blank or generic labels such as `Vision target`, `button`, or `icon`.
2. Require the selected target to be grounded in the current screenshot, with OCR/accessibility/browser evidence used when available rather than imposed as a universal prerequisite.
3. Require semantic agreement between the command's action/object and the target.
4. Refine the target rectangle only after semantic grounding passes.
5. Prove that different commands on the same screen select different appropriate regions.
6. Expose raw provider output, original box, chosen evidence, grounding verdict, coordinate transform, and rejection reason in Debug.
7. Confirm permission/account targets appear immediately with a clear warning, while strong-risk targets show no ring before `Show target` and reveal only the ring afterward.

## Exact Recommended Next Action

The updated installed app is launched for the user. Codex may rebuild, install, and launch Toki after changes, but must not issue the real acceptance commands or make the final visual judgment:

1. Use only one Toki process and record whether the dev app or built artifact is under test.
2. Hold Right Option, speak, and release it. Confirm capture is active only while held and stops immediately on release.
3. On a fixed screen in any user-chosen app, run at least three commands that require different targets.
4. Confirm rejected guidance shows no target decoration and accepted guidance shows only the rotating target-centered ring.
5. Export sanitized Debug evidence for failures:
   - transcript
   - active-window bounds and screenshot dimensions
   - provider mode and raw structured answer
   - candidate IDs/evidence used
   - original provider box
   - semantic grounding verdict
   - coordinate transform receipt
   - final accepted/rejected target
6. Compare the traces before any follow-up patch. Change only the first boundary proven wrong.

The migration pack was updated on 2026-07-15 after source changes, automated tests, an app-only production build, signing, and replacement of `/Applications/Toki.app`. Toki was not launched or manually driven. Nothing was committed or pushed.

After the first installed-app check failed, macOS TCC logs proved that Input Monitoring was denied and that stored Microphone/Screen Recording grants referenced the previous code hash. The detector and permission request were repaired, the app was rebuilt/reinstalled, and all Toki permission records were reset for clean user reauthorization. The assistant did not launch the corrected app.

After the next manual screenshot showed a 12% vision refusal, repository inspection proved that Toki's prompt—not confidence scaling—was forcing icon controls to fail when OCR/Accessibility/DOM had no exact candidate. The prompt and verifier now support strict current-image-only evidence with a 72% minimum, specific label, semantic match, valid geometry, and current localization trace. Target-verification tests pass 16/16 and all broader automated gates pass. `/Applications/Toki.app` was rebuilt, ad-hoc signed, replaced without launch, and matched to the build at SHA-256 `4d6dab06bedc27cdb19a0da5738b420a058c71bbe5d319f73015b6a35b470b95`; Toki's permission records were reset again for the new ad-hoc identity. No commit or push was made.

The subsequent 98% Spotify trace exposed an inverse evidence-fusion bug: the same provider answer passed as vision-only but failed when it correctly named the current OCR candidate. The verifier now combines exact candidate geometry/provenance with provider label/reason only for generic or symbolic candidates, at 72% or higher, with a current-image trace and no explicit semantic conflict. The exact reproduction plus boundary, missing-trace, and conflict controls pass; target verification is 20/20 and broader automated gates remain green. The rebuilt and installed app match at SHA-256 `73275686ba0d6e1e48c58b2586dd11b98f06f755ce07899b2e659afaba12a533`. Toki was not launched after installation, its permission records were reset, and no commit or push was made.

The later 99% `Recently played tab` trace proved localization and coordinate mapping succeeded but the semantic vocabulary rejected `see` and did not recognize a media-history target. The general repair maps read-only navigation to `open`, infers navigation from UI context such as `tab`, and recognizes only specific phrases such as `recently played`, `listening history`, and `playback history` as media. Exact and negative regressions pass: target verification 22/22 and candidate intent 9/9, with unrelated recent-profile and playback-action cases still rejected. All broader gates pass. The rebuilt, signed, installed, and launched app matches the build at SHA-256 `059d4f87eab649a3a3015b0114b2fda6f41d7beb8786c1bdd01ea08a5f495f59`; permissions were reset for reauthorization, and no commit or push was made.

The 96% `Invite collaborators` trace then isolated a provider/safety contract mismatch rather than a vision error. The repair separates warning-only account/permission guidance from target-reveal acknowledgment for external-send, delete, payment, security, and unknown-risk guidance. The top utility now presents a focused `Show target` button only for the latter; it changes only reveal state and never clicks or changes the underlying app. Focused regressions pass 41/41 for AI/provider policy and 23/23 for target verification/render gating; 64 combined interaction tests, 40 smoke tests, all workspace typechecks, Rust check, visual-motion QA, browser-extension checks, and deterministic browser/fallback/workflow/eval known-screen suites pass. The app-only release was rebuilt, signed, installed, strictly verified, and launched; the installed process was observed running as PID `72997` at final verification. Built and installed executables match at SHA-256 `70048e37b6af5176e43b5d6e6c91bea1dfdc00e325b9afe7ba5a392caea615bf`; Toki permissions were reset for the new ad-hoc identity. The optional image-driven known-screen command was not run because `TOKI_KNOWN_SCREEN_IMAGE` was not configured. No commit or push was made.

## Latest Living-Visual Checkpoint

- The circle-like stationary puck was traced to `BlobCursor` stopping its animation loop after cursor catch-up; the visual configuration already carried different runtime modes, but no autonomous deformation remained visible.
- `BlobCursor` now adds bounded mode-tuned drift, uneven scaling, rotation wobble, and organic border-radius changes while stationary. Idle is calm, listening is more energetic, thinking is strongest, and paused disables autonomous motion.
- `PuckMotionModel.canSendTargetDroplets` was previously calculated but unused. `BlobPuck` now consumes it and releases one small droplet from the target-facing edge to the accepted target center.
- The droplet cannot render for rejected, hidden, missing, refreshing, or errored targets. The rotating ring remains the only stable target marker; no blob ring, square, crosshair, aura, pulse, or old glint was restored.
- JavaScript liquid motion and CSS droplet travel both honor reduced-motion preference.
- Verification passes 15/15 visual-motion assertions, 4/4 puck-motion safety tests, 23/23 target-verification tests, all workspace TypeScript checks, Rust workspace check, production web build, diff whitespace checks, and the signed app-only macOS release build.
- `/Applications/Toki.app` was replaced. Built and installed executables match at SHA-256 `ca4809d7f063a6e53b67412e52964e635089fc9ba9026c8b76cad62455415286`. The first automatic launch did not remain running; a second explicit launch succeeded and the installed process was observed as PID `84279`.
- User-owned manual acceptance remains: verify visible idle liquid motion, stronger hold-to-talk/processing motion, one accepted-target droplet, and no droplet or ring for rejected/hidden guidance. Codex did not issue a Toki command. No commit or push was made.

## Latest Capture-Integrity and Target-Cue Checkpoint

- The 5% “underwater imagery” refusal was caused by invalid capture pixels, not a vision-model accuracy regression. Active-window metadata named Spotify while the screenshot payload contained only wallpaper because the newly ad-hoc-signed binary lacked Screen Recording trust.
- Capture now fails closed in both `App.tsx` orchestration and the native Rust command. A denied macOS preflight produces an actionable permission error before any screenshot reaches the provider.
- The target cue now derives its shape from the final verified rectangle. Wide text/tab targets receive a padded rounded outline around their full bounds; compact icon targets retain the circular cue. No app-specific label rule was added.
- Verification passes all workspace TypeScript checks, Rust workspace check, 23/23 semantic target tests, 2/2 capture-access tests, 4/4 cue-geometry tests, 17/17 visual-motion assertions, 5/5 native tests, the production web build, release build, signing, and installation.
- `/Applications/Toki.app` was replaced and launched. Built and installed executable SHA-256 values match at `9289d3a776516c88c25ca0d9352d9cb1e6682912832ae615d7ca2522b2a4baf9`; the installed process was observed as PID `90673`.
- User action remains: if macOS reports Screen Recording is not trusted, grant Screen Recording to Toki, quit/relaunch it, then manually retest. Codex did not issue a Toki command. No commit or push was made.
