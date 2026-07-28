# Phase 13A: Living Visual Identity

## Plain English Summary

Toki already has a lot of the nervous system built.

It can sit near the cursor.
It can listen to voice.
It can capture the screen.
It can send a screen and command into the guidance pipeline.
It can sometimes lock onto a target.
It can render a puck, a target ring, and a small command cue.

But it still does not feel alive enough.

The current visual layer still feels like a cursor decoration plus a guidance box.
The product goal is different: Toki should feel like a tiny liquid companion that lives next to the cursor, reacts to voice, thinks visibly, travels toward targets, responds to gestures, and feels intentional even before target accuracy is perfect.

This phase is not a provider-accuracy phase.
It is not a screen-intelligence phase.
It is not a permissions phase.

This phase gives Toki a body, behavior, and visual personality without disturbing the working guidance pipeline.

## Why This Phase Exists

The target accuracy work has been mentally expensive and repetitive.
We have had several cycles where one fix improved a target, then another change broke it or made the behavior confusing again.

That does not mean the project is failing.
It means target accuracy is a hard "brain" problem.

The living visual identity is a separate product-feel problem.
It can be improved without solving all guidance accuracy at once.

The point of this phase is to make Toki feel worth using while the brain continues improving.

## Current Runtime State

Current working pieces:

- The app is now named Toki.
- The app runs as a Tauri desktop app with React UI and Rust native commands.
- The overlay can show a puck and target cue.
- The settings popup exists.
- The debug window exists.
- Voice can produce commands.
- The guidance pipeline can sometimes produce a target lock.
- The app has local vision/provider work in progress.
- The current puck has gone through several iterations and is closer to a liquid blob than the original CSS ghost puck.

Current unresolved pieces:

- Target accuracy is not reliable enough yet.
- Some commands still collapse into the same visual target.
- Debug output still needs to explain provider decisions better.
- The puck is not yet a real living creature.
- The puck does not yet have strong state transitions.
- Voice, target lock, error, and gesture states do not have a polished visual language.
- Fullscreen/Spaces overlay behavior on macOS still needs native attention.

## Strict Boundary For This Phase

This phase must not break the guidance pipeline.

Do not touch:

- retired local vision runtime prompt structure unless a visual field requires display-only metadata.
- Provider routing.
- Candidate ranking.
- Screen capture permission logic.
- Accessibility permission logic.
- Voice recording/transcription logic.
- Native hotkey behavior.
- Settings popup behavior.
- Debug provider contracts.
- Existing target validation behavior.

Allowed changes:

- Visual components under the overlay.
- Puck rendering internals.
- State-to-motion mapping.
- Visual debug readouts for creature state.
- Reduced-motion fallback.
- Non-invasive hooks from existing runtime state.

The correct attitude is:

"Render the current app state better, do not reinterpret the app state."

## Product Goal

Toki should feel like:

- a small liquid companion,
- close to the cursor,
- aware of voice,
- aware of thinking,
- aware of guidance,
- emotionally readable without becoming childish,
- elegant enough for a Mac utility,
- visible enough on light and dark screens,
- quiet enough not to block work.

It should not feel like:

- a static blob,
- a giant cursor replacement,
- a toy sticker,
- a loading spinner,
- a normal app window,
- a debug visualization,
- a noisy game effect.

## Visual Personality

Toki should be:

- curious,
- soft,
- calm,
- responsive,
- slightly playful,
- restrained,
- liquid,
- precise when guiding,
- expressive when listening or thinking.

Toki should not be:

- loud,
- random,
- flashy,
- over-animated,
- distracting,
- opaque enough to hide content,
- so transparent that it gets lost.

## State Model

The living visual layer should consume a small derived state.

