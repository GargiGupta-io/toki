# Phase 8: Monochrome Overlay Reset

> Phase 8 rebuilt TouchPilot's overlay from a loud prototype surface into a quieter monochrome desktop layer so the product could feel premium before more advanced interaction features were added.

---

## In Plain English

This phase was about taste, but not in a shallow way.

TouchPilot already had working capture, guidance, validation, runtime QA, and a fluid puck system. The problem was that the app still looked like a developer tool. It had bright mint accents, oversized glass panels, obvious branding chrome, and a puck that still felt more like a CSS demo than a polished desktop assistant.

That matters because overlays are not normal apps. A normal app gets to own the whole screen. An overlay has to sit on top of somebody else's work without becoming annoying. If it feels loud or toy-like, it stops feeling trustworthy. So Phase 8 paused feature expansion long enough to reset the visual language.

The core idea was simple: make the overlay feel more like a monochrome mac interface. That meant white and smoke instead of color, smaller and quieter surfaces, and a puck that behaves like a subtle cursor-shadow presence instead of a floating badge.

## What Is A Visual Reset?

Technically, a visual reset is a phase where the runtime behavior stays mostly intact while the presentation contract is rewritten.

That is different from polish at the very end of a project. End-stage polish usually assumes the visual direction is already correct and only needs tuning. Phase 8 was deeper than that. It changed:

- hierarchy
- palette
- surface scale
- perceived weight of UI elements
- motion meaning
- the relationship between product UI and debug UI

This is important because visual language is not just decoration. It changes how the user interprets the product:

- loud color reads as a warning or a toy
- oversized panels read as heavy and intrusive
- small restrained surfaces read as calmer and more native
- monochrome materials tend to feel closer to desktop system UI

## The Problem It Solves

Before Phase 8, the logic was ahead of the UI.

### Problem 1: Prototype Chrome

Plain English: the app opened like a demo screen instead of an assistant that quietly belongs on the desktop.

The visible top-left brand rail and title block were a strong example of this. They announced the app too hard.

### Problem 2: Neon Accent Bias

Plain English: the green-led palette made the app feel synthetic and loud.

The color system was spread through:

- state pills
- buttons
- target ring
- risk strips
- debug controls
- puck orbit and droplets

The result was that almost every important UI state looked like it had the same accent identity, which flattened meaning and cheapened the product feel.

### Problem 3: The Puck Still Felt Like A Badge

Plain English: even with motion, the puck still looked like a branded circle with particles around it.

That is not the same thing as a premium cursor-shadow assistant. The user wanted something more subtle and object-like, almost like a small white shadow that lives near the cursor.

### Problem 4: Debug Tooling Dominated The Experience

Plain English: the app still looked like an internal control panel.

That was partly because the debug panel was large and high-contrast, but also because the product surfaces were not strong enough to visually outrank it.

## How It Works

Phase 8 changed the presentation in layers.

1. remove loud runtime chrome
2. shrink and soften the main guidance surface
3. replace the color/material system
4. redesign the puck form
5. rework activation motion
6. quiet the guiding motion
7. demote the debug panel
8. re-run the engineering verification gate

## What We Built

Phase 8 mostly touched:

- `touchpilot/apps/desktop/src/App.tsx`
- `touchpilot/apps/desktop/src/App.css`
- `touchpilot/docs/phase-8-monochrome-overlay-qa.md`

### Remove The Runtime Brand Rail

Plain English: the app stopped shouting its own name in the corner.

Before this step, the runtime included:

```tsx
<section className="status-rail" aria-label="Assistant status">
  <div className="brand-mark">TP</div>
  <div>
    <p className="eyebrow">TouchPilot</p>
    <h1>Overlay prototype</h1>
  </div>
</section>
```

That structure made sense while proving the shell existed. It did not make sense once the goal shifted toward a premium desktop assistant.

By removing that block, the overlay stopped opening like a prototype dashboard shell and started leaving more room for the actual contextual surfaces to define the product.

### Rebuild The Guidance Surface

Plain English: the main panel became a smaller floating hint instead of a chunky control card.

The guidance surface was retuned in both markup and CSS.

In the component:

```tsx
<div className="instruction-panel">
  <p className="surface-kicker">Current guidance</p>
  <h2>{hasAcceptedGuidance ? activeTarget.label : meta.label}</h2>
  <p>{meta.description}</p>
```

