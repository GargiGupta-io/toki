# Phase 1 Foundation

Phase 1 created the working foundation for Toki. The goal was to move from product plan to a real, buildable cross-platform desktop project.

## What Exists Now

- A monorepo at `Documents/codex/clicky/toki`.
- A Tauri v2 desktop app in `apps/desktop`.
- A placeholder gateway app in `apps/gateway`.
- Rust workspace crates for native subsystems.
- Shared TypeScript workspace packages.
- Baseline architecture, safety, roadmap, Clicky reference, and gesture docs.
- Shared TypeScript contracts for core assistant concepts.
- Root build and check scripts.
- A verified Windows build.

## Verification

These commands passed:

```text
npm install
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

## Fixes Made During Verification

Two scaffold issues were found and fixed:

1. Empty TypeScript packages failed `tsc` because `.gitkeep` files are not compiler inputs.
   - Fixed by replacing placeholder `.gitkeep` files with minimal `src/index.ts` files.

2. The generated Tauri `main.rs` still referenced the old scaffold library name.
   - Fixed by changing `tauri_app_lib::run()` to `toki_desktop_lib::run()`.

## Phase 2 Entry Point

Phase 2 should focus on the overlay prototype:

1. Create a transparent always-on-top overlay window.
2. Add the assistant puck.
3. Draw a test pointer ring at known coordinates.
4. Add a step bubble.
5. Add pause/stop controls.
6. Confirm the overlay does not permanently block normal desktop use.

The main technical risk for Phase 2 is coordinate fidelity: the overlay must draw in exactly the same coordinate space that screen capture and model outputs will use later.
