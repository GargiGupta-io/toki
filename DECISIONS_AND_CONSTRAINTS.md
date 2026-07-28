# Decisions and Constraints

## Product Requirements

1. Toki is a user companion and visual guidance tool, not a conventional chatbot.
2. The default experience is cursor-first: puck, target ring, and minimal cue only.
3. Toki must point to the next action; it must not take over the computer or auto-click.
4. Wrong guidance is worse than no guidance. Invalid or ungrounded targets must be refused.
5. Multi-step tasks require explicit session memory and screen verification between steps.
6. The normal runtime must not expose developer panels, fixture controls, or mock targets.

## Surface Architecture

1. Overlay, user utility/settings, and Debug are separate surfaces.
2. Overlay responsibilities:
   - transparent desktop layer
   - click-through behavior
   - puck
   - target ring
   - minimal guidance cue
3. User utility responsibilities:
   - compact user controls
   - voice state
   - pause/update behavior
   - no large blank area
   - tabs rather than multiple competing boxes where controls must be grouped
4. Debug responsibilities:
   - capture/provider/evidence/coordinate/safety diagnostics
   - developer-only controls
   - never open by default for normal users
5. Clicking `Open Toki` from the menu/tray must open the intended top utility surface, not a second unrelated settings app.

## Dev App and Main App Separation

1. The dev app uses Vite/Tauri dev mode and live source.
2. The main app uses built assets and can be stale.
3. Never report a dev-app observation as proof of the installed app.
4. Never rebuild/install the main app casually while debugging the dev app.
5. Before main-app acceptance, record:
   - source commit
   - build command
   - artifact path
   - signing result
   - install path
   - running process identity
6. Do not run both apps simultaneously during acceptance testing.

## Cross-Platform Strategy

1. macOS is the primary product-feel and manual QA platform.
2. Keep Tauri/Rust/React as the cross-platform core.
3. Add native platform bridges only where the OS requires them:
   - cursor/window behavior
   - active Spaces/fullscreen overlay behavior
   - capture and permissions
   - accessibility
   - microphone/global input integration
4. Keep Windows and Linux code paths alive.
5. macOS-specific code belongs behind platform boundaries and must not replace shared contracts.
6. Windows implementation must remain separate from macOS implementation where native APIs differ.

## Voice Decisions

1. Use true hold-to-talk, not toggle recording or always-listening audio.
2. Privacy reason: do not capture unnecessary audio.
3. Current pipeline:
   - native microphone capture
   - WAV encoding
   - local Whisper transcription
   - transcript becomes the guidance command
4. Voice does not select a target directly.
5. The global trigger should be one reliable control where possible; the settings control remains a fallback/debug path.
6. Permission settings should open only when permission is genuinely missing.
7. A capture session must have explicit idle/recording/stopping/transcribing terminal states and must not remain stuck listening.
8. Right Option is the macOS global hold control: keydown starts at most one capture, keyup stops/submits exactly once, and a release received during startup must be remembered and honored.
9. Right Option detection uses right-side device/key signals only; left or generic Option flags must not activate capture.
10. Input Monitoring must be preflighted and requested only when missing. A denied global trigger must not fail silently.

## Guidance and Accuracy Decisions

1. Provider modes must remain honest:
   - `mock`: renderer/fixture testing only
   - `real`: real provider path
   - `codex-subscription`: temporary local development adapter using the user's authenticated Codex CLI
   - `unavailable`: no safe accepted target
2. Mock guidance must not be the normal default experience.
3. Provider input should contain the relevant active-window crop, command, dimensions, and current evidence.
4. Evidence can include:
   - screenshot/visual model output
   - OCR text boxes
   - accessibility elements
   - browser/DOM candidates
   - layout/geometry metadata
   The current screenshot is primary visual evidence. Structured candidates are preferred corroboration, not a universal prerequisite for a visually unambiguous icon.
5. Do not add Spotify-specific fallback logic. Spotify is a test screen, not a product boundary.
6. If the user names an app, or a clear frontmost app is present, capture/crop that relevant window rather than the entire desktop when reliable.
7. Reject blank or generic labels including `Vision target`, `button`, and `icon` unless independently grounded to a specific current element.
8. Require semantic agreement between:
   - command action
   - command object
   - candidate role/label/evidence