Technical detail:

This changes the tone of the panel. Instead of a larger “system card” with a title-like heading, it starts behaving more like a contextual hint attached to the current state or current target.

The surface styling became smaller and lighter:

```css
.guidance-surface {
  width: min(292px, calc(100vw - 56px));
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04)),
    var(--panel-bg);
  box-shadow:
    var(--shadow-lg),
    inset 0 1px 0 var(--panel-highlight);
  backdrop-filter: blur(28px) saturate(120%);
}
```

Technical detail:

The key change here is not only blur. It is proportion.

The panel now:

- occupies less visual mass
- uses softer material contrast
- behaves more like a floating note

That is closer to what system overlays do well.

### Replace The Palette With Monochrome Materials

Plain English: instead of using bright accent color to make everything visible, the UI now uses contrast, opacity, and blur.

The CSS root now defines a material system:

```css
:root {
  --overlay-bg: rgba(10, 10, 12, 0.24);
  --panel-bg: rgba(20, 21, 24, 0.34);
  --panel-bg-strong: rgba(20, 21, 24, 0.56);
  --panel-border: rgba(255, 255, 255, 0.16);
  --panel-highlight: rgba(255, 255, 255, 0.26);
  --text-strong: rgba(255, 255, 255, 0.96);
  --text-soft: rgba(255, 255, 255, 0.66);
  --text-faint: rgba(255, 255, 255, 0.42);
}
```

Technical detail:

This is one of the biggest architectural improvements in the phase because the styling is no longer a pile of one-off colors. It has an actual material vocabulary.

That vocabulary then propagates through:

- guidance surface
- step bubble
- target ring
- controls
- debug panel
- confirmation states
- issue states

The important design decision was this:

> Remove color from the default meaning of most surfaces.

That means the product relies more on hierarchy and shape than on green/yellow/red categories everywhere.

### Redesign The Puck

Plain English: the puck stopped being a round branded badge and started becoming a small cursor-shadow object.

The old core was text-based:

```tsx
<span className="puck-core">TP</span>
```

The new core is shape-based:

```tsx
<span className="puck-core" aria-hidden="true">
  <span className="puck-shadow-form" />
  <span className="puck-shadow-tail" />
</span>
```

Technical detail:

This is a subtle but major conceptual shift.

The puck is no longer “the brand circle.” It is an object with a silhouette. The markup gives CSS room to make it feel more like a small desktop companion instead of a labeled badge.

The footprint was also reduced:

```css
.assistant-puck {
  width: 54px;
  height: 54px;
  border-radius: 18px;
}
```

And the shadow-form itself became a custom shape:

```css
.puck-shadow-form {
  width: 18px;
  height: 18px;
  border-radius: 2px 11px 11px 11px;
  transform: rotate(-18deg) skewY(-8deg);
}
```

This is not a literal mouse pointer icon. That is deliberate. A literal cursor would look kitschy. The current approach suggests the cursor-shadow idea without turning it into a cartoon.

### Rework Activation Into Separation

Plain English: when the puck activates, it now feels like the shadow is peeling apart.

The key motion change was replacing the core's generic activation animation with a separation animation:

```css
.assistant-puck[data-motion="forming"] .puck-core {
  animation: puck-shadow-separate 920ms cubic-bezier(0.2, 0.86, 0.24, 1) both;
}
```

And the keyframes:

```css
@keyframes puck-shadow-separate {
  0% {
    opacity: 0.82;
    transform: scale(0.94) rotate(0deg);
  }

  34% {
    opacity: 0.72;
    transform: translate(-2px, 1px) scale(0.9) rotate(-6deg);
  }

  100% {
    opacity: 0.22;
    transform: translate(1px, -1px) scale(0.72) rotate(-10deg);
  }
}
```

Technical detail:

The animation does three useful things:

- lowers opacity
- reduces scale
- introduces a slight directional break

That gives the droplets a believable origin story. They look like they came from the shadow-form instead of appearing arbitrarily around it.

### Quiet The Guiding Cues

Plain English: the target-travel motion became softer and more like a hint than a beam.

The timing was slowed and the travel was softened:

