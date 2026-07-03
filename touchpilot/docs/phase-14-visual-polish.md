# Phase 14: Visual Polish

Phase 14 improves Toki's product feel after the core runtime, voice, browser/provider accuracy, safety, screen intelligence, and controlled workflow foundations are in place.

The goal is not to turn Toki back into an app window. The goal is to make the cursor companion, target cue, workflow cue, settings popup, and debug surfaces feel intentional, small, legible, and stable on macOS first while preserving the cross-platform Tauri/Rust/React core.

## Product Rules

1. The default runtime remains cursor-first.
2. The overlay must stay invisible except for the puck, target ring, and compact cue.
3. Toki must not add visible app chrome or permanent panels to the user's screen.
4. The puck must stay close enough to the real cursor that it reads as a companion, not a lost floating object.
5. Guidance visuals must be readable without blocking the thing the user needs to click.
6. Debug polish must make developer inspection easier, but debug never becomes the user product.
7. CSS remains the fallback renderer even if a WebGL/R3F spike is added.
8. Reduced-motion behavior must remain available.

## Tradeoffs

### CSS First

CSS is already working and ships cleanly inside the current Tauri WebView. It is easier to keep stable across macOS, Windows, and Linux.

Tradeoff: CSS cannot easily create the final cinematic liquid behavior.

Best alternative: keep CSS as the production fallback, then add a narrow WebGL/R3F spike only for puck/target rendering if the fallback cannot reach the desired feel.

### Mac Product Feel First

The current development and manual testing machine is macOS, and the product reference is a menu-bar style Mac utility.

Tradeoff: macOS polish can hide problems that will reappear on Windows or Linux.

Best alternative: tune product feel on Mac, keep shared contracts cross-platform, and maintain Windows/Linux compile and QA scripts without letting those platforms block Mac visual progress.

### Small Cues Instead Of Panels

Toki should explain the current action with a tiny cue near the cursor instead of a persistent dashboard.

Tradeoff: tiny cues can become unclear if they carry too much workflow/safety/provider information.

Best alternative: show only the next actionable instruction in the overlay, and keep details in Debug.

## Step Plan

### Step 14.1: Visual Polish Plan

Define this plan, update the roadmap, and record the learning. No rendering code changes.

### Step 14.2: Visual Acceptance Refresh

Refresh the visual acceptance checklist for the current Toki name and Mac-first runtime:

- no app chrome in normal runtime
- puck close to cursor
- no permanent panel
- settings behaves like a menu-bar utility
- target ring is subtle but visible
- workflow cue is compact and readable

### Step 14.3: Overlay Cue Polish

Tighten the workflow/guidance cue:

- reduce visual weight
- keep instruction text readable
- prevent overlap with target ring
- keep Back/Next/Stop compact
- ensure confirmation state is obvious without looking dangerous by default

### Step 14.4: Puck Motion And Edge Behavior

Improve the cursor companion:

- keep it very close to the cursor
- flip/shift around screen edges instead of getting lost
- tune lag/smoothing so it feels attached
- keep reduced-motion stable
- document when native cursor/R3F should replace CSS

### Step 14.5: Target Ring Polish

Make target guidance feel less mock-like:

- subtle ring
- clearer focus point
- better label placement
- avoid blocking the target
- handle small targets and edge targets

### Step 14.6: Settings/Menu Panel Polish

Keep the settings popup compact and understandable:

- menu-bar utility feel
- no confusing toggles
- clear push-to-talk affordance
- clear camera/gesture state
- no unnecessary decorative boxes

### Step 14.7: Debug Visual Cleanup

Make Debug easier to inspect:

- keep tabs
- reduce dense repeated cards
- keep long sections scrollable
- separate user-facing state from provider internals
- keep debug clearly internal

### Step 14.8: Optional WebGL/R3F Spike

Only if CSS cannot reach the desired puck/target feel:

- spike a small isolated WebGL/R3F puck renderer
- keep CSS fallback
- measure bundle/performance impact
- do not move all overlay UI into WebGL

### Step 14.9: Performance And Reduced Motion QA

Check that visual polish does not make the app feel heavy:

- idle CPU stays low
- puck motion does not stutter
- reduced-motion disables decorative loops
- overlay remains click-through

### Step 14.10: Manual Visual QA

Run manual checks on realistic screens:

- browser dashboard
- desktop edge positions
- Dock/menu bar areas
- settings open/close
- workflow guidance active
- confirmation-required guidance

### Step 14.11: Phase Closure

Close Phase 14 only when the visual layer is clearly better without weakening the core product contract: Toki is a small cursor companion, not a dashboard.

## Non-Goals

- Full brand/onboarding site.
- Final shader-quality liquid simulation.
- New provider intelligence.
- New workflow planning logic.
- Browser extension architecture changes.

Those belong to later product, rendering, or intelligence phases.