9. Require source provenance and current-request evidence.
10. Tighten/refine rectangles only after semantic grounding passes.
11. Validate crop, display, overlay, and source coordinate spaces explicitly.
12. Different commands on the same screen must select different regions when the requested actions differ.
13. Debug must expose:
   - transcript
   - provider mode
   - raw structured answer
   - original target box
   - candidate IDs/evidence
   - grounding verdict
   - coordinate transform receipt
   - final target or rejection reason
14. Provider invocation is an adapter boundary. Moving later to the OpenAI API must not require changes to capture, evidence gathering, grounding, coordinate mapping, safety, or overlay rendering.
15. The retired local vision runtime is not part of the current project path, configuration, tests, documentation, or debug UI.
16. Only accepted guidance may display the target ring. Rejected guidance must remain visually absent.
17. A current-image-only target may pass only when it has the current localization trace, a specific non-generic label, confidence of at least 72%, valid geometry, and semantic agreement with the command action and object.
18. The provider must not lower confidence merely because no exact structured candidate ID exists. It must lower confidence when the requested control is not visible or its location is ambiguous.
19. Complementary evidence may be combined: a generic/symbolic current candidate can supply identity and geometry while a specific provider label/reason supplies missing semantics. This requires at least 72% confidence and a current-image trace, and it must never override an explicit structured action or object conflict.
20. Read-only navigation synonyms such as `see`, `show`, and `view` normalize to `open`. Contextual inference may recognize UI navigation nouns and specific media-history phrases, but generic words such as `history` must not be treated as media and app-specific rules remain forbidden.

## Safety Constraints

1. Toki guides; it does not execute clicks.
2. Preserve allow/clarify/confirm/block safety outcomes.
3. Account and permission changes are warning-only guidance: show the target immediately and state that account settings, access, or editing rights may change.
4. External send, delete, payment, security, unknown-risk, and other irreversible actions require user-controlled target reveal. The target ring stays absent until the user chooses `Show target`.
5. `Show target` acknowledges visibility only. It must never click, submit, confirm, or modify the underlying application.
6. Low-confidence or invalid results must refuse rather than hallucinate.
7. Do not expose secrets, API keys, tokens, private screenshots, or raw sensitive logs in commits or handoff docs.
8. Paid provider keys must not be embedded in the desktop app.
9. Production paid providers require a backend/proxy for credentials, billing, rate limiting, and abuse prevention.

## Visual Identity Constraints

1. Toki should feel like a small living liquid companion, not a static badge.
2. The puck must remain close to the real cursor and flip/clamp at screen edges.
3. It must remain visible without dominating the desktop.
4. It should react to idle, listening, thinking, guiding, gesture, and error states.
5. Do not place a text box next to the puck in normal idle behavior.
6. Voice/guidance status belongs in the top-edge utility surface.
7. The top-edge surface should be visually separate from the puck and should reveal intentionally.
8. Maintain reduced-motion and performance fallbacks.
9. Avoid large permanent panels, nested cards, decorative clutter, and unnecessary rounded text boxes.
10. Living motion belongs inside the blob shape: use bounded drift, stretch, and organic deformation rather than restoring a ring, aura, square, or crosshair around it.
11. Thinking/processing must remain visibly active so model latency does not look like a frozen application.
12. Target travel is one transient droplet, not a second stable marker. The existing rotating ring remains the sole authoritative destination cue.
13. A droplet may render only from the accepted-guidance motion gate and the same visible accepted target supplied to the ring. Raw, rejected, hidden, missing, refreshing, and errored target state must never animate toward a location.
14. JavaScript-driven motion must check `prefers-reduced-motion` inside the motion calculation; CSS-only reduced-motion rules are insufficient for inline transforms.

## Gesture Pointer-Explanation Constraints

