# macOS Runtime QA

Toki is now tested primarily on macOS, so the runtime checks need to prove the app feels like a menu-bar utility with an invisible overlay, not a normal desktop app window.

## Run The App

From `toki`:

```bash
npm run desktop:dev
```

If the sandbox blocks localhost or GUI access, run it from a normal terminal.

## Runtime Probe

With Toki running:

```bash
npm run qa:mac:runtime
```

This checks that the app process is alive and, when macOS Accessibility allows it, lists the visible Toki windows.

If the script says System Events access failed, grant Accessibility permission to the terminal app and rerun. The script still leaves manual checks below as the final visual gate.

## Manual Accept Checks

The overlay passes when all of these are true:

- No visible `Toki Overlay` titlebar or app-name strip appears.
- The overlay does not show a full-screen colored panel.
- Apps under the overlay remain clickable.
- The puck follows the cursor while the overlay is passive.
- The settings popup opens intentionally from the menu bar/tray path.
- The settings popup can be dragged from its header.
- The settings close control hides the popup.
- Debug opens separately and is not part of default runtime.

## Manual Fail Checks

The overlay fails if any of these are true:

- A blue/native titlebar appears because Toki created it.
- Toki blocks clicks on the desktop while idle.
- The settings popup behaves like a stuck floating card instead of a movable utility panel.
- Debug or camera panels open by default.
- The puck disappears or stops following the cursor.

## Current Mac Shell Strategy

The overlay uses a monitor-sized borderless transparent window instead of native fullscreen. This keeps the Windows Phase 8 Option 1 fix and gives macOS the same product contract:

- borderless
- transparent
- always on top
- click-through
- not a taskbar/dock-style surface

The settings popup uses native Tauri window dragging instead of manual pointer-coordinate movement.
