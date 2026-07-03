# Phase 16 Release Build Inventory

Step 16.2 records the release commands and artifacts that exist before production packaging work begins.

This is an inventory, not a release approval. No signing, updater, notarization, or installer changes are made in this step.

## Current Build Commands

### Development App

Use this when actively testing the Tauri runtime:

```bash
npm run desktop:dev
```

What it does:

- starts the desktop Tauri dev app
- uses the Vite dev server
- is the fastest way to test menu bar, settings, overlay, puck, voice, and debug behavior

This is not a release build.

### Frontend Production Build

Use this for a quick web bundle check:

```bash
npm run desktop:web:build
```

What it does:

- runs the desktop TypeScript build
- runs the Vite production bundle
- does not compile the native Tauri app

This is a good preflight before native release packaging.

### Full Workspace Checks

Use this to check TypeScript and Rust together:

```bash
npm run check
```

Faster focused option:

```bash
npm run check:fast
```

`check:fast` runs desktop TypeScript plus Rust workspace check. It skips the full monorepo TypeScript matrix.

### Mac Release App Bundle

Use this for the current Mac local release app path:

```bash
npm run desktop:release:mac
```

What it does:

- calls `tauri build --bundles app`
- builds a macOS `.app` bundle
- avoids every possible bundle target

This is the clearest current command for local Mac release testing.

### Full Tauri Package Build

Use this only at release checkpoints:

```bash
npm run desktop:build
```

What it does:

- calls `tauri build`
- uses the bundle targets from `apps/desktop/src-tauri/tauri.conf.json`
- may be slower than the Mac app-only build

Current Tauri config has:

```json
"bundle": {
  "active": true,
  "targets": "all"
}
```

Because `targets` is `all`, full packaging can create platform-specific artifacts depending on the host operating system and available tooling.

### Windows Release Commands

Windows commands still exist for later parity work:

```bash
npm run desktop:build:windows
npm run desktop:release:windows:exe
npm run desktop:release:exe
```

They call:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts/windows-tauri-build.ps1
```

The helper forces `CARGO_BUILD_JOBS=1` by default because Windows release packaging was memory-sensitive during earlier testing.

These commands are not expected to run on Mac.

## Current Artifact Snapshot

Observed local artifacts:

```text
target/release/bundle/msi/TouchPilot_0.1.0_x64_en-US.msi
target/release/bundle/nsis/TouchPilot_0.1.0_x64-setup.exe
```

Important: these are stale Windows artifacts with the old `TouchPilot` name.

They should not be treated as valid Toki release artifacts.

This is a Step 16.3 identity cleanup issue, not a Step 16.2 build-command issue.

## Current Release Risk Notes

### Mac

- Mac is the primary beta target.
- `npm run desktop:release:mac` is the preferred current release-test command.
- Signing and notarization are not wired yet.
- Auto-update is not wired yet.
- Release QA checklist does not exist yet.

### Windows

- Windows build helpers still exist.
- Earlier Windows packaging was slow and memory-sensitive.
- Current local artifacts are stale and still named `TouchPilot`.
- Windows parity should not block Mac beta readiness.

### Linux

- No dedicated Linux release helper exists yet.
- Tauri can support Linux packaging later, but no Linux packaging QA is recorded in this inventory.

## Current Recommendation

For Phase 16 work, use this order:

1. `npm run desktop:web:build`
2. `npm run check:fast`
3. `npm run desktop:release:mac`
4. `npm run desktop:build` only at release checkpoints

Do not rely on stale `TouchPilot` artifacts for release decisions.

## Step 16.2 Result

Step 16.2 is complete when this inventory exists and Phase 16 docs point to it.
