# Phase 8: Cursor-First Runtime Reset

> Phase 8 resets TouchPilot from a visible app-like overlay into a cursor-first desktop assistant layer, where the puck and target cues are the product and settings/debug surfaces stay out of the normal user view.

---

## In Plain English

Phase 8 exists because the app was technically moving forward, but the runtime experience did not yet feel like the product vision.

The original overlay had panels, debug readouts, visible app chrome, and a large guidance surface. That helped during prototyping, but it made TouchPilot look like a normal app sitting on top of the desktop. The user-facing goal is different: it should feel almost invisible until needed, like a small assistant living near the cursor.

The most important correction was separating product UI from internal UI. The default user experience should be the cursor-shadow puck, target cue, and temporary guidance. Settings should appear only when intentionally opened. Debug tools should exist for us, but they should not be part of what a normal user sees.

## What Phase 8 Is Really About

Phase 8 is not just a color pass. It is a runtime architecture and product-feel reset.

The product direction is:

- default runtime is transparent and click-through
- puck is the main assistant surface
- settings are a small transient popup
- debug tooling is separate
- guidance should feel cursor-first, not panel-first
- the visual tone should be restrained, monochrome, and desktop-native

This matters because overlay software has a different trust bar than normal app software. A normal app can take over the screen. An overlay has to stay out of the way, respect the user's current work, and only become visible when it is useful.

## Final Phase 8 Step Plan

### 8.1 Visual Acceptance Spec - Complete

Plain English: we wrote down what "good" means before continuing to polish.

Built:

- `touchpilot/docs/visual-acceptance.md`

Result:

- Phase 8 now has a pass/fail standard.
- The overlay must feel cursor-first.
- Visible titlebars, permanent debug panels, app-like dashboards, and ghost-like puck behavior are explicit failures.

Commit:

```text
b1a2e32 docs: define visual acceptance gate
```

### 8.2 Runtime Surface Split - Complete

Plain English: the one big app surface was split into separate jobs.

Built:

- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/App.css`

Result:

- Overlay, settings, and debug are now separate surfaces.
- The overlay can stay fullscreen and click-through.
- Settings and debug can be opened intentionally instead of always being on screen.

Commit:

```text
85b23a1 refactor: split runtime surfaces
```

### 8.3 Overlay Native Chrome Cleanup - Complete

Plain English: the overlay stopped showing normal app-window signals where possible.

Built:

- Native title cleanup in Tauri/Rust setup.
- Overlay and settings title text removed from visible config.
- Skip-taskbar behavior enforced.

Result:

- The overlay no longer tries to look like a normal desktop window.
- On Windows, title text is cleared at the HWND level.

Commit:

```text
cdc66ca fix: suppress overlay window chrome
```

### 8.4 Clicky-Style Settings Popup - Complete

Plain English: settings became a compact popup instead of a permanent app panel.

Built:

- Smaller settings window.
- Escape closes settings.
- Losing focus closes settings.
- Heavy explanatory copy removed.

Result:

- Settings are closer to Clicky's small popup/menu behavior.
- The normal runtime can stay focused on the puck.

Commit:

```text
6e5ce51 fix: make settings popup transient
```

### 8.5 Separate Debug Window - Complete

Plain English: internal controls were moved away from the user-facing overlay.

Built:

- Debug state controls.
- Safe/risky/invalid fixture buttons.
- Capture metadata.
- Calibration details.
- Guidance validation issues.
- Screenshot preview.

Result:

- Debug tooling still exists.
- It no longer needs to live inside the default overlay.

Commit:

```text
9dd5c7f feat: expand debug window controls
```

### 8.6 Cursor-First Monochrome Runtime - Complete

Plain English: the overlay stopped behaving like a dashboard and became quieter.

Built:

- Removed risk/debug readouts from the user-facing cue.
- Removed legacy panel/debug styles from the overlay runtime.
- Reworked the step cue into a small cursor-adjacent pill.

Result:

- The user-facing runtime is much less panel-heavy.
- The puck and target cue now carry more of the experience.

Commit:

```text
c5b4072 refactor: make overlay cursor first
```

### 8.7 Puck Baseline Fix - Complete

Plain English: the puck was made smaller and closer to the real cursor, so it reads more like a cursor shadow and less like a floating object.

Built:

- Cursor-shadow offset tightened.
- Puck width/height reduced.
- Ghost halo reduced.
- Droplet size and opacity reduced.
- Active shadow transform removed so the puck does not double-offset away from the cursor.

Files:

- `touchpilot/apps/desktop/src/App.tsx`
- `touchpilot/apps/desktop/src/App.css`

Result:

- The puck baseline is less loud.
- It should sit near the cursor instead of drifting like a detached badge.

Commit:

```text
92718d9 style: refine cursor shadow puck
```

Verification:

- The user manually ran:

```powershell
npm --workspace @touchpilot/desktop run typecheck
```

- Typecheck passed.

### 8.8 Cursor And Coordinate QA - In Progress

Plain English: this step is about making the cursor math easier to verify and less fragile.

Current partial changes:

- `touchpilot/apps/desktop/src/overlayGeometry.ts` was added.
- `touchpilot/apps/desktop/src/App.tsx` was updated to use extracted geometry helpers.

The extracted helper is meant to own:

- pointer-shadow offset
- pointer-shadow bounds
- target droplet vector
- tiny-screen clamping
- non-finite value protection

Still needed:

- run verification without looping
- commit only `App.tsx` and `overlayGeometry.ts` if clean
- update the step log after commit

Important status:

- This step is not complete yet.
- The verification command was interrupted/aborted, so there is no honest pass/fail result yet.

### 8.9 Runtime Window QA - Pending

Plain English: this step checks whether the app behaves like an invisible overlay instead of blocking the desktop.

Needs to verify:

- overlay is transparent
- overlay is fullscreen
- overlay is click-through
- app does not trap clicks when settings are hidden
- settings only blocks its own popup rectangle when visible
- debug window stays separate
- no unwanted native title strip belongs to TouchPilot
- top-screen hit testing points to the underlying app, not the overlay

Expected output:

- a short QA note with pass/fail state
- any confirmed platform-specific issues
- one focused fix only if a blocking issue is found

### 8.10 Visual Acceptance Pass - Pending

Plain English: this is the taste check against the Clicky-style target.

Needs to verify:

- default runtime is mostly invisible
- puck is the main visible assistant object
- no debug UI appears in normal use
- settings feel like a small popup, not an app shell
- puck is not a floating ghost
- target cue does not look like a prototype dashboard
- monochrome material feels calm and mac-like

References:

- Clicky demo video behavior
- Clicky GitHub/README demos if available
- user-provided visual target video

Expected output:

- list of visual failures
- list of acceptable states
- decision on whether to move to Phase 9 or do another visual fix pass

### 8.11 Phase 8 Docs And Deeplearn - Pending

Plain English: this closes the phase properly.

Needs to finish:

- update Phase 8 learning doc
- remove duplicate stale notes
- update `learnings/plan.md` if needed
- update `steps.md`
- commit docs separately
- mark Phase 8 complete only after 8.8, 8.9, and 8.10 are done

## Current Phase 8 Status

Completed:

- 8.1 Visual Acceptance Spec
- 8.2 Runtime Surface Split
- 8.3 Overlay Native Chrome Cleanup
- 8.4 Clicky-Style Settings Popup
- 8.5 Separate Debug Window
- 8.6 Cursor-First Monochrome Runtime
- 8.7 Puck Baseline Fix

In progress:

- 8.8 Cursor And Coordinate QA

Pending:

- 8.9 Runtime Window QA
- 8.10 Visual Acceptance Pass
- 8.11 Phase 8 Docs And Deeplearn

## Architecture Now

Plain English: TouchPilot is now shaped more like a background assistant than a visible app.

```text
Tray / launcher
    |
    +-- overlay window
    |      fullscreen
    |      transparent
    |      click-through
    |      puck + target cues only
    |
    +-- settings window
    |      small popup
    |      visible only when requested
    |
    +-- debug window
           internal QA controls
           capture preview
           validation state
```

The core design rule is:

```text
User-facing runtime = puck and target cue
Internal tooling = debug window
Configuration = settings popup
```

## Key Implementation Ideas

### Split The Runtime Surfaces

The overlay, settings, and debug surfaces should not share one visual responsibility.

The old shape was:

```text
one overlay surface
    contains product UI
    contains settings-like UI
    contains debug UI
