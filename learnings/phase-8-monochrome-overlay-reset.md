# Phase 8: Cursor-First Runtime Reset

> Phase 8 moved TouchPilot away from an app-like overlay and toward a Clicky-style cursor assistant: invisible by default, tray-controlled, separated into overlay/settings/debug surfaces, and verified with native Windows runtime probes.

---

## In Plain English

Phase 8 was not just a visual redesign. It became the phase where we corrected the basic product shape.

Before this phase, TouchPilot technically had an overlay, a puck, capture, guidance, and debug tools. But it looked and behaved like a normal app window sitting on top of the desktop. That was wrong for the product. The user should not feel like they opened a dashboard. They should feel like a small assistant is living near the cursor and only appears when useful.

The big lesson was that a cursor assistant has to split its surfaces:

- the overlay is only for the cursor/puck/target cues
- settings are a small tray-style popup
- debug tools live in their own window
- the normal runtime does not show panels, cards, or developer readouts

The second big lesson was Windows-specific. A transparent fullscreen Tauri window can still feel like an app window or create weird visual artifacts. The better Windows choice was to avoid Tauri fullscreen mode and instead use a monitor-sized borderless popup window with native Win32 styles.

## The Final Phase 8 Outcome

Phase 8 now has an accepted runtime direction:

- TouchPilot is tray-controlled.
- The user-facing overlay is click-through.
- The overlay has no visible TouchPilot title.
- The overlay is not a taskbar app.
- Settings and debug are separate windows.
- Settings is transient and compact.
- Debug tooling is internal only.
- The normal runtime is cursor-first.
- The current puck is only a CSS baseline.
- Final liquid/cinematic puck rendering is deferred to a later premium rendering phase.

## Why The Earlier Direction Felt Wrong

The original overlay combined too many roles in one surface.

It had:

- visible guidance panels
- debug readouts
- capture preview
- state buttons
- risk metadata
- settings-like controls
- a large puck
- bright prototype styling

That helped while building early phases, but it damaged the product feel. A normal user does not need to see capture metadata or schema state. A cursor assistant must stay quiet.

The problem was not only color. Even after shifting to a monochrome mac-like palette, the app still felt wrong because it was structurally wrong. It was still panel-first instead of cursor-first.

## Clicky Reference Decision

Clicky was used as the conceptual reference.

The key thing from Clicky is not the exact codebase. The key thing is the product structure:

```text
menu bar / tray utility
  -> small settings/control popup
  -> fullscreen transparent cursor overlay
  -> internal/debug tooling kept separate
```

On macOS, Clicky can lean on `NSPanel`, which is a native macOS window type designed for utility panels and overlays. It can float above apps, avoid normal Dock behavior, be borderless, and behave more like a system utility than a normal app.

On Windows, TouchPilot has to recreate that behavior through:

- Tauri windows
- transparent WebView2 surfaces
- no decorations
- skip taskbar
- native Win32 window style flags
- click-through hit testing
- tray menu control path

That is why Phase 8 became a Windows runtime architecture phase, not just styling.

## Final Step Summary

### 8.1 Visual Acceptance Spec

Plain English: we wrote down what good means before continuing.

Built:

- `touchpilot/docs/visual-acceptance.md`

Result:

- No visible `TouchPilot Overlay` titlebar is allowed.
- No permanent panels are allowed in default runtime.
- No debug UI is allowed in normal user mode.
- The default runtime must be cursor-first.
- Clicky-style surface separation became the pass/fail bar.

Commit:

```text
b1a2e32 docs: define visual acceptance gate
```

### 8.2 Runtime Surface Split

Plain English: the old mixed surface was split into separate jobs.

Built:

- `touchpilot/apps/desktop/src-tauri/tauri.conf.json`
- `touchpilot/apps/desktop/src-tauri/src/lib.rs`
- `touchpilot/apps/desktop/src-tauri/capabilities/default.json`
- `touchpilot/apps/desktop/src/App.tsx`
- `touchpilot/apps/desktop/src/App.css`

Result:

- Overlay window: cursor/puck/target cues only.
- Settings window: user controls.
- Debug window: internal QA/capture/schema state.
- Tray opens settings and debug intentionally.

Commit:

```text
85b23a1 refactor: split runtime surfaces
```

### 8.3 Overlay Native Chrome Cleanup

Plain English: TouchPilot stopped exposing app-window chrome where possible.

Built:

- blank titles in Tauri config
- runtime title blanking
- Windows HWND title text clearing
- no caption/border system styles
- skip-taskbar enforcement

Result:

- TouchPilot-created title text is no longer expected in the user runtime.
- Window chrome is treated as a Phase 8 failure.

Commit:

```text
cdc66ca fix: suppress overlay window chrome
```

### 8.4 Clicky-Style Settings Popup

