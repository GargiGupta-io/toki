# Phase 7: Fluid Puck Motion

> Phase 7 turned TouchPilot's static assistant puck into a state-aware fluid motion surface that can stay quiet, activate, think, and point toward accepted guidance without lying to the user.

---

## In Plain English

This phase was about giving the assistant a body language system.

Before this work, TouchPilot already had a floating puck. It showed where the assistant lived on the screen, but it did not yet feel alive. More importantly, it did not visually explain the difference between being idle, waking up, thinking, actively guiding, paused, or in error.

Phase 7 fixed that by turning the puck into a small motion system. When the assistant is idle, it behaves more like a shadow near the pointer. When it activates, droplets split out and merge back. When it is guiding, droplets can travel toward the highlighted target. When guidance is invalid or risky state is not accepted, it does not pretend a target is valid. That is the important part: the motion is decorative, but it is also bound by safety rules.

Think of it like dashboard lights in a car. Good dashboard motion is not there just to look impressive. It tells you whether the system is sleeping, waiting, warning, or actively doing something. The fluid puck is the same idea applied to an assistant overlay.

## What Is A Fluid Puck?

Technically, the fluid puck is a visual state machine driven by runtime UI state.

It is not a physics simulation yet. It is also not a shader system yet. Phase 7 deliberately used a CSS-first fallback so the team could prove the motion logic, state boundaries, and safety gates before pulling in heavier rendering tools such as `react-three-fiber` or liquid surface libraries.

That decision matters. In motion-heavy UI work, the expensive mistake is usually not "the animation was too simple." The expensive mistake is "the animation was deeply coupled to bad state logic." Phase 7 avoided that by separating:

- motion state decisions
- overlay runtime state
- CSS rendering behavior
- target-travel safety gates

## The Problem It Solves

The older puck had three real limitations.

### Problem 1: No Visual State Depth

Plain English: the assistant looked mostly the same even when its behavior changed.

If the assistant is idle, thinking, paused, or guiding, the user should feel that difference without reading a debug label every time.

### Problem 2: No Motion Contract

Plain English: without a state model, animation rules end up scattered and easy to break.

If the droplet layer decided target travel in CSS alone, and the app decided acceptance in JSX alone, the overlay could drift into showing a target path when the logic did not actually trust that target.

### Problem 3: No Reduced-Motion Boundary

Plain English: production UI cannot assume every user wants constant animation.

If the only version of the puck was the animated one, the overlay would be harder to use for reduced-motion users and harder to reason about during QA.

## How It Works

The phase has four connected layers:

1. motion specification
2. motion state model
3. runtime integration in the desktop overlay
4. CSS rendering rules

### Motion Specification

Plain English: this is the rules document that says what the puck should mean before code tries to draw it.

The spec lives in:

```text
touchpilot/docs/phase-7-fluid-puck.md
```

It defines the intended behaviors for:

- idle pointer shadow
- activation droplets
- thinking pulse
- guidance travel
- paused suspension
- error tension

This file matters because motion systems are easy to hand-wave. The spec forced the team to define:

- which states exist
- what each state is allowed to imply
- when target droplets are forbidden
- how reduced-motion changes the behavior
- how much performance budget the fallback layer should spend

### Motion State Model

Plain English: this is the part that translates app truth into animation truth.

The model lives in:

```ts
// touchpilot/apps/desktop/src/puckMotion.ts
export type PuckMotionState =
  | "shadow"
  | "forming"
  | "thinking"
  | "guiding"
  | "paused"
  | "error";
```

Technical detail:

The model is intentionally separate from `App.tsx`. That keeps the logic testable and makes it easier to evolve later when gesture state, voice state, cursor telemetry, or performance mode are added.

The key function is:

```ts
export function getPuckMotionModel(input: PuckMotionInput): PuckMotionModel {
  const hasRejectedGuidance = input.guidanceIssueCount > 0;
  const hasSafeTarget =
    input.hasAcceptedGuidance &&
    input.hasActiveTarget &&
    !input.isRefreshingCapture &&
    !input.hasCaptureError &&
    !hasRejectedGuidance;

  if (input.hasCaptureError || hasRejectedGuidance || input.overlayState === "error") {
    return {
      state: "error",
      canSendTargetDroplets: false,
    };
  }

  if (input.overlayState === "paused") {
    return {
      state: "paused",
      canSendTargetDroplets: false,
    };
  }

  if (input.isRefreshingCapture || input.overlayState === "thinking") {
    return {
      state: "thinking",
      canSendTargetDroplets: false,
    };
  }

  if (input.overlayState === "guiding" && hasSafeTarget) {
    return {
      state: "guiding",
      canSendTargetDroplets: true,
    };
  }

  if (input.overlayState === "listening") {
    return {
      state: "forming",
      canSendTargetDroplets: false,
    };
  }

  return {
    state: "shadow",
    canSendTargetDroplets: false,
  };
}
```

