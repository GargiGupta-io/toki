# Phase 7: Fluid Puck Motion Completion

Phase 7 replaced the static assistant puck with a state-aware fluid motion system built as a CSS-first fallback layer.

## What Phase 7 Added

- a written motion specification for the puck
- a dedicated puck motion state model
- fluid droplet rendering around the puck
- idle pointer-shadow behavior
- activation droplet transition for the forming state
- guidance-to-target droplet travel for accepted guidance
- reduced-motion and performance fallback rules
- a Phase 7 motion QA record

## Why This Phase Mattered

The earlier puck proved where the assistant lived on screen, but it did not yet feel like a production interaction surface.

Phase 7 made the puck communicate state instead of only showing a label:

- `shadow` feels quiet and follows the pointer area
- `forming` behaves like activation
- `thinking` stays contained while the app is working
- `guiding` can visually connect the puck to an accepted target
- `paused` and `error` stay readable without implying action

That gives later phases a stronger visual anchor for gesture entry, voice mode, and richer rendering layers.

## Key Implementation Pieces

### Motion Model

`apps/desktop/src/puckMotion.ts`

This file maps overlay runtime state into motion state and decides whether target droplets are allowed.

Important rule:

- target droplets only enable when guidance is accepted, active, and not blocked by refresh, capture error, or validation rejection

### Desktop Overlay Integration

`apps/desktop/src/App.tsx`

The desktop app now:

- computes puck motion from overlay state
- tracks pointer-shadow position
- computes target travel vectors
- exposes motion and target-droplet state to CSS through data attributes and custom properties

### Fluid Visual Layer

`apps/desktop/src/App.css`

The puck now has:

- orbit layer
- droplet cluster
- state-driven motion variants
- one-shot activation animation
- guiding travel animations
- reduced-motion fallback

## Verification

Phase 7 verification is recorded in:

- `docs/phase-7-motion-qa.md`

Checks that passed:

```bash
npm --workspace @toki/desktop run typecheck
npm --workspace @toki/desktop run build
npm run check
```

The live dev server also responded on:

```text
http://127.0.0.1:1420
```

## Residual Risk

The remaining risk after Phase 7 is mostly visual QA, not compile/runtime correctness.

Still worth validating later:

- screenshot-based review of droplet timing and travel paths
- narrow-window layout checks in the real overlay
- reduced-motion verification with actual browser or OS preference toggles
- future comparison between CSS fallback and any richer rendering layer

## What This Unlocks Next

Phase 7 makes later work easier because the puck is now stateful enough to carry richer behaviors.

This phase directly prepares for:

- gesture-triggered activation
- voice/listening transitions
- runtime evaluation of visual target communication
- future shader or canvas-based puck rendering
