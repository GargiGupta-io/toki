# Codex Handoff

## Repository Identity

- Git repository root: `/Users/pumba/Documents/ Codex Projects/clicky`
- Application workspace: `/Users/pumba/Documents/ Codex Projects/clicky/touchpilot`
- Current branch: `main`
- Pre-gesture repair checkpoint: commits `315e49e` through `71a2ebe` on `main`.
- Gesture Step 9 source checkpoint: commits `0adb06a` through `ca04de0` on `main`; documentation is committed separately afterward.
- Baseline before the repair: `d4234bf00104ad973e694fc3564cf98a21a12f30`.
- Upstream state after checkpoint publication: the repair and this migration pack are included on `origin/main`.
- Tracked worktree state before this migration pack: clean.
- Pre-existing untracked state: `touchpilot/learnings/`.
- Installed application source state: the installed executable includes Gesture Step 9 plus the uncommitted camera-privacy repair and Gesture Experience Repair Phases 1–2. The bundle does not yet embed a Git commit identifier.

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
- `/Applications/Toki.app` was replaced on 2026-07-17 with the signed Gesture Experience Repair Phase 1 build and launched as exactly one process for user-owned acceptance.

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

Gesture Steps 1 through 9 now add deterministic contracts, an Overlay-owned offline camera runtime, reliable pointing, immutable double-air-tap locking, bounded local calibration, stable two-hand tracking and liquid split/merge, secondary-hand hold-to-talk, and frozen-pointer explanation. Step 9 uses a separate passive result card and cannot click, retarget, or display the verified-guidance ring.

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
- Approved deictic phrases with a frozen gesture lock recapture and revalidate the current active window, combine nearby OCR/Accessibility/DOM evidence, and call the existing Codex subscription vision bridge with the exact locked point plus a bounded focus region.
- Pointer explanations refuse stale, ambiguous, conflicting, generic, unsupported, low-confidence, or provider-retargeted answers. Grounded answers use a passive card and optional post-microphone speech with a persistent mute control; they do not enter generic guidance state.

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

Gesture Step 9 and Gesture Experience Repair Phases 1–4 are complete at their automated/build/install gates. The next unfinished work is the user-owned live checklist at `touchpilot/docs/gesture-experience-manual-acceptance.md`. Later gesture vocabulary stays deferred until this basic composition is accepted or its first failing boundary is repaired.

Required acceptance conditions:

1. Reject blank or generic labels such as `Vision target`, `button`, or `icon`.
2. Require the selected target to be grounded in the current screenshot, with OCR/accessibility/browser evidence used when available rather than imposed as a universal prerequisite.
3. Require semantic agreement between the command's action/object and the target.
4. Refine the target rectangle only after semantic grounding passes.
5. Prove that different commands on the same screen select different appropriate regions.
6. Expose raw provider output, original box, chosen evidence, grounding verdict, coordinate transform, and rejection reason in Debug.
7. Confirm permission/account targets appear immediately with a clear warning, while strong-risk targets show no ring before `Show target` and reveal only the ring afterward.
8. Lock one clearly visible control, pinch/hold with the other hand, say “Explain this,” and confirm only that current control is described in the passive card with no target ring and no click.
9. Confirm “What happens if I use this?” works with a valid lock; no-lock, stale-screen, equally near candidates, and explicit pointer/speech conflicts clarify safely.
10. Confirm speech begins only after recording/transcription stop and the persistent mute control suppresses it.

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

## Latest Gesture Step 9 Checkpoint

- `gesturePointerExplanation.ts` recognizes the approved deictic phrases, distinguishes explicit object names, preserves ordinary non-deictic voice, selects only unique current evidence near the frozen point, and defensively validates the subscription vision response.
- `App.tsx` consumes the matching live lock once, recaptures and fingerprints the active window, checks the point remains inside that app, collects combined OCR/Accessibility/DOM evidence, maps the exact provider point and a 160 px focus region, and refuses ambiguity or screen drift before provider use.
- The provider must return specific supported semantics at 70% or higher and a rectangle still containing the locked point. It cannot substitute another nearby control.
- `TokiPointerExplanationCard` is a passive, pointer-transparent, reduced-motion-safe result surface. It is separate from guidance state and never renders the accepted-target ring. Optional speech waits for the microphone/transcriber to become idle and has a persistent top-utility mute control.
- The focused suite passes 9/9. Selected gesture, voice, capture, coordinate, provider-image, candidate-fusion, target-verification, asset, corpus, visual-motion, TypeScript, Rust, and production web/native gates pass.
- `/Applications/Toki.app` was replaced, strictly verified, and launched. Built and installed executables match at SHA-256 `4c63cbd0fb26edb56e29e48773507a7a1b397ac2d3e249a222591585b4eeb293`; the installed process was observed as PID `57842`.
- Manual pointer/voice/explanation acceptance remains user-owned. Codex issued no Toki command or gesture. Step 10 has not started.