Technical detail:

This is the safety spine of the phase.

The most important output is not just `state`. It is `canSendTargetDroplets`.

That single boolean ensures the CSS layer cannot honestly represent target guidance unless the runtime has actually accepted it. In other words:

```text
accepted guidance + active target + no refresh + no capture error + no rejected issues
  -> target droplets allowed

anything else
  -> target droplets blocked
```

### Desktop Overlay Integration

Plain English: the desktop app feeds live screen state into the motion system and exposes the result to the puck.

The puck integration happens in:

```text
touchpilot/apps/desktop/src/App.tsx
```

The puck now receives:

- overlay state
- motion state model
- pointer-shadow position
- target vector

The component surface:

```tsx
function AssistantPuck({
  state,
  motion,
  pointerShadow,
  targetVector,
}: {
  state: OverlayState;
  motion: PuckMotionModel;
  pointerShadow: PointerShadowPosition | null;
  targetVector: PuckTargetVector | null;
}) {
```

Technical detail:

The puck uses CSS custom properties to pass visual geometry without moving that math into the stylesheet:

```tsx
  const puckStyle = {
    ...(pointerShadow == null
      ? {}
      : {
          "--puck-shadow-x": `${pointerShadow.x}px`,
          "--puck-shadow-y": `${pointerShadow.y}px`,
        }),
    ...(targetVector == null
      ? {}
      : {
          "--puck-target-x": `${targetVector.x}px`,
          "--puck-target-y": `${targetVector.y}px`,
        }),
  } as CSSProperties;
```

This is a strong pattern because:

- React calculates the geometry
- CSS consumes the geometry
- the view layer stays declarative

The puck also exposes state to CSS with data attributes:

```tsx
<button
  className={`assistant-puck is-${meta.tone}`}
  data-motion={motion.state}
  data-pointer-shadow={motion.state === "shadow" && pointerShadow ? "active" : "idle"}
  data-target-droplets={motion.canSendTargetDroplets ? "enabled" : "disabled"}
  style={puckStyle}
  type="button"
  aria-label={`TouchPilot is ${meta.label.toLowerCase()}`}
>
```

That creates a clear contract:

```text
React owns truth
CSS owns rendering
data attributes are the handshake between them
```

### Pointer Shadow Behavior

Plain English: when the assistant is quiet, it should feel like a presence near the pointer instead of a bright static badge.

The pointer-shadow support works by listening to pointer movement:

```ts
useEffect(() => {
  function handlePointerMove(event: PointerEvent) {
    setPointerShadow(getPointerShadowPosition(event.clientX, event.clientY, viewport));
  }

  window.addEventListener("pointermove", handlePointerMove);

  return () => {
    window.removeEventListener("pointermove", handlePointerMove);
  };
}, [viewport]);
```

Technical detail:

The position is clamped so the puck does not drift out of the window bounds:

```ts
function getPointerShadowPosition(
  pointerX: number,
  pointerY: number,
  viewport: ViewportMetrics,
): PointerShadowPosition {
  const offsetX = 28;
  const offsetY = 30;
  const margin = 56;

  return {
    x: Math.min(Math.max(pointerX - offsetX, margin), viewport.width - margin),
    y: Math.min(Math.max(pointerY + offsetY, margin), viewport.height - margin),
  };
}
```

This matters for two reasons:

1. it keeps the motion readable
2. it avoids the puck colliding with screen edges in narrow windows

### Target Travel Vector

Plain English: when the assistant is actively guiding, the droplets need a believable direction to move.

The vector is computed relative to the puck's default home position:

```ts
function getPuckTargetVector(
  target: TargetBox,
  viewport: ViewportMetrics,
): PuckTargetVector {
  const puckCenterX = viewport.width - 80;
  const puckCenterY = viewport.height - 334;

  return {
    x: target.x - puckCenterX,
    y: target.y - puckCenterY,
  };
}
```

