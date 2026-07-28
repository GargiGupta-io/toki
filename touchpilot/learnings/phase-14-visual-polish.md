# Toki Phase 14: Visual Polish

## Step 14.1: Visual Polish Plan

Phase 14 starts after Phase 13 closed the controlled multi-step workflow foundation.

The important learning is that visual polish now has to improve product feel without undoing the main product contract:

- Toki is a cursor companion, not a normal app window.
- The overlay should stay invisible except for puck, target ring, and compact cue.
- Settings should feel like a small menu-bar utility surface.
- Debug can be more complete, but it must stay clearly internal.
- CSS remains the production fallback.
- WebGL/R3F is allowed only as a focused spike if CSS cannot deliver the desired puck/target feel.

## Why This Phase Exists

Earlier phases made the product functionally broader:

- voice can produce commands
- browser/provider accuracy paths exist
- safety rules can block risky actions
- screen intelligence candidates exist
- controlled workflows can advance, block, and require confirmation

But the visible product still needs refinement:

- the puck must stay close to the real cursor
- edge behavior must avoid losing the companion near the Dock, menu bar, or screen corners
- target rings should feel intentional instead of mock-like
- workflow cues need to stay readable without becoming a dashboard
- Debug needs to stay inspectable without becoming visually overwhelming

## Tradeoffs Captured

### CSS First

CSS is stable, already integrated, and cross-platform.

Tradeoff: it cannot easily create a final liquid, cinematic cursor companion.

Best alternative: keep CSS as fallback and only spike WebGL/R3F for the puck/target layer if the CSS version remains insufficient.

### Mac Feel First

Mac is the current primary product-feel platform and matches the menu-bar utility reference better.

Tradeoff: Windows/Linux may still need separate runtime validation later.

Best alternative: tune manual product feel on Mac while keeping shared contracts and compile checks portable.

### Compact Cue Over Panel

The overlay should show the next useful action, not every internal detail.

Tradeoff: compact cues can become unclear if we overload them.

Best alternative: keep only current instruction/safety state in the overlay and move provider/workflow detail to Debug.

## Step Outcome

Created the Phase 14 plan in the Toki repo:

- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

Phase 14 is now explicitly scoped before implementation starts.

## Step 14.2: Visual Acceptance Refresh

The visual acceptance file was updated from a Phase 8 closure gate into the current Phase 14 visual gate.

The key additions:

- use the current Toki name
- treat Mac as the primary product-feel runtime
- add the close-puck reference
- fail detached puck behavior
- fail puck edge loss near Dock/menu bar/screen corners
- fail dashboard-like workflow cues
- fail unclear safety/confirmation visuals
- require compact workflow current-step cues
- require target rings that guide without blocking the target

This matters because Phase 14 will make visual changes. The acceptance doc now protects the product shape before implementation starts:

> Toki is still the small cursor companion, not an app panel.

Files updated:

- `docs/visual-acceptance.md`
- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

## Step 14.3: Overlay Cue Polish

The workflow cue was changed from a small card-like control surface into a lighter cursor-adjacent instruction cue.

What changed:

- moved the cue closer to the puck
- replaced boxed step count with a compact meta line
- kept the step title small
- allowed the instruction to use up to two lines instead of forcing everything into one clipped line
- changed Back/Next/Stop from boxed buttons into flatter text controls
- added a distinct but restrained confirmation-required state

The important product decision is that workflow guidance should show the current action, not become a mini dashboard.

This keeps the overlay consistent with the main rule:

> The user should feel like Toki is guiding their cursor, not covering their app with controls.

Files updated:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/App.css`
- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

Verification:

- `npm --workspace @toki/desktop run typecheck`

## Update: Blob Cursor Transparency And Shape Reset

Date: 2026-07-04

The ReactBits-style blob cursor went through one correction loop after the clean renderer reset. The first attempt over-tuned the component for Toki by shrinking it, lowering opacity, removing inner dots, and weakening the goo filter. That made the puck softer, but it also made it no longer match the ReactBits reference.

The final correction was to restore the actual ReactBits visual defaults while keeping Toki's native cursor input source:

```text
ReactBits behavior
  -> GSAP blob elements
  -> SVG goo/filter
  -> multiple blob nodes with different chase timing

Toki input source
  -> native OS cursor polling
  -> pointerShadow position
  -> ReactBits position adapter