```ts
type TokiCreatureMode =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "guiding"
  | "error"
  | "paused";

type TokiCreatureAnchor =
  | "cursor"
  | "target"
  | "finger";

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

This state should be derived from existing app state.
It should not become another source of truth.

## State Behaviors

### Idle

Idle means Toki is available but not working.

Expected behavior:

- stays near cursor,
- small breathing motion,
- no noisy aura,
- low-energy liquid drift,
- no target line,
- no large panel.

### Listening

Listening means voice capture is active.

Expected behavior:

- gently expands,
- small voice-reactive pulse,
- blue/cyan highlight,
- optional circular text or ring saying listening,
- no target lock yet.

### Transcribing

Transcribing means audio is captured and local Whisper/provider is converting speech to text.

Expected behavior:

- compact spinning/internal motion,
- slightly tighter shape,
- quiet shimmer,
- no fake guidance target.

### Thinking

Thinking means command and screen are being processed.

Expected behavior:

- strands/aura motion around puck,
- small orbital motion,
- subtle scan-like movement,
- no random target ring.

### Guiding

Guiding means Toki has a target.

Expected behavior:

- puck shifts attention toward target,
- target ring becomes alive,
- a subtle travel line or elastic pull appears,
- target cue feels connected to the puck,
- the target label is concise.

### Error

Error means Toki cannot guide.

Expected behavior:

- brief red/amber contraction,
- no angry flashing,
- explanation cue appears,
- then returns to idle.

### Paused

Paused means Toki is intentionally disabled.

Expected behavior:

- dimmed,
- minimal,
- no target cue,
- no voice pulse.

## Component Architecture

Target architecture:

```txt
OverlayWindow
  App.tsx
    derives existing runtime state
    derives TokiCreatureState
    renders TokiCreatureLayer

TokiCreatureLayer
  LiquidPuck
  StrandsAura
  CircularStatusRing
  LivingTargetCue
  GestureReactionLayer
  ReducedMotionCreature