Technical detail:

This is intentionally simple. It does not yet solve every responsive or multi-layout case. What it does solve is the first important problem:

- the puck can aim toward the accepted target
- the droplet travel path is derived from real overlay coordinates
- the CSS does not guess where to move

## What We Built

Phase 7 changed the product in a way the user would immediately feel even if they never opened the debug panel.

When the overlay is running now:

- the puck no longer looks static
- idle mode can visually shadow the pointer
- activation has a distinct "wake up" sequence
- guiding mode can visually connect puck and target
- paused and error modes visually cool down
- reduced-motion mode suppresses the long and noisy motion paths

### Overview

Plain English: the assistant now behaves more like a living tool than a floating badge.

The implementation stayed conservative on purpose. Instead of jumping straight to WebGL or shader work, the phase used a CSS fallback to prove that:

- the state model is correct
- the motion grammar is coherent
- the safety rules are enforceable
- performance stays under control

That is the right order for production work. If the state contract is wrong, a prettier renderer just makes the wrong behavior more convincing.

### Code Walkthrough

**[App.tsx](C:/Users/Pumba/Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx:106)**

Plain English: this is where the puck started accepting live motion inputs instead of only a single overlay state label.

```tsx
function AssistantPuck({
  state,
  motion,
  pointerShadow,
  targetVector,
}: {
  state: OverlayState;
  motion: PuckMotionModel;
  pointerShadow: PointerShadowPosition | null;
  targetVector: PuckTargetVector | null;
}) {
  const meta = stateMeta[state];
  const puckStyle = {
    ...(pointerShadow == null
      ? {}
      : {
          "--puck-shadow-x": `${pointerShadow.x}px`,
          "--puck-shadow-y": `${pointerShadow.y}px`,
        }),
    ...(targetVector == null
      ? {}
      : {
          "--puck-target-x": `${targetVector.x}px`,
          "--puck-target-y": `${targetVector.y}px`,
        }),
  } as CSSProperties;
```

Technical detail:

This block gives the puck a rendering contract that is richer than "state is paused" or "state is guiding." It now passes both logical and geometric information:

- logical: `motion.state`, `canSendTargetDroplets`
- geometric: pointer position and target vector

That separation keeps future rendering options open.

**[App.tsx](C:/Users/Pumba/Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx:660)**

Plain English: this is where the overlay decides whether the puck is allowed to point at anything.

```tsx
  const puckMotion = getPuckMotionModel({
    overlayState,
    hasAcceptedGuidance,
    hasActiveTarget: acceptedTarget != null,
    isRefreshingCapture,
    hasCaptureError: captureError != null,
    guidanceIssueCount: guidanceIssues.length,
  });
  const puckTargetVector =
    puckMotion.canSendTargetDroplets && acceptedTarget != null
      ? getPuckTargetVector(acceptedTarget, viewport)
      : null;
```

Technical detail:

This is the runtime safety chain:

```text
overlay state + capture state + validation state
  -> puck motion model
  -> target vector only when droplets are allowed
  -> CSS can only travel when both signals exist
```

The important thing here is that travel is blocked before rendering, not cleaned up afterward.

**[App.css](C:/Users/Pumba/Documents/codex/clicky/touchpilot/apps/desktop/src/App.css:621)**

Plain English: this section creates the droplet cluster that gives the puck its fluid look.

```css
.puck-droplets {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
}

.puck-droplet {
  --droplet-size: 13px;
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--droplet-size);
  height: var(--droplet-size);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.74), transparent 24%),
    radial-gradient(circle at 54% 58%, rgba(117, 244, 215, 0.76), rgba(38, 154, 181, 0.2));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.36),
    0 0 18px rgba(117, 244, 215, 0.34);
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.5);
  will-change: transform, opacity;
}
```

Technical detail:

The droplets are absolutely positioned inside a fixed puck box. That is important because the motion should not reflow layout or expand containers. Everything is driven by `transform` and `opacity`, which is the right baseline for cheap animation.

**[App.css](C:/Users/Pumba/Documents/codex/clicky/touchpilot/apps/desktop/src/App.css:851)**

Plain English: this section is where the app allows droplets to fly toward a target, but only in the right state.