1. Pointing alone never selects, calls a provider, displays a guidance ring, or clicks.
2. Two valid air taps copy an immutable coordinate; later pointer movement cannot change it.
3. A deictic explanation requires the matching frozen lock. Without one, Toki clarifies; ordinary non-deictic voice remains on the existing command route.
4. The screen is recaptured and the active-window receipt is revalidated when the lock is used, not merely when it was created.
5. Current OCR, Accessibility, and DOM evidence may be combined near the point, but equally near distinct candidates are ambiguous and must be refused.
6. The provider receives the exact mapped point and a bounded focus region. It cannot substitute a nearby control; the returned target must still contain the point.
7. Pointer explanations require specific semantics, current supporting evidence, and confidence of at least 70%. Generic, unsupported, stale, conflicting, or moved results clarify.
8. Pointer explanations use a separate passive card. They never become generic guidance results or borrow the accepted-target ring.
9. Spoken explanation starts only after microphone capture, listening, and transcription are idle. A persistent mute control is required.
10. Gesture explanations remain guidance-only and have no click authority.

## Engineering Workflow Constraints

1. Inspect and explain the plan before source edits.
2. Prefer coherent root-cause fixes over repeated micro-patches.
3. Do not modify unrelated files.
4. Use existing repository patterns and shared contracts.
5. When a command fails once:
   - read the failure
   - use a different appropriate approach if possible
   - otherwise stop and report the exact blocker
   - do not repeat the same failing command pattern
6. For commands historically unreliable in the tool environment, ask the user to run them when requested.
7. Use granular, file-focused commits when commits are requested.
8. Do not push until explicitly requested.
9. Do not mix generated artifacts with source edits.
10. Do not edit files under `.codex` for project documentation.
11. After rebuilding/reinstalling the main Toki app, launch the updated installed app unless the user explicitly says not to. Launching does not authorize Codex to issue real guidance commands or make the manual acceptance judgment.
12. The 2026-07-15 pre-gesture checkpoint push was explicitly authorized by the user; this does not authorize future pushes automatically.

## Rejected or Deferred Approaches

| Approach | Decision | Reason |
| --- | --- | --- |
| Full rewrite in Swift | Rejected | Would make the core Mac-only and discard the cross-platform Tauri/Rust/React architecture |
| Pure React/web cursor tracking | Rejected for overlay tracking | Click-through overlay cannot rely on normal page mouse events; native cursor data is required |
| CSS-only final liquid puck | Deferred as fallback | Useful baseline but insufficient for final living/liquid feel |
| Full native overlay/render rewrite immediately | Deferred | High complexity and would duplicate cross-platform UI before the shared architecture is stable |
| Fullscreen WebView assumptions on macOS | Rejected alone | macOS fullscreen apps use separate Spaces and require native window ordering/collection behavior |
| Small moving puck window as the only overlay | Deferred | Efficient for idle, but guidance still needs a screen-wide target layer |
| Always-listening microphone | Rejected | Privacy and unnecessary capture risk |
| OpenAI transcription as required path | Rejected for current development | Paid quota required; local Whisper works offline |
| FreeLLMAPI as production backend | Rejected for shipping | Appropriate only as a development experiment, not credential/security infrastructure |
| Unqualified screenshot-only target guessing | Rejected as sufficient | Visual models can return plausible but wrong coordinates; current-image provenance, specific semantics, confidence, geometry, and verification are required |
| Accessibility-only targeting | Rejected as sufficient | Some apps expose incomplete or unhelpful accessibility trees |
| OCR-only targeting | Rejected as sufficient | Icons and unlabeled controls are not reliably represented as text |
| App-specific Spotify heuristics | Rejected | The product must generalize across apps |
| Auto-click/takeover | Rejected | Toki is guidance software and must preserve user control |
| Treating generic model labels as valid | Rejected | Produces semantically ungrounded guidance |

## Documentation Authority

1. Tracked roadmap: `touchpilot/docs/roadmap.md`.
2. Production status: `touchpilot/docs/phase-16-production-readiness.md`.
3. Untracked `touchpilot/learnings/plan.md` is contextual history, not authoritative until reconciled and committed.
4. This migration pack records current state but does not itself change application behavior.