## Latest Camera Privacy Crash Repair

- The first manual `Turn camera on` attempt terminated Toki immediately. Two `.ips` reports at 19:47 show `EXC_CRASH`/`SIGABRT` in TCC with the explicit reason that `NSCameraUsageDescription` was absent.
- The source, built, and installed plists previously contained Microphone and Screen Recording usage descriptions but no Camera description. The failure was packaging metadata, not gesture recognition or camera-model logic.
- `apps/desktop/src-tauri/Info.plist` now explains that gesture camera frames are processed locally and not stored.
- A deterministic 2/2 test covers all three privacy descriptions. The normal macOS signing/install script now inspects the final bundle and refuses to sign or install it if any required key is absent.
- Plist validation, shell syntax, all workspace TypeScript checks, the production app build, signing, replacement, installed-plist inspection, strict signature verification, and executable hash comparison pass.
- Built and installed executables match at SHA-256 `245b78148fd70f4b960065951af9b8f32a95c6494d5cd95c207220abb050d92e`. Installation completed and requested launch; Codex did not click the camera control. User-owned camera retry remains pending.
- This repair is intentionally uncommitted and unpushed pending the bug-fix checkpoint.

## Latest Gesture Experience Repair Phase 1

- `gestureCameraControl.ts` owns a pure atomic Camera + Gestures transition, narrow positive voice-on classifier, closed-fist pose classifier, and a two-fist shutdown state machine.
- The top utility Controls tab now owns one combined switch and reports real Off/Starting/Active/Permission denied/No camera/Error states. Debug retains diagnostics, device refresh, calibration, and shutdown-hold progress but no competing enable switches.
- Explicit positive camera-on voice commands are handled locally before pointer explanation or generic guidance. Negative, off, ambiguous, and unrelated phrases do not activate the local route.
- Holding two closed fists for 2,000 ms emits one shutdown event. A 250 ms interruption grace tolerates a brief missed frame and a 500 ms release cooldown prevents repeats. One fist, point, open palm, and pinch are negative controls.
- Focused regression: 7/7. Selected runtime 6/6, two-hand 6/6, control voice 9/9, pointer explanation 9/9, visual motion 18/18, and macOS privacy 2/2 pass. Workspace TypeScript and Rust checks pass.
- The production app was rebuilt, signed, installed, strictly verified, and relaunched after stopping all older Toki processes. Exactly one installed process was observed as PID `80461` at verification time.
- Signed bundle and installed executable SHA-256 values match at `ba70cd998aba2e4f1588a49698ca95e74151f5f3da2d477376a28d68f71b6e76`. Codex issued no Toki command or gesture.
- This phase is uncommitted and unpushed. Next: repair pointer sensitivity, pinch hold-to-talk stability, and stale-hand cleanup; then implement the persistent split strand.

## Latest Gesture Experience Repair Phase 2

- Pointer fine motion now uses a `0.01` dead zone, a lower `0.28` maximum smoothing alpha, and motion-sensitive damping. The visible pointer clears after `320 ms`; internal identity and lock recovery remain available for `2,000 ms`.
- Control pinch entry has a `0.06` exit margin and `140 ms` interruption grace. It cannot begin without a current lock context. A press emitted while that lock is still checking remains pending until validation passes instead of being marked handled and lost.
- Generic held gestures tolerate `120 ms` of detector dropout. Split visuals begin clearing after `320 ms`, while stable hand identity and active recording retain their longer safety grace.
- `gestureFrameFreshness.ts` skips duplicate video timestamps and feeds empty detections after a `350 ms` camera stall, preventing an old frame from freezing derived hand state.
- Stability 4/4, pointing 9/9, control voice 11/11, two-hand 6/6, runtime 6/6, camera control 7/7, pointer explanation 9/9, target lock 8/8, adaptive profile 6/6, visual motion 18/18, all workspace TypeScript, and Rust checks pass.
- The production app was rebuilt, signed, installed, strictly verified, and observed as exactly one installed process (PID `84774`). Signed built/installed executable SHA-256 values match at `b3e1d2d50d2e887bc783772f1782d00718a9394bc672a45a86e1d07fac984b8f`.
- Codex issued no Toki command or gesture. This phase is uncommitted and unpushed. Next: keep a liquid strand visible for the full split state.

