# Visual Acceptance

Toki should feel like a cursor-native assistant, not a normal app window sitting on top of the desktop.

This document is the visual gate for Phase 8 and every later overlay change. Phase 14 refreshes it for the current Mac-first Toki runtime. If the running app violates this file, the implementation is not ready even if TypeScript, Rust, and packaging checks pass.

## References

- Clicky repository: https://github.com/farzaa/clicky
- Clicky README raw source: https://raw.githubusercontent.com/farzaa/clicky/main/README.md
- Clicky demo GIF in repository: https://github.com/farzaa/clicky/blob/main/clicky-demo.gif
- User-provided visual reference: https://www.youtube.com/watch?v=ZX9A31WoBEs
- User-provided close-puck reference: https://www.youtube.com/watch?v=ajIO6p7pR6M

The Clicky README describes the product as an AI teacher that lives next to the cursor, appears in the macOS menu bar rather than the dock, and uses one small control panel plus one fullscreen transparent cursor overlay. Toki should borrow that product shape while staying cross-platform.

## Product Shape

The default runtime must be:

```text
system tray/menu presence
  -> optional small settings popup
  -> invisible fullscreen overlay
  -> tiny cursor-adjacent puck
  -> target cues only when guiding
```

It must not be:

```text
taskbar app
  -> large titled window
  -> dashboard panels
  -> debug metadata
  -> permanent guidance card
```

## Hard Fail Rules

Any one of these is enough to fail visual acceptance.

1. A visible titlebar says `Toki`, `Toki Overlay`, or any app/window label in the normal runtime.
2. The default runtime shows a permanent panel, dashboard, debug surface, or bottom-right card.
3. The overlay blocks normal desktop clicks outside intentional controls.
4. The overlay appears as a normal app window in the taskbar/dock/app switcher.
5. Debug capture preview, display metadata, schema state, risk state, or QA buttons appear in the normal user-facing overlay.
6. The settings surface opens as a normal app-like window instead of a small intentional popup.
7. The puck looks like a floating badge or large ghost circle rather than a tiny cursor-shadow assistant.
8. The visual language relies on loud color accents in normal runtime.
9. Guidance cues cover the target control without a clear reason.
10. Motion distracts from the user's active app or hides readable content.
11. The puck sits far enough from the cursor that it looks detached or gets lost near the Dock, menu bar, or screen edges.
12. A workflow cue expands into a dashboard-like surface instead of a compact current-step instruction.
13. A safety/confirmation state looks like ordinary safe guidance.

## Pass Rules

The visual layer passes only when all of these are true.

1. On launch, the screen looks like the normal desktop plus a tiny cursor-adjacent assistant presence.
2. Toki adds no visible titlebar, app-name strip, or native window chrome to the overlay.
3. The default overlay is visually quiet and click-through.
4. The puck is small, white/monochrome, cursor-shadow shaped, and close enough to the pointer that it reads as attached.
5. The settings popup is hidden by default and appears only when intentionally opened.
6. The settings popup is compact, chrome-free, and closes quickly through blur or Escape behavior.
7. Debug tooling is available only in a separate dev/debug surface.
8. Target guidance is minimal: ring, cue, or short step hint only when needed.
9. The app still works if the user never opens settings.
10. Runtime QA can prove the native window state, and screenshot QA can prove the visual state.
11. Workflow guidance shows only the current step, immediate controls, and any required safety state.
12. Target rings are visible enough to guide but subtle enough to avoid looking like a mock/debug marker.

## Phase 14 Visual Priorities

Phase 14 should improve these areas in order:

1. Keep the puck very close to the real cursor and prevent edge loss.
2. Make workflow/guidance cues compact, readable, and clearly non-dashboard.
3. Make target rings feel intentional instead of mock-like.
4. Keep settings menu-bar-like and understandable without adding a full app surface.
5. Make Debug easier to inspect without changing the default runtime.
6. Consider WebGL/R3F only after the CSS fallback is clearly insufficient.

