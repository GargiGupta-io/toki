# TouchPilot Phase 4 Real Screen Capture

> Phase 4 gave TouchPilot real screen pixels: the app can capture the primary display, encode it as PNG/base64, return it through Tauri, and show screenshot metadata plus a debug preview in the overlay.

---

## In Plain English

Before this phase, TouchPilot had a screenshot command, but it returned fake image data. Phase 4 changed that. The app can now ask the native Rust side to capture the screen and return a real image.

This matters because the entire product depends on seeing what the user sees. The AI will eventually inspect the screenshot and decide where to point. Without real capture, the overlay is just a visual shell. With real capture, TouchPilot now has the first real input it needs for screen understanding.

The current capture is still early. It captures the primary display and shows debug metadata and a tiny preview. It does not yet handle every monitor, cursor position, app window, privacy flow, or AI call. But the hardest boundary is now real: pixels can move from the operating system into the app.

---

## What Was Built

### Phase 4 Requirements Doc

Plain English: We wrote down what real capture needed to do before adding native dependencies.

File:

```text
touchpilot/docs/phase-4-real-screen-capture.md
```

It covers:

- implementation goal,
- non-goals,
- dependency criteria,
- payload requirements,
- debug UI requirements,
- error handling,
- calibration,
- done criteria.

Technical detail: The doc kept Phase 4 focused on real screenshot capture instead of drifting into AI, OCR, accessibility APIs, or workflow automation.

---

## Capture Dependencies

Plain English: The capture crate now has the tools needed to take a screenshot and turn it into a UI-safe image string.

File:

```text
touchpilot/crates/capture/Cargo.toml
```

Added dependencies:

```text
screenshots
image
base64
chrono
```

What each one does:

- `screenshots`: captures monitor pixels.
- `image`: encodes the captured pixels as PNG.
- `base64`: converts PNG bytes into a string that React can use in an image `src`.
- `chrono`: generates real timestamps.

Technical detail: The first optimized release build became much slower after these dependencies were added because image/capture dependencies pull in a larger native and encoding stack.

---

## Real Capture Function

Plain English: The capture crate can now grab the primary display.

Function:

```rust
pub fn capture_primary_display() -> Result<ScreenshotCapture, CaptureError>
```

What it does:

1. lists available screens,
2. selects the first screen,
3. captures the screen pixels,
4. converts the raw buffer into an image,
5. encodes the image as PNG,
6. base64-encodes the PNG,
7. returns a `ScreenshotCapture` payload.

Technical detail: The function lives in `touchpilot/crates/capture/src/lib.rs` and returns a typed result instead of panicking.

---

## Capture Error Type

Plain English: Capture can fail, so the app needs clear error messages.

Error cases:

- no display available,
- capture failed,
- invalid image buffer,
- PNG encoding failed,
- encoded image too large.

Technical detail: `CaptureError` implements `Display` and `Error`, which lets the Tauri command convert errors into clean frontend strings.

---

## Real Tauri Screenshot Command

Plain English: The frontend can now call a native command and receive a real screenshot payload.

Command:

```text
capture_screenshot
```

File:

```text
touchpilot/apps/desktop/src-tauri/src/lib.rs
```

Current shape:

```rust
#[tauri::command]
fn capture_screenshot() -> Result<ScreenshotCapture, String> {
    capture_primary_display().map_err(|error| error.to_string())
}
```

Technical detail: This keeps the Tauri command thin. The capture crate owns the capture logic, and the desktop app only exposes it to React.

---

## Real Display Metadata

Plain English: The metadata command now reports real display size where available.

Function:

```rust
pub fn capture_primary_display_metadata() -> Result<CaptureMetadata, CaptureError>
```

What changed:

- display ID is real,
- display width is real,
- display height is real,
- scale factor is real,
- timestamp is real.

What is still not real:

- cursor position,
- active window title,
- active app name.

Why:

It is better to return missing optional fields than to pretend fake values are real.

---

## Debug Panel Screenshot Metadata

Plain English: The overlay now shows whether screenshot capture is returning real image data.

The debug panel shows:

- screenshot dimensions,
- PNG byte length,
- image format,
- whether base64 image data is present.

Technical detail: React calls `capture_screenshot` and stores the returned `ScreenshotCapture` object in state.

---

## Debug Screenshot Preview

Plain English: The app shows a tiny preview of the latest captured screenshot.

Why this helps:

- confirms image data is real,
- helps detect black/blank captures,
- makes capture debugging immediate.

Technical detail: The image uses a data URL:

```text
data:image/png;base64,...
```

The preview is intentionally small and debug-only so it does not become part of the production guidance surface.

---

## Capture Status And Errors

Plain English: If capture fails, the app shows the user what happened.

The debug panel now shows:

- `Capture ready` when capture succeeds,
- `Capture error` with the error message when capture fails.

Technical detail: The UI catches errors from the Tauri invoke call, stores the message in state, and switches the overlay state to `error`.

---

## Verification

Plain English: The real capture implementation builds all the way to native installers.

Passed:

```text
npm run check
npm --workspace @touchpilot/desktop run build
npm run desktop:build
```

Native output:

```text
target/release/touchpilot-desktop.exe
target/release/bundle/msi/TouchPilot_0.1.0_x64_en-US.msi
target/release/bundle/nsis/TouchPilot_0.1.0_x64-setup.exe
```

The first release build timed out at 15 minutes, but the rerun with a longer timeout completed. The release build took around 13m 48s after frontend build.

---

## What Phase 4 Did Not Build

This phase intentionally did not add:

- AI model calls,
- OCR,
- accessibility APIs,
- real cursor tracking,
- real active-window tracking,
- multi-monitor selection,
- screen permission onboarding,
- privacy mode,
- screenshot storage controls.

Those should be handled in later phases.

---

## Key Lessons

### Real Pixels Are A Major Boundary

Plain English: Getting a real screenshot into the app is the first big step toward screen understanding.

Technical detail: Once the image is available as base64, future AI/model code can consume it without depending directly on native APIs.

### Keep Native Commands Thin

Plain English: The desktop command should pass data through, not own all the capture logic.

Technical detail: `capture_screenshot` calls into `touchpilot-capture`, which keeps the native app shell cleaner and makes the capture crate independently testable.

### Missing Data Is Better Than Fake Data

Plain English: If we do not know the cursor or active window yet, we should say unknown.

Technical detail: Optional fields should be `None` until reliable OS-specific APIs are added.

### Release Builds Can Be Slow After Native Dependencies

Plain English: Adding image and capture libraries made the first release build much slower.

Technical detail: The dependency tree includes image codecs and platform bindings that are expensive in optimized builds. CI time should be watched later.

---

## Phase 5 Preview

Plain English: Next, TouchPilot can start using screenshots for AI guidance.

Phase 5 should focus on:

1. AI provider/client structure,
2. guidance request schema,
3. guidance response schema,
4. local/mock model response first,
5. screenshot payload flowing into the request,
6. returned target coordinates feeding the pointer ring,
7. required risk and confirmation fields.

The main risk is trusting model output too quickly. The response must be schema-validated before it controls the overlay.

---

## Suggested Quiz Questions

1. Why does `capture_screenshot` return `Result<ScreenshotCapture, String>`?
2. What do `screenshots`, `image`, `base64`, and `chrono` each do?
3. Why is the screenshot preview debug-only?
4. Why are cursor and active-window fields still optional?
5. Why did the release build take much longer after Phase 4?

---

## Atomic Active-Window Snapshot Update

> Updated on 2026-07-10: live guidance now receives the active window, display metadata, screenshot pixels, and timing provenance from one native capture request.

### In Plain English

The original capture pipeline asked three separate questions:

1. Which window is active?
2. What is the display metadata?
3. What pixels are on the screen?

Those questions were asked one after another. If the user changed windows, moved a window, or an app animated between the calls, Toki could combine window bounds from one moment with pixels from another moment. The data could look individually valid while describing different screen states.

The new snapshot contract asks the native layer for one package. That package carries one ID and contains the selected window bounds, one screenshot, metadata derived from that exact screenshot, and timestamps that show how long the native transaction took. This does not freeze macOS, but it removes the larger application-level mistake of assembling unrelated capture calls in React.

### The Contract

The shared package now exports `ActiveWindowBounds` and `ActiveWindowCaptureSnapshot`.

The snapshot contains:

- `snapshotId`: one identity for the complete observation,
- `startedAtMs`: when the native request began,
- `windowObservedAtMs`: when the active window probe completed,
- `captureStartedAtMs`: when pixel capture began,
- `completedAtMs`: when the package was ready,
- `windowToCaptureDelayMs`: the measurable delay between window observation and capture start,
- `window`: app name, title, origin, width, and height,
- `metadata`: display/cursor/window context derived from the screenshot,
- `screenshot`: the exact encoded image used by guidance.

