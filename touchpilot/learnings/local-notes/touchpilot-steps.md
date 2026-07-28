# Steps Log - TouchPilot

---

## Step 8.1 - Visual Acceptance Spec
*Completed: 2026-06-11*

**What was built**
- `docs/visual-acceptance.md` - defines the Clicky-style visual pass/fail gate for Phase 8 and later overlay work.

**In plain English**
TouchPilot now has a written visual standard instead of a vague "make it look better" target. The document says the app should feel like a tiny assistant next to the cursor, not like a normal app window or dashboard. It also lists what automatically fails Phase 8, including visible titlebars, permanent panels, debug UI in the overlay, and a ghost-like puck.

**Files changed**
+ created: `touchpilot/docs/visual-acceptance.md`

**Commit**
- `b1a2e32 docs: define visual acceptance gate`

---

## Step 8.2 - Runtime Surface Split
*Completed: 2026-06-11*

**What was built**
- `apps/desktop/src-tauri/tauri.conf.json` - defines separate overlay, settings, and debug windows.
- `apps/desktop/src-tauri/src/lib.rs` - opens settings and debug from the tray while keeping the overlay click-through.
- `apps/desktop/src-tauri/capabilities/default.json` - grants capabilities to the named runtime windows.
- `apps/desktop/src-tauri/Cargo.toml` - enables Tauri tray icon support.
- `apps/desktop/src/App.tsx` - routes each window label to its own React surface and streams debug state separately.
- `apps/desktop/src/App.css` - adds separate visual styling for settings, overlay, and debug surfaces.

**In plain English**
TouchPilot now has separate places for separate jobs. The invisible overlay is for the cursor assistant, the settings popup is for user controls, and the debug window is for internal capture and schema information. This removes the old pressure to show developer tools inside the user-facing overlay.

**Files changed**
~ modified: `touchpilot/apps/desktop/src-tauri/tauri.conf.json`
~ modified: `touchpilot/apps/desktop/src-tauri/src/lib.rs`
~ modified: `touchpilot/apps/desktop/src-tauri/capabilities/default.json`
~ modified: `touchpilot/apps/desktop/src-tauri/Cargo.toml`
~ modified: `touchpilot/apps/desktop/src/App.tsx`
~ modified: `touchpilot/apps/desktop/src/App.css`

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck`
- `cargo check --workspace`
- `npm --workspace @touchpilot/desktop run build`

**Commit**
- `85b23a1 refactor: split runtime surfaces`

---

## Step 8.3 - Overlay Native Chrome Cleanup
*Completed: 2026-06-11*

**What was built**
- `apps/desktop/src-tauri/tauri.conf.json` - removes visible overlay/settings titles from the native window config.
- `apps/desktop/src-tauri/src/lib.rs` - clears Windows HWND title text and enforces skip-taskbar behavior during setup.

**In plain English**
TouchPilot now does more than hide the border around the overlay. It also removes the native window name that could show up as an ugly `TouchPilot Overlay` strip or app-like label. The overlay and settings surfaces are being pushed closer to utility/popup behavior instead of normal app-window behavior.

**Files changed**
~ modified: `touchpilot/apps/desktop/src-tauri/tauri.conf.json`
~ modified: `touchpilot/apps/desktop/src-tauri/src/lib.rs`

**Verification**
- `cargo check --workspace`
- `npm --workspace @touchpilot/desktop run build`

**Commit**
- `cdc66ca fix: suppress overlay window chrome`

---

## Step 8.4 - Clicky-Style Settings Popup
*Completed: 2026-06-11*

**What was built**
- `apps/desktop/src/App.tsx` - makes the settings popup close on Escape and focus loss, and removes explanatory app-like copy.
- `apps/desktop/src/App.css` - tightens the popup sizing, spacing, and control proportions.
- `apps/desktop/src-tauri/tauri.conf.json` - reduces the native settings window size to match a compact popup.

**In plain English**
The settings surface now behaves more like a temporary utility popup. It is smaller, less wordy, and closes when the user presses Escape or clicks away. This moves it closer to Clicky's tray/menu style instead of feeling like a small standalone app window.

**Files changed**
~ modified: `touchpilot/apps/desktop/src/App.tsx`
~ modified: `touchpilot/apps/desktop/src/App.css`
~ modified: `touchpilot/apps/desktop/src-tauri/tauri.conf.json`

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck`
- `cargo check --workspace`
- `npm --workspace @touchpilot/desktop run build`

**Commit**
- `6e5ce51 fix: make settings popup transient`

---

## Step 8.5 - Separate Debug Window
*Completed: 2026-06-12*

**What was built**
- `apps/desktop/src/App.tsx` - expands the debug window with overlay state controls, fixture controls, capture metadata, guidance state, calibration details, and screenshot preview.
- `apps/desktop/src/App.css` - adds dedicated internal toggle button styling for the debug window.

**In plain English**
The debug window is now the place for internal testing and inspection. It can switch overlay states, choose safe/risky/invalid mock guidance, refresh capture, show screenshot metadata, and inspect validation details. This keeps those developer tools out of the normal overlay and settings popup.

**Files changed**
~ modified: `touchpilot/apps/desktop/src/App.tsx`
~ modified: `touchpilot/apps/desktop/src/App.css`

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck`
- `cargo check --workspace`
- `npm --workspace @touchpilot/desktop run build`

**Commit**
- `9dd5c7f feat: expand debug window controls`

---

## Step 8.6 - Cursor-First Monochrome Runtime
*Completed: 2026-06-12*

**What was built**
- `apps/desktop/src/App.tsx` - removes risk/debug readouts from the user-facing step cue.
- `apps/desktop/src/App.css` - removes legacy overlay panel/debug styles and turns the step cue into a compact cursor-adjacent pill.

**In plain English**
The normal overlay no longer carries leftover dashboard or developer-panel styling. When guidance is active, the app shows a target ring and a small instruction cue instead of a larger card with risk/debug metadata. The product surface is now much closer to "cursor plus guidance" rather than "app panel on top of desktop."

**Files changed**
~ modified: `touchpilot/apps/desktop/src/App.tsx`
~ modified: `touchpilot/apps/desktop/src/App.css`

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck`
- `cargo check --workspace`
- `npm --workspace @touchpilot/desktop run build`

**Commit**
- `c5b4072 refactor: make overlay cursor first`

---