## Surface Responsibilities

### Overlay Window

The overlay window owns only user-facing guidance visuals.

Allowed:

- tiny puck
- target ring
- target cue path
- minimal step cue
- compact workflow current-step cue
- compact safety/confirmation cue
- confirmation cue only when required

Not allowed:

- debug panel
- capture preview
- schema metadata
- risk/confidence readouts
- permanent settings controls
- titlebar or app-name strip
- general dashboard layout

### Settings Window

The settings window is a temporary control popup.

Allowed:

- assistant active/idle state
- push-to-talk hint
- pause/resume
- open debug/dev window
- quit
- simple visual preferences later
- simple camera/gesture state only when useful

Not allowed:

- capture preview
- full QA dashboard
- large onboarding content
- permanent placement on the desktop
- normal app chrome
- large control grids
- unclear toggle rows without a user-facing purpose

### Debug Window

The debug window is internal tooling.

Allowed:

- screenshot preview
- capture metadata
- display metadata
- schema validation results
- guidance fixture controls
- risk/confidence/confirmation state
- runtime QA buttons
- workflow plan and verification state
- provider/candidate details

Not allowed:

- opening automatically in normal runtime
- being confused with the product UI
- controlling the default visual impression
- forcing the normal overlay to show internal metadata

## Runtime Visual Checklist

Use this checklist before closing any visual phase.

```text
[ ] launch the release or dev app
[ ] confirm no `Toki Overlay` strip is visible
[ ] confirm no titlebar/app-name text is visible from Toki
[ ] confirm no debug panel is visible
[ ] confirm no bottom-right guidance card is visible
[ ] confirm puck is tiny and very close to the cursor
[ ] confirm puck does not get lost near the Dock, menu bar, or screen corners
[ ] confirm desktop remains clickable through overlay
[ ] open settings from tray/hotkey
[ ] confirm settings appears as compact popup
[ ] confirm settings has no native titlebar
[ ] close settings with Escape
[ ] confirm settings closes when focus is lost
[ ] open debug surface intentionally
[ ] confirm debug tools are not part of default runtime
[ ] trigger workflow guidance
[ ] confirm workflow cue stays compact
[ ] confirm target ring does not cover the intended click target
[ ] trigger confirmation-required guidance
[ ] confirm the cue clearly asks for confirmation before normal progression
```

## Native Runtime Checklist

The Windows runtime probe should verify this native state.

```text
overlay window:
  Caption: false
  SysMenu: false
  ThickFrame: false
  Layered: true
  TransparentInput: true
  ToolWindow: true
  AppWindow: false
  Focusable: false

settings window:
  Caption: false
  SysMenu: false
  ThickFrame: false
  ToolWindow: true
  AppWindow: false
```

Hit-testing should show the underlying app receives clicks outside intentional Toki controls.

## Puck Baseline

Phase 8 does not need the final cinematic liquid puck, but it does need a believable baseline.

Required now:

- tiny shape
- white/monochrome material
- cursor-shadow silhouette
- no large halo by default
- follows the OS cursor while the overlay is click-through
- remains close to the cursor on all normal screen positions
- shifts/flips around edges instead of disappearing or feeling detached
- reduced-motion fallback

Deferred:

- WebGL/react-three-fiber liquid simulation
- cinematic droplet split/merge
- water-like refraction
- target-traveling liquid particles
- advanced gesture-reactive motion

## Screenshot QA

The visual screenshot check should fail if it detects:

- `Toki Overlay`
- visible native titlebar from Toki
- visible app-like dashboard
- debug panel in normal runtime
- capture preview in normal runtime
- large bottom guidance card in normal runtime

This check is not a replacement for manual taste review, but it catches the worst regressions.

## Design Decision

The product should optimize for this sentence:

> Toki is the tiny assistant next to the cursor, not an app window on the screen.

That is the Phase 8 visual acceptance bar.
