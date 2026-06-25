# Phase 4 Real Screen Capture

Phase 4 replaces the typed screenshot placeholder with a Windows-first real screen capture implementation. The goal is to return actual screenshot pixels through the existing native command boundary while preserving the capture metadata and calibration path created in Phase 3.

## Goal

Build the first real screenshot capture path:

1. choose a Windows-first capture dependency,
2. capture the primary/current display,
3. encode the screenshot as PNG,
4. return base64 image data through `capture_screenshot`,
5. expose image dimensions and byte length in the debug panel,
6. keep capture errors visible and non-fatal,
7. document scaling and coordinate assumptions.

## Why This Phase Matters

Toki cannot guide the user visually without seeing the screen. The overlay already knows how to mark a target, and Phase 3 added capture contracts. Phase 4 starts feeding real pixels into that pipeline.

The eventual flow is:

```text
capture real screenshot
  -> send screenshot to AI model
  -> model returns target coordinates
  -> overlay draws pointer and step bubble
```

Phase 4 only builds the first part of that flow.

## Non-Goals

This phase should not add:

- AI model calls,
- OCR,
- accessibility tree extraction,
- gesture control,
- voice control,
- multi-step workflows,
- automated clicking,
- production privacy screens.

Those depend on a reliable capture foundation.

## Preferred Implementation Shape

The capture crate should expose a function with this kind of shape:

```rust
pub fn capture_primary_display() -> Result<ScreenshotCapture, CaptureError>
```

The Tauri command should stay thin:

```rust
#[tauri::command]
fn capture_screenshot() -> Result<ScreenshotCapture, String>
```

The UI should not know which crate or OS API produced the image. It should only receive the shared capture payload shape.

## Dependency Criteria

The first capture dependency should be:

- usable from Rust,
- compatible with Windows,
- simple enough for a first implementation,
- able to capture monitor pixels,
- able to provide or infer image dimensions,
- not tightly coupled to one UI framework.

Possible approaches:

- a Rust screenshot crate for fast first integration,
- Windows Graphics Capture later for a more native implementation,
- platform-specific modules once macOS/Linux support is added.

## Payload Requirements

The real `capture_screenshot` payload should return:

```json
{
  "source": "active_display",
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
  "capturedAt": "2026-06-01T00:00:00.000Z",
  "format": "png",
  "byteLength": 123456,
  "imageWidth": 1920,
  "imageHeight": 1080,
  "imageBase64": "..."
}
```

Metadata can still be partial if the first dependency does not expose active-window or cursor data. It is better to return accurate screenshot dimensions than fake extra context.

## Debug UI Requirements

The debug panel should show:

- screenshot format,
- image width,
- image height,
- byte length,
- whether image data is present,
- latest capture error if capture fails.

A tiny screenshot preview is optional. If added, it should be small and explicitly marked as debug-only.

## Error Handling

Capture failures should not crash the app.

Expected errors:

- no display available,
- capture permission blocked,
- encoder failure,
- unsupported platform behavior,
- dependency-specific capture failure.

The UI should show a short capture status and keep the overlay usable.

## Coordinate Calibration

After real screenshot capture lands, compare:

```text
overlay width/height
screenshot image width/height
display metadata width/height
scale factor
```

If screenshot dimensions differ from overlay dimensions, the calibration status should be `needs_check` until we define the conversion.

## Done Criteria

Phase 4 is complete when:

- the capture crate can produce a real PNG screenshot payload on Windows,
- the Tauri `capture_screenshot` command returns real image data or a clean error,
- the debug panel can trigger screenshot capture,
- the debug panel shows screenshot dimensions and byte length,
- capture failures are displayed without crashing,
- `npm run check` passes,
- `npm run desktop:build` passes,
- Phase 4 docs and learning notes are saved.

## Suggested Step Order

1. Define this implementation spec.
2. Add a Windows-first capture dependency.
3. Implement capture and PNG/base64 encoding in the capture crate.
4. Return real screenshot payload from Tauri.
5. Show screenshot dimensions and byte length in the debug panel.
6. Add optional preview/debug state.
7. Improve metadata accuracy where available.
8. Add capture error handling.
9. Verify full build and packaging.
10. Document completion and deeplearn.