Plain English: settings became a small temporary utility popup.

Built:

- smaller settings window
- less explanatory copy
- Escape-to-close
- focus-loss auto-hide
- no native titlebar

Result:

- Settings feels closer to a tray/menu utility.
- Settings no longer needs to be part of the overlay.

Commit:

```text
6e5ce51 fix: make settings popup transient
```

### 8.5 Separate Debug Window

Plain English: internal tools moved out of the user experience.

Built:

- debug-only window route
- capture metadata readout
- screenshot preview
- fixture switching
- overlay state controls
- validation issue display
- risk/confidence/confirmation details

Result:

- Debug is still powerful for us.
- Debug no longer leaks into normal user runtime.

Commit:

```text
9dd5c7f feat: expand debug window controls
```

### 8.6 Cursor-First Monochrome Runtime

Plain English: the overlay stopped behaving like a dashboard.

Built:

- removed old guidance card styling
- removed in-overlay debug panel styling
- removed risk/debug readouts from normal step cue
- kept only puck, target cue, and minimal instruction cue

Result:

- The default overlay is closer to cursor plus guidance.
- The product surface no longer looks like an internal tool.

Commit:

```text
c5b4072 refactor: make overlay cursor first
```

### 8.7 Puck Baseline Fix

Plain English: the CSS puck was made smaller and more cursor-shadow-like.

Built:

- extracted/adjusted cursor offset behavior
- reduced ghost-like halo
- tightened the puck near the cursor
- reduced droplet intensity
- kept CSS as fallback

Result:

- The puck now follows the cursor better.
- It still does not meet the final liquid/cinematic quality bar.

Commit:

```text
92718d9 style: refine cursor shadow puck
```

### 8.8 Cursor And Coordinate QA

Plain English: the cursor coordinate math became easier to reason about.

Built:

- `touchpilot/apps/desktop/src/overlayGeometry.ts`
- extracted puck coordinate geometry from `App.tsx`

Result:

- Cursor/puck geometry is no longer buried inline in the app component.
- Coordinate math can now be tested and refined separately.

Commit:

```text
f871c27 test cursor coordinate geometry
```

### 8.9 Runtime QA Script

Plain English: we added a native Windows probe to prove the invisible overlay behavior.

Built:

- `touchpilot/scripts/windows-runtime-qa.ps1`
- `npm run qa:windows:runtime`

Checks:

- overlay exists
- overlay covers monitor bounds
- overlay title is blank
- overlay has no caption/titlebar
- overlay has click-through style
- overlay is layered/transparent
- overlay is not a taskbar app
- settings has no native chrome
- hit-testing passes through overlay

Commit:

```text
efd28e1 test windows runtime overlay
```

### 8.10 Visual Screenshot QA

Plain English: we added a screen-level visual gate.

Built:

- `touchpilot/scripts/windows-visual-qa.ps1`
- `npm run qa:windows:visual`

Checks:

- screenshot captured
- no visible TouchPilot title text
- no visible settings/debug panel by default
- OCR forbidden text check if Tesseract is installed
- manual screenshot review fallback if OCR is unavailable

Commit:

```text
e812e8e test overlay visual acceptance
```

### 8.11 Faster Build Scripts

Plain English: we stopped relying on the slow full installer build for every check.

Built:

- `touchpilot/scripts/windows-tauri-build.ps1`
- `check:fast`
- `desktop:typecheck`
- `desktop:web:build`
- `desktop:build:windows`
- `desktop:release:exe`

Result:

- Faster verification paths exist.
- Windows release builds can use `CARGO_BUILD_JOBS=1`.
- Full installer packaging stays available for release checkpoints.

Commit:

```text
647a745 chore: add faster desktop build scripts
```

### 8.12 Checks And Option 1 Overlay Fix

Plain English: the final Windows runtime issue was fixed by avoiding fullscreen-window behavior.

The issue:

- Runtime QA passed.
- Visual QA passed.
- But the user still saw a simple blue bar when the overlay was active.
- The bar was not `TouchPilot Overlay` text anymore, but it still made the app feel like a visible app layer.

The better alternatives considered:

1. Replace fullscreen mode with a monitor-sized borderless popup.
2. Use a fully native Win32 overlay for the puck layer.
3. Use a small moving puck window for idle mode.
4. Move final cursor rendering to native tracking plus WebGL/Three.js.

Decision:

- Do Option 1 now.
- Keep Options 3 and 4 for later.
- Keep Option 2 as a fallback only if the lighter native window fix fails.

Built:

- `touchpilot/apps/desktop/src-tauri/tauri.conf.json`
- `touchpilot/apps/desktop/src-tauri/src/lib.rs`

Result:

- overlay no longer uses Tauri `fullscreen: true`
- Rust sizes the overlay to monitor bounds manually
- Windows style patch applies `WS_POPUP`
- overlay keeps layered/transparent input styles
- overlay keeps toolwindow/no-activate behavior
- settings remains interactive and separate

Commits:

```text
b2adf2f fix windows qa window filtering
31906f1 fix windows overlay popup mode
```

Accepted result:

- Option 1 worked.
- Runtime QA passed.
- Visual QA passed.
- The user accepted this as the correct Phase 8 overlay fix.

## Option 1: The Final Windows Overlay Method

Plain English: instead of asking Windows for a fullscreen app-like window, we create a borderless utility window that happens to cover the monitor.

That distinction matters. A fullscreen window can trigger OS/window-manager behavior that feels like an app is taking over. A monitor-sized popup window is closer to a utility overlay.

The final Windows overlay model is:

```text
not fullscreen mode
  -> set window bounds to monitor size
  -> remove caption/border/system menu
  -> use WS_POPUP
  -> use layered transparency
  -> use transparent input
  -> use toolwindow behavior
  -> avoid taskbar/app-window presence
```

In plain English, TouchPilot is now saying:

> Do not treat me like a fullscreen app. Treat me like a borderless invisible utility surface placed exactly over the monitor.

That is the closest practical Windows/Tauri equivalent to the Clicky-style overlay without jumping into a full custom native graphics layer.

## Why We Did Not Choose Option 2 Now

Option 2 was a fully native Win32 overlay for the puck layer.

That may become the best long-term rendering path, but it was too expensive for Phase 8.

It would require:

- custom native window creation
- native transparency management
- native hit testing
- native paint/render loop
- separate GPU or DirectComposition decisions
- bridging data back to the React/Tauri app
- separate macOS/Linux equivalents later

That is not a small Phase 8 fix. That is a native rendering architecture phase.

Option 1 solved the Windows overlay artifact while preserving the current Tauri/WebView renderer, so it was the right first move.

## Current Tradeoffs

### Tradeoff 1: Transparent Overlay Shows The Real Desktop

If the overlay is truly transparent, it shows whatever is underneath.

That is correct behavior. TouchPilot should not paint over the desktop just to hide another app's chrome, because that would make it less invisible.

The Phase 8 rule is:

- TouchPilot must not add its own chrome.
- TouchPilot does not erase other apps' chrome.

### Tradeoff 2: CSS Puck Is Still A Baseline

The current puck is better than before, but still CSS-driven.

CSS is useful because:

- it is simple
- it is cheap
- it works inside the current WebView
- it is good as fallback

CSS is limited because:

- it can look like a ghost/blob
- it cannot easily create believable liquid merging
- it struggles with cinematic material depth
- it can feel slightly laggy when tied to webview updates

The accepted decision:

- keep CSS as fallback
- build the final mesmerizing liquid puck later with native cursor tracking plus WebGL/Three.js

### Tradeoff 3: Cursor Tracking Works, But Is Not Final

The puck now follows the cursor.

But it is still not the final tracking architecture.

Current model:

- OS cursor position is polled
- WebView renders the puck
- CSS transforms animate the visible object

Better later model:

- native Rust/Win32 cursor polling
- stable coordinate events into overlay
- `requestAnimationFrame` rendering
- WebGL/Three.js puck surface

### Tradeoff 4: Runtime QA Is Stronger, But Not Complete

The new QA scripts are useful because they test Windows state directly.

They check actual HWND behavior, not just React or Tauri config.

Still missing:

- automated OCR unless Tesseract is installed
- cross-monitor matrix
- high-DPI matrix
- app-underlay visual scenarios
- automated puck-follow latency measurement

These belong in later QA/evaluation work.

## Final QA Results

After Option 1, the user ran:

```powershell
npm run qa:windows:runtime
npm run qa:windows:visual
```

Runtime QA passed:

- overlay exists
- overlay covers monitor bounds
- overlay title blank
- overlay no caption
- overlay click-through style
- overlay layered
- overlay not taskbar app
- settings title blank
- settings no caption
- settings not taskbar app
- overlay hit-test pass-through

Visual QA passed:

- screenshot captured
- no visible TouchPilot title text
- no visible settings/debug panel by default
- OCR skipped because Tesseract was not installed
- manual screenshot review still required when OCR is skipped

The user confirmed:

```text
the option 1 worked so okay
```

That is the acceptance point for the Phase 8 Windows overlay architecture.

## What Phase 8 Fixed

Phase 8 fixed:

- app-like overlay structure
- debug UI leaking into user runtime
- permanent guidance card behavior
- settings behaving like a normal panel
- TouchPilot-created window title/chrome exposure
- click-through uncertainty
- lack of runtime QA scripts
- lack of visual screenshot QA
- slow build workflow pain
- fullscreen-window artifact through Option 1