The important property is provenance. Later coordinate mapping can point to one snapshot ID and explain which bounds and pixels produced a target.

### Native Command

The Tauri layer now exposes:

```text
capture_active_window_snapshot
```

Its native sequence is:

```text
start transaction
  -> resolve the requested/frontmost content window
  -> record when the window was observed
  -> capture the primary display once
  -> attach the observed app/window identity
  -> derive metadata from that exact screenshot object
  -> return one snapshot package
```

The existing `capture_metadata`, `capture_screenshot`, and `frontmost_window_bounds` commands remain available. Debug tools and non-live fixture modes still use them where an atomic live target is not required. Keeping those commands avoids breaking Windows and older QA paths while the cross-platform active-window implementation continues to mature.

### Exact Metadata Derivation

Before this update, metadata and screenshot pixels were captured independently. They could have different timestamps or display observations.

The helper `metadata_from_screenshot` now copies these fields from the screenshot that will actually be sent onward:

- capture source,
- display context,
- cursor context,
- active-window context,
- capture timestamp.

This means `metadata.capturedAt` and `screenshot.capturedAt` describe the same capture. The display dimensions also come from the same object instead of a second display query.

### Live Guidance Integration

Live providers (`real` and `retired-local-vision-runtime-vision`) now invoke only `capture_active_window_snapshot` for their initial observation. React no longer independently joins window bounds, metadata, and screenshot pixels for these runs.

Mock and unavailable modes keep the older lightweight path. This is deliberate: fixture rendering does not need active-window atomicity, and keeping that path unchanged reduces the blast radius of this update.

The guidance trace records:

- snapshot ID,
- selected app name,
- window bounds,
- delay between window observation and capture start,
- total transaction duration,
- screenshot format, dimensions, and byte length.

These fields make timing drift visible during debugging instead of hiding it behind a generic capture result.

### What “Atomic” Means Here

Atomic does not mean macOS is frozen while Toki looks at it. The operating system and foreground app can still change during the native operation.

Atomic means the application receives one transaction result and cannot accidentally mix results from three unrelated frontend requests. The remaining native observation delay is measured and returned. If later QA shows that the delay is too large, the next improvement is a lower-level platform capture API that obtains window identity and pixels even closer together.

### Tradeoffs

**One larger native command versus reusable small calls**

The larger command is less composable, but it guarantees that live guidance receives a coherent package. The small commands remain for debug and compatibility.

**Whole-display pixels plus active-window bounds versus direct window capture**

The current screenshot still captures the display, then the frontend crops it using the returned bounds. This preserves the existing capture implementation and limits this step to provenance. Direct native window capture could reduce background exposure and timing drift, but it is a separate platform-specific change.

**Timing transparency versus pretending simultaneity**

The contract exposes delay fields rather than claiming the bounds and pixels were captured at the exact same instant. This makes later performance and accuracy work testable.

### Regression Test

The native layer includes a focused test named:

```text
snapshot_metadata_uses_the_exact_screenshot_context
```

It verifies that derived metadata preserves the screenshot's source, display identity, cursor, active app, and timestamp. This protects the central invariant if the capture structures change later.

### Verification

The update passed:

```text
npm --workspace @toki/shared run typecheck
cargo check -p toki-desktop
npm --workspace @toki/desktop run typecheck
npm --workspace @toki/desktop run build
cargo test -p toki-desktop --lib snapshot_metadata_uses_the_exact_screenshot_context
```

The running Tauri dev app also rebuilt and relaunched successfully with the new command registered.

### What Comes Next

The snapshot contract fixes provenance, not coordinate accuracy by itself. The next step must define and test the transforms between:

1. macOS logical window points,
2. full screenshot pixels,
3. cropped provider-image pixels,
4. model-returned target coordinates,
5. overlay logical points.

Those transforms can now be keyed to one snapshot instead of relying on observations taken at different times.

## Updates

- 2026-07-10 - Added the atomic active-window snapshot contract, screenshot-derived metadata invariant, timing provenance, live-guidance integration, compatibility boundaries, and regression-test notes.

---

*Generated: 2026-06-01 | Updated: 2026-07-10 | Project: TouchPilot/Toki | Phase: 4 Real Screen Capture*