## 2026-07-15 Capture and Cue Decisions

1. Active-window metadata is not proof that captured pixels contain the active window. Screen Recording trust must pass before pixel capture begins.
2. Screenshot-library success must never override a failed macOS Screen Recording preflight.
3. Capture permission is enforced twice: once in TypeScript orchestration and again at the native Rust pixel boundary.
4. A denied preflight returns no provider payload. Confidence thresholds must not be weakened to compensate for corrupted or wallpaper-only captures.
5. Target cue shape is derived only from the final verified rectangle's geometry, not from Spotify names, command wording, or provider labels.
6. Wide text/tab targets use a padded rounded outline covering the full verified bounds. Compact icon targets preserve the circular cue.
7. Cue geometry remains downstream of semantic acceptance and cannot choose, expand, or authorize a different target.
8. Rebuild, install, and launch remain authorized after source changes; real Toki commands and visual acceptance remain manual/user-owned.
9. Every privacy-sensitive macOS capability must have a meaningful source `Info.plist` description. Camera, Microphone, and Screen Recording keys are release inputs, not optional documentation.
10. The signing/install path must inspect the final packaged plist and refuse a bundle missing any required privacy description before signing or installation. Runtime error handling cannot catch a TCC missing-description abort.

## 2026-07-17 Gesture Experience Repair Decisions

1. Camera and gesture recognition are one user-facing capability. All UI, voice, and shutdown transitions must update their desired state atomically.
2. The combined lifecycle switch belongs in the top utility Controls tab. Debug is diagnostic-only for enable state; it may retain device refresh, calibration, and derived runtime diagnostics.
3. Explicit positive camera-on voice commands are local control intents. They must be handled before pointer explanation and generic visual guidance, and they must not call the provider.
4. Negated, camera-off, ambiguous, incomplete, and unrelated phrases must not enter the local voice-on route.
5. Camera-off by gesture requires two closed fists held for 2,000 ms. One fist, pointing, open palm, and pinch are non-shutdown gestures.
6. The shutdown recognizer gets a short missed-frame grace and a release cooldown, but its duration and meaning are not adaptive profile outputs.
7. Turning the combined capability off may cancel a gesture-owned voice context. It must not blindly cancel Right Option or settings-owned voice capture.
8. Rebuild, sign, install, stop stale processes, and launch exactly one installed Toki process after each completed source phase. Codex still must not issue Toki commands or perform manual gesture acceptance.
9. Pointer sensitivity, pinch stability, stale-hand cleanup, and the persistent split strand are separate phases. The Phase 1 lifecycle change must not silently tune those behaviors.

## 2026-07-17 Gesture Input Stability Decisions

1. The two-second human grace remains an internal identity and safety promise. It is not the visible freeze duration.
2. A missing pointer may remain visibly recoverable for 320 ms; afterward the blob releases while the internal track and smoothed point remain eligible to recover for two seconds.
3. Split presentation uses the same short visual-recovery principle, while hand-track identity remains retained independently.
4. Fine pointer motion receives stronger damping than large deliberate motion. Absolute display mapping, screen bounds, lock coordinates, and the real mouse remain unchanged.
5. A control pinch may begin only while a current pointer lock exists and is checking or locked. An already-held pinch remains governed by release and tracking-loss safety even if start eligibility later changes.
6. A press event may wait only for the same lock's asynchronous `checking` state. Missing, invalid, or busy contexts consume it safely; it must not start later against an unrelated lock.
7. Brief pinch-entry and generic-classifier dropout receive small fixed grace windows. These windows do not weaken release holds, the two-second active-recording loss cancellation, or provider/safety boundaries.
8. Hand inference runs only for new video timestamps. A 350 ms timestamp stall becomes empty derived input so old camera pixels cannot preserve action state.
9. The frame-freshness controller stores only timestamps and booleans. It never receives, stores, or exports camera pixels or landmarks.

## 2026-07-17 Persistent Split Strand Decisions

