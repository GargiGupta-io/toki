# Mac Migration Sanity

> TouchPilot moved from a Windows development machine to a Mac, so the first job was proving the project can build, launch, and stay clean on the new platform.

---

## In Plain English

Moving the project to a Mac is like moving a workshop to a new room. The tools are the same in theory, but the outlets, shelves, and lighting are different. Before building anything new, we had to check whether the tools actually worked in the new room.

The main result is good: the Mac can typecheck, build, compile Rust, and launch the Tauri desktop shell. The problems we found were migration problems, not product-code problems.

## What Changed

Mac is now the primary product target for the next stretch.

That means:

- macOS gets daily manual QA.
- Windows stays supported but moves to CI/manual-later while no Windows machine is available.
- Linux stays build/best-effort until the main product loop is stable.

## What M0 Proved

The following checks passed on macOS:

- `npm --workspace @touchpilot/shared run typecheck`
- `npm --workspace @touchpilot/desktop run typecheck`
- `cargo check --workspace`
- `npm --workspace @touchpilot/desktop run build`
- `tauri dev` launched the desktop shell

## Problems Found

### Missing Rust

Plain English: the Mac did not yet have the Rust toolchain available in the shell.

Fix:

- installed Rust with rustup
- sourced Cargo with `. "$HOME/.cargo/env"`

### Copied Node Binaries Were Not Executable

Plain English: `node_modules` came from the Windows environment and the Mac could see files like `tsc`, but it was not allowed to run them.

Fix:

- ran `npm install`
- repaired executable bits for package binaries

### Cargo Needed Network Access

Plain English: Cargo had to download crates for the Mac build the first time.

Fix:

- reran `cargo check --workspace` with network access

### Git Push Used A Windows Credential Helper

Plain English: Git on the Mac was still trying to call `C:\Program Files\GitHub CLI\gh.exe`, which only exists on Windows.

Fix:

- removed the broken Windows GitHub credential helper
- added the Mac `gh` credential helper

### Line Ending Churn

Plain English: many source files looked modified even though their code had not really changed. The content was mostly the same, but line endings had flipped between Windows and Mac styles.

Fix:

- added `.gitattributes`
- normalized source/docs as LF
- reserved CRLF for Windows script files

## Mac Runtime Finding

The Tauri desktop shell launches on macOS, but transparent windows print this warning:

```text
The window is set to be transparent but the `macos-private-api` is not enabled.
```

This is not an M0 blocker. It belongs to Phase M1 because M1 is specifically about the macOS runtime shell and transparent overlay behavior.

## Phase M1 Runtime Shell Update

Plain English: macOS did not only need the window to be marked transparent. Tauri also requires an explicit private-API opt-in before transparent windows behave without warnings on Mac.

The warning pointed to `app.macOSPrivateApi` in `tauri.conf.json`. Adding that config alone was not enough: the Rust build then failed because the Cargo feature list did not match the config allowlist.

The fix needed both sides:

- `touchpilot/apps/desktop/src-tauri/tauri.conf.json` sets `app.macOSPrivateApi` to `true`.
- `touchpilot/apps/desktop/src-tauri/Cargo.toml` enables the Tauri `macos-private-api` feature.

After both were set, `cargo check --workspace` passed and `tauri dev` launched without the old transparent-window warning.

The tradeoff is important: macOS private APIs can affect App Store eligibility. For TouchPilot, this is acceptable for the current direction because the product needs a Clicky-style transparent desktop overlay, and distribution can target direct download/beta builds before App Store packaging is considered.

## Phase M1 Settings Popup Update

Plain English: the settings popup should move like one small native utility surface, not like a React element pretending to be a window.

The previous settings drag path manually tracked pointer coordinates in the webview and called a custom Rust command to move the window. That path is brittle on macOS because a tiny transparent popup can lose pointer movement as soon as the cursor leaves its bounds.

The better Mac-shell approach is to use Tauri's native window drag primitive:

- the settings header calls `getCurrentWindow().startDragging()`
- the old `move_settings_window` command was removed
- the close command stays native through `hide_settings_window`

This keeps the popup closer to a real macOS utility panel while avoiding custom coordinate movement code.

## Phase M1 Overlay QA Update

Plain English: the Mac overlay cannot be accepted only because the code says it is transparent. It needs a repeatable local check plus a manual visual gate, because the real product requirement is how the desktop feels while the overlay is running.

The Mac overlay keeps the Windows Phase 8 Option 1 architecture: a monitor-sized borderless transparent popup instead of native fullscreen. That avoids the normal "fullscreen app window" path and better matches the Clicky-style product contract.

The new runtime QA path is:

- `npm run qa:mac:runtime` checks that TouchPilot is running.
- when macOS allows System Events access, it reports TouchPilot window names, positions, and sizes.
- `touchpilot/docs/macos-runtime-qa.md` defines the manual accept/fail checks for click-through, titlebar absence, puck following, and settings behavior.

