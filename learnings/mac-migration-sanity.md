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
