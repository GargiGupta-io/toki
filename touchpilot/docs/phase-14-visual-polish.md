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

Result: completed. `docs/visual-acceptance.md` now acts as the current visual gate for Phase 14 and later overlay work. It adds the close-puck reference, detachment/edge-loss fail rules, compact workflow/safety cue requirements, target-ring polish expectations, and updated runtime checklist items for workflow and confirmation states.

### Step 14.3: Overlay Cue Polish

Tighten the workflow/guidance cue:

- reduce visual weight
- keep instruction text readable
- prevent overlap with target ring
- keep Back/Next/Stop compact
- ensure confirmation state is obvious without looking dangerous by default

Result: completed. The workflow cue is now a lighter cursor-adjacent instruction surface instead of a small dashboard card. It uses a compact step meta line, two-line clamped instruction text, flatter Back/Next/Stop controls, and a distinct but restrained confirmation-required state.

### Step 14.4: Puck Motion And Edge Behavior

Improve the cursor companion:

- keep it very close to the cursor
- flip/shift around screen edges instead of getting lost
- tune lag/smoothing so it feels attached
- keep reduced-motion stable
- document when native cursor/R3F should replace CSS

Result: completed. The puck geometry now places the puck very close to the cursor by default, flips it left/up when it would overflow near screen edges, and computes target droplet vectors from the actual cursor-following puck position instead of the old bottom-right fallback anchor.

### Step 14.5: Target Ring Polish

Make target guidance feel less mock-like:

- subtle ring
- clearer focus point
- better label placement
- avoid blocking the target
- handle small targets and edge targets

Result: completed. The target marker now uses the actual target box coordinates without the old half-size shift, a softer border, corner emphasis, smaller center focus point, lower glow, and a slower quieter pulse. This makes it read more like a guidance highlight and less like a debug/mock badge.

### Step 14.6: Settings/Menu Panel Polish

Keep the settings popup compact and understandable:

- menu-bar utility feel
- no confusing toggles
- clear push-to-talk affordance
- clear camera/gesture state
- no unnecessary decorative boxes

Result: completed. The settings popup is now tighter and more menu-like: the inner surface no longer fills the whole settings window, copy is shorter, push-to-talk is clearer, and footer actions are lighter. Camera/gesture-specific changes remain out of this visual step.

### Step 14.7: Debug Visual Cleanup

Make Debug easier to inspect:

- keep tabs
- reduce dense repeated cards
- keep long sections scrollable
- separate user-facing state from provider internals
- keep debug clearly internal

Result: completed. Debug keeps its tabs and full internal information, but the surface is denser and easier to scan: smaller shell padding, wider content area, lower-contrast cards, tighter data grids, compact workflow/candidate rows, and sticky tabs for long sections.

### Step 14.8: Optional WebGL/R3F Spike

Only if CSS cannot reach the desired puck/target feel:

- spike a small isolated WebGL/R3F puck renderer
- keep CSS fallback
- measure bundle/performance impact
- do not move all overlay UI into WebGL

Result: completed as a documented deferral in `docs/phase-14-webgl-r3f-spike.md`. CSS is currently good enough for the Phase 14 baseline, so we did not add Three.js/R3F dependencies. The doc records the trigger conditions, adapter shape, dependency boundary, and acceptance criteria for a future spike.

### Step 14.9: Performance And Reduced Motion QA

Check that visual polish does not make the app feel heavy:

- idle CPU stays low
- puck motion does not stutter
- reduced-motion disables decorative loops
- overlay remains click-through

Result: completed. Added `npm run qa:visual:motion`, which checks reduced-motion coverage for puck/target animations, verifies decorative animations are disabled under reduced motion, checks the pointer pulse fallback, confirms the cursor polling interval remains responsive, and verifies compositor-friendly puck motion properties.

### Step 14.10: Manual Visual QA

Run manual checks on realistic screens:

- browser dashboard
- desktop edge positions
- Dock/menu bar areas
- settings open/close
- workflow guidance active
- confirmation-required guidance

Result: completed. Added `docs/phase-14-manual-visual-qa.md` and `npm run qa:visual:manual`, which prints the Mac manual visual checklist for default runtime, settings/menu panel, target ring, workflow cue, Debug, and reduced-motion review.

### Step 14.11: Phase Closure

Close Phase 14 only when the visual layer is clearly better without weakening the core product contract: Toki is a small cursor companion, not a dashboard.

Result: completed. Phase 14 is closed for implementation and QA guardrails. The visual layer now has a refreshed acceptance gate, tighter workflow cue, closer edge-aware puck geometry, softer target ring, more compact settings popup, denser Debug surface, a documented WebGL/R3F deferral, reduced-motion QA, and a manual visual QA checklist.

Closure verification:

- `npm run qa:visual:motion`
- `npm run qa:visual:manual`
- `npm --workspace @toki/desktop run typecheck`

Manual product-feel review still requires launching Toki on a real screen and walking through `docs/phase-14-manual-visual-qa.md`. That is the final taste check, not an automated claim.

## Closure Summary

Phase 14 improved the product surface without changing Toki's architecture:

- overlay remains cursor-first
- CSS remains the active renderer
- WebGL/R3F is deferred until proven necessary
- settings stays a compact utility popup
- Debug stays internal
- target and workflow cues are lighter
- puck geometry is closer to the cursor and edge-aware

The next phase can move into evals/measurement work without reopening visual polish unless manual visual QA finds a specific regression.

## Non-Goals

- Full brand/onboarding site.
- Final shader-quality liquid simulation.
- New provider intelligence.
- New workflow planning logic.
- Browser extension architecture changes.

Those belong to later product, rendering, or intelligence phases.