1. The two separated lobes remain visually connected for the complete split lifecycle: splitting, stable split, visual recovery, and merge.
2. Strand endpoints are derived from the current visible lobe edges, not hardcoded screen positions or the real mouse cursor.
3. Greater hand separation may make the strand finer, but fixed minimum thickness and non-zero stable-split opacity prevent it from disappearing.
4. The strand is drawn behind the lobes and cannot cover or replace target cues, pointer-lock cues, or hit-testing surfaces.
5. Reduced-motion mode keeps the connection visible while disabling its pulse and positional interpolation.
6. Strand geometry is a pure visual calculation. It cannot classify gestures, extend hand retention, start voice, call a provider, render accepted guidance, move the real cursor, or click.
7. No app-specific, command-specific, or target-specific logic is allowed in the strand path.

## 2026-07-17 Final Gesture Acceptance Decisions

1. Automated completion and live product acceptance are separate claims. Passing deterministic tests does not prove camera comfort, motion taste, microphone behavior, or live target correctness.
2. The final automated matrix must cover every root `test:*` command plus package AI tests, the full Rust workspace, visual motion, browser extension, browser/AX/OCR/workflow/eval fixtures, all TypeScript, Rust format/check, provider readiness, production builds, signing, privacy keys, hash equality, and process count.
3. The user owns every live camera, gesture, voice, guidance, and visual judgment. Codex may install and launch Toki but must not manufacture acceptance evidence by operating it.
4. Live cases must run against one installed `/Applications/Toki.app` process, never a mixed dev/installed environment.
5. The first failure is evidence. Preserve its case ID, exact phrase/gesture, relevant Debug state, app identity, and privacy-safe screenshot before retrying or adjusting thresholds.
6. A live failure does not authorize weakening confidence, safety, semantic verification, permission checks, no-click boundaries, or gesture authority.
7. `touchpilot/docs/gesture-experience-manual-acceptance.md` is the canonical gesture-experience checklist until results are recorded and reconciled.

## 2026-07-19 Persistent Lock and Compact Utility Decisions

1. A copied lock coordinate survives ordinary hand movement. The main creature and lock feedback stay at that coordinate until explicit invalidation or consumption.
2. Missing Screen Recording permission or a temporary screen-state probe failure is insufficient evidence to delete a coordinate. It produces a visible `limited` lock and periodic revalidation. A proven display/window identity or bounds change still invalidates.
3. Ordinary pinch voice and contextual control-hand pinch voice are separate state machines. Both reuse the existing native hold-to-talk lifecycle; neither owns a second recorder.
4. A thumb/index pinch cannot also satisfy the index-bend classifier. Open-palm pause cannot fire during a lock, two-hand interaction, either pinch lifecycle, or active voice capture.
5. The mapped fingertip is authoritative for locks and explanations. The `100 x 80 px` creature offset is visual only; it stays full-size in open space and compresses per axis near a boundary rather than redirecting lost distance along the edge.
6. Final screen clamping is based on the visible puck radius. Invisible carrier geometry must not create a false gap at display boundaries.
7. The top utility is a native fullscreen auxiliary window on macOS. Peek ignores mouse events; expanded mode is interactive; both stay on all Spaces above fullscreen content.
8. The accepted compact design is literal pitch black, top-flush, `380 x 58 px` passive, and `400 x 218 px` expanded. Future changes must not silently restore the oversized `560 x 278 px` surface.
9. Rebuild, reinstall, and launch after runtime/UI changes remain required. Manual gestures and commands remain user-owned.

## 2026-07-19 Wrist-Roll Lock and Deliberate-Split Decisions