## Latest Gesture Experience Repair Phase 3

- `gestureSplitStrand.ts` computes a safe edge-to-edge strand from the two current lobe centers. It handles overlap without division by zero and thins within fixed bounds as the hands separate.
- `BlobPuck` now keeps the strand visible during `splitting`, stable `split`, `recovering`, and `merging`. The connection tracks both moving lobes instead of remaining center-anchored or disappearing while split.
- The strand has a narrow highlight and slow liquid brightness pulse. Reduced motion disables animation and interpolation but deliberately leaves the connection visible.
- The helper is presentation-only and owns no hand classification, action, microphone, provider, guidance, target, cursor, hit-testing, or click authority.
- Split-strand 7/7, two-hand 6/6, pointing 9/9, target lock 8/8, control voice 11/11, runtime 6/6, camera control 7/7, input stability 4/4, pointer explanation 9/9, adaptive profile 6/6, visual motion 18/18, all workspace TypeScript, and Rust checks pass.
- The production app was rebuilt, signed, installed, strictly verified, and observed as exactly one installed process (PID `88799`). Signed built/installed executable SHA-256 values match at `fed306fbb7e8e4e566dfc6b9ccd07afa7ccaf39dce4d2a4ec6d8771ccc9dd20a`.
- Codex issued no Toki command or gesture. This phase is uncommitted and unpushed. Next: final regression/acceptance handoff.

## Latest Gesture Experience Repair Phase 4

- Every repository `test:*` entry, the AI package suite, and the full Rust workspace suite pass: 244/244 automated tests.
- Visual-motion QA passes 18/18. Browser-extension syntax/fixtures, browser known screen, OCR/Accessibility fallback, workflow, eval, all TypeScript workspaces, Rust test/check/format, provider readiness, production web build, and whitespace checks pass.
- `touchpilot/docs/gesture-experience-manual-acceptance.md` is the canonical ordered live checklist. It covers the combined camera lifecycle, voice-on and two-fist shutdown, pointer feel/recovery, double-air-tap lock, two-hand strand, control-pinch voice, pointer explanation, Right Option, semantic guidance, target shapes, and risk reveal.
- The production app rebuilt reproducibly, was signed, installed, strictly verified, and observed as exactly one installed process (PID `91133`). Signed built/installed executable SHA-256 values match at `fed306fbb7e8e4e566dfc6b9ccd07afa7ccaf39dce4d2a4ec6d8771ccc9dd20a`.
- All Camera/Microphone/Screen Recording privacy descriptions are present in the installed bundle. Codex issued no Toki command or gesture.
- No commit or push was made. The user should record the first live failure before retrying or changing thresholds.

## 2026-07-19 Persistent-Lock, Dual-Pinch, Edge, and Compact-Utility Checkpoint

- Bend locking now freezes the main creature at the copied coordinate and keeps persistent `locked` or `limited` feedback. Missing Screen Recording evidence no longer erases an otherwise valid coordinate; genuine display/window changes still invalidate it.
- Gesture voice has separate ordinary one-hand and contextual second-hand pinch controllers. Both use the native hold-to-talk lifecycle. A pinch is explicitly excluded from index-bend classification, and open-palm pause is guarded from locks, multiple hands, either pinch controller, and active voice.
- The creature uses a visual-only `100 x 80 px` offset (about `128 px`) from the authoritative point in open space. Near edges it compresses the unavailable x/y component instead of redirecting distance into a large boundary jump, then clamps by the actual visible radius so the puck may touch every display boundary.
- The top utility receives the Overlay's macOS fullscreen-auxiliary/all-Spaces window contract. It is flush at the top, literal pitch black, `380 x 58 px` in passive mode, and `400 x 218 px` expanded.
- The focused gesture/visual regressions passed before release. After the compact-utility refinement, all workspace typechecks, camera/utility 9/9, visual-motion 18/18, Rust check/format, release build, signing, installation, strict verification, hash comparison, and one-process launch passed.
- Built and installed executable SHA-256 values match at `8b58e1b2719de6cfcd57e5dc2bad1add7ac6fe35169aad85e13de47c632d1a5f`. Exactly one installed process was observed as PID `34312`.
- Codex issued no gesture or Toki command. Manual live acceptance remains user-owned. No commit or push was made.

