# TouchPilot Phase 1 Foundation

> Phase 1 turned the TouchPilot idea into a real buildable project: a cross-platform Tauri desktop app, monorepo structure, native Rust crates, shared TypeScript contracts, baseline docs, and passing build checks.

---

## In Plain English

Before this phase, TouchPilot was a product idea and a plan. After this phase, it has a real project folder, a real desktop app shell, and a build system that proves the foundation is not just theoretical.

Think of this phase like laying out a workshop before building a complex machine. The desktop app has its own area, the future backend has its own area, native system modules have their own area, shared UI and AI code have their own area, and documentation lives inside the project so decisions do not get lost.

The app does not yet guide the screen or detect gestures. That comes next. What Phase 1 proves is that the cross-platform foundation can install, check, compile, and package as a Windows desktop app.

---

## What Was Built

### Project Root

Plain English: This is the home for the whole product.

```text
C:\Users\Pumba\Documents\codex\clicky\touchpilot
```

Technical detail: This folder is the monorepo root. It owns the npm workspace, Rust workspace, docs, apps, crates, and shared packages.

### Desktop App

Plain English: This is the app the user will eventually open and use.

```text
apps/desktop
```

Technical detail: The desktop app is a Tauri v2 project using React, TypeScript, Vite, and Rust. It currently contains the generated starter UI, renamed and configured as TouchPilot.

### Gateway Placeholder

Plain English: This is where the future model/API gateway will live.

```text
apps/gateway
```

Technical detail: The gateway is registered as an npm workspace package but does not yet contain server logic. Later it will protect model keys, route providers, enforce rate limits, and centralize model calls.

### Rust Crates

Plain English: These are separate native modules for things the app will need from the operating system.

```text
crates/accessibility
crates/capture
crates/gestures
crates/input
crates/overlay-native
crates/safety
crates/storage
```

Technical detail: Each crate has a `Cargo.toml` and a minimal `src/lib.rs`, and the root `Cargo.toml` registers them in one Rust workspace.

### Shared TypeScript Packages

Plain English: These are reusable code areas shared by the desktop app, AI layer, UI, evals, and design system.

```text
packages/ai
packages/design
packages/evals
packages/shared
packages/ui
```

Technical detail: Each package has a `package.json`. The shared package also exports core types, while placeholder packages have minimal `src/index.ts` files so TypeScript checks have real inputs.

---

## Shared Contracts

Plain English: The project now has agreed words for important assistant concepts.

The shared package defines:

- risk classes
- assistant states
- target boxes
- guidance steps
- gesture commands
- display context
- cursor context
- active window context
- screen context
- UI elements

This matters because the app, AI layer, safety layer, and eval layer all need to agree on what a "target", "risk", or "gesture" means.

Technical detail: These types live in:

```text
packages/shared/src/index.ts
```

Example concepts:

```ts
export type RiskClass =
  | "safe_navigation"
  | "form_entry"
  | "external_send"
  | "delete"
  | "payment"
  | "security_change"
  | "account_change"
  | "permission_change"
  | "unknown_risky";
```

Risk classes are the safety vocabulary. Later, every guidance step can be classified before the overlay decides whether to show it immediately or require confirmation.

---

## Build And Check System

Plain English: The project has simple commands to prove it still works.

Root scripts:

```text
npm run check
npm run desktop:build
npm run desktop:dev
npm run rust:check
npm run rust:fmt
```

Technical detail:

- `npm run check` runs TypeScript checks and Rust workspace checks.
- `npm run desktop:build` runs the Tauri desktop build.
- `npm run desktop:dev` will run the development desktop app.
- `npm run rust:check` verifies the Rust workspace.
- `npm run rust:fmt` formats Rust code.

---

## Verification Results

Plain English: The foundation was tested and it works.

Passed:

```text
npm install
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

Technical detail: The first full Tauri packaging run took several minutes because Rust and native packaging dependencies had to compile and download. Future builds should be faster because dependencies are cached.

---

## Issues Found And Fixed

### Empty TypeScript Packages

Plain English: Some folders looked like packages, but TypeScript could not check them because they had no real code files.

Technical cause: `.gitkeep` files are ignored by TypeScript, so `tsc` reported "No inputs were found".

Fix:

```text
packages/ai/src/index.ts
packages/design/src/index.ts
packages/evals/src/index.ts
packages/ui/src/index.ts
```

### Renamed Tauri Library Reference

Plain English: The generated app still tried to call the old placeholder app name after we renamed it.

Technical cause: `apps/desktop/src-tauri/src/main.rs` referenced `tauri_app_lib::run()`, but the library was renamed to `touchpilot_desktop_lib`.

Fix:

```rust
fn main() {
    touchpilot_desktop_lib::run()
}
```

---

## Why This Foundation Matters

Plain English: TouchPilot is too large to build as one pile of code.

The product needs screen capture, overlays, camera gestures, voice, AI routing, safety checks, storage, evals, and design polish. If all of that goes into one app folder, it becomes hard to reason about and hard to test.

The monorepo structure gives each concern a place:

- desktop experience in `apps/desktop`
- model gateway in `apps/gateway`
- native system capabilities in `crates`
- shared frontend/AI/eval code in `packages`
- product decisions in `docs`

Technical detail: This also allows Rust and TypeScript code to grow independently while still being checked from the root.

---

## Phase 2 Preview

Plain English: Next we start making the desktop app feel like an assistant, not just a starter app.

Phase 2 should build:

1. transparent always-on-top overlay
2. assistant puck
3. test pointer ring
4. step bubble
5. pause/stop controls
6. basic overlay behavior validation

The main risk is coordinate alignment. If the overlay cannot draw exactly where the app thinks it is drawing, then later AI target coordinates will not be trustworthy.

---

## Quick Reference

### Important Paths

| Path | Meaning |
|---|---|
| `apps/desktop` | Tauri desktop app |
| `apps/gateway` | Future model/API gateway |
| `crates/capture` | Future screen capture module |
| `crates/gestures` | Future camera gesture module |
| `crates/safety` | Future risk policy module |
| `packages/shared` | Shared TypeScript contracts |
| `docs/phase-1-foundation.md` | Phase 1 completion note |

### Important Commands

```text
npm install
npm run check
npm run desktop:build
npm run desktop:dev
```

### Suggested Quiz Questions

1. Why does TouchPilot use a monorepo instead of one app folder?
2. What is the difference between `apps`, `crates`, and `packages`?
3. Why did empty TypeScript packages fail the first check?
4. Why does the Tauri `main.rs` need to reference the renamed library crate?
5. What is the main technical risk for Phase 2?

---

*Generated: 2026-05-31 | Project: TouchPilot | Phase: 1 Foundation*