```css
.assistant-puck[data-motion="guiding"][data-target-droplets="enabled"] .puck-droplet {
  animation-duration: 1.3s;
  animation-iteration-count: infinite;
  animation-timing-function: cubic-bezier(0.32, 0.72, 0.18, 1);
}

.assistant-puck[data-motion="guiding"][data-target-droplets="enabled"] .puck-droplet-a {
  animation-name: puck-target-droplet-a;
}
```

Technical detail:

This selector matters because it is very strict:

- the puck must be in guiding state
- the target droplets must be explicitly enabled

If either condition is false, these animations do not run.

That is exactly how motion systems should communicate trust boundaries.

**[App.css](C:/Users/Pumba/Documents/codex/clicky/touchpilot/apps/desktop/src/App.css:1245)**

Plain English: this section protects users who do not want or cannot comfortably use constant animation.

```css
@media (prefers-reduced-motion: reduce) {
  .puck-orbit,
  .puck-core,
  .puck-droplet,
  .pointer-pulse {
    animation: none !important;
  }

  .assistant-puck[data-motion="guiding"][data-target-droplets="enabled"] .puck-droplet {
    animation: none !important;
  }
}
```

Technical detail:

The reduced-motion fallback does not simply lower speed. It changes behavior:

- no looping orbit
- no long travel path
- no pointer-trailing movement
- static droplet hints remain for state readability

That is better than merely slowing the animation, because some users need removal, not just reduction.

## How The Pieces Connect

Plain English: the flow starts with app truth and ends with CSS motion, with safety checks in the middle.

```text
[overlay state]
     |
     v
[guidance acceptance + capture state + validation state]
     |
     v
[getPuckMotionModel]
     |
     +--> [motion.state]
     |
     +--> [canSendTargetDroplets]
     |
     v
[App.tsx computes pointer shadow + target vector]
     |
     v
[AssistantPuck data-* attributes + CSS variables]
     |
     v
[App.css renders shadow / forming / thinking / guiding / paused / error]
```

That is a good architecture because each layer has one job:

- app state decides truth
- model decides motion permissions
- React passes state and geometry
- CSS draws the motion

## Common Patterns

### Pattern 1: State Model Before Fancy Rendering

What it is for: making animation behavior correct before trying to make it impressive.

This phase deliberately introduced `puckMotion.ts` before adding more CSS states.

That means later rendering upgrades can keep the same contract:

```ts
type PuckMotionModel = {
  state: PuckMotionState;
  canSendTargetDroplets: boolean;
};
```

If the renderer changes later, this model can stay.

### Pattern 2: CSS Variables For Motion Geometry

What it is for: letting JS calculate dynamic positions while keeping animation logic in CSS.

The target and shadow coordinates are passed as custom properties, not baked into hundreds of inline styles.

That makes the animation readable and keeps the component structure clean.

### Pattern 3: Data Attributes As Rendering Gates

What it is for: letting CSS react to trusted runtime signals without owning business logic.

Example:

```tsx
data-target-droplets={motion.canSendTargetDroplets ? "enabled" : "disabled"}
```

That gives CSS a clear switch without duplicating validation logic.

### Pattern 4: Reduced Motion As A First-Class Variant

What it is for: treating accessibility as part of the base design, not a cleanup task.

Phase 7 added reduced-motion rules in the same phase as the animation work itself. That is the correct place to do it.

## Edge Cases And Gotchas

### Gotcha 1: Pretty Motion Can Accidentally Lie

In plain English: if droplets travel to a target the app does not trust, the user sees false confidence.

Technical cause: animation can imply correctness even when data is stale, rejected, or loading.

How to avoid: keep target-travel motion gated behind accepted guidance and explicit `canSendTargetDroplets`.

### Gotcha 2: Pointer Following Can Break Layout Fast

In plain English: a shadow that follows the pointer can easily fly off screen or block nearby UI.

Technical cause: raw cursor coordinates do not respect viewport edges or padding.

How to avoid: clamp the position and keep a fixed margin buffer.

### Gotcha 3: Infinite Activation Animation Feels Wrong

In plain English: waking up should look like a moment, not a permanent spin cycle.

Technical cause: reusing looping orbit animation for activation makes the forming state feel stuck.

How to avoid: use one-shot activation keyframes with fill mode and limited duration.

### Gotcha 4: Reduced Motion Is Not "Slower Motion"

In plain English: many users need movement removed, not merely softened.

Technical cause: slowing a long travel animation can still feel distracting or nauseating.

How to avoid: disable long travel and looping effects entirely in `prefers-reduced-motion`.