## 2026-07-19 Wrist-Roll Lock and Deliberate-Split Checkpoint

- Live evidence superseded index-bend locking: the camera showed momentary bend classifications but could not maintain a dependable lock. The active trigger is now a same-hand, baseline-relative wrist roll.
- Toki derives a normalized 3D palm normal from wrist/index-MCP/pinky-MCP landmarks, freezes the last stable pointer coordinate when rotation begins, and locks after at least `70 degrees` is held for `220 ms`. It allows `450 ms` of brief landmark interruption inside a `2,000 ms` sequence, rejects stale or wrong-hand completion, and rearms only after a returned point plus `350 ms` cooldown.
- A second hand entering the camera no longer splits Toki. Both hands must join for `240 ms`, producing visible `Split ready` feedback, and then separate for `180 ms`. The armed sequence expires after `2,000 ms`; a far-apart second hand leaves Toki merged.
- Debug, top status, machine-readable diagnostics, fixtures, calibration compatibility, and manual acceptance copy reflect the wrist-roll and join-before-split phases. The native voice lifecycle and working pinch-to-talk paths were preserved.
- Target-lock passes 9/9, two-hand passes 7/7, the focused gesture selection passes, visual motion passes 18/18, macOS privacy passes 2/2, all workspace TypeScript checks pass, Rust check passes, and debug export passes 3/3.
- Production build, signing, installation, strict signature verification, built/installed hash equality, diagnostics readback, and one-process launch pass. Executables match at `79742b6e7a1b7dd08bf06f0debf06160e2ad1d30aad2a3a73e9440e78897f820`; PID `43794` was the sole installed process at verification.
- Codex issued no gesture or Toki command. Manual wrist-roll, split sequence, and contextual pinch acceptance remain user-owned. No commit or push was made.

## 2026-07-19 Single-Creature Lock Checkpoint

- The independent blue pointer-lock creature and its `TARGET LOCKED` label were removed. `TokiPointerLockCue.tsx` and `TokiPointerLockCue.css` are deleted.
- `App.tsx` renders exactly one `BlobPuck`. When a wrist-roll lock succeeds, that same main creature freezes at the copied pointer coordinate; the top status remains the textual lock receipt.
- The immutable coordinate, lock validation, provider boundary, no-click behavior, split lifecycle, and guidance-only target ring are unchanged. A lock must never create a second creature.
- Target-lock passes 9/9, visual-motion QA passes 18/18, and all workspace TypeScript checks pass.
- The production app was rebuilt, signed, installed, strictly verified, and relaunched as exactly one installed process (PID `47578`). Built and installed executables match at SHA-256 `a96fd4ac4376755898e2659d61c3caac60689c40a28349d18025d9679185ac6d`.
- Codex issued no gesture or Toki command. Manual one-creature lock acceptance remains user-owned. No commit or push was made.

## 2026-07-19 Stable Local Identity and Edge-Compression Checkpoint