```css
.assistant-puck[data-motion="guiding"][data-target-droplets="enabled"] .puck-droplet {
  animation-duration: 1.45s;
  animation-timing-function: cubic-bezier(0.22, 0.7, 0.2, 1);
}
```

The droplet keyframes were also made smaller and less aggressive. For example:

```css
@keyframes puck-target-droplet-a {
  0% {
    opacity: 0;
    transform: translate(-10px, -6px) scale(0.3);
  }

  78% {
    opacity: 0.54;
    transform: translate(
        calc(var(--puck-target-x) * 0.78),
        calc(var(--puck-target-y) * 0.78)
      )
      scale(0.52);
  }

  100% {
    opacity: 0;
    transform: translate(var(--puck-target-x), var(--puck-target-y)) scale(0.14);
  }
}
```

Technical detail:

The motion now communicates “follow this” instead of “look at this effect.” That is the right tradeoff for an assistant overlay.

### Demote The Debug Panel

Plain English: the debug panel still exists, but it stopped visually defeating the product.

The panel was shrunk and dimmed:

```css
.debug-panel {
  width: min(312px, calc(100vw - 56px));
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
    rgba(14, 15, 18, 0.26);
  opacity: 0.7;
}
```

Technical detail:

This is not a full debug-mode architecture yet. The panel still renders in the runtime. But Phase 8 made the correct interim move:

- preserve development utility
- reduce visual authority

That lets the product UI lead without sacrificing tooling.

## How The Pieces Connect

Plain English: the phase kept the logic contract and swapped out the visual contract.

```text
[existing overlay logic]
     |
     +--> guidance state
     +--> accepted target
     +--> puck motion state
     |
     v
[new visual hierarchy]
     |
     +--> smaller guidance hint
     +--> monochrome material system
     +--> cursor-shadow puck
     +--> quieter guiding motion
     +--> softer debug surface
```

This is why the phase moved quickly. The runtime behavior stayed intact. The redesign mostly changed how that behavior is presented.

## Common Patterns

### Pattern 1: Keep Logic, Reset Presentation

What it is for: redesigning product feel without destabilizing runtime behavior.

Phase 8 barely touched capture logic, guidance logic, validation logic, or motion-state logic. It used those stable systems as a base and changed the visual contract around them.

That is the right move when engineering is ahead of design.

### Pattern 2: Material Tokens Before Micro-Polish

What it is for: making UI changes coherent instead of accidental.

The shift to variables like `--panel-bg`, `--panel-border`, and `--text-soft` gives future phases a better styling foundation.

Without this, every new surface would risk drifting back into ad hoc color choices.

### Pattern 3: Suggestive Shapes Over Literal Icons

What it is for: making symbolic UI feel premium.

The puck does not use a literal cursor glyph. It uses a silhouette that suggests a cursor-shadow presence. That is a better pattern for premium UI because it avoids looking gimmicky.

### Pattern 4: Debug Surfaces Should Lose To Product Surfaces

What it is for: keeping internal tooling from poisoning the user-facing feel.

The panel still exists, but it no longer acts as the loudest object in the scene. That is a good rule for any prototype becoming a product.

## Edge Cases And Gotchas

### Gotcha 1: Monochrome Can Become Muddy

In plain English: when everything is gray, it is easy for nothing to stand out.

Technical cause: removing accent color can flatten hierarchy if opacity and contrast are not tuned carefully.

How to avoid: use clear differences in text opacity, blur, border intensity, and size.

### Gotcha 2: Small Puck Forms Can Become Unclear

In plain English: making the puck subtle is good until it becomes too vague.

Technical cause: shrinking the form reduces legibility and makes motion carry more of the recognition load.

How to avoid: keep the silhouette readable and keep motion states distinct enough that the eye still catches them.

### Gotcha 3: CSS Motion Can Still Feel Synthetic

In plain English: even after redesign, particle motion can still feel fake.

Technical cause: CSS keyframes are deterministic and can feel repetitive compared with true fluid simulation.

How to avoid: use CSS only to prove the motion grammar, then decide later whether a richer renderer is justified.

### Gotcha 4: Debug UI Presence Is Still A Product Risk

In plain English: demoting the debug panel helps, but it is still on screen.

Technical cause: visibility and rendering are separate concerns. Lowering contrast does not create a proper dev-mode boundary.

