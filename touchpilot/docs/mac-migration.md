# Mac Migration Track

TouchPilot is now being developed on macOS as the primary product target.

The goal of this track is not to abandon Windows or Linux. The goal is to make the Clicky-style experience feel correct on the machine we can test every day, while keeping platform-specific behavior isolated enough that Windows and Linux can remain supported.

## Platform Priority

1. macOS: primary runtime, product feel, manual QA.
2. Windows: keep compile/build paths healthy, return to manual visual QA when hardware is available.
3. Linux: compile/best-effort until the core product loop is stable.

## Phase M0 Findings

M0 verified that the Mac environment can build and launch TouchPilot.

Passed:

- Node is installed.
- npm is installed.
- Rust was installed through rustup.
- `npm --workspace @touchpilot/shared run typecheck` passed.
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `cargo check --workspace` passed on macOS.
- `npm --workspace @touchpilot/desktop run build` passed.
- `tauri dev` launched the desktop shell on macOS when run outside the sandbox.

Migration fixes:

- Added `.gitattributes` so Windows and Mac line endings do not create false app-file changes.
- Fixed Mac git push by replacing a copied Windows GitHub CLI credential helper path with the Mac GitHub CLI helper.
- Repaired copied `node_modules` executable bits so TypeScript binaries can run on macOS.

Resolved Mac runtime issue:

- Transparent Tauri windows no longer warn about `macos-private-api`.
- `tauri.conf.json` enables `app.macOSPrivateApi`.
- `Cargo.toml` enables the matching Tauri `macos-private-api` feature.

## Next Track

Phase M1 should focus on the macOS runtime shell:

- menu bar utility behavior
- settings popup behavior
- transparent overlay behavior
- cursor/puck tracking
- removing Windows-specific assumptions from the default path

Useful Mac commands:

- `npm run desktop:dev`
- `npm run desktop:release:mac`
- `npm run qa:mac:runtime`