## What Phase 8 Did Not Fully Fix

Phase 8 did not fully build:

- final liquid/cinematic puck
- Three.js/WebGL renderer
- native high-frequency cursor tracking
- gesture activation
- voice activation
- real AI provider guidance
- OCR/accessibility targeting
- eval metrics harness
- full DPI/multi-monitor matrix

Those remain later phases.

## What We Would Do Differently If Restarting

### Start Cursor-First Earlier

We should have removed panels/debug surfaces earlier.

The project spent too long improving the look of a structure that was wrong. The correct structure was:

```text
overlay = cursor only
settings = popup
debug = separate tool
```

### Add Runtime QA Earlier

Flags like `decorations: false` are not enough.

The only reliable proof is a runtime probe that asks Windows what the window actually is:

- does it have caption bits?
- is it click-through?
- is it in the taskbar?
- who receives hit tests?
- what title does the OS see?

### Avoid Fullscreen Overlay Mode Earlier

The fullscreen mode created product-feel issues on Windows.

The better Windows model is monitor-sized popup mode:

```text
set bounds to monitor
use WS_POPUP
use layered transparency
use transparent input
use toolwindow/no-activate
```

### Do Not Rush The Liquid Puck In CSS

CSS can establish motion grammar, but not the final visual quality.

The final puck should be a separate rendering phase with:

- native cursor tracking
- animation frame loop
- WebGL/Three.js
- cursor-shaped mesh/material
- droplets that merge and separate physically

## Key Files

### Runtime And Native Windowing

- `touchpilot/apps/desktop/src-tauri/tauri.conf.json`
- `touchpilot/apps/desktop/src-tauri/src/lib.rs`

These define and prepare the overlay, settings, and debug windows.

### User And Debug Surfaces

- `touchpilot/apps/desktop/src/App.tsx`
- `touchpilot/apps/desktop/src/App.css`

These route the correct UI into each window label and keep the normal overlay cursor-first.

### Cursor Geometry

- `touchpilot/apps/desktop/src/overlayGeometry.ts`

This holds puck coordinate geometry instead of burying it inside the app component.

### QA Scripts

- `touchpilot/scripts/windows-runtime-qa.ps1`
- `touchpilot/scripts/windows-visual-qa.ps1`

These are the Windows-specific proof that the overlay is behaving like an invisible utility layer.

### Build Helper

- `touchpilot/scripts/windows-tauri-build.ps1`

This keeps Windows release checks from requiring full installer packaging every time.

## Quick Reference

### Terms

| Term | Plain English | Technical meaning |
| --- | --- | --- |
| Overlay | The invisible layer over the desktop | Transparent click-through Tauri/WebView window |
| Settings popup | Small user control panel | Separate hidden-by-default Tauri window |
| Debug window | Internal QA tool | Separate debug Tauri window |
| Desktop chrome | OS app-window decoration | titlebar, border, system menu, taskbar presence |
| Click-through | Clicks go to apps underneath | `WS_EX_TRANSPARENT` / ignore cursor events |
| Layered window | Window supports transparency | `WS_EX_LAYERED` |
| Tool window | Utility-style window | `WS_EX_TOOLWINDOW`, not taskbar app |
| Popup mode | Borderless monitor-sized utility window | `WS_POPUP` plus manual monitor bounds |

### Final Windows Overlay Pattern

```text
Tauri window config:
  transparent: true
  decorations: false
  skipTaskbar: true
  fullscreen: false
  focusable: false

Rust startup:
  blank title
  fit to monitor bounds
  ignore cursor events
  remove native chrome
  apply WS_POPUP
  apply WS_EX_LAYERED
  apply WS_EX_TRANSPARENT
  apply WS_EX_TOOLWINDOW
  avoid WS_EX_APPWINDOW
```

### QA Commands

```powershell
npm run desktop:typecheck
npm run rust:check
npm run desktop:web:build
npm run qa:windows:runtime
npm run qa:windows:visual
```

For a faster release executable check:

```powershell
npm run desktop:release:exe
```

For full Windows packaging when needed:

```powershell
npm run desktop:build:windows
```

## Suggested Quiz Questions

1. Why did Phase 8 split overlay, settings, and debug into separate windows?
2. Why was a monitor-sized `WS_POPUP` overlay better than Tauri fullscreen mode on Windows?
3. What does the runtime QA script prove that config flags alone cannot prove?
4. Why is the current CSS puck only a fallback and not the final visual system?
5. What is the difference between TouchPilot-created chrome and underlying app chrome?

---

## Updates

- 2026-06-13 - Consolidated duplicate Phase 8 notes, added the final Option 1 Windows overlay decision, recorded runtime/visual QA results, and clarified remaining tradeoffs for puck rendering, cursor tracking, and future native/WebGL work.
