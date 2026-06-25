# Phase 4 Real Screen Capture Completion

Phase 4 replaced the screenshot placeholder with a Windows-first real screen capture path. Toki can now capture real pixels, encode them as PNG/base64, return them through the Tauri command boundary, and show screenshot metadata plus a debug preview in the overlay panel.

## What Exists Now

- Phase 4 real capture spec in `docs/phase-4-real-screen-capture.md`.
- Capture dependencies in `crates/capture`:
  - `screenshots`
  - `image`
  - `base64`
  - `chrono`
- Real `capture_primary_display()` implementation.
- Real `capture_primary_display_metadata()` implementation.
- Tauri `capture_screenshot` command returning real screenshot payloads.
- Tauri `capture_metadata` command returning real display dimensions.
- Debug panel screenshot metadata:
  - format,
  - image width,
  - image height,
  - byte length,
  - image-data presence.
- Debug-only screenshot preview.
- Capture status and error display.

## Verification

These commands passed:

```text
npm run check
npm --workspace @toki/desktop run build
npm run desktop:build
```

The full native Tauri build produced:

```text
target/release/toki-desktop.exe
target/release/bundle/msi/Toki_0.1.0_x64_en-US.msi
target/release/bundle/nsis/Toki_0.1.0_x64-setup.exe
```

The release build took around 13m 48s after frontend build on the verification run.

## Current Capture Behavior

The overlay debug panel triggers:

```text
capture_metadata
capture_screenshot
```

The metadata command returns real display ID, width, height, scale factor, and timestamp where available. Cursor and active-window fields are still intentionally left empty until reliable APIs are added.

The screenshot command captures the primary display, encodes it as PNG, base64-encodes the PNG bytes, and returns the full payload to the frontend.

## Important Technical Decisions

1. Use `screenshots` as the first Windows-capable capture dependency.
   - It is fast to integrate and returns monitor image data directly.

2. Encode PNG inside the capture crate.
   - The frontend receives stable base64 data instead of native image buffers.

3. Keep cursor and active-window data unset for now.
   - Returning no data is better than pretending placeholder values are real.

4. Keep the preview debug-only.
   - The production overlay should not show screenshots unless explicitly needed.

5. Keep capture errors non-fatal.
   - Capture failure updates UI status instead of crashing the app.

## Phase 5 Entry Point

Phase 5 should focus on AI guidance loop foundations:

1. add AI provider/client package shape,
2. define structured guidance request/response schemas,
3. send screenshot payload and user prompt to a model gateway or local mock,
4. validate returned target coordinates,
5. feed model target into the existing pointer ring and step bubble,
6. keep safety/risk fields required in the response.

The main technical risk for Phase 5 is making model output reliable and schema-valid enough to drive overlay coordinates.