1. Index flexion is no longer an accepted target-lock authority. Live evidence showed that it flickered and failed to produce a dependable persistent lock.
2. Lock intent is a baseline-relative wrist roll on the already-pointing hand. Camera-facing absolute palm orientation must not be required.
3. The last stable pointer coordinate is copied before meaningful rotation. Wrist rotation may prove intent but may never move the chosen coordinate.
4. A lock requires at least `70 degrees` of relative palm-normal rotation held for `220 ms`. The detector permits `450 ms` interruption inside a `2,000 ms` sequence.
5. A completed roll is one-shot. It rearms only after the same hand returns to a valid pointing baseline and the `350 ms` cooldown completes.
6. Wrong-hand completion, stale pointers, screen changes, or unavailable gesture ownership remain refusals. Wrist roll does not add click, provider, or guidance-render authority.
7. A second hand appearing is not split intent. Toki stays merged until both hands join for `240 ms`, arm visibly, and then separate for `180 ms`.
8. Split arming expires after `2,000 ms` and tolerates `450 ms` of brief join interruption. Split remains visual-only.
9. Working ordinary/contextual pinch-to-talk behavior is preserved. Gesture changes must not create a second microphone owner.
10. Build/install/launch is authorized and required after this runtime change. Manual gesture judgment remains user-owned; no commit or push occurs without explicit approval.

## 2026-07-19 Single-Creature Lock Decisions

1. Toki has one visible main creature. A target lock must never add a miniature creature, duplicate droplet, independent lock ring, or `TARGET LOCKED` label beside it.
2. The same main `BlobPuck` that follows the gesture pointer freezes at the copied coordinate after lock. This visual freeze is only a receipt; the authoritative coordinate remains unchanged.
3. Textual lock state belongs in the compact top status. Accepted-guidance geometry continues to own the target ring; lock feedback must not reuse or imitate that ring.
4. Removing the separate cue does not weaken freshness checks, lock invalidation, grounding, split behavior, voice ownership, no-click boundaries, or provider safety.
5. The one-creature invariant is regression-tested at the `App.tsx` render boundary. Future visual changes must preserve exactly one `BlobPuck`.
6. Runtime/UI changes still require rebuild, replacement, and relaunch. Manual acceptance remains user-owned; no commit or push occurs without explicit approval.

## 2026-07-19 Stable Local Signing and TCC Decisions

1. Local macOS builds require the persistent `Toki Local Development` identity. Ad-hoc fallback is forbidden because it recreates hash-bound TCC failures.
2. The designated requirement must contain `app.toki.desktop`, be certificate-bound, and contain no `cdhash` term.
3. Installation copies the signed build and verifies it. The installed copy must never be signed a second time.
4. The bootstrap import grants private-key access only to `/usr/bin/codesign` and `/usr/bin/security`; broad `security import -A` access is forbidden.
5. A two-build gate must show different CDHashes and the exact same designated requirement whenever the local signing workflow changes.
6. TCC rows are reset only for the one-time identity migration or evidence-proven corruption. Routine rebuilds must not reset permission records.
7. This self-signed identity is for local development only. Developer ID signing and notarization remain separate production-release work.
8. The user owns fresh permission approval and live gesture/visual acceptance. Codex may build, install, reset the explicitly scoped stale rows, and launch, but may not issue a command or gesture.

## 2026-07-20 Pinch Release and Screen-Access Decisions

1. Pinch remains hold-to-talk: the user pinches and holds while speaking, and opening the pinch ends and submits the recording.
2. Once `releasing` starts, missing camera frames may not overwrite the release candidate. The `180 ms` release timestamp is authoritative until one release emits or the controller resets.
3. Persistent hand loss keeps the `2,000 ms` recovery grace. When that grace expires during active gesture-owned capture, Toki ends listening and submits the speech already captured once; it must not silently discard the audio or remain listening.
4. Ordinary and contextual gesture voice share the one native recorder but have explicit detector and track ownership. An event from the other detector or another track cannot terminate the active session.
5. Screen Recording preflight is a check, not a request. If a real capture needs access and preflight is false, Toki must invoke native `CGRequestScreenCaptureAccess` before returning the permission blocker.
6. Screen Recording must not be requested at startup. Approval is requested just in time at capture intent, and capture remains fail-closed until native access succeeds.
7. The persistent local signing identity remains the macOS permission identity. This repair must not reset TCC or create a replacement certificate.
8. Runtime changes require rebuild, copy-without-resigning verification, and launch. Manual gestures/commands remain user-owned; no commit or push occurs without explicit approval.

## 2026-07-20 Local Voice Handoff and Pointer-Mapping Decisions