The important limitation is honest: this environment can compile and launch the app, but it cannot fully prove click-through and visual feel without looking at the real Mac desktop. That manual check remains required before accepting M1 overlay behavior.

## Phase M1 Default Runtime Cleanup

Plain English: after moving to Mac, the default app should not talk like it is still running on Windows.

The app still had one user-facing Windows assumption in the debug camera permission message. If camera access was denied, it told the user to enable camera access in "Windows privacy settings." That is wrong on macOS and makes the product feel like a port rather than a native-feeling Mac utility.

The copy now says "system privacy settings," which works on macOS, Windows, and Linux.

The package scripts were also clarified:

- `desktop:release:mac` builds the macOS app bundle.
- `desktop:release:windows:exe` is the explicit Windows no-bundle executable path.
- the older `desktop:release:exe` alias remains so existing Windows workflow notes do not break immediately.

This does not remove Windows support. It removes Windows as the assumed default.

## Phase M2 Capture QA Update

Plain English: Mac screen capture works, but it must be tested from a process that macOS lets see the desktop.

The first capture probe run inside the restricted shell failed with:

```text
[FAIL] metadata - no display available for capture
```

That looked like a capture failure, but it was actually an environment boundary. Running the same probe outside the sandbox succeeded:

```text
[PASS] metadata - display=1 1470x956 scale=2
[PASS] screenshot - image=2940x1912 bytes=2145981 base64_chars=2861308
```

This proves the existing Rust capture crate can enumerate the Mac display and capture pixels. It also shows the Retina relationship clearly:

- logical display size: `1470x956`
- scale factor: `2`
- captured image size: `2940x1912`

That relationship matters for overlay coordinate mapping. The model/overlay may reason in logical coordinates while screenshots are pixel-dense Retina images.

The new command is:

```bash
npm run qa:mac:capture
```

If this fails from a normal terminal, the likely next issue is macOS Screen Recording permission.

## Phase M2 Screen Recording Permission Update

Plain English: when Mac capture fails, the app should tell the user exactly where to fix it instead of showing a raw technical error.

TouchPilot now formats permission-like capture failures with a macOS-specific hint:

```text
On macOS, grant Screen Recording permission to TouchPilot or the terminal app, then quit and relaunch it.
```

The relaunch part matters because macOS privacy permissions usually do not apply to already-running processes.

The app treats these messages as permission-related:

- `no display available`
- `permission`
- `denied`
- `not authorized`

This makes the capture failure path more useful without changing the underlying capture architecture.

## Phase M2 Capture Coordinate Update

Plain English: Retina screens report two related sizes. The app sees a logical desktop size for UI placement, while screenshots come back at physical pixel size.

The Mac capture probe currently reports:

```text
display metadata: 1470x956 scale=2
screenshot:       2940x1912
```

That is correct because:

```text
1470 * 2 = 2940
956 * 2  = 1912
```

TouchPilot now checks this relationship when building calibration metadata. It still keeps the existing shared calibration shape, but the note/status now considers whether screenshot dimensions match `display * scaleFactor`.

Why this matters:

- the overlay/puck uses logical coordinates
- the screenshot sent to guidance is pixel-dense
- target coordinates must not accidentally mix those two spaces

If the screenshot size does not match the expected Retina scale, calibration reports `needs_check` and the debug readout should surface the mismatch.

## Why This Matters

TouchPilot is a cursor-first overlay product. If the development machine cannot reliably run the desktop shell, every later feature becomes guesswork.

M0 gives us a stable base:

- the repo pushes correctly
- source files no longer look dirty for fake reasons
- checks pass
- the app launches
- the next Mac-specific issue is known

## Next

Phase M1 should focus on:

- menu bar utility behavior
- settings popup behavior
- transparent overlay behavior
- cursor/puck tracking on macOS
- isolating Windows-only overlay assumptions

## Updates

- 2026-06-25 - Created after Phase M0 completed on macOS.
- 2026-06-25 - Added Phase M1 transparent-window fix: `app.macOSPrivateApi` plus the matching Tauri `macos-private-api` Cargo feature.
- 2026-06-25 - Replaced custom settings popup movement with Tauri native window dragging for macOS shell behavior.
- 2026-06-25 - Added macOS runtime QA script and manual overlay checklist for transparent overlay validation.
- 2026-06-25 - Removed user-facing Windows camera permission copy and added explicit Mac/Windows release script names.
- 2026-06-25 - Added macOS capture probe and recorded successful Retina capture outside the sandbox.
- 2026-06-25 - Added macOS Screen Recording guidance for permission-like capture failures.
- 2026-06-25 - Added Retina screenshot scale validation to desktop calibration metadata.
