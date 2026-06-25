# Phase 3 Screen Capture And Coordinate Calibration

Phase 3 connects the overlay prototype to the first screen-capture foundation. The goal is not full AI guidance yet. The goal is to collect reliable screen metadata and prepare the coordinate system that future model outputs will depend on.

## Goal

Build the first capture pathway:

1. define shared capture contracts,
2. expose a Tauri command for capture metadata,
3. show capture metadata in the debug panel,
4. prepare a screenshot capture path,
5. begin coordinate calibration between capture pixels and overlay coordinates.

## Why This Phase Matters

The assistant will eventually receive a screenshot, send it to a multimodal model, and draw the returned target on the overlay. That only works if these coordinate systems line up:

```text
physical display
  -> screenshot pixels
  -> model target coordinates
  -> overlay CSS coordinates
```

If any conversion is wrong, Toki will point to the wrong place even if the AI chooses the right element.

## Phase 3 Non-Goals

This phase should not add:

- AI calls,
- OCR,
- accessibility APIs,
- camera gestures,
- voice mode,
- full workflow planning,
- click automation.

Those depend on reliable screen and coordinate data.

## Capture Context Contract

The app should move toward this shape:

```json
{
  "display": {
    "id": "primary",
    "width": 1920,
    "height": 1080,
    "scaleFactor": 1
  },
  "cursor": {
    "x": 640,
    "y": 360
  },
  "activeWindow": {
    "title": "Toki",
    "appName": "Toki"
  },
  "capturedAt": "2026-05-31T00:00:00.000Z"
}
```

Screenshot image data can be added after metadata is reliable.

## Platform Notes

### Windows

Windows is the current development target. Phase 3 should prioritize getting display metadata and screenshot behavior working here first.

Risks:

- display scaling,
- multi-monitor offsets,
- protected windows,
- permission differences for elevated windows.

### macOS

macOS requires screen recording permissions. The app will need a proper permission flow later.

Risks:

- permission denial,
- retina scaling,
- active window metadata limitations.

### Linux

Linux capture depends heavily on desktop environment and Wayland/X11 behavior.

Risks:

- black screenshots on Wayland,
- portal requirements,
- inconsistent active-window APIs.

## Debug Panel Requirements

The debug panel should eventually show:

- display width,
- display height,
- scale factor,
- cursor x/y,
- active window title,
- capture timestamp,
- overlay target x/y,
- calibration status.

Phase 3 can start with mock or metadata-only values if screenshot capture needs more native work.

## Coordinate Calibration

The target ring already renders from explicit values:

```text
x: 640
y: 360
width: 112
height: 48
```

Phase 3 should compare those overlay coordinates against display metadata and future screenshot dimensions.

Questions to answer:

1. Does CSS pixel width match display logical width?
2. Does the overlay origin match the captured display origin?
3. Does high-DPI scaling change the screenshot dimensions?
4. How do multi-monitor offsets appear?

## Done Criteria

Phase 3 is complete when:

- shared capture contracts exist,
- Rust capture model types exist,
- desktop app can call a capture metadata command,
- debug panel displays capture metadata,
- capture trigger exists in the UI,
- coordinate calibration assumptions are documented,
- `npm run check` passes,
- desktop frontend build passes,
- Phase 3 completion and learning docs are saved.

## Suggested Step Order

1. Define this requirements doc.
2. Add capture contracts to `packages/shared`.
3. Add Rust types to `crates/capture`.
4. Expose a Tauri command for capture metadata.
5. Show capture metadata in the debug panel.
6. Add a capture trigger button.
7. Add screenshot capture placeholder or first implementation.
8. Add calibration notes/readout.
9. Verify checks/build.
10. Document completion and deeplearn.