1. A detected local gesture event must not traverse a cross-window event bus merely to reach another function in the same Overlay runtime.
2. Ordinary/contextual pinch effects call the shared local voice lifecycle directly. Settings, Debug, and other genuine window boundaries may still use the Tauri command listener, which delegates to the same functions.
3. There remains exactly one native recorder and one voice hold controller. Direct handoff does not create a second voice implementation.
4. A correct same-track release in diagnostics with voice still listening is evidence of a delivery/integration failure, not permission to loosen pinch thresholds.
5. Pointer mapping is full-frame normalized `[0, 1]` camera space to `[0, 1]` display space. Horizontal mirroring is the only axis transformation.
6. Adaptive calibration may tune bounded gesture measurements but may not shrink the pointer range or create high-DPI amplification.
7. The authoritative mapped point continues to own locks and explanations. The `100 x 80 px` detached blob position remains visual-only and compresses at edges.
8. Current response constants are `0.0025` dead zone, `0.82` maximum alpha, `0.60` minimum response scale, `0.04` full-response distance, and `0.025 s` gesture lead follow.
9. Runtime changes require rebuild/install/launch. Manual feel and microphone acceptance remain user-owned; no commit or push occurs without explicit approval.

## 2026-07-27 Gesture Voice Lifecycle Decisions

1. Pinch remains physical hold-to-talk. Entry, continuous hold, and deliberate opening are different phases; a transient contradictory frame is not a user action.
2. Entry interruption grace is `240 ms`; release interruption grace is `160 ms`; an intentional open release must remain valid for `180 ms`. Interruption time is excluded from the required hold duration.
3. Raw pinch distance is retained only as a derived number for diagnostics. The controller acts on the track-owned filtered distance and never stores camera frames or landmarks.
4. One native recorder is shared. Its authoritative owner is detector plus stable track plus press event, and its asynchronous start is guarded by a monotonically increasing attempt generation.
5. A native stop result must match the native session ID recorded at start. A late start, wrong detector, wrong track, old event, or mismatched session may not submit or cancel the current capture.
6. Turning Camera + Gestures off cancels any ordinary or contextual gesture-owned capture so an inactive gesture runtime cannot leave the microphone listening.
7. Recorder lifecycle diagnostics must expose phase, owner, native session, release-pending state, last duration/byte count, and last transition without exporting audio.
8. This phase changes no provider, semantic grounding, target coordinate, click, capture, permission, split, or visual authority.
9. Runtime changes require rebuild, stable-signature verification, installation, one-process launch, and fresh local diagnostics. Manual gestures and spoken commands remain user-owned; no commit or push occurs without explicit approval.

## 2026-07-27 Gesture Performance and Footprint Decisions

1. Performance work may reduce ambient presentation frequency, but it may not delay a new logical pointer, target revision, or active settling frame.
2. Ambient-only liquid deformation is capped at `30 FPS`. Active pointer and target movement continues on the display animation loop.
3. MediaPipe Tasks Vision is camera-owned and lazy. It must not occupy the startup entry chunk before Camera + Gestures requests hand tracking.
4. The offline MediaPipe model and SIMD/non-SIMD WASM variants remain bundled and checksum-pinned. Package reduction may not delete compatibility assets merely to improve a headline size.
5. Enforced source budgets are `64 MiB` app, `64 MiB` executable, `56 MiB` web dist, `1 MiB` production JavaScript, `128 KiB` CSS, and `48 MiB` MediaPipe. Raising a budget requires measured evidence and an explicit decision.
6. Footprint reporting is read-only. It may inspect the installed process and filesystem but may not launch, kill, alter, or re-sign Toki.
7. Camera-off CPU/RSS sampling is diagnostic evidence, not a substitute for user-owned camera-on thermal, battery, visual-fluidity, or latency acceptance.
8. Phase completion requires the complete root/AI/Rust regression matrix, deterministic QAs, provider readiness, visual checks, production builds, stable signing, copy-without-resigning install, strict verification, matching hashes, one process, fresh diagnostics, and replay.
9. No partial publication is authorized. The complete working tree remains uncommitted and unpushed until the user manually approves the integrated result.