### Gotcha 5: Visual QA Still Matters Even When Typecheck Passes

In plain English: code can compile perfectly and still look wrong on screen.

Technical cause: layout collisions, timing issues, and path aesthetics are not caught by TypeScript.

How to avoid: keep a runtime QA record and revisit screenshot-based review when browser tooling is available.

## How It Connects To Other Concepts

- **Runtime QA**: Phase 6 made the overlay states trustworthy; Phase 7 makes those trustworthy states visible in a richer way.
- **Safety**: motion is now part of the safety story because it must not point toward rejected or unconfirmed targets.
- **Gestures**: the `forming` and `shadow` states are natural hooks for future gesture-triggered activation.
- **Voice mode**: listening or speaking states can reuse the same motion model instead of adding ad hoc animation flags.
- **Advanced rendering**: a future shader or `react-three-fiber` layer can replace the CSS visuals without replacing the runtime contract.

## Going Deeper

### Shader-Driven Liquid Surfaces

The next level would be a shader-based puck with more convincing merging and refraction. That is worth exploring only after the current motion grammar is stable and visually verified.

### Gesture-Coupled Motion

Future gesture confidence could modulate droplet count, orbit intensity, or activation timing. That would make the puck feel more connected to the camera input system.

### Path Sampling Against Real Targets

Right now the target vector is simple and practical. A deeper version could sample actual puck position, target center, and layout constraints to build better curved travel paths.

### Visual Regression QA

This phase already has internal verification. The next layer would be screenshot-based checks for puck position, target-travel readability, and reduced-motion presentation.

## Quick Reference

### Key Terms

| Term | Plain English meaning | Technical meaning |
|------|-----------------------|-------------------|
| `shadow` | Quiet assistant presence near the pointer | Idle puck motion state |
| `forming` | Activation burst before the puck settles | One-shot motion state mapped from `listening` |
| `guiding` | The assistant is actively pointing somewhere real | Motion state that may enable target droplets |
| `canSendTargetDroplets` | Permission to visually point at the target | Guard derived from accepted guidance and error/loading state |
| reduced motion | Static or quieter version of the puck | `prefers-reduced-motion` CSS fallback |

### Essential Patterns

```ts
const puckMotion = getPuckMotionModel({
  overlayState,
  hasAcceptedGuidance,
  hasActiveTarget: acceptedTarget != null,
  isRefreshingCapture,
  hasCaptureError: captureError != null,
  guidanceIssueCount: guidanceIssues.length,
});

const puckTargetVector =
  puckMotion.canSendTargetDroplets && acceptedTarget != null
    ? getPuckTargetVector(acceptedTarget, viewport)
    : null;
```

```css
.assistant-puck[data-motion="guiding"][data-target-droplets="enabled"] .puck-droplet-a {
  animation-name: puck-target-droplet-a;
}

@media (prefers-reduced-motion: reduce) {
  .assistant-puck[data-motion="guiding"][data-target-droplets="enabled"] .puck-droplet {
    animation: none !important;
  }
}
```

## Verification Summary

Phase 7 closed with:

- desktop typecheck passing
- desktop build passing
- full repo check passing
- source verification for target-droplet gate and reduced-motion fallback
- live dev server responding on port `1420`

The remaining gap is screenshot-based visual QA because the in-app browser backend was unavailable during the verification step.

## Phase 7 Commits

```text
fc1ad2d docs: phase 7 fluid puck spec
ed3c94a feat: add puck motion state model
4ae7879 feat: add fluid puck css fallback
7718e6c feat: add idle pointer shadow puck
2e3a849 feat: add puck activation droplet transition
227e1db feat: animate puck droplets to guidance target
52ce520 feat: add puck reduced motion fallback
af78684 docs: add phase 7 motion qa
```

## Suggested Quiz Questions

1. Why does the puck need a separate motion state model instead of letting CSS infer everything from overlay state?
2. Why is `canSendTargetDroplets` more important than the animation itself?
3. What problem do CSS custom properties solve in the puck implementation?
4. Why is reduced-motion support part of Phase 7 instead of a later cleanup?
5. What is still unproven after Phase 7 even though typecheck and build passed?

---

*Generated: 2026-06-01 | Project: TouchPilot | Files: `docs/phase-7-fluid-puck.md`, `apps/desktop/src/puckMotion.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/App.css`, `docs/phase-7-motion-qa.md`*
