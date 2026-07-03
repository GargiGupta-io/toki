# Phase 14 Manual Visual QA

This is the manual acceptance checklist for Phase 14 visual polish.

Automated checks can catch broken reduced-motion coverage or native window state, but they cannot judge whether Toki feels like a small cursor companion. This checklist is the human product-feel gate.

## Command

```bash
npm run qa:visual:manual
```

The command prints the checklist below. It does not launch the app or click through your desktop.

## Setup

1. Open a realistic browser/dashboard screen.
2. Start Toki:

```bash
npm run desktop:dev
```

3. Keep Debug closed at first.

## Checks

### Default Runtime

- No Toki window, titlebar, or app panel is visible.
- Desktop/browser remains clickable through the overlay.
- Puck stays close to the real cursor.
- Puck does not get lost near the menu bar, Dock, corners, or screen edges.

### Settings/Menu Panel

- Settings opens from the menu bar icon.
- Settings appears as a compact utility popup.
- Close works.
- Drag/move behavior works if the panel is visible.
- Push-to-talk copy is understandable.

### Guidance Target

- Trigger a known mock or real target from Debug.
- Target ring sits on the actual target box.
- Target ring is visible but does not cover the click.
- Step cue stays compact and cursor-adjacent.

### Workflow

- Start a mock workflow from Debug.
- Current-step cue shows only the active step.
- Back/Next/Stop are usable and not visually heavy.
- Confirmation-required step looks distinct from safe guidance.

### Debug

- Debug opens only intentionally.
- Tabs are easy to scan.
- Long sections scroll.
- Debug does not resemble the user-facing product.

### Reduced Motion

- Run `npm run qa:visual:motion`.
- If macOS Reduce Motion is enabled, decorative puck/target animation is quiet.

## Pass Rule

Toki should feel like a tiny cursor companion, not a dashboard or app window.

## Fail Rule

If the default runtime shows panels, app chrome, detached puck behavior, or mock-looking guidance, Phase 14 is not ready to close.
