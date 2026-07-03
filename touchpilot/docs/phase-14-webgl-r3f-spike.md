# Phase 14 WebGL/R3F Spike Decision

Step 14.8 is an optional spike, not a required renderer rewrite.

Current decision: do not add Three.js or react-three-fiber yet.

## Why Not Add It Now

The CSS renderer is currently good enough for the Phase 14 baseline:

- puck stays close to the cursor
- edge behavior flips the puck instead of losing it
- target ring is softer and less mock-like
- workflow cue is compact
- reduced-motion fallback already exists
- no extra bundle/runtime cost is required

Adding WebGL/R3F now would add dependency weight and a second rendering path before we have manual evidence that CSS is blocking the desired product feel.

## What Would Trigger The Spike

Add a WebGL/R3F spike only if manual visual QA proves one of these:

1. CSS puck motion still feels detached or cheap after edge/proximity tuning.
2. The desired liquid split/merge effect cannot be done cleanly with CSS.
3. Target-traveling droplets need smoother curved motion than CSS keyframes can provide.
4. CSS animations stutter while a canvas/WebGL renderer would be smoother.
5. The final product direction requires shader-style material/refraction that CSS cannot approximate.

## Spike Scope

If triggered, the spike must stay narrow:

- render only puck and target-traveling droplets
- keep the overlay, settings, debug, and workflow cues in React/CSS
- keep CSS renderer as fallback
- preserve reduced-motion behavior
- do not move click handling into WebGL
- do not make the WebGL canvas block desktop clicks

## Proposed Architecture

```text
OS cursor polling
  -> overlay geometry
  -> renderer adapter
       -> CSS renderer fallback
       -> optional WebGL/R3F puck renderer
```

The renderer adapter should receive the same inputs either way:

- pointer shadow position
- puck motion state
- target vector
- reduced-motion flag
- overlay state

That keeps the product logic independent from the rendering technology.

## Dependency Boundary

Do not add these until the spike is approved:

- `three`
- `@react-three/fiber`
- shader/material helper packages

The current desktop bundle should stay simple until visual QA proves the need.

## Acceptance For A Future Spike

A future WebGL/R3F spike would only pass if:

- puck remains close to cursor
- click-through still works
- idle CPU remains low
- reduced-motion fallback works
- CSS fallback still works
- bundle increase is documented
- manual visual QA shows a clear improvement over CSS

## Step 14.8 Outcome

Step 14.8 closes as a documented deferral. The next useful work is Step 14.9: performance and reduced-motion QA against the current CSS renderer.