- Root cause for recurring macOS permission denial is proven: ad-hoc builds had `cdhash`-bound designated requirements, so TCC kept grants for an older executable hash while rejecting the current build even when its System Settings toggle appeared enabled.
- One persistent login-keychain code-signing identity now exists: `Toki Local Development`, certificate SHA-1 `1E8EC8756338C5412FC99CAE92C5A611BC46800D`.
- `macos-sign-app.sh` rejects ad-hoc signing, requires that identity, rejects `cdhash`-only requirements, verifies the installed copy, and never re-signs `/Applications/Toki.app` after copying it.
- Two changed builds prove identity stability. Build A CDHash `10ced93909a8e41f9e3e49cb0d4777a8c10f9200` and build B CDHash `ea7176c4e2bc0b94a1d32eaa0c80bd7ff44feba5` share the exact requirement `identifier "app.toki.desktop" and certificate root = H"1e8ec8756338c5412fc99cae92c5a611bc46800d"`.
- Obsolete ScreenCapture, Microphone, Camera, ListenEvent, and Accessibility TCC records were reset successfully once. The user must approve the stable identity once; later local rebuilds should retain those grants.
- Detached geometry keeps `100 x 80 px` spacing in open space, compresses the visual offset near boundaries, and preserves the unshifted fingertip/lock coordinate. Pointing passes 11/11, target lock 9/9, visual motion 18/18, macOS privacy/signing 3/3, and all workspace TypeScript checks pass.
- Built and installed executable SHA-256 values match at `2edcbc0ab20f60d36a5dc0997f51de131367b968806e729a36ab9595e74fb86e`. The stable installed app passes strict signature verification and runs as PID `55623`. Codex issued no command or gesture. No commit or push was made.

## 2026-07-20 Pinch Release and Native Screen-Access Request Checkpoint

- Live diagnostics proved that an intentional unpinch entered `releasing`, but a following missing-hand frame replaced it with `recovering`; the eventual `tracking_lost` path then reset native voice capture and discarded the recording.
- `gestureControlVoice.ts` now preserves the release candidate and its timestamp through missing frames, completes the `180 ms` release once, and keeps the existing `2,000 ms` recovery window for loss without a release candidate.
- `App.tsx` records the active gesture voice owner as ordinary or contextual plus its track ID. Only a matching controller can end that voice session. Both intentional release and persistent tracking loss submit captured speech once; an emit failure still falls back to native cancellation.
- The recurring Screen Recording denial had a separate cause: Toki preflighted access but never invoked `CGRequestScreenCaptureAccess`. The capture path now requests natively only when a real capture needs a missing grant, then continues through the same fail-closed capture gate.
- Gesture control voice 13/13, capture access 3/3, target lock 9/9, voice hold 3/3, macOS privacy 3/3, gesture runtime 6/6, input stability 6/6, all workspace typechecks, Rust test/check/format, and diff checks pass.
- The production app was rebuilt, signed with the existing `Toki Local Development` identity, copied without re-signing, strictly verified, and launched as PID `63321`. Installed executable SHA-256 is `83eeed91ba94611ce8d907669a88217dbd1c8107bc806436dba5776a10ade251`; CDHash is `7ede33456b09f8320066ca9e6b2e75bb442c5da9`; the certificate-rooted designated requirement is unchanged.
- No TCC reset, Toki command, gesture, commit, or push was performed. The user owns the live unpinch and first native permission-prompt checks.

## 2026-07-20 Direct Pinch Handoff and One-to-One Pointer Checkpoint

- The user's next live retry proved that release recognition was working: private history recorded ordinary press `control-pinch-1-hand-7-press` at `20:47:59.296Z`, then same-track release `control-pinch-2-hand-7-release` at `20:48:03.354Z`, with the pinch controller idle while voice incorrectly remained `listening`.
- Root cause was the local gesture-to-voice round trip through `toki://overlay-command`. The Overlay listener is asynchronously re-subscribed from fast-changing state, so a local release could hit a delivery gap or a duplicate press could disturb voice ownership.
- `App.tsx` now exposes shared local start/stop/submit voice lifecycle functions. Ordinary and contextual pinch, lock invalidation, and local timeout call them directly. Genuine cross-window commands still use the Tauri listener and delegate to those same functions.
- Pointer mapping is fixed to the full normalized camera frame on both axes. Adaptive calibration cannot shrink the range. Current response values are `0.0025` dead zone, `0.82` alpha, `0.60` minimum motion scale, `0.04` full-response distance, and `0.025 s` gesture lead follow.
- Gesture control voice passes 13/13, pointing 12/12, input stability 6/6, adaptive profile 6/6, voice hold 3/3, gesture runtime 6/6, all workspace TypeScript checks, and whitespace validation.
- The production app was rebuilt with the existing stable identity, copied without re-signing, strictly verified, and launched as PID `66966`. Installed executable SHA-256 is `da7e81aa51aa06ca5c86220ded651c5abb164c1976dc6ebef269590931485bd7`; CDHash is `851d10b804875c16520e68fbe2f1a8db636085f1`; the certificate-rooted designated requirement is unchanged.
- Fresh diagnostics start clean and idle. No TCC reset, Toki command, gesture, commit, or push was performed. Live unpinch and one-to-one pointer feel remain user-owned acceptance.

