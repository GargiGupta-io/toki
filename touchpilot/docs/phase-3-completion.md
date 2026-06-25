# Phase 3 Screen Capture Foundation Completion

Phase 3 created the first capture and coordinate-calibration foundation for Toki. It does not yet capture real screen pixels, but the native and UI boundaries now exist for capture metadata and screenshot payloads.

## What Exists Now

- Phase 3 capture requirements in `docs/phase-3-screen-capture.md`.
- Shared TypeScript capture contracts in `packages/shared`.
- Rust capture metadata models in `crates/capture`.
- Tauri `capture_metadata` command.
- Tauri `capture_screenshot` placeholder command.
- Debug panel display for capture metadata.
- Manual capture refresh control.
- Coordinate calibration readout comparing overlay size and display metadata.

## Verification

These commands passed:

```text
npm run check
npm --workspace @toki/desktop run build
npm run desktop:build
```

The full Tauri build produced:

```text
target/release/toki-desktop.exe
target/release/bundle/msi/Toki_0.1.0_x64_en-US.msi
target/release/bundle/nsis/Toki_0.1.0_x64-setup.exe
```

## Current Capture Behavior

The desktop app calls the native `capture_metadata` command on load and when the user clicks `Refresh capture`.

Current command output is placeholder metadata:

- source: active display,
- display: primary 1180 x 760,
- scale factor: 1,
- cursor: 640, 360,
- active window: Toki,
- captured at: placeholder.

The `capture_screenshot` command returns a typed placeholder screenshot payload with empty `imageBase64`.

## Important Technical Decisions

1. Metadata boundary first, real pixels later.
   - This keeps the app/UI contract stable before adding platform-specific capture libraries.

2. Capture models exist in both TypeScript and Rust.
   - This lets the desktop app and native command boundary stay aligned.

3. Calibration is visible in the debug panel.
   - Coordinate mismatches should be visible early, not discovered after AI target output is connected.

4. Screenshot payload is typed even before implementation.
   - Future real screenshot capture can replace internals without changing the UI/API contract.

## Phase 4 Entry Point

Phase 4 should focus on real screen capture implementation:

1. choose the first Windows capture library or API,
2. return actual display dimensions,
3. return actual cursor position if possible,
4. produce a real screenshot payload,
5. show screenshot dimensions and byte length in debug UI,
6. compare real screenshot dimensions against overlay dimensions,
7. document platform-specific behavior.

The main technical risk for Phase 4 is platform-specific capture behavior, especially display scale and multi-monitor coordinates.