```

No provider code should depend on these components.
The visual system reads results only after the brain has already decided.

## ReactBits References

ReactBits is useful, but we need to use it carefully.

ReactBits components generally assume normal webpage input.
Toki's overlay is click-through.
That means normal `onMouseMove` is not reliable for the app runtime.

Correct pattern:

- copy the visual idea and rendering structure,
- keep native cursor polling as the input source,
- do not let ReactBits event handling become the source of truth,
- adapt only what must be adapted.

### Blob Cursor

Useful for:

- liquid cursor body,
- merged blob look,
- gooey filter reference,
- soft trailing motion.

Risk:

- if copied without adapting input, it fails on click-through overlay.
- if filter/opacity/sizes are tuned wrong, it becomes stacked circles.

Best use:

- keep the blob/filter idea,
- drive position from native cursor polling,
- tune as one coherent object,
- keep fallback.

### Strands

Useful for:

- Cortana/Jarvis-style aura,
- listening/thinking energy,
- subtle intelligence field around the puck,
- target lock celebration.

Risk:

- can look like a background effect instead of a companion.
- can be too noisy over real apps.

Best use:

- only during listening/thinking/guiding,
- small radius around puck or target,
- low opacity,
- no permanent full-screen effect.

Reference:

- https://reactbits.dev/animations/strands

### Dot Field

Useful for:

- debug visualization,
- onboarding scene,
- settings background,
- maybe future "thinking map" surface.

Risk:

- too much for default overlay,
- reads like a decorative website background.

Best use:

- not default runtime,
- use in debug or optional visual mode.

Reference:

- https://reactbits.dev/backgrounds/dot-field

### Circular Text

Useful for:

- tiny status ring,
- "listening",
- "thinking",
- "locked",
- maybe voice command state.

Risk:

- text around the puck can get distracting,
- bad for small sizes.

Best use:

- only on active states,
- very short words,
- optional reduced-motion fallback.

Reference:

- https://reactbits.dev/text-animations/circular-text

## Other Tools Considered

### Three.js

Best for:

- real liquid/WebGL puck,
- shader-based blob,
- metaballs,
- soft light and refraction effects,
- future creature movement.

Tradeoff:

- more complex,
- more performance risk,
- needs careful canvas-pixel verification.

Best decision:

- use Three.js when CSS/DOM cannot produce the liquid body cleanly.
- keep state mapping separate so we can swap renderer later.

### Theatre.js

Best for:

- choreographed onboarding,
- keyframed product demo,
- highly controlled animation sequences.

Tradeoff:

- not ideal for runtime reactive cursor behavior.

Best decision:

- not first pass.
- consider later for intro/demo scenes.

### Spline

Best for:

- visual prototyping,
- exported 3D assets,
- reference motion.

Tradeoff:

- runtime integration can be heavy,
- assets can become hard to tune in code.

Best decision:

- use as reference or asset prototype, not core runtime first.

### Threlte

Best for:

- Svelte + Three workflows.

Tradeoff:

- Toki is React/Tauri.

Best decision:

- do not use Threlte directly.

### PeachWeb

Best for:

- visual inspiration,
- design exploration.

Tradeoff:

- not useful as a runtime dependency for this app.

Best decision:

- inspiration only.

## Final Phase Plan

### Step 13A.1: Visual Contract And Boundary

Document exactly what Toki should feel like and what this phase must not touch.

Deliverables:

- visual contract in docs,
- no provider changes,
- no voice changes,
- no capture changes.

Acceptance:

- the team can tell whether a visual change belongs in this phase.

### Step 13A.2: Creature State Model

Create a small derived state model for visual behavior.

Deliverables:

- `TokiCreatureState`,
- `TokiCreatureMode`,
- selector/helper that maps current app state to creature state.

Acceptance:

- no duplicate runtime source of truth,
- app compiles,
- debug can show creature mode if needed.

### Step 13A.3: Creature Layer Scaffold

Create a dedicated overlay visual layer.

Deliverables:

- `TokiCreatureLayer`,
- isolated component folder,
- visual layer receives state only through props.

Acceptance:

- existing puck and target behavior still render,
- no change to provider output.

### Step 13A.4: Liquid Puck State Reactions

Make the current puck react to modes.

Deliverables:

- idle breathing,
- listening pulse,
- thinking compression,
- guiding directional attention,
- error contraction,
- paused dimming.

Acceptance:

- Toki looks alive without target accuracy needing to improve.

### Step 13A.5: Strands Aura

Add a small strands-style aura.

Deliverables:

- listening aura,
- thinking aura,
- target lock aura,
- reduced-motion fallback.

Acceptance:

- it does not cover the whole screen,
- it does not block clicks,
- it does not make the overlay noisy.

### Step 13A.6: Circular Status Ring

Add optional tiny status ring/text.

Deliverables:

- listening/thinking/locked status,
- disabled in reduced motion,
- hidden during idle.

Acceptance:

- readable enough,
- not annoying,
- not always visible.

### Step 13A.7: Living Target Cue

Make target lock feel connected to the puck.

Deliverables:

- target ring appears with motion,
- puck-to-target elastic relationship,
- target label placement avoids covering target,
- confidence affects intensity.

Acceptance:

- target lock feels intentional even when model accuracy is imperfect.

### Step 13A.8: Gesture Visual Hooks

Prepare visuals for gestures without requiring gesture accuracy work.

Deliverables:

- finger anchor support,
- pinch reaction,
- open-palm pause reaction,
- debug simulation button if needed.

Acceptance:

- gestures can later drive visuals cleanly.

### Step 13A.9: Dot Field Debug/Onboarding Surface

Use Dot Field only outside default runtime.

Deliverables:

- optional debug/onboarding visual,
- no full-screen default overlay decoration.

Acceptance:

- default runtime stays cursor-first.

### Step 13A.10: Reduced Motion And Performance

Add a hard fallback path.

Deliverables:

- `prefers-reduced-motion` support,
- lower-cost animation mode,
- no unbounded requestAnimationFrame loops,
- cleanup on component unmount.

Acceptance:

- app does not hang,
- animation does not keep stale listeners alive.

### Step 13A.11: Manual Visual QA

Run a manual acceptance pass.

Checks:

- idle,
- listening,
- thinking,
- guiding,
- error,
- paused,
- light background,
- dark background,
- app window,
- desktop,
- reduced motion.

Acceptance:

- no stacked-circle regression,
- no giant opaque blob,
- no click blocking,
- no provider regression.

### Step 13A.12: Docs And Commit

Only after user visually accepts the result.

Deliverables:

- learning doc update,
- screenshot notes,
- granular commits,
- no GitHub push unless user says push.

Acceptance:

- local worktree is understandable,
- user approves before remote push.

## Tradeoffs

### Option 1: Keep DOM/CSS Puck

Pros:

- simple,
- easy to debug,
- less GPU risk.

Cons:

- hard to get real liquid motion,
- easy to become stacked circles,
- less premium.

Use as:

- fallback only.

### Option 2: ReactBits-Derived DOM Blob

Pros:

- fast,
- close to known visual reference,
- less work than custom shader.

Cons:

- ReactBits assumes pointer events,
- Toki needs native cursor polling,
- filter behavior differs across browser/WebView engines.

Use as:

- short-term bridge if tuned properly.

### Option 3: Three.js/WebGL Creature

Pros:

- best path for true liquid creature,
- supports shaders/metaballs/3D lighting,
- can react to voice and gestures more naturally.

Cons:

- more engineering work,
- more performance testing,
- needs careful canvas verification.

Use as:

- final premium renderer if DOM blob cannot reach the desired feel.

### Option 4: Native Renderer

Pros:

- best OS-level control,
- can solve platform overlay issues better.

Cons:

- platform-specific,
- more Rust/native code,
- more maintenance.

Use as:

- later if WebView overlay cannot meet product quality.

## Best Alternative For Now

Use a staged renderer:

1. Keep current working overlay and guidance pipeline untouched.
2. Build a clean React visual state layer.
3. Use ReactBits-inspired Strands/Circular Text for state expression.
4. Keep the current liquid blob as a controlled component.
5. Move to Three.js only if the DOM renderer still cannot look alive.

This avoids breaking the brain while improving the body.

## What Not To Do

Do not:

- rewrite the guidance provider,
- change the screen capture path,
- retune target accuracy inside visual work,
- create app-specific Spotify hacks,
- attach visual logic to provider internals,
- make the overlay interactive,
- create a full-screen decorative background,
- push changes before visual acceptance.

## Manual Acceptance Rules

The phase passes only if:

- Toki feels like one companion, not multiple unrelated circles.
- Toki stays close to the cursor.
- Toki visibly reacts to voice activation.
- Toki visibly reacts while thinking.
- Toki visibly changes when target is locked.
- Toki gives a restrained error reaction.
- Toki does not block clicks.
- Toki does not cover important UI.
- Toki remains visible on light and dark screens.
- Toki has reduced-motion behavior.
- Existing target lock still works as well as before.

## Interview Explanation

If asked why this phase exists:

"We had already built the functional guidance loop: voice command, screen capture, provider targeting, validation, and overlay rendering. The remaining issue was that the assistant felt like a utility marker rather than a living companion. Phase 13A separates product feel from target intelligence. It creates a small visual state machine so Toki can react to voice, thinking, target lock, errors, and gestures without changing the provider pipeline."

If asked why not just use ReactBits directly:

"ReactBits components are designed for webpage pointer events. Toki's overlay is click-through, so normal mouse events are not the source of truth. We can reuse the visual ideas, filters, and motion language, but we drive the component from native cursor polling and app runtime state."

If asked why not go straight to Three.js:

"Three.js is the better long-term renderer for a true liquid companion, but it adds complexity and performance risk. We first isolate the state model and visual layer so the renderer can be swapped without disturbing voice, capture, or guidance."

If asked why not solve accuracy first:

"Accuracy is the brain problem. Living visual identity is the body problem. They are connected in the product, but they should be engineered separately. Improving the body now makes the app feel better while the brain continues to improve."

## Open Questions

- Should the default color stay cyan-blue, blue-violet, or warmer aqua?
- Should the puck ever split into droplets, or should it remain one coherent body?
- Should gestures create visible trails, ripples, or only subtle state changes?
- Should target travel be a line, a droplet, a ripple, or a pull effect?
- Should the status ring show text or only motion?

## Current Recommendation

Start with Step 13A.1 and Step 13A.2 before touching visuals.

The most important design decision is not the exact shader.
It is the state contract.

If the state contract is clean, the renderer can improve safely.
If the state contract is messy, every visual experiment will keep breaking the app.

## Updates

- 2026-07-10 - Unified the compact runtime status and settings controls into one top-edge utility window. The window now has hidden, peek, and expanded modes; active status uses a non-focusing click-through peek, while top-center cursor dwell or the tray expands the same surface into controls. The overlay reuses its existing native cursor stream and no new polling loop was added. Rust/Tauri owns native visibility, size, position, focus, and click-through, while React owns the shared compact and expanded UI.
- 2026-07-10 - Completed automated Phase 13A acceptance checks: the production frontend build and native Rust check pass, idle Toki remains at 0.0% CPU, no permanent top utility is visible while idle, the old overlay status render path is gone, and reduced-motion coverage exists across active visual components. Real cursor dwell, voice peek, focus/collapse, target, and gesture behavior remain manual visual acceptance items.
- 2026-07-10 - Replaced the remaining two-component illusion with one persistent tabbed React surface. The same status header now survives the transition from compact peek to expanded controls, and expansion reveals `Voice` and `Controls` tabs inside the same visual shell instead of swapping to a separate settings card. The old `TokiTopStatus` component, old settings popup component, and their dormant CSS were removed. This is an important architecture lesson: sharing a native window is not enough to communicate one object if the rendered component identity, background, and geometry still change completely.
- 2026-07-10 - Removed the empty lower area from the expanded top utility by replacing the inherited 344-pixel host height with a measured 224-pixel contract. The visible content needs 222 pixels: a 54-pixel header, 38-pixel tab bar, 116-pixel active panel, and 14 pixels for its divider and lower padding. Two pixels remain for platform rounding. The same expanded dimensions now drive the TypeScript cursor-exit boundary, Rust/Tauri runtime resizing, and the initial Tauri window configuration. The key lesson is that transparent or dark native host area remains visually real even when React has no content there; native window geometry must match the rendered surface instead of relying on a generous legacy size.
