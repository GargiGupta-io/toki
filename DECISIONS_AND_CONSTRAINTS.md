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
