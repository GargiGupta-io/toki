# Phase 13A: Living Visual Identity

Phase 13A gives Toki a living visual body without changing the guidance brain.

The goal is to make Toki feel like a small liquid companion that reacts to the user's state: idle, listening, transcribing, thinking, guiding, error, paused, and later gesture input. This phase must preserve the current voice, capture, provider, validation, and target-lock contracts.

## Product Intent

Toki should feel like:

- a small liquid companion near the cursor
- calm while idle
- visibly awake while listening
- visibly active while thinking
- clearly focused when a target is locked
- restrained when an error happens
- responsive to gestures later

Toki should not feel like:

- a dashboard
- a debug marker
- a normal app window
- a giant cursor replacement
- a stack of unrelated circles
- a noisy full-screen animation
- a decorative website background

## Hard Boundary

This phase may change only the visual body and visual state mapping.

Allowed:

- overlay visual components
- puck/creature rendering
- target cue animation
- state-to-motion mapping
- reduced-motion fallback
- visual debug labels for creature state
- non-invasive gesture visual hooks

Not allowed:

- guidance provider routing
- Ollama or provider prompts
- candidate ranking
- screen capture permission logic
- active-window crop logic
- voice recording/transcription
- global hotkey behavior
- settings popup behavior
- debug provider contracts
- safety policy logic
- app-specific targeting fallbacks

If a change is needed for target accuracy, it belongs outside Phase 13A.

## State Contract

The living visual layer should consume a derived state. It must not become another source of truth.

```ts
type TokiCreatureMode =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "guiding"
  | "error"
  | "paused";

type TokiCreatureAnchor = "cursor" | "target" | "finger";

type TokiCreatureState = {
  mode: TokiCreatureMode;
  anchor: TokiCreatureAnchor;
  cursor: { x: number; y: number };
  target?: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    confidence?: number;
  };
  voiceLevel?: number;
  gestureLevel?: number;
  confidence?: number;
  hasTarget: boolean;
  hasGesture: boolean;
  reducedMotion: boolean;
};
```

## Component Boundary

Target structure:

```text
OverlayWindow
  App.tsx
    deriveTokiCreatureState(...)
    TokiCreatureLayer
      LiquidPuck
      StrandsAura
      CircularStatusRing
      LivingTargetCue
      GestureReactionLayer
      ReducedMotionCreature
```

The provider decides what target exists.
The creature layer decides how that state feels.

## Motion Rules

### Idle

- small breathing motion
- close to cursor
- no aura
- no target travel
- no status text

### Listening

- gentle expansion
- soft pulse
- voice-reactive brightness if voice level is available
- optional short status ring

### Transcribing

- compact internal motion
- small shimmer
- no target cue

### Thinking

- controlled aura or strands
- small scan-like movement
- no fake target

### Guiding

- puck visually acknowledges target lock
- target cue appears with motion
- label remains compact
- ring does not cover the thing to click
- confidence can control intensity

### Error

- brief contraction
- restrained amber/red shift
- no flashing
- explanation remains text-based

### Paused

- dimmed
- minimal
- no aura
- no target motion

## ReactBits Usage

ReactBits can be used as visual reference, but not as a direct input model.

Reason: ReactBits examples usually rely on webpage pointer events. Toki's overlay is click-through, so pointer events are not the source of truth. Toki must continue to use native cursor polling and existing runtime state.

Allowed ReactBits-inspired pieces:

- Blob Cursor visual idea for the creature body
- Strands for listening/thinking aura
- Circular Text for optional status ring
- Dot Field only for debug/onboarding, not default runtime

Not allowed:

- relying on `onMouseMove` for runtime cursor position
- full-screen decorative background in normal overlay
- visual code that changes provider behavior

## Tool Choices

### First Pass

Use React components and controlled animation state.

Reason:

- least disruptive
- keeps current overlay architecture
- easier to verify against existing target lock
- can keep CSS/reduced-motion fallback

### Later Upgrade

Use Three.js/WebGL only if the DOM renderer cannot produce a coherent liquid creature.

Reason:

- better for shaders, metaballs, and true liquid effects
- higher risk and more performance testing
- should be introduced behind a renderer boundary

### Not A Fit Right Now

- Threlte: Svelte-oriented, while Toki is React.
- Theatre.js: useful for demos/onboarding, not reactive runtime first.
- Spline: useful for visual prototyping, not core runtime first.
- PeachWeb: inspiration only.

## Acceptance Rules

Phase 13A passes only if all are true:

- Toki still launches with the same runtime behavior.
- Voice, capture, provider, and validation are not changed by this phase.
- Puck remains close to the real cursor.
- Toki reads as one companion, not disconnected circles.
- Idle, listening, thinking, guiding, error, and paused states are visually distinct.
- The target ring remains visible and compact.
- The visual layer does not block clicks.
- The overlay does not become a full-screen decorative scene.
- Reduced motion disables decorative loops.
- Target lock remains at least as functional as before this phase.

## Manual QA Checklist