```

The new shape is:

```text
overlay = product runtime
settings = transient control surface
debug = internal testing surface
```

This makes the product easier to reason about. If something appears on the overlay, it must justify itself as part of the user-facing assistant experience.

### Make The Overlay Click-Through By Default

The overlay is supposed to guide, not intercept.

That means the default runtime should not block the user from opening apps, clicking windows, or using the desktop. Any real controls should live in a separate popup/window, or the app has to temporarily opt into interaction for a very specific reason.

This is why the settings popup can still block clicks inside its rectangle. It is a real interactive surface. The overlay itself should not behave that way.

### Move Debug Out Of The Product Layer

Debug UI is necessary, but it is not product UI.

The debug window now carries:

- fixture controls
- capture state
- calibration readouts
- validation issues
- screenshot preview

That makes QA possible without making the normal user experience look broken.

### Treat The Puck As The Product

The puck is not decoration. It is the default visible assistant object.

That means the puck has to be judged more strictly than a normal button:

- position matters
- silhouette matters
- opacity matters
- motion matters
- whether it feels attached to the cursor matters

Step 8.7 improved the baseline, but the full liquid cinematic version is still a later rendering phase.

### Keep Geometry Testable

Cursor math should not be buried inside a React component forever.

Step 8.8 started extracting geometry into `overlayGeometry.ts` so these questions become easier to verify:

- where does the puck sit relative to the OS cursor?
- does the puck stay on screen?
- what happens near the screen edge?
- how does target guidance compute its travel vector?
- what happens with tiny viewports or invalid coordinates?

## Known Issues Left

### 1. Step 8.8 Is Partially Applied

The coordinate helper file exists, and `App.tsx` has been updated, but verification was interrupted.

This should not be treated as done until typecheck or an equivalent verification passes.

### 2. Settings Is Still A Real Focused Window

When visible, settings blocks its own rectangle. That is normal for an interactive popup, but the product goal is stricter: TouchPilot should feel almost never-present.

The likely direction is:

- keep settings short-lived
- close on blur
- open from tray/menu
- never show it as part of default runtime

### 3. Puck Is Still CSS-Driven

The puck is better, but not yet the cinematic liquid cursor-shadow system the user wants.

CSS is good for proving:

- size
- placement
- basic silhouette
- simple activation grammar

CSS is weaker for:

- liquid breakup
- fluid droplet merging
- cinematic pointer-following
- organic motion
- high-end material effects

### 4. DPI And Multi-Monitor Mapping Need Deeper QA

OS cursor polling works, but coordinate correctness across DPI scale and multiple displays is not deeply verified yet.

That needs real runtime QA, not just TypeScript checks.

### 5. Automated Runtime QA Does Not Exist Yet

Right now, window behavior is mostly manual/probe-based.

We still need automated or semi-automated checks for:

- click-through behavior
- window flags
- screenshot capture
- puck position
- settings/debug visibility
- target cue alignment

## Operating Lessons From This Phase

Phase 8 also exposed workflow problems.

The important operating rules now are:

- if a command fails once, do not repeat the same command pattern
- switch to the next best method or stop and report the exact error
- do not loop on fragile PowerShell quoting
- avoid broad file reads during narrow steps
- patch only scoped files
- run one appropriate verification command
- commit only current-step files
- do not stage unrelated dirty docs or partial work

These rules were saved separately in:

```text
C:\Users\Pumba\codex\touchpilot\operating-rules.md
```

## What We Learned From Clicky

Clicky behaves more like a menu-bar/tray assistant than a dock-style app.

That means:

- the main product should not be a permanent window
- settings should feel like a small popover
- the cursor/puck behavior is the main experience
- debug UI should never appear in normal usage
- app chrome should be almost invisible

The user-facing mistake was treating the overlay like a mini app. The corrected direction is to make TouchPilot feel like a desktop layer.

## Why The Top Strip Was Confusing

The screenshot showed a top strip that looked like TouchPilot was drawing an ugly title/app panel.

Runtime probing suggested a different explanation:

- hit-testing top-screen points resolved to the underlying app/window
- those points did not resolve to TouchPilot
- because the overlay is transparent, underlying window chrome can show through

Plain English: what looked like TouchPilot's panel may have been the app underneath showing through the transparent overlay.

Still, the visual complaint is valid. Even if the strip is not TouchPilot receiving clicks, the final product should not create a confusing visual frame. Runtime QA still needs to verify this carefully.

## Tradeoffs Discovered

### Build From Scratch vs Use Clicky As A Base

Using Clicky as a base would be faster for copying behavior, but it would also inherit platform, ownership, licensing, and architecture constraints.

The better direction for TouchPilot is to learn from Clicky's product shape while building our own cross-platform architecture.

Tradeoff:

- Clicky base: faster early imitation, less control
- own architecture: slower early work, better long-term control across Windows/macOS/Linux

### Tauri Overlay vs Native Platform App

Tauri gives a cross-platform desktop shell, which matches the user's no-Swift requirement.

The cost is that platform-specific overlay behavior still needs native handling:

- Windows HWND flags
- macOS panel/menu-bar behavior
- Linux window manager differences

Tradeoff:

- Tauri: cross-platform base, web UI velocity
- fully native apps: better platform-native overlay behavior, much more implementation work

### Overlay UI vs Separate Settings/Debug Windows

Keeping everything in the overlay is convenient for development, but it makes the product look broken.

Splitting surfaces is more correct:

- overlay is invisible/cursor-first
- settings is temporary
- debug is internal

Tradeoff:

- one overlay: easier to build, worse product feel
- split surfaces: more wiring, much cleaner user experience

### CSS Puck vs Three.js/R3F/Spline/Theatre

CSS is the right baseline for Step 8.7 because it is fast, small, and easy to keep click-through.

But the final liquid cursor-shadow idea may need a stronger renderer.

Options:

- CSS: simple, low overhead, good for baseline
- Three.js/R3F: best for real-time liquid/material control in the app
- Spline: good for authored visuals, less ideal for deep runtime behavior
- Theatre.js: useful for choreographing animations, not a renderer by itself
- Threlte: strong if using Svelte, not a match for this React/Tauri app

Tradeoff:

- CSS now: lower risk, less cinematic
- R3F/Three later: higher visual ceiling, more performance and integration work

### Click-Through Overlay vs Interactive Controls

A click-through overlay cannot also behave like a normal clickable control surface at the same time.

That means product controls must be designed carefully:

- overlay stays click-through
- settings/debug are separate windows
- any interactive overlay mode must be temporary and explicit

Tradeoff:

- always click-through: best desktop respect, fewer direct controls
- interactive overlay: easier controls, higher risk of blocking the user's desktop

### Typecheck vs Full Build

Typecheck is fast and catches TypeScript mistakes.

Full desktop build catches packaging/native issues, but it is much slower on this machine and can waste time during narrow UI steps.

Tradeoff:

- typecheck: fast step verification
- full build: better release confidence, slower and more fragile

The better rule is:

- use typecheck for narrow UI/code steps
- use full build during dedicated runtime QA or release checks

### Manual Visual Review vs Automated Checks

Build tools cannot judge whether the app feels premium.

Manual visual review is still required for:

- Clicky-like feel
- puck taste
- overlay invisibility
- whether settings look like a popup or an app

Automated QA is still needed for:

- coordinate math
- click-through behavior
- window flags
- screenshot capture
- regression checks

Tradeoff:

- manual review catches taste problems
- automated checks catch repeatable correctness problems

Both are needed.

### Moving Fast vs Over-Verifying Every Step

This phase showed that over-verifying a narrow step can waste time if the verification tooling is slow or repeatedly interrupted.

The better approach is:

- one targeted verification command
- if it fails, stop or switch method
- do not loop
- keep broad checks for dedicated QA steps

Tradeoff:

- verify every tiny step deeply: safer, but slow and frustrating
- use scoped verification: faster, but requires a later QA pass

For this project, scoped verification plus dedicated QA phases is the better workflow.

## Updates

- 2026-06-13 - Rewrote this Phase 8 doc to remove duplicate older monochrome-reset notes and reflect the current cursor-first runtime reset plan. Added completed steps 8.1 through 8.7, marked 8.8 as in progress, listed pending 8.9 through 8.11, and added the discovered product/engineering tradeoffs.