How to avoid: eventually add a true hidden or toggled debug mode.

### Gotcha 5: Build Success Does Not Equal Taste Success

In plain English: all the verification commands can pass while the product still feels off.

Technical cause: build tooling checks structural correctness, not visual balance or motion quality.

How to avoid: keep separate runtime QA notes and do real screenshot or live review passes when tooling allows it.

## Verification

Phase 8 closed with a strong engineering gate:

```bash
npm --workspace @touchpilot/desktop run typecheck
npm --workspace @touchpilot/desktop run build
npm run check
npm run desktop:build
```

The native build produced:

- `touchpilot-desktop.exe`
- MSI installer
- NSIS installer

The verification note lives in:

```text
touchpilot/docs/phase-8-monochrome-overlay-qa.md
```

The one important remaining gap is screenshot-backed visual runtime inspection. The browser backend was unavailable in this environment, so the phase can honestly claim structural correctness, but not complete visual proof.

## How It Connects To Other Concepts

- **Gesture MVP**: now that the overlay looks calmer, gesture activation has a better visual surface to land on.
- **Voice mode**: listening and guiding transitions will feel more coherent on a restrained monochrome base.
- **Future polish**: later premium visual work now has a cleaner starting point and does not need to first undo prototype neon styling.
- **Product trust**: calmer overlays feel more credible, especially for guidance and confirmation flows.

## Going Deeper

### Real Runtime Visual Regression

The next valuable layer is screenshot-based or manual visual comparison across window sizes and states. That would prove the redesign visually, not just structurally.

### Dev Mode Separation

At some point the debug panel should probably become a real toggle or separate mode. That would let the runtime feel even cleaner during demos and user-facing testing.

### Higher-Fidelity Puck Rendering

If the current shadow-form still feels too synthetic, the next question is whether to keep pushing CSS or move the puck to a richer render path. That should be a product decision, not a reflex.

## Quick Reference

### Key Terms

| Term | Plain English meaning | Technical meaning |
|------|-----------------------|-------------------|
| monochrome overlay | quiet mostly-white visual style | grayscale material system with translucent panels |
| smoke-glass panel | soft floating hint surface | blurred translucent panel with light border/highlight |
| cursor-shadow puck | subtle assistant object near the cursor | small custom-shaped puck replacing the old text badge |
| target cue | quiet guidance path to the target | slowed droplet travel animation in guiding state |
| debug demotion | keep tooling without letting it lead | reduced contrast, size, and opacity for debug panel |

### Essential Patterns

```css
:root {
  --panel-bg: rgba(20, 21, 24, 0.34);
  --panel-border: rgba(255, 255, 255, 0.16);
  --text-strong: rgba(255, 255, 255, 0.96);
  --text-soft: rgba(255, 255, 255, 0.66);
}
```

```tsx
<span className="puck-core" aria-hidden="true">
  <span className="puck-shadow-form" />
  <span className="puck-shadow-tail" />
</span>
```

```css
.assistant-puck[data-motion="guiding"][data-target-droplets="enabled"] .puck-droplet {
  animation-duration: 1.45s;
  animation-timing-function: cubic-bezier(0.22, 0.7, 0.2, 1);
}
```

## Phase 8 Commits

```text
a748f96 refactor: remove default overlay brand chrome
83434b4 style: compact the overlay guidance surface
61f8193 style: shift overlay materials to monochrome glass
adc5468 style: redesign puck as cursor shadow
8a7deae style: refine puck activation separation
7bd26ed style: quiet the puck guidance cues
3173cea style: demote debug panel prominence
f3421cc docs: add phase 8 overlay qa
```

## Suggested Quiz Questions

1. Why was Phase 8 a product phase and not just a cosmetic cleanup?
2. Why is monochrome material hierarchy harder than just removing color?
3. What changed when the puck moved from a `TP` badge to a cursor-shadow form?
4. Why was it useful to keep the logic contract stable while resetting the presentation layer?
5. What is still unproven after Phase 8 even though all build and package checks passed?

---

*Generated: 2026-06-02 | Project: TouchPilot | Files: `apps/desktop/src/App.tsx`, `apps/desktop/src/App.css`, `docs/phase-8-monochrome-overlay-qa.md`*