## 2026-07-27 Gesture Polish Phases 1–5 Checkpoint

- Phase 1 added a bounded privacy-safe frame trace, complete window-validation receipts, and deterministic production-pointer replay.
- Phase 2 replaced fixed per-frame smoothing with elapsed-time one-to-one filtering: `85 ms` near-rest response, `18 ms` deliberate-motion response, and `180 ms` stale-gap reset.
- Phase 3 made a live lock authoritative over split presentation so the one main `BlobPuck` owns checking, locked, and limited feedback.
- Phase 4 selects the real frontmost window under the frozen point, records bundle/PID/CG-window identity, tolerates volatile same-window titles, and rejects changed windows/bounds or an out-of-window point.
- Phase 5 makes pinch-to-talk tolerant of brief pose noise and deterministic across asynchronous recorder starts/stops. Physical entry/release interruption time does not count toward hold time; detector, track, press event, attempt generation, and native session ID form one ownership chain.
- Private diagnostics now expose raw/filtered pinch distance and the complete gesture-owned recorder lifecycle without storing camera frames, landmarks, or audio.
- Focused Phase 5 regressions, all workspace typechecks, visual-motion QA 19/19, production web/native builds, persistent signing, copy-without-resigning install, strict verification, hash equality, one-process launch, and fresh diagnostics pass.
- Current built and installed executable SHA-256: `618babc7045e3b7d5f49530d320d1d3a6b74aed900071d246380ae4f5ab06644`. Installed CDHash: `587537a0eb8c36c49aff9129a42e8a3cf1c79032`. Exactly one installed process was observed as PID `2545`.
- Phase 6 performance/package-footprint and final regression work is next. Manual camera/gesture/voice/guidance acceptance remains user-owned. No Toki command, gesture, commit, or push was performed.

## 2026-07-27 Gesture Polish Phase 6 Final Automated Checkpoint

- Idle-only liquid deformation is capped at `30 FPS`; target revisions and active settling bypass the cap, so performance work does not add pointer or target latency.
- MediaPipe Tasks Vision is a lazy camera-owned dependency. The production entry chunk fell from about `594 KB` to `469 KB`, with a separate approximately `136 KB` vision chunk and no Vite `500 KB` warning.
- `npm run toki:footprint -- --enforce` protects explicit app, executable, web-dist, JavaScript, CSS, and MediaPipe ceilings. The final installed app is `30.89 MiB`, web dist `40.27 MiB`, JavaScript `0.58 MiB`, CSS `0.03 MiB`, and offline MediaPipe `39.65 MiB`.
- The full deterministic matrix passes: 240 root tests, 33 `@toki/ai` tests, 5 Rust tests, visual-motion 19/19, browser candidate/known-screen, AX/OCR fallback, workflow, eval 2/2, provider readiness, all typechecks, Rust check/format, builds, signing, installation, footprint enforcement, and replay.
- A camera-off ten-sample observation used roughly `66.7–68.8 MiB` RSS. Its CPU mean was about `2.9%` versus about `4.0%` on the Phase 5 build; this is a directional local observation, not a formal benchmark or camera-on thermal acceptance.
- Built and installed executable SHA-256 values match at `f7dbda8ecb5be43cc5a033cc8ad039c8d8b9699696118b51825193a38c5d527c`. Installed CDHash is `102050a23efbe8aa9ee30fd70407cb0b4adbe14c`; the certificate-rooted designated requirement remains unchanged; exactly one installed app process was observed as PID `8596`.
- The footprint reporter falls back from restricted `pgrep`/`ps` access to Toki's launchd application-service identity, preventing a managed shell from falsely reporting that no app process exists.
- Fresh machine-readable diagnostics are idle with Camera + Gestures off. All agent-owned Gesture Polish phases are complete; the ordered live matrix remains user-owned. No Toki command, gesture, commit, or push was performed.
