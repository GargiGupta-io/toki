# TouchPilot Phase 3 Screen Capture Foundation

> Phase 3 built the first native capture boundary for TouchPilot: shared capture contracts, Rust metadata models, Tauri commands, debug panel metadata display, manual refresh, screenshot placeholder payloads, and coordinate calibration readouts.

---

## In Plain English

TouchPilot needs to look at the user’s screen before it can guide them. Phase 3 did not fully solve screen capture yet, but it created the pipes that capture data will flow through.

The app now has a native command that the React UI can call to ask, "What display are we looking at? What is the cursor position? What window is active?" Those values are placeholders for now, but the contract is real. That means the UI and native side already agree on the shape of capture data.

This phase also made coordinate calibration visible. That is important because the future AI model will return coordinates. If the screenshot and overlay do not use the same coordinate system, the assistant will point to the wrong place.

---

## What Was Built

### Phase 3 Requirements Doc

Plain English: We wrote down what screen capture needs to solve before coding deeper capture logic.

File:

```text
touchpilot/docs/phase-3-screen-capture.md
```

It defines:

- capture goals,
- non-goals,
- metadata contract,
- platform notes,
- debug panel requirements,
- calibration questions,
- done criteria.

Technical detail: The doc keeps Phase 3 focused on metadata and coordinate readiness, not AI, OCR, accessibility, voice, or automation.

---

## Shared TypeScript Capture Contracts

Plain English: The frontend now has clear names for capture data.

File:

```text
touchpilot/packages/shared/src/index.ts
```

Added concepts:

- `ScreenshotFormat`
- `CaptureSource`
- `CaptureMetadata`
- `ScreenshotMetadata`
- `ScreenshotCapture`
- `CalibrationStatus`
- `CoordinateCalibration`

Why this matters:

- The UI knows what a capture result looks like.
- Future AI/eval code can reuse the same types.
- The Rust command output has a TypeScript target to match.

Technical detail: These types extend the existing display, cursor, and active-window context types from Phase 1.

---

## Rust Capture Models

Plain English: The native side now has matching capture data structures.

Files:

```text
touchpilot/crates/capture/Cargo.toml
touchpilot/crates/capture/src/lib.rs
```

The capture crate now defines:

- `DisplayContext`
- `CursorContext`
- `ActiveWindowContext`
- `CaptureSource`
- `CaptureMetadata`
- `ScreenshotFormat`
- `ScreenshotCapture`
- `CalibrationStatus`
- `CoordinateCalibration`

Technical detail: The Rust models derive `Serialize` so Tauri can return them to the frontend as JSON-compatible values.

---

## Tauri Capture Metadata Command

Plain English: The frontend can now ask the native app for capture metadata.

File:

```text
touchpilot/apps/desktop/src-tauri/src/lib.rs
```

Command:

```text
capture_metadata
```

Current behavior:

- returns placeholder display metadata,
- returns placeholder cursor position,
- returns placeholder active window information,
- uses the Rust capture crate types.

Technical detail: The desktop crate links to `touchpilot-capture`, and the command is registered in Tauri’s `invoke_handler`.

---

## Screenshot Capture Boundary

Plain English: The app has a screenshot API shape even though real pixels are not captured yet.

Command:

```text
capture_screenshot
```

Current payload:

- source,
- display metadata,
- cursor metadata,
- active window metadata,
- captured timestamp placeholder,
- format,
- byte length,
- image dimensions,
- empty base64 image data.

Why this matters:

- The UI/API contract is stable.
- Future real capture code can replace internals without changing the frontend call shape.
- Screenshot dimensions can become part of calibration work.

---

## Debug Panel Capture Display

Plain English: Capture metadata is now visible in the overlay UI.

The debug panel shows:

- display dimensions,
- scale factor,
- cursor position,
- capture source,
- active window title,
- capture timestamp.

Why this matters:

- Native capture output is no longer hidden.
- Developers can see what the app thinks the screen state is.
- It creates a practical place to debug real capture later.

Technical detail: The React app calls `invoke<CaptureMetadata>("capture_metadata")` and stores the response in local state.

---

## Manual Capture Refresh

Plain English: The user can request capture metadata again.

The debug panel now has a button:

```text
Refresh capture
```

Why this matters:

- Capture data can be refreshed without restarting the app.
- Later, actual screen/cursor/window changes can be inspected live.
- It gives Phase 4 a simple test loop.

Technical detail: The refresh button calls the same async function used on initial load and disables while refreshing.

---

## Coordinate Calibration Readout

Plain English: The app now compares overlay size and display size.

The calibration readout shows:

- status,
- overlay width and height,
- display width and height,
- notes.

Current statuses:

- `unknown`
- `needs_check`
- `aligned`
- `scale_mismatch`
- `origin_mismatch`

Why this matters:

- If overlay dimensions and display dimensions differ, model coordinates may not map correctly.
- Calibration has to be visible before AI is connected.
- This gives future capture work a place to report mismatches.

Technical detail: The first calibration check compares `window.innerWidth/innerHeight` with capture metadata dimensions.

---

## Verification

Plain English: The capture foundation builds and packages successfully.

Passed:

```text
npm run check
npm --workspace @touchpilot/desktop run build
npm run desktop:build
```

The Tauri build produced:

```text
target/release/touchpilot-desktop.exe
target/release/bundle/msi/TouchPilot_0.1.0_x64_en-US.msi
target/release/bundle/nsis/TouchPilot_0.1.0_x64-setup.exe
```

---

## What Phase 3 Did Not Build

This phase intentionally did not add:

- real pixel screenshot capture,
- OCR,
- accessibility tree extraction,
- AI model calls,
- real active-window lookup,
- real cursor lookup,
- multi-monitor handling,
- permissions flow.

Those belong in the next implementation phase.

---

## Key Lessons

### Build The Contract Before The Platform-Specific Code

Plain English: It is easier to connect a real screen capture engine when the app already knows what shape the result should have.

Technical detail: The TypeScript and Rust capture types make the future implementation safer because the command boundary already has a stable structure.

### Make Calibration Visible Early

Plain English: Coordinate bugs are easier to fix when the app shows what it thinks the screen size is.

Technical detail: The debug panel compares overlay viewport dimensions against capture display metadata, which will help identify scaling and origin mismatches.

### Placeholder Commands Are Useful When They Are Typed

Plain English: Fake data is acceptable if it uses the real structure.

Technical detail: The screenshot command returns a real `ScreenshotCapture` shape, even though `imageBase64` is empty. The frontend/API contract can stay stable when real pixels are added.

---

## Phase 4 Preview

Plain English: Next, TouchPilot should capture real pixels.

Phase 4 should focus on:

1. choosing a Windows-first capture API or crate,
2. returning real display dimensions,
3. returning real cursor position,
4. returning real screenshot dimensions,
5. filling screenshot base64 data,
6. showing screenshot byte length in debug UI,
7. documenting scaling behavior.

The main technical risk is display scaling and multi-monitor coordinate mapping.

---

## Suggested Quiz Questions

1. Why did Phase 3 add typed capture placeholders before real screenshot capture?
2. What does `CaptureMetadata` represent?
3. Why does the Rust capture crate derive `Serialize`?
4. What does the calibration readout compare?
5. Why is coordinate mismatch dangerous for AI screen guidance?

---

*Generated: 2026-05-31 | Project: TouchPilot | Phase: 3 Screen Capture Foundation*
