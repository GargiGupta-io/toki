# Phase 7: Fluid Water Puck Motion System

Phase 7 replaces the static assistant puck with a fluid, state-aware assistant presence.

The goal is to make the assistant feel alive without making the overlay noisy, heavy, or unsafe. The puck must still communicate clear state: idle, thinking, guiding, paused, and error. Motion should support guidance, not distract from the target application.

## Product Behavior

### Idle: Pointer Shadow

In idle mode, the assistant should feel like a soft water shadow near the real pointer.

Expected behavior:

- puck is visually quiet
- shape is compact and low contrast
- follows or trails near pointer position once pointer tracking exists
- until real pointer tracking exists, remains anchored in the current puck location
- does not cover targets or debug controls

Fallback behavior:

- current static puck remains available
- no pointer-following is required until cursor telemetry exists

### Activation: Droplets Form The Puck

When activated, the shadow should split into droplets, orbit briefly, then merge into the main assistant puck.

Expected behavior:

- small droplets separate from the core
- droplets orbit or arc around the core
- droplets merge back into a stable puck
- animation completes quickly enough that the user can continue working
- reduced-motion mode skips orbiting and fades directly to stable puck

Target duration:

- normal motion: 600ms to 1100ms
- reduced motion: under 250ms

### Thinking: Fluid Pulse

When the assistant is reading the screen or waiting for guidance, the puck should show contained motion.

Expected behavior:

- core gently breathes or ripples
- droplets stay close to the puck
- no long paths across the screen
- UI stays calm because the user may be waiting for capture/model output

### Guiding: Droplets Travel To Target

When there is accepted guidance, droplets should visually connect the puck to the target ring.

Expected behavior:

- one or more droplets leave the puck
- droplets move toward the target ring
- droplets fade or merge into the glowing target ring
- animation should not cover the target for long
- invalid or rejected guidance must not launch target droplets

Important rule:

> Droplets only travel to a target when `hasAcceptedGuidance` is true.

### Paused: Suspended Water

Paused state should feel frozen or suspended.

Expected behavior:

- orbit and ripple pause
- core remains visible
- status label remains readable
- no target-travel droplets

### Error: Tense But Clear

Error state should signal that attention is needed without looking like a destructive warning.

Expected behavior:

- color shifts toward existing error palette
- motion becomes minimal
- shape may tighten or wobble once
- no target-travel droplets
- validation/capture error text remains the main explanation

## State Inputs

The puck should be driven by existing app state before adding more sources.

Current useful inputs:

- `overlayState`
- `hasAcceptedGuidance`
- `activeTarget`
- `guidanceResult?.step?.risk`
- `guidanceResult?.step?.requiresConfirmation`
- `isRefreshingCapture`
- `captureError`
- `guidanceIssues.length`

Future inputs:

- cursor position
- gesture confidence
- voice/listening state
- target transition history
- reduced-motion preference from settings
- performance mode

## Rendering Strategy

Start with CSS fallback first.

Reason:

- the current puck is already CSS-based
- CSS gives fast iteration
- no new rendering dependency is needed for the first motion pass
- reduced-motion support is straightforward
- it keeps Phase 7 small and verifiable

Then add a richer rendering layer only when needed.

Potential future layers:

- `react-three-fiber` for shader-style droplets and target paths
- canvas for lightweight particle motion
- `liquid-glass-js` style surfaces for puck/panel polish

Constraint:

> Do not add heavy visual libraries until the CSS fallback proves the motion states and layout rules.

## Motion Architecture

The initial implementation should separate the motion model from visual rendering.

Recommended pieces:

1. `PuckMotionState`
   - maps app state to motion state
   - examples: `shadow`, `forming`, `thinking`, `guiding`, `paused`, `error`

2. `FluidPuck`
   - replaces or wraps `AssistantPuck`
   - receives state, accepted target, and reduced-motion flag
   - renders static fallback plus droplets

3. CSS variables
   - puck color
   - droplet count/positions
   - animation duration
   - target vector placeholders

4. Reduced motion rules
   - disable orbit animations
   - disable long droplet paths
   - use opacity/scale only

## Safety Rules

Visual effects must never imply a target is valid when it is not.

Rules:

- no target droplets unless guidance is accepted
- no target droplets during invalid fixture
- no target droplets during capture error
- no target droplets during refresh while state is `thinking`
- paused state freezes or minimizes motion
- error state uses clear status, not decorative motion
- risk/confirmation UI remains readable

## Layout Rules

The puck must not break the overlay.

Rules:

- puck dimensions stay stable
- status label remains readable
- droplets do not expand layout boxes
- effects use absolute positioning
- pointer ring and step bubble keep priority
- debug panel remains usable
- no text overlap
- no visual element should cover confirmation controls

## Reduced Motion

Reduced motion is mandatory, not optional.

Initial support:

```css
@media (prefers-reduced-motion: reduce) {
  /* stop looping puck/droplet animation */
}
```

Expected behavior:

- no infinite orbiting
- no long droplet travel
- no pulsing that could distract
- state changes use quick opacity/scale transitions

## Performance Guardrails

Keep the first pass cheap.

Rules:

- prefer transform and opacity
- avoid animating layout properties
- avoid large blur radii on many elements
- avoid full-screen animated layers
- avoid canvas/Three.js until needed
- keep droplet count low in CSS fallback

Initial droplet count:

- idle: 0 to 2 visible droplets
- forming: 4 to 6 droplets
- thinking: 3 to 4 close droplets
- guiding: 1 to 3 travel droplets

## Phase 7 Step Plan

1. Write fluid puck motion spec.
2. Add puck motion state model.
3. Add fluid puck CSS fallback layer.
4. Add idle pointer-shadow behavior.
5. Add activation droplet transition.
6. Add guidance-to-target droplet path.
7. Add reduced-motion and performance fallback.
8. Verify Phase 7 motion and layout.
9. Document Phase 7 completion and deeplearn.

## Done Criteria

Phase 7 is complete when:

- puck has state-driven fluid motion
- static fallback remains usable
- accepted guidance can send droplets toward the target
- invalid/rejected guidance never sends target droplets
- reduced-motion mode is respected
- desktop typecheck and build pass
- full repo check passes
- runtime layout remains readable
- Phase 7 deeplearn doc is saved