```text
[ ] idle state is calm and close to cursor
[ ] listening state visibly reacts
[ ] transcribing state is distinct from listening
[ ] thinking state shows controlled activity
[ ] guiding state connects puck and target
[ ] error state is noticeable but not loud
[ ] paused state is quiet
[ ] target cue does not cover the target
[ ] overlay remains click-through
[ ] reduced-motion fallback works
[ ] no provider/capture/voice behavior changed
```

## Step Plan

1. Define this visual contract and boundary.
2. Add a derived `TokiCreatureState`.
3. Scaffold `TokiCreatureLayer`.
4. Add mode-reactive puck behavior.
5. Add small Strands-style aura.
6. Add optional Circular Text/status ring.
7. Make target cue feel connected to the puck.
8. Add gesture visual hooks.
9. Keep Dot Field scoped to debug/onboarding only.
10. Add reduced-motion and performance guardrails.
11. Run manual visual QA.
12. Update docs and commit only after visual acceptance.

## Non-Goals

- solving target accuracy
- changing Ollama/provider behavior
- fixing macOS screen-recording permissions
- changing keyboard shortcuts
- rewriting settings
- building a full onboarding scene
- committing or pushing before visual approval

## Updates

- 2026-07-09 - Added the isolated `TokiCreatureLayer` scaffold. The current `BlobPuck` remains visually unchanged, but it now renders through a dedicated creature layer with explicit mode, anchor, tone, energy, pulse, stretch, and aura data attributes. This gives Phase 13A a clean switch point for the living visual system without mixing new behavior into voice, capture, guidance, or provider code.
- 2026-07-09 - Added mode-reactive puck visuals through `BlobPuck`. The puck now receives the derived creature state and changes color, opacity, size, shadow, speed, trail pull, and liquid stretch for idle, listening, thinking, guiding, confirming, paused, and error modes. `BlobCursor` itself remains untouched; this keeps the visual behavior configurable without disturbing cursor polling or guidance logic.
- 2026-07-09 - Added a small Strands-style aura layer around the puck. The aura follows the same native cursor center as the blob, uses three subtle animated arcs, brightens during active modes, shifts warm during error mode, and disables animation under reduced-motion. This adds life around the puck without changing click-through behavior, target placement, or provider output.
- 2026-07-09 - Reworked the blob motion loop so cursor-follow animation uses one `requestAnimationFrame` loop instead of creating repeated GSAP tweens for every cursor update. The creature layer can now receive an accepted guidance target and render a small target-travel pulse only when real guidance is locked, keeping visual motion connected to the target without changing provider accuracy, voice capture, permissions, or target selection.
- 2026-07-10 - Added an isolated circular status ring around the creature for active runtime states. The ring reads only the derived creature state and distinguishes listening, transcribing, thinking, guiding, confirmation, paused, and error modes. It follows the same native cursor coordinates as the puck, includes a reduced-motion fallback, and does not change voice capture, guidance selection, or provider behavior.
- 2026-07-10 - Fixed the Phase 13A lag at its event-system source. Profiling showed the Rust/AppKit event loop was waiting normally but servicing a continuous stream of WebKit IPC requests. The hidden debug WebView received each runtime snapshot, reported the same inactive gesture back to the overlay, and caused the overlay to publish another snapshot indefinitely. Toki now suppresses duplicate gesture classifications at both the debug and overlay boundaries, does not report inactive gestures when gestures are disabled, deduplicates debug snapshots, and avoids an unnecessary second settings snapshot. Hand-landmark inference now stops when gestures are disabled and is capped at 15 FPS when enabled. Invisible aura strands pause their CSS animation. Before the repair, a clean idle launch sustained roughly 93% CPU in `toki-desktop` plus 61%, 38%, and 17% across three WebKit renderers. After hot reload and again after a clean relaunch, Toki settled at 0-0.9% and all three WebKit renderers at 0%. This establishes a performance rule for later visual steps: state events must be one-way or semantically deduplicated, hidden surfaces must not run unnecessary inference, and invisible decorative animation must be paused rather than merely made transparent.
- 2026-07-10 - Strengthened the circular status ring for unpredictable desktop backgrounds. The previous sub-pixel strokes and whole-element `screen` blend mode could make the ring disappear over bright or colorful content. The ring now uses explicit shared Toki color tokens, a dark contrast under-stroke, a brighter cyan foreground stroke, and outlined label text. This preserves the lightweight SVG renderer while making contrast deterministic on both light and dark applications. The same tokens are reserved for the upcoming top-edge status surface so the creature, status communication, and settings popup can share one visual language without coupling their behavior.
- 2026-07-10 - Added a single cross-platform top-edge status surface for voice and guidance state. The creature remains visually unframed while listening, microphone setup, transcription, screen reading, accepted guidance, confirmation, pause, and failure messages are translated into one compact black surface near the top center. A deterministic priority order prevents simultaneous runtime states from competing: pause and confirmation are handled first, active voice and thinking states follow, then failures, accepted guidance, and command acknowledgement. The surface is pure React/CSS, click-through, safe-area aware, reduced-motion compatible, and introduces no polling, IPC, or native platform dependency. macOS can place it near the camera/notch while Windows and Linux use the same centered top-edge component.
- 2026-07-10 - Removed the five legacy cursor- and target-adjacent communication surfaces: voice status, guidance failure, target instruction, confirmation instruction, and workflow controls. Their styling was deleted rather than left dormant, preventing future regressions back to competing floating boxes. The runtime now follows one strict visual responsibility rule: the creature communicates personality through motion, the top-edge surface communicates words and state, and the target receives only a precise ring. Safety confirmation copy is preserved in the top-edge surface. Target coordinates, target selection, voice capture, and provider logic were not modified.
- 2026-07-10 - Polished the settings popup as a compact matte utility surface without changing its behavior. The oversized glass-card treatment was replaced with denser 8px geometry, restrained cool borders, system typography, a flat voice-control row, a small waveform signal, and unboxed footer commands. Drag, close, push-to-talk, refresh, pause, focus, and keyboard handlers remain the same. The component is shared React/CSS across macOS, Windows, and Linux; only the native shell that opens and positions the popup differs by platform. Active voice animation is disabled by reduced-motion preferences.
- 2026-07-10 - Added an optional compact task-progress surface for workflows with more than one step. It shows the task title, runtime state, proportional progress, current step, current instruction, and the two most recent completed steps. The surface is deliberately read-only because the fullscreen overlay is ignored by the operating system for mouse input; adding clickable controls there would either create controls that cannot work or require weakening the click-through contract. Workflow actions remain in explicit control surfaces while the overlay only reports progress. The component is shared React/CSS across platforms, uses no timers or IPC, and is hidden for single-step guidance.
- 2026-07-10 - Removed the unwanted outer outline around the compact settings popup. The visible panel was inset inside a larger transparent native window, while macOS was still drawing a shadow around that invisible host rectangle. The settings window now disables native shadow in both Tauri configuration and runtime setup; the intentional CSS shadow remains attached only to the black popup. This keeps the visual result consistent without changing drag, focus, close, or platform-specific positioning behavior.
- 2026-07-10 - Added gesture-reactive creature motion without changing recognition thresholds or inference frequency. The hidden debug surface converts the existing MediaPipe hand landmarks into a deduplicated visual anchor only while a smoothed pinch or open-palm gesture is active. Camera coordinates are deliberately mapped to a small, clamped offset around the native cursor rather than treated as desktop coordinates: pinch compresses and tightens the creature, open palm broadens it, and hand movement gently pulls the creature within a 24-by-18-pixel response area. The existing blob interpolation supplies smoothing, so this adds no second animation loop. Gesture state also appears in the single top-edge status surface, while recognized pinch/open-palm actions continue to use the existing activation and pause behavior.
- 2026-07-10 - Merged the separate top-edge status and settings popup into one native utility window with three explicit states. Idle uses a truly hidden window; active listening, transcription, thinking, guidance, confirmation, gesture, pause, or failure uses a compact non-focusing and click-through peek; a short cursor dwell at the top-center screen edge or an explicit tray action expands the same window into interactive controls. The overlay reuses its existing native cursor event stream, so this feature introduces no second poller. Native Rust/Tauri owns window size, centered placement, focusability, click-through, and visibility, while shared React owns both compact and expanded content. Leaving a hover-expanded surface collapses to the active peek when status still matters, otherwise it hides; a tray-opened focused surface stays open until it loses focus or is explicitly closed. The old status component was removed from the fullscreen overlay, settings no longer opens automatically at startup, and tray open remains an intentional focused expansion. This preserves cross-platform content while allowing native window behavior to remain platform-aware.
- 2026-07-10 - Ran the automated half of the final Phase 13A acceptance pass. The desktop production bundle completed in 432 ms, `cargo check -p toki-desktop` passed, the idle native process remained at 0.0% CPU across repeated checks, and a local desktop screenshot showed no permanent settings or status surface while idle. Static inspection confirmed that top status renders only inside the settings utility route and cannot also render from the fullscreen overlay. Reduced-motion rules cover the blob, aura/ring, task progress, top status, and settings transitions. Manual interaction acceptance remains intentionally separate because top-edge dwell, focus behavior, voice-driven peek, target rendering, and gesture response require real user input and visual judgment.
- 2026-07-10 - Corrected the unified utility at the React boundary. The first implementation reused one native window but swapped between a compact `TokiTopStatus` component and a separate `SettingsPopup`, so the user still perceived two different boxes. Both obsolete component paths and their CSS were deleted. `TokiTopUtilitySurface` now remains mounted in both peek and expanded modes: peek shows its status header alone, while expansion preserves that exact header and reveals flat `Voice` and `Controls` tabs below it inside the same background, border, and shadow. The push-to-talk control also releases pointer capture explicitly and submits once, with keyboard hold support preserved. Typecheck and the production frontend build pass; manual visual acceptance remains pending.