```

The key distinction is that ReactBits gets mouse movement from `onMouseMove` on a normal web page. Toki cannot depend on that because the overlay is click-through and should not receive normal mouse input. So Toki keeps the visual structure but replaces the input source with the native cursor position.

What changed in the renderer structure:

- split `BlobCursor.tsx` into a clean ReactBits-style component
- split `BlobCursor.css` into the copied ReactBits CSS shape
- kept `BlobPuck.tsx` as a small adapter from Toki cursor coordinates to `BlobCursor`
- removed old blob styles from `App.css`

What changed in the Toki visual tuning:

- ReactBits default sizes were too large for a cursor companion
- the visible inner dots made the blob read like a target/bullseye
- the slow default trail separated too far when driven by native cursor polling
- Toki now uses smaller blob sizes, zero inner dots, lower opacity, and faster trail timing

The lesson is not "paste defaults blindly." The lesson is: preserve the component architecture and animation model, then tune only the props that are necessary for the product context.

File updated:

- `apps/desktop/src/BlobCursor.tsx`
- `apps/desktop/src/BlobCursor.css`
- `apps/desktop/src/BlobPuck.tsx`
- `apps/desktop/src/App.css`

Verification:

- `npm --workspace @toki/desktop run typecheck`
- `npm --workspace @toki/desktop run build`
- `npm run desktop:release:mac`

Commit:

- `33981c0 style: soften blob cursor`
- `4636326 style: restore blob cursor defaults`
- `e6da18f refactor: isolate blob cursor`
- `78bd16e style: tune blob cursor size`
- `6f376a8 style: connect blob cursor`

## Updates

- 2026-07-04 - Split the blob renderer into a clean ReactBits component and a tiny Toki adapter. `BlobCursor.tsx` and `BlobCursor.css` now hold the copied component structure and CSS. `BlobPuck.tsx` only converts Toki's native cursor position into the component's `position` input. The old blob CSS was removed from `App.css` so the renderer no longer has two style systems fighting each other.
- 2026-07-04 - Tuned the copied blob component for Toki's cursor-companion scale. The raw ReactBits defaults are demo-sized and created a huge bullseye on the desktop. Toki now keeps the component structure but uses smaller blobs, no inner dots, lower opacity, and faster trailing so the shape stays close to the cursor instead of splitting into large circles.
- 2026-07-04 - Tightened the blob trail so the circles connect visually. The previous Toki-sized props still let the trailing blob lag too far behind native cursor movement, creating two separate circles. The fix was to make the trail duration much closer to the lead duration, increase blob overlap, increase SVG blur, and raise opacity so the cursor reads as one connected liquid shape instead of detached dots.
- 2026-07-04 - Corrected the Blob Cursor integration approach. The earlier implementation copied the idea but redesigned the shape with fixed bubble offsets, which made the puck look like separate blue circles instead of the React Bits teardrop. The corrected implementation keeps the React Bits component structure, prop values, SVG goo filter, three blob sizes, inner dots, opacity values, shadow settings, and GSAP lead/trail timing. The only intended adaptation is the input source: React Bits normally uses `onMouseMove` / `onTouchMove`, but Toki's overlay is click-through and must not capture pointer events, so the blob position is driven from Toki's native cursor polling path instead. The lesson is that when adopting a reference component, start from the component itself and change only the product-specific boundary, not the rendering behavior.
- 2026-07-04 - Reset the puck renderer instead of continuing to patch the mixed implementation. The old `.assistant-puck`, CSS fallback puck, orbit, droplet, target-droplet, and puck keyframe system was deleted from the runtime. Toki now has one cursor companion renderer: the React Bits-style `BlobPuck` driven by native cursor polling. This removed the source of the visual bugs where old target-vector logic pulled one blob away from the main shape or made the blob behave like a large target marker. The rule going forward is that target rings and workflow cues stay separate from the cursor blob; the blob cursor should only follow the pointer.

## Step 14.12: React Bits Blob Puck

Toki now has a stronger liquid puck renderer inspired by React Bits Blob Cursor.

The important adaptation is that Toki cannot use the React Bits interaction model directly. React Bits listens to `onMouseMove` inside its component. Toki's overlay is click-through, so pointer events pass to the real app underneath. That is why the blob puck is driven by Toki's existing native cursor polling path instead.

What changed:

- `gsap` was added to the desktop workspace
- `BlobPuck.tsx` was added as an isolated renderer
- `AssistantPuck` now renders the blob puck first
- the previous CSS puck remains as the reduced-motion fallback
- the blob is blue/purple and uses overlapping nodes plus an SVG blur/color-matrix filter
- `overlayGeometry.ts` now knows the larger visual footprint so edge flipping/clamping stays correct

The better mental model is:

```text
macOS cursor position
  -> Toki native cursor polling
  -> pointerShadow position
  -> BlobPuck GSAP animation
  -> CSS fallback if reduced motion is enabled
```

Tradeoff:

- This is still not a full WebGL liquid renderer.
- It adds `gsap`, increasing frontend bundle size.
- It keeps the implementation much lighter than Three.js/R3F.

Best alternative later:

- If the blob still cannot reach the final cinematic water-drop quality, build a small WebGL/R3F renderer only for the puck and target transition, while keeping this blob/CSS version as fallback.

Verification:

- `npm --workspace @toki/desktop run typecheck`
- `npm --workspace @toki/desktop run build`

## Step 14.8: Optional WebGL/R3F Spike Decision

The optional WebGL/R3F spike was closed as a documented deferral instead of adding dependencies immediately.

The decision:

- do not add `three`
- do not add `@react-three/fiber`
- keep the CSS renderer as the active renderer
- only spike WebGL/R3F if manual visual QA proves CSS cannot hit the desired puck/target feel

Why this is the right tradeoff right now:

- CSS already handles close cursor following
- CSS already handles edge flipping
- CSS already has reduced-motion behavior
- CSS has lower bundle/runtime cost
- adding WebGL now would create a second rendering path before we know it is necessary

Future spike trigger conditions:

- CSS puck still feels detached after polish
- final liquid split/merge cannot be done with CSS
- target-traveling droplets need smoother curved motion
- CSS animation stutters
- shader-style material/refraction becomes a product requirement

The important architecture lesson is to keep product state separate from renderer choice:

```text
overlay state + cursor geometry + target vector
  -> renderer adapter
      -> CSS fallback
      -> optional WebGL/R3F renderer later
```

Files updated:

- `docs/phase-14-webgl-r3f-spike.md`
- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

Verification:

- docs-only step; no app check needed

## Step 14.9: Performance And Reduced Motion QA

The visual layer now has a repeatable static QA command for motion guardrails.

What was added:

- `scripts/visual-motion-qa.mjs`
- `npm run qa:visual:motion`

What the QA checks:

- reduced-motion block exists
- puck orbit is covered by reduced motion
- puck core is covered by reduced motion
- puck droplets are covered by reduced motion
- target pulse is covered by reduced motion
- decorative animation is disabled under reduced motion
- pointer pulse has a static fallback
- cursor polling interval stays responsive
- puck uses compositor-friendly motion properties

Why this matters:

Visual polish can accidentally make the app feel heavy or inaccessible. This check catches the obvious regressions before manual QA:

```text
visual polish change
  -> run qa:visual:motion
  -> fail if reduced-motion or cursor responsiveness regresses
```

This does not replace real runtime testing. It is a fast guardrail before Step 14.10 manual visual QA.

Files updated:

- `scripts/visual-motion-qa.mjs`
- `package.json`
- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

Verification:

- `npm run qa:visual:motion`
- `npm --workspace @toki/desktop run typecheck`

## Step 14.10: Manual Visual QA

Phase 14 now has a manual visual QA checklist.

What was added:

- `docs/phase-14-manual-visual-qa.md`
- `scripts/macos-visual-manual-qa.sh`
- `npm run qa:visual:manual`

The manual checklist covers:

- default runtime invisibility
- click-through overlay behavior
- puck proximity and edge behavior
- settings/menu panel open, close, drag, and copy
- target ring placement and visual weight
- workflow cue compactness
- confirmation-required cue distinction
- Debug tabs and scroll behavior
- reduced-motion review

Why this matters:

Automated scripts can check syntax and some static visual guardrails, but they cannot decide if Toki feels like a cursor companion. Manual visual QA is the product-feel gate.

The acceptance rule is:

> Toki should feel like a tiny cursor companion, not a dashboard or app window.

Files updated:

- `docs/phase-14-manual-visual-qa.md`
- `scripts/macos-visual-manual-qa.sh`
- `package.json`
- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

Verification:

- `npm run qa:visual:manual`
- `npm run qa:visual:motion`

## Step 14.11: Phase Closure

Phase 14 is closed for implementation and QA guardrails.

What Phase 14 completed:

- visual acceptance refresh
- workflow cue polish
- puck proximity and edge behavior
- target ring polish
- settings/menu panel polish
- Debug visual cleanup
- WebGL/R3F spike decision
- visual motion QA
- manual visual QA checklist

Closure verification passed:

- `npm run qa:visual:motion`
- `npm run qa:visual:manual`
- `npm --workspace @toki/desktop run typecheck`

The honest limitation is that the manual checklist command only prints the human review steps. It does not prove product taste by itself. Final visual acceptance still requires launching Toki and walking through the checklist on a real screen.

The main learning from Phase 14:

> Visual polish is not just prettier CSS. It is protecting the product shape.

For Toki, the product shape is:

```text
normal desktop
  -> tiny cursor companion
  -> subtle target guidance
  -> compact workflow cue
  -> small settings utility
  -> internal Debug only when opened intentionally
```

The best decision was not to add WebGL/R3F yet. CSS is still the right active renderer until manual QA proves it cannot deliver the desired feel.

## Phase 14 Final Tradeoffs

### CSS Renderer

Tradeoff: less cinematic than WebGL.

Decision: keep it because it is stable, simple, reduced-motion friendly, and cross-platform.

### Compact Overlay

Tradeoff: less information visible in the user overlay.

Decision: keep only what helps the user act now. Move detail to Debug.

### Manual QA

Tradeoff: cannot be fully automated.

Decision: keep automated guardrails for motion/accessibility basics, then require human visual review for product feel.

## Ready For Next Phase

Phase 15 can move into evals/measurement. Visual polish should only reopen if manual visual QA finds a concrete regression.

## Step 14.7: Debug Visual Cleanup

The Debug surface was visually tightened without removing information.

What changed:

- smaller outer shell padding
- wider debug content area
- slightly smaller header type
- sticky tabs for long sections
- compact non-sticky action row
- lower-contrast debug sections
- tighter data grids
- smaller workflow rows
- smaller candidate rows
- reduced card padding and visual weight

This step deliberately kept Debug as an internal tool. The goal was not to make Debug look like the product UI; the goal was to make it easier for us to inspect runtime state without the panel feeling crowded.

The useful pattern is:

```text
default runtime
  -> minimal and user-facing

debug
  -> dense, tabbed, scrollable, internal
```

Files updated:

- `apps/desktop/src/App.css`
- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

Verification:

- `npm --workspace @toki/desktop run typecheck`

## Step 14.6: Settings/Menu Panel Polish

The settings popup was tightened so it feels more like a compact utility menu and less like a small app window.

What changed:

- the settings surface no longer fills the whole settings window
- the panel keeps a small inset so it reads as a popup surface
- the main instruction is shorter
- the voice action now says `Push to talk`
- the helper copy says what to do in one line
- footer actions are shorter: `Update screen`, `Pause`, `Resume`
- spacing was reduced so the panel feels less bulky

This step intentionally did not add new camera or gesture behavior. The goal was visual/usability polish for the existing menu panel, not a new feature.

Files updated:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/App.css`
- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

Verification:

- `npm --workspace @toki/desktop run typecheck`

## Step 14.5: Target Ring Polish

The target marker was polished so it looks less like a mock/debug badge and more like a subtle guidance highlight.

What changed:

- removed the old `translate(-50%, -50%)` shift so the marker uses the target box coordinates directly
- softened the outer border
- added corner emphasis instead of a heavy full box
- reduced the center focus dot size
- reduced glow intensity
- slowed and narrowed the pulse animation

The important correctness detail is that a `TargetBox` is a rectangular target area. The visual marker should sit on that rectangle. Shifting the marker by half its own size makes the ring look inaccurate even if the provider returned the right box.

The better model is:

```text
provider / candidate target box
  -> draw marker exactly on that box
  -> use corner/focus styling to guide attention
  -> keep pointer-events disabled so the user can click through
```

Files updated:

- `apps/desktop/src/App.css`
- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

Verification:

- `npm --workspace @toki/desktop run typecheck`

## Step 14.4: Puck Motion And Edge Behavior

The puck placement math was tightened so the cursor companion no longer relies on old center-offset behavior.

What changed:

- default puck placement is now close to the real cursor
- the puck flips left near the right edge
- the puck flips upward near the bottom edge
- clamping still prevents it from leaving the viewport
- target droplet vectors now start from the actual cursor-following puck position
- the old bottom-right target vector anchor remains only as a fallback when no pointer position is available

The important bug was conceptual: the puck followed the cursor, but part of the target animation still thought the puck lived near an old bottom-right anchor. That made guidance visuals easier to detach from the real cursor companion.

The better model is:

```text
OS cursor position
  -> edge-aware puck top-left
  -> actual puck center
  -> target vector from actual puck center to target center
```

This keeps puck motion and target guidance using the same visual origin.

Files updated:

- `apps/desktop/src/overlayGeometry.ts`
- `apps/desktop/src/App.tsx`
- `docs/phase-14-visual-polish.md`
- `docs/roadmap.md`

Verification:

- `npm --workspace @toki/desktop run typecheck`
