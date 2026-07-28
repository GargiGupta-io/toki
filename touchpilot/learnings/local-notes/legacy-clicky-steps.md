# Steps Log - Clicky

---

## Step 53 - Document Phase 8 Completion And Deeplearn
*Completed: 2026-06-02*

**What was built**
- `docs/phase-8-monochrome-overlay-completion.md` - Summarizes what the monochrome overlay reset changed, why it mattered, what passed verification, and what visual polish risks remain.
- `learnings/phase-8-monochrome-overlay-reset.md` - Deep learning note explaining the visual reset, material system, cursor-shadow puck redesign, motion changes, and verification outcome.

**In plain English**
Phase 8 is now fully closed out. The repo has the short completion note for the redesign phase, and the learning folder has the deeper explanation of how the visual reset was done and why it had to happen before moving on. That means the phase is not only implemented and verified, it is also documented well enough to build the next interaction phases on top of it cleanly.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/docs/phase-8-monochrome-overlay-completion.md
+ created: Documents/codex/clicky/learnings/phase-8-monochrome-overlay-reset.md

**Verification**
- Phase 8 verification references `touchpilot/docs/phase-8-monochrome-overlay-qa.md`.
- Learning doc saved to `Documents/codex/clicky/learnings/phase-8-monochrome-overlay-reset.md`.

---

## Step 52 - Verify Monochrome Overlay Redesign
*Completed: 2026-06-02*

**What was built**
- `docs/phase-8-monochrome-overlay-qa.md` - Records the Phase 8 verification commands, native packaging result, and the remaining visual QA limits in this environment.

**In plain English**
The redesign is not just “looking different”; it still builds and packages correctly. The desktop web build passed, the full repo check passed, and the native Tauri build produced the app and installer bundles. The one thing still not fully proven here is screenshot-backed visual review, because the in-app browser backend was unavailable.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/docs/phase-8-monochrome-overlay-qa.md

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm --workspace @touchpilot/desktop run build` passed.
- `npm run check` passed.
- `npm run desktop:build` passed.

---

## Step 51 - Demote Debug Panel Into Secondary Layer
*Completed: 2026-06-02*

**What was built**
- `apps/desktop/src/App.css` - Shrinks, softens, and dims the debug panel so it remains available for development without visually dominating the product surface.

**In plain English**
The debug panel is still there, but it no longer screams for attention. It is smaller, lighter, and less heavy than before, which lets the actual overlay experience lead instead of looking like an internal tool with a product UI attached to it.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

---

## Step 50 - Rework Guiding Droplets Into Quiet Target Cues
*Completed: 2026-06-02*

**What was built**
- `apps/desktop/src/App.css` - Retunes guiding-state droplet travel so the target path reads as slower, smaller, quieter white cues instead of bright particles being launched across the screen.

**In plain English**
The guiding effect is now calmer. Instead of feeling like the puck is shooting particles around, the motion behaves more like small white hints resolving into the target ring. That makes the effect feel more premium and less like a loading animation.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

---

## Step 49 - Rework Activation Into Shadow Separation
*Completed: 2026-06-02*

**What was built**
- `apps/desktop/src/App.css` - Rewrites the forming-state motion so the cursor-shadow fades and separates into white droplets before the assistant state settles in.

**In plain English**
The activation no longer feels like a generic particle loop. It now behaves more like the little white shadow is breaking apart into droplets and lifting away from its original form, which is much closer to the motion idea you described. It still uses CSS, but the motion grammar is now based on separation instead of orbiting for no reason.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

---

## Step 48 - Redesign Puck Into Cursor-Shadow Form
*Completed: 2026-06-02*

**What was built**
- `apps/desktop/src/App.tsx` - Replaces the old `TP` puck core with a small shadow-form silhouette built from shape layers.
- `apps/desktop/src/App.css` - Shrinks the puck footprint, softens the orbit, scales down droplet geometry, and restyles the puck into a white cursor-shadow object instead of a floating badge.

**In plain English**
This is the first step where the puck actually starts looking closer to what you described. It is much smaller now, no longer has the cheesy `TP` badge in the middle, and reads more like a pale cursor-shadow presence than a button. The animation still needs refinement in the next steps, but the object itself is now pointed in the right direction.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

---

## Step 47 - Replace Neon Palette With Grayscale Material System
*Completed: 2026-06-02*

**What was built**
- `apps/desktop/src/App.css` - Replaces the bright green-led color system with grayscale glass materials, softer text contrast, quieter controls, monochrome target cues, and monochrome status surfaces.

**In plain English**
This is the step where the overlay stopped looking like it had a neon accent color sprayed across everything. The app now leans on white, smoke, blur, and contrast instead of green, yellow, and red signals. It still needs the puck redesign, but the overall surface is finally moving into the mac-like monochrome direction instead of fighting it.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

---

## Step 46 - Rebuild Guidance Surface Into Compact Glass Hint
*Completed: 2026-06-02*

**What was built**
- `apps/desktop/src/App.tsx` - Reframes the guidance panel copy so it reads more like a compact contextual hint than a dashboard block.
- `apps/desktop/src/App.css` - Shrinks and restyles the guidance panel into a tighter smoke-glass surface with quieter pills, tighter spacing, and monochrome controls.

**In plain English**
The main panel now takes up less space and reads more like a mac-style floating hint. It is smaller, softer, and less shouty, which helps the overlay feel like it belongs over another app instead of trying to become the whole UI. The logic is the same, but the panel is no longer shaped like a chunky settings card.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

---

## Step 45 - Remove Default Runtime Brand Chrome
*Completed: 2026-06-02*

**What was built**
- `apps/desktop/src/App.tsx` - Removes the visible top-left TouchPilot brand rail from the default overlay runtime so the app stops opening like a branded prototype shell.
- `learnings/plan.md` - Inserts the monochrome mac-style redesign as Phase 8 and shifts later roadmap phases forward.

**In plain English**
The app no longer opens with that obvious TP badge and title sitting in the corner. That sounds small, but it changes the feel immediately: the overlay starts looking less like a demo screen and more like something that belongs on top of another app. The actual visual redesign is still next, but this removes one of the loudest prototype signals first.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/learnings/plan.md

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

---

## Step 44 - Document Phase 7 Completion And Deeplearn
*Completed: 2026-06-01*

**What was built**
- `docs/phase-7-fluid-puck-completion.md` - Summarizes what Phase 7 added, why it mattered, what passed verification, and what visual QA still remains.
- `learnings/phase-7-fluid-puck-motion.md` - Deep learning note explaining the fluid puck motion system, state model, safety gates, rendering contract, and future direction.

**In plain English**
Phase 7 is now properly closed out. The repo has a short completion note for the fluid puck phase, and the learning folder has the deeper explanation of how the motion system works and why it was built this way. That means the phase is no longer just implemented; it is also documented clearly enough to build on without re-deriving the design later.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/docs/phase-7-fluid-puck-completion.md
+ created: Documents/codex/clicky/learnings/phase-7-fluid-puck-motion.md

**Verification**
- Phase 7 verification references `touchpilot/docs/phase-7-motion-qa.md`.
- Learning doc saved to `Documents/codex/clicky/learnings/phase-7-fluid-puck-motion.md`.

---

## Step 43 - Verify Phase 7 Motion And Layout
*Completed: 2026-06-01*

**What was built**
- `docs/phase-7-motion-qa.md` - Records the Phase 7 verification commands, source checks, browser limitation, and remaining visual QA risk.

**In plain English**
The fluid puck work has now been checked from the inside. The app still builds, the whole repo check passes, and the motion safety gates are present so rejected guidance cannot visually point at a target. The only thing still needing a later pass is visual screenshot review, because the in-app browser backend was unavailable during this step.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/docs/phase-7-motion-qa.md

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm --workspace @touchpilot/desktop run build` passed.
- `npm run check` passed.
- `curl.exe -I http://127.0.0.1:1420` returned `HTTP/1.1 200 OK`.
- Browser screenshot verification was blocked because the in-app browser backend was unavailable.

---

## Step 18 - Verify And Document Phase 2
*Completed: 2026-05-31*

**What was built**
- `docs/phase-2-completion.md` - Summarizes the completed overlay prototype, verification, decisions, and Phase 3 entry point.
- `learnings/phase-2-overlay-prototype.md` - Deep-learning style explanation of the overlay prototype phase.

**In plain English**
Phase 2 is now verified and documented. The overlay prototype passes checks, the repo has a short completion note, and the learning folder has a deeper explanation of what was built and why it matters. The project is ready for Phase 3: screen capture and coordinate calibration.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/docs/phase-2-completion.md
+ created: Documents/codex/clicky/learnings/phase-2-overlay-prototype.md

**Verification**
- `npm run check` passed.
- `npm --workspace @touchpilot/desktop run build` passed.

---

## Step 17 - Add Overlay Debug Panel
*Completed: 2026-05-31*

**What was built**
- `apps/desktop/src/App.tsx` - Adds a debug panel for manually switching overlay states and inspecting fixed target coordinates.
- `apps/desktop/src/App.css` - Adds debug panel layout, state buttons, active button styling, and target readout styling.

**In plain English**
The overlay now has a small development control panel. It lets us manually switch between idle, listening, thinking, guiding, paused, and error states, and it shows the current target label, coordinates, and size. This makes overlay testing easier before AI, gestures, or screen capture are connected.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm --workspace @touchpilot/desktop run build` passed.

---

## Step 16 - Add Pause And Stop Controls
*Completed: 2026-05-31*

**What was built**
- `apps/desktop/src/App.tsx` - Adds interactive pause, resume, and stop behavior using React state.
- `apps/desktop/src/App.css` - Adds compact control button styling for the guidance panel.

**In plain English**
The overlay is now interactive for the first time. Pause changes the assistant into a paused state, resume brings the target guidance back, and stop returns the shell to idle while hiding the active pointer and step bubble. This gives users a basic safety/control surface before more advanced overlay behavior is added.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm --workspace @touchpilot/desktop run build` passed.

---

## Step 15 - Add Target Step Bubble
*Completed: 2026-05-31*

**What was built**
- `apps/desktop/src/App.tsx` - Adds a guidance bubble positioned from the same fixed target data as the pointer ring.
- `apps/desktop/src/App.css` - Adds the bubble panel, anchor notch, heading, and instruction text styling.

**In plain English**
The target marker now has an explanation attached to it. Instead of only showing a ring, the overlay can show what the user should do at that target. The bubble is still fixed-position, but it follows the same target data path that model-generated guidance will use later.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm --workspace @touchpilot/desktop run build` passed.

---

## Step 14 - Add Fixed Coordinate Pointer Ring
*Completed: 2026-05-31*

**What was built**
- `apps/desktop/src/App.tsx` - Adds a fixed test target and pointer ring component rendered from explicit x/y/width/height values.
- `apps/desktop/src/App.css` - Adds the target ring, pulse animation, and crosshair styling.

**In plain English**
The overlay can now mark a specific spot on the screen. The target is still hardcoded, but it already uses the same kind of coordinate data the AI will produce later. This is the first visual proof that TouchPilot can point at a UI element instead of only showing a panel.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm --workspace @touchpilot/desktop run build` passed.

---

## Step 13 - Configure Overlay-Style Tauri Window
*Completed: 2026-05-31*

**What was built**
- `apps/desktop/src-tauri/tauri.conf.json` - Updates the desktop window toward overlay behavior with a larger debug size, no decorations, transparency support, always-on-top behavior, resizability, and no window shadow.

**In plain English**
The desktop shell is now configured more like an overlay surface than a normal app window. It is larger, decoration-free, transparent-capable, and set to stay above other windows. Click-through behavior is still intentionally left for later because the prototype needs interactive controls first.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src-tauri/tauri.conf.json

**Verification**
- `npm --workspace @touchpilot/desktop run build` passed.
- `npm run rust:check` passed.

---

## Step 12 - Add Overlay State Model
*Completed: 2026-05-31*

**What was built**
- `apps/desktop/src/App.tsx` - Adds a typed overlay state model and uses it to drive shell, panel, and puck labels.
- `apps/desktop/src/App.css` - Adds tone-specific styles for paused and error states.

**In plain English**
The overlay now has a small internal model for what the assistant is doing. The screen still starts in idle mode, but the visible labels and styling now come from a real state map instead of hardcoded text. That gives later controls a clean place to switch between idle, listening, thinking, guiding, paused, and error states.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm --workspace @touchpilot/desktop run build` passed.

---

## Step 11 - Add Assistant Puck Component
*Completed: 2026-05-31*

**What was built**
- `apps/desktop/src/App.tsx` - Adds the first assistant puck component to the overlay shell.
- `apps/desktop/src/App.css` - Adds puck positioning, glass styling, status chip, focus state, and pulse animation.

**In plain English**
The overlay now has a visible floating control that represents the assistant. It does not control anything yet, but it gives the product its first real interaction anchor: the place users will later click, gesture toward, or use to start voice mode.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm --workspace @touchpilot/desktop run build` passed.

---

## Step 10 - Replace Starter UI With TouchPilot Shell
*Completed: 2026-05-31*

**What was built**
- `apps/desktop/src/App.tsx` - Replaces the default Tauri greet/demo screen with a TouchPilot overlay shell.
- `apps/desktop/src/App.css` - Replaces starter styles with the first overlay-style visual surface, status rail, guidance panel, state pill, and coordinate readout.

**In plain English**
The desktop app no longer looks like a Tauri starter template. It now opens into a TouchPilot-branded overlay prototype surface with a status area and guidance panel. The real puck, pointer, state controls, and debug tools will be added in the next steps.

**Files changed**
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.tsx
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src/App.css

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm --workspace @touchpilot/desktop run build` passed.

---

## Step 9 - Define Phase 2 Overlay Behavior
*Completed: 2026-05-31*

**What was built**
- `docs/phase-2-overlay.md` - Defines the overlay prototype goal, window behavior, click handling, components, state model, debug panel, design rules, and completion criteria.

**In plain English**
Phase 2 now has written rules before code changes start. The app will begin as an interactive overlay prototype, then move toward transparent and pass-through behavior once the visual surface is stable. This keeps the next UI work focused on proving the overlay instead of drifting into AI, voice, or gesture features too early.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/docs/phase-2-overlay.md

---

## Step 8 - Save Phase 1 Completion Notes
*Completed: 2026-05-31*

**What was built**
- `docs/phase-1-foundation.md` - Summarizes what Phase 1 created, what passed verification, and where Phase 2 starts.
- `learnings/phase-1-foundation.md` - Deep-learning style explanation of the completed Phase 1 foundation.

**In plain English**
Phase 1 is now closed out with written notes. The repo has a short completion record for future development, and the learning folder has a deeper explanation of what was built and why it matters. This gives Phase 2 a clean starting point.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/docs/phase-1-foundation.md
+ created: Documents/codex/clicky/learnings/phase-1-foundation.md

---

## Step 7 - Verify App Launch And Build
*Completed: 2026-05-31*

**What was built**
- `package-lock.json` - Records the installed npm dependency tree for reproducible installs.
- `node_modules/` - Installed local npm dependencies for verification.
- `packages/ai/src/index.ts` - Replaces an empty placeholder with a real TypeScript input file.
- `packages/design/src/index.ts` - Replaces an empty placeholder with a real TypeScript input file.
- `packages/evals/src/index.ts` - Replaces an empty placeholder with a real TypeScript input file.
- `packages/ui/src/index.ts` - Replaces an empty placeholder with a real TypeScript input file.
- `apps/desktop/src-tauri/src/main.rs` - Updates the generated Tauri crate reference to match the renamed TouchPilot library.
- `target/release/touchpilot-desktop.exe` - Built Windows desktop executable.
- `target/release/bundle/msi/TouchPilot_0.1.0_x64_en-US.msi` - Built Windows MSI installer.
- `target/release/bundle/nsis/TouchPilot_0.1.0_x64-setup.exe` - Built Windows NSIS installer.

**In plain English**
The scaffold has now been proven, not just created. Dependencies installed, TypeScript checks passed, Rust checks passed, the frontend built, and Tauri produced a Windows executable plus installers. Two setup issues were found and fixed: empty TypeScript packages needed real files, and the generated Rust entrypoint still referenced the old placeholder app name.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/package-lock.json
+ created: Documents/codex/clicky/touchpilot/packages/ai/src/index.ts
+ created: Documents/codex/clicky/touchpilot/packages/design/src/index.ts
+ created: Documents/codex/clicky/touchpilot/packages/evals/src/index.ts
+ created: Documents/codex/clicky/touchpilot/packages/ui/src/index.ts
- deleted: Documents/codex/clicky/touchpilot/packages/ai/src/.gitkeep
- deleted: Documents/codex/clicky/touchpilot/packages/design/src/.gitkeep
- deleted: Documents/codex/clicky/touchpilot/packages/evals/src/.gitkeep
- deleted: Documents/codex/clicky/touchpilot/packages/ui/src/.gitkeep
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src-tauri/src/main.rs

**Verification**
- `npm install` passed with 0 vulnerabilities.
- `npm run check` passed.
- `npm --workspace @touchpilot/desktop run build` passed.
- `npm run desktop:build` passed and produced Windows bundles.

---

## Step 6 - Add Lint, Format, And Build Scripts
*Completed: 2026-05-31*

**What was built**
- `package.json` - Adds root scripts for build, check, TypeScript checks, Rust checks, Rust formatting, and desktop app commands.
- `apps/desktop/package.json` - Adds a desktop TypeScript check script.
- `packages/*/package.json` - Adds TypeScript check scripts for shared workspace packages.
- `packages/*/tsconfig.json` - Adds TypeScript project configs for placeholder shared packages.
- `packages/*/src/.gitkeep` - Keeps intentionally empty package source folders present.

**In plain English**
The project now has standard commands for checking the code instead of relying on one-off terminal commands. Even the placeholder packages have basic TypeScript configs, so they are ready to grow without needing setup later.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/packages/ai/tsconfig.json
+ created: Documents/codex/clicky/touchpilot/packages/ai/src/.gitkeep
+ created: Documents/codex/clicky/touchpilot/packages/design/tsconfig.json
+ created: Documents/codex/clicky/touchpilot/packages/design/src/.gitkeep
+ created: Documents/codex/clicky/touchpilot/packages/evals/tsconfig.json
+ created: Documents/codex/clicky/touchpilot/packages/evals/src/.gitkeep
+ created: Documents/codex/clicky/touchpilot/packages/ui/tsconfig.json
+ created: Documents/codex/clicky/touchpilot/packages/ui/src/.gitkeep
~ modified: Documents/codex/clicky/touchpilot/package.json
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/package.json
~ modified: Documents/codex/clicky/touchpilot/packages/ai/package.json
~ modified: Documents/codex/clicky/touchpilot/packages/design/package.json
~ modified: Documents/codex/clicky/touchpilot/packages/evals/package.json
~ modified: Documents/codex/clicky/touchpilot/packages/shared/package.json
~ modified: Documents/codex/clicky/touchpilot/packages/ui/package.json

---

## Step 5 - Add Shared Schemas
*Completed: 2026-05-31*

**What was built**
- `tsconfig.base.json` - Defines the shared TypeScript compiler baseline for workspace packages.
- `packages/shared/package.json` - Exposes the shared package entrypoint.
- `packages/shared/tsconfig.json` - Connects the shared package to the root TypeScript config.
- `packages/shared/src/index.ts` - Defines the first shared contracts for risk classes, assistant state, guidance output, gestures, screen context, and UI elements.

**In plain English**
The project now has a shared language for the main assistant concepts. Instead of each part of the app inventing its own version of "risk", "gesture", "screen", or "target", they can all use the same definitions. This reduces confusion as the desktop app, AI layer, safety system, and evals start talking to each other.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/tsconfig.base.json
+ created: Documents/codex/clicky/touchpilot/packages/shared/src/index.ts
+ created: Documents/codex/clicky/touchpilot/packages/shared/tsconfig.json
~ modified: Documents/codex/clicky/touchpilot/packages/shared/package.json

---

## Step 4 - Add Baseline Docs
*Completed: 2026-05-31*

**What was built**
- `docs/architecture.md` - Captures the system shape, product loop, and first milestone.
- `docs/safety.md` - Defines risk classes, policy rules, and early non-goals.
- `docs/roadmap.md` - Records the phased build plan from foundation through production readiness.
- `docs/clicky-reference.md` - Explains how Clicky should influence TouchPilot without becoming the codebase foundation.
- `docs/gestures.md` - Defines the first camera gestures, later gesture map, and local-processing privacy rules.

**In plain English**
The project now has written direction inside the repo. Anyone opening the folder can see what the product is, why it is cross-platform, how safety should work, why Clicky is only a reference, and which gestures come first. This keeps the build from drifting as code starts getting added.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/docs/architecture.md
+ created: Documents/codex/clicky/touchpilot/docs/safety.md
+ created: Documents/codex/clicky/touchpilot/docs/roadmap.md
+ created: Documents/codex/clicky/touchpilot/docs/clicky-reference.md
+ created: Documents/codex/clicky/touchpilot/docs/gestures.md

---

## Step 3 - Add Workspace Structure For Rust Crates And Shared Packages
*Completed: 2026-05-31*

**What was built**
- `package.json` - Defines the root npm workspace and desktop app scripts.
- `Cargo.toml` - Defines the root Rust workspace and shared Rust dependency versions.
- `crates/*/Cargo.toml` - Registers each native subsystem as its own Rust crate.
- `crates/*/src/lib.rs` - Adds minimal placeholder libraries so each crate is valid.
- `apps/gateway/package.json` - Registers the gateway as a future workspace package.
- `packages/*/package.json` - Registers shared TypeScript packages for AI, UI, evals, design, and shared types.

**In plain English**
The project folders are now connected into real workspaces. The JavaScript side knows where the apps and shared packages live, and the Rust side knows about each native module. These are still placeholders, but the project now has the backbone needed for a serious multi-package app.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/package.json
+ created: Documents/codex/clicky/touchpilot/Cargo.toml
+ created: Documents/codex/clicky/touchpilot/crates/accessibility/Cargo.toml
+ created: Documents/codex/clicky/touchpilot/crates/accessibility/src/lib.rs
+ created: Documents/codex/clicky/touchpilot/crates/capture/Cargo.toml
+ created: Documents/codex/clicky/touchpilot/crates/capture/src/lib.rs
+ created: Documents/codex/clicky/touchpilot/crates/gestures/Cargo.toml
+ created: Documents/codex/clicky/touchpilot/crates/gestures/src/lib.rs
+ created: Documents/codex/clicky/touchpilot/crates/input/Cargo.toml
+ created: Documents/codex/clicky/touchpilot/crates/input/src/lib.rs
+ created: Documents/codex/clicky/touchpilot/crates/overlay-native/Cargo.toml
+ created: Documents/codex/clicky/touchpilot/crates/overlay-native/src/lib.rs
+ created: Documents/codex/clicky/touchpilot/crates/safety/Cargo.toml
+ created: Documents/codex/clicky/touchpilot/crates/safety/src/lib.rs
+ created: Documents/codex/clicky/touchpilot/crates/storage/Cargo.toml
+ created: Documents/codex/clicky/touchpilot/crates/storage/src/lib.rs
+ created: Documents/codex/clicky/touchpilot/apps/gateway/package.json
+ created: Documents/codex/clicky/touchpilot/packages/ai/package.json
+ created: Documents/codex/clicky/touchpilot/packages/design/package.json
+ created: Documents/codex/clicky/touchpilot/packages/evals/package.json
+ created: Documents/codex/clicky/touchpilot/packages/shared/package.json
+ created: Documents/codex/clicky/touchpilot/packages/ui/package.json

---

## Step 2 - Scaffold Tauri v2 Desktop App
*Completed: 2026-05-31*

**What was built**
- `apps/desktop/package.json` - Defines the TouchPilot desktop frontend app and its Tauri/Vite scripts.
- `apps/desktop/src-tauri/` - Contains the Rust-side Tauri shell for the desktop app.
- `apps/desktop/src/` - Contains the generated React frontend starter.
- `apps/desktop/src-tauri/tauri.conf.json` - Defines the app identifier, product name, window title, and build settings.

**In plain English**
The desktop app now exists as a real Tauri project instead of an empty folder. It has the basic pieces needed for a cross-platform app: a visual frontend, a native desktop shell, and app configuration. I also renamed the generated placeholder branding so the shell identifies as TouchPilot.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/apps/desktop/.vscode/
+ created: Documents/codex/clicky/touchpilot/apps/desktop/public/
+ created: Documents/codex/clicky/touchpilot/apps/desktop/src/
+ created: Documents/codex/clicky/touchpilot/apps/desktop/src-tauri/
+ created: Documents/codex/clicky/touchpilot/apps/desktop/index.html
+ created: Documents/codex/clicky/touchpilot/apps/desktop/package.json
+ created: Documents/codex/clicky/touchpilot/apps/desktop/README.md
+ created: Documents/codex/clicky/touchpilot/apps/desktop/tsconfig.json
+ created: Documents/codex/clicky/touchpilot/apps/desktop/tsconfig.node.json
+ created: Documents/codex/clicky/touchpilot/apps/desktop/vite.config.ts
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/package.json
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src-tauri/Cargo.toml
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/src-tauri/tauri.conf.json
~ modified: Documents/codex/clicky/touchpilot/apps/desktop/README.md

---

## Step 1 - Create Project Root And Monorepo Folders
*Completed: 2026-05-31*

**What was built**
- `Documents/codex/clicky/touchpilot/` - The root folder for the new cross-platform assistant project.
- `apps/` - The place for runnable applications like the desktop app and backend gateway.
- `crates/` - The place for Rust-native modules such as capture, gestures, safety, and storage.
- `packages/` - The place for shared TypeScript packages such as UI, AI, schemas, evals, and design tokens.
- `docs/` - The place for architecture, safety, roadmap, and reference documentation.

**In plain English**
The project now has an organized home. Instead of putting everything into one messy folder, the structure separates the desktop app, backend gateway, native system code, shared UI/code packages, and documentation. Nothing has been installed yet; this step only created the shelves that the actual product will be built on.

**Files changed**
+ created: Documents/codex/clicky/touchpilot/apps/desktop/
+ created: Documents/codex/clicky/touchpilot/apps/gateway/
+ created: Documents/codex/clicky/touchpilot/crates/capture/
+ created: Documents/codex/clicky/touchpilot/crates/accessibility/
+ created: Documents/codex/clicky/touchpilot/crates/input/
+ created: Documents/codex/clicky/touchpilot/crates/gestures/
+ created: Documents/codex/clicky/touchpilot/crates/overlay-native/
+ created: Documents/codex/clicky/touchpilot/crates/safety/
+ created: Documents/codex/clicky/touchpilot/crates/storage/
+ created: Documents/codex/clicky/touchpilot/packages/ai/
+ created: Documents/codex/clicky/touchpilot/packages/ui/
+ created: Documents/codex/clicky/touchpilot/packages/shared/
+ created: Documents/codex/clicky/touchpilot/packages/evals/
+ created: Documents/codex/clicky/touchpilot/packages/design/
+ created: Documents/codex/clicky/touchpilot/docs/

---

---

## Step 8.9 - Runtime QA Script
*Completed: June 13, 2026*

**What was built**
- `touchpilot/scripts/windows-runtime-qa.ps1` - Windows runtime probe for overlay/settings native window behavior.
- `touchpilot/package.json` - Adds an npm shortcut for the runtime QA probe.

**In plain English**
TouchPilot now has a repeatable Windows check for the invisible overlay behavior. The script verifies the overlay exists, is fullscreen, has no titlebar, stays out of the taskbar, allows clicks through to apps underneath, and keeps the settings popup free of native chrome.

**Files changed**
+ created: touchpilot/scripts/windows-runtime-qa.ps1
~ modified: touchpilot/package.json

---

## Step 8.10 - Visual Screenshot QA
*Completed: June 13, 2026*

**What was built**
- `touchpilot/scripts/windows-visual-qa.ps1` - captures a Windows screenshot and checks for visible TouchPilot-created chrome or default panels.
- `touchpilot/package.json` - adds an npm shortcut for the visual QA probe.

**In plain English**
TouchPilot now has a visual acceptance check for the default runtime. It captures the screen, verifies TouchPilot is not showing titled windows or permanent panels by default, and uses OCR when available to catch forbidden old overlay text like `TouchPilot Overlay` or `CURRENT GUIDANCE`.

**Files changed**
+ created: touchpilot/scripts/windows-visual-qa.ps1
~ modified: touchpilot/package.json

---

## Step 8.11 - Faster Build Scripts
*Completed: June 13, 2026*

**What was built**
- `touchpilot/scripts/windows-tauri-build.ps1` - Windows helper for low-memory Tauri builds with optional no-bundle mode.
- `touchpilot/package.json` - Adds faster check/build shortcuts for desktop typecheck, frontend build, low-memory Windows build, and no-bundle release executable checks.

**In plain English**
TouchPilot now has quicker ways to check the desktop app without always running the slow full installer build. The full packaging path still exists, but Windows release checks can use one Rust job and a no-bundle path when we only need to prove the executable builds.

**Files changed**
+ created: touchpilot/scripts/windows-tauri-build.ps1
~ modified: touchpilot/package.json

---

## Phase 8 Correction - Windows Overlay Popup Mode
*Completed: June 13, 2026*

**What was built**
- `touchpilot/apps/desktop/src-tauri/tauri.conf.json` - stops using fullscreen mode for the overlay window.
- `touchpilot/apps/desktop/src-tauri/src/lib.rs` - sizes the overlay to the monitor bounds and applies popup/toolwindow/no-activate/click-through Windows styles.
- `touchpilot/scripts/windows-runtime-qa.ps1` and `touchpilot/scripts/windows-visual-qa.ps1` - fixes QA window filtering so helper windows do not cause false failures.

**In plain English**
TouchPilot now avoids Windows fullscreen-window behavior for the overlay. The overlay is sized to the monitor like a borderless utility popup, which should reduce the blue fullscreen/window artifact while keeping click-through behavior and the tray/settings split intact.

**Files changed**
~ modified: touchpilot/apps/desktop/src-tauri/tauri.conf.json
~ modified: touchpilot/apps/desktop/src-tauri/src/lib.rs
~ modified: touchpilot/scripts/windows-runtime-qa.ps1
~ modified: touchpilot/scripts/windows-visual-qa.ps1

---

## Phase 9 Step 9.1 - Gesture MVP Spec
*Completed: June 13, 2026*

**What was built**
- `touchpilot/docs/phase-9-gesture-mvp.md` - defines the camera gesture MVP rules, pinch/open-palm behavior, privacy constraints, Surface camera decision, data-contract requirements, and done criteria.

**In plain English**
TouchPilot now has a clear written contract for the first gesture phase. The app will use the local camera to detect hand landmarks, classify only pinch and open palm for the MVP, keep camera preview out of the normal overlay, and stay usable if camera permission fails.

**Files changed**
+ created: touchpilot/docs/phase-9-gesture-mvp.md

**Commit**
- `4596c0c docs: define phase 9 gesture mvp`

---

## Phase 9 Step 9.2 - Gesture Data Contracts
*Completed: June 13, 2026*

**What was built**
- `touchpilot/packages/shared/src/index.ts` - adds shared Phase 9 types for camera permission/status, camera devices, hand landmarks, gesture labels, gesture phases, thresholds, classifications, action events, and gesture runtime state.

**In plain English**
TouchPilot now has a common vocabulary for the gesture system before any camera code is added. Future camera, debug, settings, and overlay code can all talk about the same things: camera state, detected hand points, pinch/open-palm labels, confidence, hold timing, cooldown, and final assistant actions.

**Verification**
- `npm --workspace @touchpilot/shared run typecheck` passed.

**Files changed**
~ modified: touchpilot/packages/shared/src/index.ts

**Commit**
- `2805916 feat: add gesture data contracts`

---

## Phase 9 Step 9.3 - Camera Capability Probe
*Completed: June 13, 2026*

**What was built**
- `touchpilot/apps/desktop/src/cameraDevices.ts` - adds a small helper that enumerates video input devices and classifies likely RGB, IR, depth, virtual, or unknown cameras.
- `touchpilot/apps/desktop/src/App.tsx` - adds a debug-window camera devices section with refresh/probe status.
- `touchpilot/apps/desktop/src/App.css` - styles the debug-only camera device list and probe controls.

**In plain English**
TouchPilot can now look at what camera devices Windows exposes without turning the camera on. The debug window can show whether the machine reports a normal camera, IR-like camera, depth-like camera, virtual camera, or unknown camera, which lets us support Surface hardware carefully without making the MVP depend on it.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Files changed**
+ created: touchpilot/apps/desktop/src/cameraDevices.ts
~ modified: touchpilot/apps/desktop/src/App.tsx
~ modified: touchpilot/apps/desktop/src/App.css

**Commit**
- `6fc62c3 feat: add camera capability probe`

---

## Phase 9 Step 9.4 - Camera Settings Controls
*Completed: June 13, 2026*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - adds shared gesture runtime state and settings controls for camera enablement and gesture enablement.
- `touchpilot/apps/desktop/src/App.css` - adds compact settings toggle styling for the new camera and gesture controls.

**In plain English**
TouchPilot now has the user-facing switches needed before camera work starts. The settings popup can turn the camera path on or off and enable or disable gestures, while the debug window can see those states without showing camera UI in the normal overlay.

**Verification**
- The first desktop typecheck found a TypeScript narrowing error around `event.payload.enabled`.
- Fixed by storing `event.payload.enabled` in a local `enabled` constant before state updater closures.
- Final desktop typecheck should be run from the user terminal with `npm --workspace @touchpilot/desktop run typecheck`.

**Files changed**
~ modified: touchpilot/apps/desktop/src/App.tsx
~ modified: touchpilot/apps/desktop/src/App.css

**Commit**
- `2dca613 feat: add gesture settings toggles`

---

## Phase 9 Step 9.5 - Debug Camera Preview
*Completed: June 13, 2026*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - adds a debug-only camera preview that requests `getUserMedia`, reports permission/status, and stops camera tracks when disabled or unmounted.
- `touchpilot/apps/desktop/src/App.css` - adds dedicated styling for the debug camera preview surface.

**In plain English**
TouchPilot can now open the local camera stream inside the internal debug window only. The normal overlay still stays clean and cursor-first, while the debug window can prove whether camera permission and live video are working before we add hand tracking.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Files changed**
~ modified: touchpilot/apps/desktop/src/App.tsx
~ modified: touchpilot/apps/desktop/src/App.css

**Commit**
- `cb70865 feat: add debug camera preview`

---

## Phase 9 Step 9.6 - MediaPipe Hand Landmarker Prototype
*Completed: June 13, 2026*

**What was built**
- `touchpilot/apps/desktop/src/handLandmarker.ts` - adds the MediaPipe Hand Landmarker helper for local hand landmark detection from the debug camera video.
- `touchpilot/apps/desktop/src/App.tsx` - runs the hand landmarker while the debug camera preview is active and shows landmark status, frame id, handedness, confidence, and landmark count.
- `touchpilot/apps/desktop/package.json` and `touchpilot/package-lock.json` - add `@mediapipe/tasks-vision`.

**In plain English**
TouchPilot can now detect whether a hand is visible in the debug camera stream and report the hand landmark status internally. This still does not trigger gestures yet; it only proves the local hand-tracking layer is wired.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Files changed**
+ created: touchpilot/apps/desktop/src/handLandmarker.ts
~ modified: touchpilot/apps/desktop/src/App.tsx
~ modified: touchpilot/apps/desktop/package.json
~ modified: touchpilot/package-lock.json

**Commit**
- `dc7fa84 feat: add hand landmark prototype`

---

## Phase 9 Step 9.7 - Pinch Classifier
*Completed: June 14, 2026*

**What was built**
- `touchpilot/apps/desktop/src/gestureClassifier.ts` - adds a pure pinch classifier using normalized thumb-tip/index-tip distance.
- `touchpilot/apps/desktop/src/App.tsx` - shows the live pinch label, phase, normalized distance, threshold, and confidence in the debug window.

**In plain English**
TouchPilot can now look at the detected hand landmarks and decide whether the hand is forming a pinch candidate. This does not activate the assistant yet; it only gives us the debug signal needed before adding smoothing and action wiring.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Files changed**
+ created: touchpilot/apps/desktop/src/gestureClassifier.ts
~ modified: touchpilot/apps/desktop/src/App.tsx

**Commit**
- `34bb02e feat: add pinch gesture classifier`

---

## Phase 9 Step 9.8 - Open Palm Classifier
*Completed: June 14, 2026*

**What was built**
- `touchpilot/apps/desktop/src/gestureClassifier.ts` - adds an open-palm classifier using finger extension count and normalized fingertip spread.
- `touchpilot/apps/desktop/src/App.tsx` - shows the live open-palm label, phase, extended-finger count, spread, threshold, and confidence in the debug window.

**In plain English**
TouchPilot can now look at detected hand landmarks and decide whether the hand is forming an open-palm candidate. This still does not pause or stop the assistant yet; it only gives us the raw debug signal before smoothing and action wiring.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Files changed**
~ modified: touchpilot/apps/desktop/src/gestureClassifier.ts
~ modified: touchpilot/apps/desktop/src/App.tsx

**Commit**
- `943b525 feat: add open palm classifier`

---

## Phase 9 Step 9.9 - Gesture Smoothing And Cooldowns
*Completed: June 14, 2026*

**What was built**
- `touchpilot/apps/desktop/src/gestureSmoothing.ts` - adds hold-duration and cooldown smoothing for raw gesture candidates.
- `touchpilot/apps/desktop/src/App.tsx` - publishes smoothed gesture state to the shared runtime snapshot and shows stable gesture phase, hold time, cooldown, and confidence in the debug window.

**In plain English**
TouchPilot now waits for a gesture to be stable before treating it as recognized, and it adds a cooldown so one held gesture does not fire repeatedly. This still does not activate or pause the assistant yet; it creates the stable signal that the next wiring steps will use.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Files changed**
+ created: touchpilot/apps/desktop/src/gestureSmoothing.ts
~ modified: touchpilot/apps/desktop/src/App.tsx

**Commit**
- `ecf0801 feat: add gesture smoothing`

---

## Phase 9 Step 9.10 - Pinch Activation Wiring
*Completed: June 14, 2026*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - maps a recognized smoothed pinch to an `activate_assistant` gesture action and moves the overlay into listening state.

**In plain English**
TouchPilot can now react to a stable pinch by entering listening mode. The debug window also records the last gesture action so we can confirm pinch activation fired without adding voice mode yet.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Files changed**
~ modified: touchpilot/apps/desktop/src/App.tsx

**Commit**
- `5058cdb feat: activate assistant on pinch`

---

## Phase 9 Step 9.11 - Open Palm Pause Wiring
*Completed: June 14, 2026*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - maps a recognized smoothed open palm to a `pause_assistant` gesture action and moves the overlay into paused state.

**In plain English**
TouchPilot can now react to a stable open palm by pausing the assistant. The debug action readout records whether the gesture action came from pinch activation or open-palm pause.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Files changed**
~ modified: touchpilot/apps/desktop/src/App.tsx

**Commit**
- `8bc2d96 feat: pause assistant on open palm`

---

## Phase 9 Step 9.12 - Camera Privacy And Failure Handling
*Completed: June 14, 2026*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - clears hand/gesture state when camera is disabled or unavailable, disables gestures on camera failure, and adds clear debug messages for camera off, permission denied, and no camera cases.

**In plain English**
TouchPilot now treats camera problems as safe fallback states. If the camera is off, denied, missing, or failing, gesture recognition shuts down cleanly and the app remains usable through manual controls.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Files changed**
~ modified: touchpilot/apps/desktop/src/App.tsx

**Commit**
- `9c62211 fix camera failure states`

---

## Phase 9 Step 9.13 - Gesture Runtime QA
*Completed: June 14, 2026*

**What was built**
- `touchpilot/docs/phase-9-gesture-runtime-qa.md` - adds the runtime QA checklist for camera permission, device probing, debug preview, hand landmarks, pinch, open palm, cooldowns, camera-off behavior, permission denied, no-camera fallback, and remaining risks.

**In plain English**
TouchPilot now has a concrete checklist for manually verifying the gesture MVP. It explains what should pass, what should fail, and what remains unproven before we call Phase 9 fully verified.

**Verification**
- Docs-only step. No typecheck required.

**Files changed**
+ created: touchpilot/docs/phase-9-gesture-runtime-qa.md

**Commit**
- `6d32d20 docs: gesture runtime qa`

---

## Phase 9 Step 9.14 - Phase 9 Checks
*Completed: June 14, 2026*

**What was built**
- `touchpilot/docs/phase-9-gesture-checks.md` - records the passing desktop TypeScript check, Rust workspace check, desktop frontend production build, remaining manual runtime QA items, and known MediaPipe asset risk.

**In plain English**
TouchPilot's Phase 9 gesture code now has a recorded verification checkpoint. The app compiles and bundles with the gesture contracts, camera controls, debug preview, MediaPipe hand landmarks, classifiers, smoothing, and action wiring in place.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `cargo check --workspace` passed.
- `npm --workspace @touchpilot/desktop run build` passed.

**Files changed**
+ created: touchpilot/docs/phase-9-gesture-checks.md

**Commit**
- `b26ecc1 docs: record phase 9 checks`

---

## Phase 9 Step 9.15 - Phase 9 Closeout And Deeplearn Update
*Completed: June 14, 2026*

**What was built**
- `learnings/phase-9-gesture-mvp.md` - updates the Phase 9 learning doc with the completed implementation details, file responsibilities, checks, and remaining risks.
- `touchpilot/docs/phase-9-gesture-completion.md` - adds the repo-facing Phase 9 completion note.

**In plain English**
Phase 9 is now documented as complete. The learning doc explains what we actually built and why it is structured that way, while the completion note gives the short project-facing summary.

**Verification**
- Step 9.14 recorded the passing typecheck, Rust check, and desktop web build.

**Files changed**
~ modified: learnings/phase-9-gesture-mvp.md
+ created: touchpilot/docs/phase-9-gesture-completion.md

**Commits**
- `c74f9e2 docs: update gesture learning`
- `ff754d4 docs: close phase 9 gestures`
---

## Step 10.1 - Voice UX Spec
*Completed: 2026-06-15*

**What was built**
- `learnings/plan.md` - updates Phase 10 to be voice-first with debug-only text fallback.
- `touchpilot/docs/roadmap.md` - aligns the compact roadmap with the voice-first decision.
- `touchpilot/docs/phase-10-voice-ux.md` - defines the Phase 10 voice UX rules and manual QA target.

**In plain English**
Phase 10 now has a clear product rule: users should speak commands, not type into a visible chatbot-style prompt. Text input is allowed only as a debug fallback so we can test the guidance loop when microphone or transcription behavior is flaky. This keeps TouchPilot aligned with the cursor-first, voice-first assistant idea.

**Files changed**
~ modified: `learnings/plan.md`
~ modified: `touchpilot/docs/roadmap.md`
+ created: `touchpilot/docs/phase-10-voice-ux.md`
---

## Step 10.2 - Voice State Model
*Completed: 2026-06-16*

**What was built**
- `touchpilot/packages/shared/src/index.ts` - adds shared voice permission, status, transcript, command request, and runtime state types.

**In plain English**
TouchPilot now has names for every important voice state: waiting, asking for microphone access, listening, transcribing, command ready, cancelled, and error. This gives the next steps a shared language so the settings popup, debug window, overlay, and gesture layer can all talk about voice in the same way.

**Files changed**
~ modified: `touchpilot/packages/shared/src/index.ts`
---

## Step 10.3 - Mic Permission Probe
*Completed: 2026-06-16*

**What was built**
- `touchpilot/apps/desktop/src/voiceCapabilities.ts` - checks microphone device support, permission status, getUserMedia, Permissions API, and browser speech API availability.
- `touchpilot/apps/desktop/src/App.tsx` - adds a debug Voice Capabilities panel with Probe and Request mic actions.

**In plain English**
TouchPilot can now inspect whether this machine and WebView can support voice input before we build the listening flow. The debug window shows whether microphone APIs exist, whether permission is granted or denied, which microphones are visible, and whether browser speech recognition exists.

**Files changed**
+ created: `touchpilot/apps/desktop/src/voiceCapabilities.ts`
~ modified: `touchpilot/apps/desktop/src/App.tsx`
---

## Step 10.4 - Manual Voice Activation Controls
*Completed: 2026-06-16*

**What was built**
- `apps/desktop/src/App.tsx` - adds shared voice runtime state plus settings/debug controls to start and stop listening mode.

**In plain English**
TouchPilot now has a manual way to enter voice-listening mode before real transcription is connected. The settings popup gets a Voice toggle, and the debug window gets Start listening and Stop controls. This proves the app can switch into a voice state cleanly without depending on gestures yet.

**Files changed**
~ modified: apps/desktop/src/App.tsx

**Commit**
- `60a3a80 voice activation controls`
---

## Step 10.5 - Browser Speech Recognition Wiring
*Completed: 2026-06-16*

**What was built**
- `apps/desktop/src/voiceRecognition.ts` - wraps browser speech recognition into a small start/stop session helper.
- `apps/desktop/src/App.tsx` - connects the Voice toggle and debug controls to real recognition state, transcript text, command-ready state, and errors.

**In plain English**
TouchPilot can now try to listen through the WebView speech recognition API. If speech recognition is available, the app can capture heard text and mark it as a pending voice command. If the WebView does not support it, the debug and settings state can show the error instead of pretending voice works.

**Files changed**
+ created: apps/desktop/src/voiceRecognition.ts
~ modified: apps/desktop/src/App.tsx

**Commits**
- `24f5e83 add voice recognition wrapper`
- `5777047 wire voice recognition state`
---

## Step 10.6 - Route Voice Commands To Guidance
*Completed: 2026-06-16*

**What was built**
- `apps/desktop/src/App.tsx` - routes final voice command text into the existing screen capture and guidance request loop.

**In plain English**
TouchPilot can now take a finished spoken command and use it as the goal for the current screen. After voice recognition produces final text, the app refreshes the screen context and asks the guidance loop what target should be shown for that goal.

**Files changed**
~ modified: apps/desktop/src/App.tsx

**Commit**
- `fd585e2 route voice commands to guidance`
---

## Step 10.7 - Voice Status UI
*Completed: 2026-06-16*

**What was built**
- `apps/desktop/src/App.tsx` - adds readable voice status details and shows a small cursor-adjacent status cue while voice is active.
- `apps/desktop/src/App.css` - styles the voice status cue and active voice row without making the overlay interactive.

**In plain English**
TouchPilot now tells you what voice is doing instead of silently changing internal state. When voice is listening, processing, ready, or unavailable, a small cue appears near the cursor and the settings/debug windows show clearer messages.

**Files changed**
~ modified: apps/desktop/src/App.tsx
~ modified: apps/desktop/src/App.css

**Commits**
- `c1205d2 show voice runtime status`
- `37e5844 style voice status cue`
---

## Step 10.8 - Voice Interruption And Stop
*Completed: 2026-06-16*

**What was built**
- `apps/desktop/src/App.tsx` - cancels active voice sessions cleanly from Stop, Pause, and open-palm pause paths.

**In plain English**
TouchPilot can now stop voice cleanly instead of leaving old listening sessions or old transcripts hanging around. Pausing the assistant also stops voice, so the app has one clear interruption behavior.

**Files changed**
~ modified: apps/desktop/src/App.tsx

**Commit**
- `a9cf807 cancel voice cleanly`
---

## Step 10.9 - Voice Runtime QA Checklist
*Completed: 2026-06-16*

**What was built**
- `docs/phase-10-voice-runtime-qa.md` - documents the manual QA path for settings voice toggles, debug probes, speech support, voice status, guidance routing, and interruption behavior.

**In plain English**
TouchPilot now has a clear checklist for testing whether voice actually works on this Windows WebView. It separates real failures from expected unsupported-platform results, so we can tell whether the UI is broken or the browser speech API simply is not available.

**Files changed**
+ created: docs/phase-10-voice-runtime-qa.md

**Commit**
- `720bad3 add voice runtime qa checklist`
---

## Step 10.10 - Voice QA Reset Plan
*Completed: 2026-06-16*

**What was built**
- `learnings/plan.md` - revises Phase 10 around native Rust microphone capture, cloud transcription, push-to-talk, voice-controlled camera activation, and tabbed debug.
- `docs/phase-10-voice-ux.md` - updates the UX direction after manual QA exposed Web Speech and settings/debug issues.
- `docs/phase-10-voice-runtime-qa.md` - records the failed QA result and replacement Step 10.10 plan.
- `C:\Users\Pumba\codex\clicky\phase-10-voice-architecture-reset.md` - deeplearn note explaining the tradeoffs and corrected architecture.

**In plain English**
The voice test proved that the quick Web Speech path can capture commands, but it is not good enough as the real product path. The plan now moves Phase 10 toward push-to-talk, native microphone capture, cloud transcription, a cleaner settings popup, voice-controlled camera activation, and tabbed debug.

**Files changed**
~ modified: learnings/plan.md
~ modified: docs/phase-10-voice-ux.md
~ modified: docs/phase-10-voice-runtime-qa.md
+ created: C:\Users\Pumba\codex\clicky\phase-10-voice-architecture-reset.md

**Commits**
- `8bf4ae5 revise phase 10 voice plan`
- `d64f789 update voice ux direction`
- `1ee4133 record voice qa reset`
---

## Corrected Step 10.10A - Push-To-Talk Settings
*Completed: 2026-06-16*

**What was built**
- `apps/desktop/src/App.tsx` - replaces normal settings voice toggle with push-to-talk behavior and keeps Web Speech debug-only.
- `apps/desktop/src/App.css` - styles the push-to-talk settings control and removes stale switch-row styling.

**In plain English**
Settings no longer looks like a webcam/config panel with Camera, Gestures, and Voice toggles. It now has a single hold-to-talk control for the user-facing voice flow, while the old Web Speech experiment is kept in debug so it does not trigger browser-like voice UI during normal use.

**Files changed**
~ modified: apps/desktop/src/App.tsx
~ modified: apps/desktop/src/App.css

**Commits**
- `384dc99 make settings voice push to talk`
- `047335b style push to talk settings`
---

## Corrected Step 10.10B - Tabbed Debug And Test Guidance
*Completed: 2026-06-16*

**What was built**
- `apps/desktop/src/App.tsx` - groups debug tools into Runtime, Voice, Gesture, Capture, and Guidance tabs, and adds a debug-only Test guidance action.
- `apps/desktop/src/App.css` - adds compact debug tab styling and reduces oversized debug control/card treatment.

**In plain English**
Debug is no longer one crowded wall of controls. It is split into tabs so runtime state, voice, gestures, capture, and guidance can be checked separately. The mock target path now has a clear Test guidance button instead of being hidden behind voice or refresh behavior.

**Files changed**
~ modified: apps/desktop/src/App.tsx
~ modified: apps/desktop/src/App.css

**Commits**
- `c9565cf organize debug into tabs`
- `09b178b compact debug tab styling`
---

## Corrected Step 10.10C - Native Voice Capture Boundary
*Completed: 2026-06-16*

**What was built**
- `apps/desktop/src-tauri/src/lib.rs` - adds native voice capture status/start/stop Tauri commands backed by a lightweight Rust session store.
- `apps/desktop/src/nativeVoiceCapture.ts` - exposes typed frontend calls for native capture commands.
- `apps/desktop/src/voiceTranscription.ts` - creates the cloud transcription adapter boundary.
- `apps/desktop/src/App.tsx` - wires settings push-to-talk to native capture and keeps Web Speech debug-only.

**In plain English**
TouchPilot now has the correct voice architecture boundary. The normal push-to-talk path goes through native desktop commands instead of browser speech, while Web Speech stays in debug. Real audio recording and cloud transcription are still placeholders, but the app now has the right structure to add them cleanly.

**Files changed**
~ modified: apps/desktop/src-tauri/src/lib.rs
+ created: apps/desktop/src/nativeVoiceCapture.ts
+ created: apps/desktop/src/voiceTranscription.ts
~ modified: apps/desktop/src/App.tsx

**Verification**
- `cargo check --workspace` passed
- `npm --workspace @touchpilot/desktop run typecheck` passed

**Commits**
- `2f99093 add native voice capture commands`
- `b4a571d add native voice capture adapter`
- `d0eb7f7 add voice transcription boundary`
- `ecf195a wire push to talk to native capture`

---

## Corrected Step 10.10D - Real Native Microphone Capture
*Completed: 2026-06-17*

**What was built**
- `apps/desktop/src-tauri/Cargo.toml` and `Cargo.lock` - added native audio capture dependencies.
- `apps/desktop/src-tauri/src/lib.rs` - records microphone input with CPAL, keeps the audio stream inside a worker thread, and returns WAV/base64 audio from stop.
- `apps/desktop/src/nativeVoiceCapture.ts` - exposes sample rate, channel count, device name, and audio payload fields to the frontend.
- `apps/desktop/src/voiceTranscription.ts` - updates the transcription boundary to recognize real native audio while cloud transcription remains unconfigured.

**In plain English**
Push-to-talk no longer stops at a fake placeholder. The native side now records the default microphone while the user holds the button, stops when released, packages the audio as a WAV, and sends it back through the app boundary. The next step is turning that WAV into text with a cloud transcription provider.

**Important fix**
CPAL streams cannot be stored directly in Tauri managed state because they are not `Send`. The fix was to keep the stream inside a dedicated recording thread and store only safe control/state handles in Tauri.

**Verification**
- `cargo check --workspace` passed
- `npm --workspace @touchpilot/desktop run typecheck` passed

**Commits**
- `e5b4251 chore: add native audio capture deps`
- `c4a6202 feat: capture native microphone audio`
- `b823403 feat: expose native audio capture payload`
- `7bc5892 fix: report native audio transcription boundary`

---

## Corrected Step 10.10E - Cloud Transcription Wiring
*Completed: 2026-06-17*

**What was built**
- `apps/desktop/src-tauri/Cargo.toml` and `Cargo.lock` - added the native HTTP dependency used for transcription calls.
- `apps/desktop/src-tauri/src/lib.rs` - adds `transcribe_voice_capture`, a Rust-side command that sends captured WAV audio to the OpenAI transcription endpoint using `OPENAI_API_KEY`.
- `apps/desktop/src/voiceTranscription.ts` - routes captured native audio through the Rust transcription command and returns a final `VoiceTranscript`.

**In plain English**
TouchPilot can now take the audio recorded by push-to-talk and send it to a cloud transcription provider. If the provider returns text, that text becomes the command that flows into the existing screen guidance loop.

**Runtime requirement**
Launch TouchPilot from a terminal/session that has `OPENAI_API_KEY` set. Optional overrides:
- `TOUCHPILOT_TRANSCRIPTION_URL`
- `TOUCHPILOT_TRANSCRIPTION_MODEL`

**Verification**
- `cargo check --workspace` passed
- `npm --workspace @touchpilot/desktop run typecheck` passed

**Commits**
- `e10b6b2 chore: add transcription http dependency`
- `3594d3a feat: transcribe native voice capture`
- `c4ff2fd feat: route voice capture to transcription`

---

## Phase M0 Step 1 - Mac migration plan and dirty-tree audit
*Completed: 2026-06-25*

**What was built**
- `learnings/plan.md` - Adds the Mac migration track as Phase M0-M4 and declares macOS as the primary product target for the next stretch.

**In plain English**
The plan now treats the Mac move as its own migration track, not as a random part of Phase 10. We also checked the current Mac repo and found the real planned change is the Mac phase update, while many app files appear dirty because of Windows line-ending churn from the migration.

**Files changed**
~ modified: learnings/plan.md

**Commit**
- `bcbc04c docs: add mac migration phases`

**Push status**
- Push blocked on this Mac because git is still configured to use a Windows GitHub CLI credential helper path: `C:\Program Files\GitHub CLI\gh.exe`.


---

## Phase M0 Step 2 - Mac git credentials and line-ending cleanup
*Completed: 2026-06-25*

**What was built**
- `.gitattributes` - Adds stable line-ending rules so Windows/Mac checkouts do not keep making source files look modified.

**In plain English**
The Mac repo can now push to GitHub correctly, and the noisy false app-file changes are gone. The problem was not real code edits; it was a Windows GitHub credential helper path and Windows-style line endings carried into the Mac checkout.

**Files changed**
+ created: .gitattributes

**Commits**
- `bcbc04c docs: add mac migration phases`
- `3c76397 chore: normalize text line endings`


---

## Phase M0 Step 3 - Mac dependency and build sanity
*Completed: 2026-06-25*

**What was checked**
- Rust installed through rustup and activated for the shell.
- Node and npm are available on the Mac.
- Windows-copied `node_modules` executable permissions were repaired.
- Shared TypeScript typecheck passed.
- Desktop TypeScript typecheck passed.
- Rust workspace check passed on macOS.
- Desktop web build passed on macOS.

**In plain English**
The Mac can now build and check the TouchPilot code. The main migration problem was not app code; it was missing Rust and copied dependency files that were not executable on macOS.

**Verification**
- `npm --workspace @touchpilot/shared run typecheck` passed
- `npm --workspace @touchpilot/desktop run typecheck` passed
- `cargo check --workspace` passed
- `npm --workspace @touchpilot/desktop run build` passed

**Commit**
- No project code commit was needed for this step.


---

## Phase M0 Step 4 - Launch Tauri dev app on Mac
*Completed: 2026-06-25*

**What was checked**
- Tauri dev app launched on macOS after running unsandboxed so localhost ports and GUI access were allowed.
- Vite served the desktop frontend at `http://127.0.0.1:1420/`.
- Cargo compiled and ran the desktop binary on macOS.
- The dev process was stopped cleanly after launch verification.

**In plain English**
The Mac can now launch the actual TouchPilot desktop shell, not just compile the code. The app starts, but macOS warns that transparent windows need `macOSPrivateApi` enabled, which becomes an M1 runtime-shell issue.

**Runtime warning**
- Transparent windows on macOS report: `macos-private-api` is not enabled.

**Commit**
- No project code commit was needed for this launch-check step.


---

## Phase M0 Step 5 - Document Mac primary status and migration findings
*Completed: 2026-06-25*

**What was built**
- `touchpilot/docs/roadmap.md` - Adds the Mac migration track to the repo roadmap.
- `touchpilot/docs/mac-migration.md` - Records M0 findings, platform priority, and the M1 transparent-window warning.
- `learnings/mac-migration-sanity.md` - Captures what broke during migration and how it was fixed.

**In plain English**
The Mac migration is now documented in the repo. Anyone resuming the project can see that macOS is the primary target, what checks passed, what migration issues were fixed, and why transparent-window behavior is the next Mac-specific issue.

**Files changed**
~ modified: touchpilot/docs/roadmap.md
+ created: touchpilot/docs/mac-migration.md
+ created: learnings/mac-migration-sanity.md

**Commits**
- `9a798e7 docs: add mac track to roadmap`
- `e859403 docs: record mac migration findings`
- `f62578d docs: add mac migration learning note`


---

## Phase M1 Step 1 - Enable macOS transparent window support
*Completed: 2026-06-25*

**What was built**
- `touchpilot/apps/desktop/src-tauri/tauri.conf.json` - Enables `app.macOSPrivateApi` for transparent macOS windows.
- `touchpilot/apps/desktop/src-tauri/Cargo.toml` - Enables Tauri's matching `macos-private-api` Rust feature.
- `learnings/mac-migration-sanity.md` - Records why macOS needs both config and Cargo feature support.

**In plain English**
The Mac app no longer launches with Tauri's transparent-window warning. macOS requires an explicit private-API opt-in for transparent overlay windows, and Tauri requires that opt-in to be set in both config and Rust features.

**Verification**
- `cargo check --workspace` passed.
- `tauri dev` launched successfully.
- The previous `macos-private-api` transparent-window warning did not appear.

**Commits**
- `2577496 fix: enable mac transparent windows`
- `bba306c docs: record mac transparent window fix`


---

## Phase M1 Step 2 - Validate settings popup behavior on macOS
*Completed: 2026-06-25*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - Uses Tauri's native `startDragging()` for the settings popup header.
- `touchpilot/apps/desktop/src-tauri/src/lib.rs` - Removes the old custom `move_settings_window` command.
- `learnings/mac-migration-sanity.md` - Records why native dragging is the better Mac-shell path.

**In plain English**
The settings popup now relies on native window dragging instead of manually chasing pointer coordinates through React. That is a better fit for macOS because the popup is a real desktop window, not a draggable HTML card.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `cargo check --workspace` passed.
- `tauri dev` compiled and reached the app runner without the transparent-window warning.

**Commits**
- `7bb3dd1 fix settings popup dragging`
- `f1296fe docs: note mac settings drag path`


---

## Phase M1 Step 3 - Validate transparent overlay behavior on macOS
*Completed: 2026-06-25*

**What was built**
- `touchpilot/scripts/macos-runtime-qa.sh` - Adds a macOS runtime probe for the running TouchPilot process and optional System Events window reporting.
- `touchpilot/package.json` - Adds `npm run qa:mac:runtime`.
- `touchpilot/docs/macos-runtime-qa.md` - Defines the manual macOS overlay accept/fail checklist.
- `learnings/mac-migration-sanity.md` - Records the Mac overlay QA path and its limits.

**In plain English**
The Mac overlay already uses the monitor-sized borderless transparent-window approach. This step added a repeatable Mac runtime check and a concrete manual checklist so we do not rely on vague screenshots or assumptions.

**Verification**
- `package.json` parses correctly.
- `npm run qa:mac:runtime` fails cleanly when TouchPilot is not running.
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Manual check still required**
- Launch TouchPilot on the Mac.
- Run `npm run qa:mac:runtime`.
- Confirm the overlay has no titlebar, desktop apps remain clickable, and the puck follows the cursor.

**Commits**
- `3c7b52f add mac runtime qa script`
- `43365e5 docs: add mac runtime qa checklist`
- `bd4ab3e docs: record mac overlay qa path`


---

## Phase M1 Step 4 - Remove Windows-only assumptions from default runtime
*Completed: 2026-06-25*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - Replaced Windows-specific camera permission copy with platform-neutral system privacy copy.
- `touchpilot/package.json` - Added `desktop:release:mac` and `desktop:release:windows:exe` script names.
- `touchpilot/docs/mac-migration.md` - Updated Mac commands and marked the transparent-window warning resolved.
- `learnings/mac-migration-sanity.md` - Recorded the default-runtime cleanup.

**In plain English**
The Mac app no longer talks like Windows is the assumed runtime. Camera permission copy now works across platforms, and release scripts clearly separate Mac and Windows paths.

**Verification**
- `package.json` parses correctly.
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- Search confirmed the old `Windows privacy` runtime copy is gone.

**Commits**
- `74f2b9d fix camera permission copy`
- `a6fe960 add mac release script`
- `db94d5d docs: update mac migration commands`
- `64141d9 docs: note mac runtime cleanup`


---

## Phase M2 Step 1 - Test screen capture on Mac
*Completed: 2026-06-25*

**What was built**
- `touchpilot/crates/capture/examples/capture_probe.rs` - Adds a small capture probe that calls the real capture crate.
- `touchpilot/package.json` - Adds `npm run qa:mac:capture`.
- `touchpilot/docs/macos-capture-qa.md` - Documents Mac capture QA and Screen Recording permission behavior.
- `touchpilot/docs/mac-migration.md` - Records the Mac capture result.
- `learnings/mac-migration-sanity.md` - Records the sandbox-vs-normal-process capture finding.

**In plain English**
Mac screen capture works, but it must be tested from a process that can see the desktop. Inside the restricted shell it reported no displays. Outside the sandbox, the same probe captured the screen successfully.

**Verification**
- First sandbox run failed cleanly: `no display available for capture`.
- Outside sandbox, `npm run qa:mac:capture` passed.
- Captured metadata: `1470x956` at scale `2`.
- Captured screenshot: `2940x1912`.

**Commits**
- `40338f6 add mac capture probe`
- `0818c64 docs: add mac capture qa`
- `2f3778c docs: record mac capture result`


---

## Phase M2 Step 2 - Record Screen Recording permission behavior
*Completed: 2026-06-25*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - Formats permission-like capture failures with a macOS Screen Recording hint.
- `touchpilot/docs/macos-capture-qa.md` - Documents Screen Recording permission and relaunch behavior.
- `learnings/mac-migration-sanity.md` - Records the permission guidance pattern.

**In plain English**
If capture fails because macOS hides the screen from TouchPilot, the app now tells the user what to do: grant Screen Recording permission and relaunch. This is much better than a raw `no display available` error.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm run qa:mac:capture` passed outside the sandbox.
- Latest successful capture: `1470x956` display at scale `2`, screenshot `2940x1912`.

**Commits**
- `3e61611 fix mac capture permission message`
- `28da8d2 docs: clarify mac screen recording access`
- `59ad440 docs: note mac capture permission hint`


---

## Phase M2 Step 3 - Verify capture dimensions match overlay coordinates
*Completed: 2026-06-25*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - Calibration now checks screenshot pixel size against `display size * scale factor`.
- `touchpilot/docs/macos-capture-qa.md` - Documents the Retina coordinate relationship.
- `learnings/mac-migration-sanity.md` - Records why logical coordinates and physical screenshot pixels must stay distinct.

**In plain English**
Mac Retina screens use logical UI points and denser screenshot pixels. TouchPilot now checks that relationship so we can catch bad coordinate mapping before guidance starts pointing at the wrong place.

**Verification**
- `npm --workspace @touchpilot/desktop run typecheck` passed.
- `npm run qa:mac:capture` passed outside the sandbox.
- Display metadata: `1470x956` at scale `2`.
- Screenshot: `2940x1912`, matching expected Retina scale.

**Commits**
- `f0ed363 check retina capture scale`
- `1953968 docs: add mac capture scale check`
- `dcefc81 docs: record retina capture mapping`


---

## Phase M3 Step 1 - Test native mic capture on Mac
*Completed: 2026-06-26*

**What was built**
- `touchpilot/apps/desktop/src-tauri/examples/mic_capture_probe.rs` - Adds a native CPAL microphone probe that records samples for two seconds.
- `touchpilot/package.json` - Adds `npm run qa:mac:mic`.
- `touchpilot/docs/macos-voice-qa.md` - Documents Mac microphone QA and permission behavior.
- `learnings/mac-migration-sanity.md` - Records the successful Mac mic capture result.

**In plain English**
TouchPilot can now prove the Mac microphone works before trying transcription. The probe opens the microphone, listens briefly, counts real audio samples, and reports whether sound came through.

**Verification**
- `npm run qa:mac:mic` passed outside the sandbox.
- Device: `External Microphone`.
- Sample rate: `48000`.
- Channels: `1`.
- Format: `F32`.
- Captured samples: `96256`.
- `cargo check --workspace` passed.

**Commits**
- `32c51bd add mac mic capture probe`
- `10c8c19 docs: add mac voice qa`
- `c903a5c docs: record mac mic capture`


---

## Phase M3 Step 2A - Switch transcription QA to free local Whisper
*Completed: 2026-06-26*

**What was built**
- `touchpilot/apps/desktop/src-tauri/examples/voice_transcription_probe.rs` - Defaults transcription QA to local `whisper.cpp`, with OpenAI kept as an explicit provider option.
- `touchpilot/docs/macos-voice-qa.md` - Documents local Whisper setup and OpenAI as optional.

**In plain English**
The voice test no longer depends on paid OpenAI credits. TouchPilot now expects local Whisper for the free transcription path, while OpenAI remains available only if you choose it and have quota.

**Verification**
- `cargo check -p touchpilot-desktop --example voice_transcription_probe` passed.
- `package.json` parsed successfully.
- Local Whisper was not run yet because `whisper-cli` and a model are not installed on this Mac.

**Commits**
- `5768566 default voice probe to local whisper`
- `6e699e0 docs: make local whisper default`


---

## Phase M3 Step 2B - Install and verify local Whisper on Mac
*Completed: 2026-06-26*

**What was built**
- Installed official `whisper.cpp` locally under `~/tools/whisper.cpp`.
- Downloaded the `base.en` model to `~/tools/whisper.cpp/models/ggml-base.en.bin`.
- Installed user-local CMake through Python because Homebrew was not present and `whisper.cpp` now builds through CMake.
- Built `~/tools/whisper.cpp/build/bin/whisper-cli`.
- Updated TouchPilot's transcription probe to auto-detect the local binary/model.
- Updated Mac voice QA docs with the local install path.

**In plain English**
TouchPilot now has a free local transcription engine on this Mac. The app no longer needs paid OpenAI credits just to test the voice path. The QA probe can find the local Whisper binary and model automatically.

**Verification**
- `make base.en` downloaded the model but failed at build time because `cmake` was missing.
- `python3 -m pip install --user cmake` installed user-local CMake.
- `~/Library/Python/3.9/bin/cmake -B build` passed.
- `~/Library/Python/3.9/bin/cmake --build build --target whisper-cli -j 4 --config Release` passed.
- `npm run qa:mac:transcribe` passed without env vars.
- Result: microphone capture passed and local Whisper ran, but the transcript was `[BLANK_AUDIO]`, so clear spoken-command recognition still needs a normal manual run.

**Commits**
- `32d96ad fix: auto-detect local whisper install`
- `58e0200 docs: document local whisper install`


---

## Phase M3 Step 2C - Require clear voice command transcript
*Completed: 2026-06-26*

**What was built**
- `touchpilot/apps/desktop/src-tauri/examples/voice_transcription_probe.rs` - Rejects placeholder local Whisper outputs like `[BLANK_AUDIO]` and `[inaudible]`.
- `touchpilot/docs/macos-voice-qa.md` - Explains the stricter transcript acceptance rule.

**In plain English**
The voice QA now checks that TouchPilot heard an actual useful command, not just that Whisper ran. If Whisper returns silence or gibberish, the probe fails and tells us to retry with clearer speech.

**Verification**
- `cargo check -p touchpilot-desktop --example voice_transcription_probe` passed.

**Commits**
- `07254bd test: require clear voice command transcript`
- `17948da docs: clarify voice transcript acceptance`


---

## Phase M3 Step 3 - Wire local transcription into app runtime
*Completed: 2026-06-26*

**What was built**
- `touchpilot/apps/desktop/src-tauri/src/lib.rs` - `transcribe_voice_capture` now defaults to local `whisper.cpp` and keeps OpenAI as an explicit provider option.
- `touchpilot/apps/desktop/src/voiceTranscription.ts` - Frontend accepts `local-whisper` as a native transcription provider.
- `touchpilot/docs/macos-voice-qa.md` - Documents that the desktop runtime uses local Whisper by default.
- `learnings/mac-migration-sanity.md` - Records the app runtime transcription path.

**In plain English**
Voice is no longer only a terminal test. The actual TouchPilot app can now send push-to-talk audio to the local Whisper install and receive a transcript without OpenAI credits.

**Verification**
- `cargo check -p touchpilot-desktop` passed.
- `npm --workspace @touchpilot/desktop run typecheck` passed.

**Commits**
- `6fbe6e4 feat: use local whisper for app voice transcription`
- `41a9cef fix: accept local whisper voice provider`
- `ae35b95 docs: note app local whisper runtime`


---

## Phase M3 Step 4 - Confirm manual app voice test
*Completed: 2026-06-26*

**What was built**
- `touchpilot/docs/macos-voice-qa.md` - Records the manual app voice test result.
- `learnings/mac-migration-sanity.md` - Records the M3 conclusion and the remaining mock-guidance limitation.

**In plain English**
Voice now works in the actual app. Saying "show me what to click" activates guidance. The target is still inaccurate because guidance is still mock-based, but voice itself is connected.

**Verification**
- Manual app test passed.
- Observed voice-triggered guidance and mock target rendering.

**Commits**
- `6b56457 docs: record mac app voice test`
- `a73a7c9 docs: close mac voice phase`


---

## Phase 10.5 Step 4 - Provider Configuration
*Completed: 2026-06-26*

**What was built**
- `touchpilot/apps/desktop/src/vite-env.d.ts` - Adds the typed desktop environment variable for the guidance provider endpoint.
- `touchpilot/package.json` - Adds a helper script that starts the desktop app against the local smoke guidance server.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents the two-terminal local smoke run flow.
- `learnings/phase-10-voice-architecture-reset.md` - Records the provider configuration bridge in the Phase 10 learning doc.

**In plain English**
Toki now has a clear way to point the desktop app at the local guidance smoke server. Instead of silently falling back to a fake target, the app can be launched with an explicit provider endpoint so the debug panel can show whether real guidance is available or unavailable.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.
- `npm run test:guidance:smoke` passed.

**Commits**
- `ddd4a1e desktop guidance endpoint env`
- `b66d48d guidance smoke dev script`
- `b4b255b docs: add guidance smoke run flow`
- `0eb232e docs: note provider config flow`


---

## Phase 10.5 Step 5 - Local Smoke Run
*Completed: 2026-06-26*

**What was built**
- `touchpilot/apps/desktop/src/App.tsx` - Promotes the Debug `Real smoke` action so it is visible near `Sync`.
- `touchpilot/apps/desktop/src/App.css` - Makes the Debug panel itself scrollable so controls do not get clipped.
- `touchpilot/docs/guidance-provider-adapter.md` - Records the manual local smoke result.
- `learnings/phase-10-voice-architecture-reset.md` - Records the smoke run result and the debug usability fix.

**In plain English**
Toki now proves the local guidance-provider bridge works without lying about target accuracy. The app reached the local smoke backend, showed that the provider is unavailable, and kept target details empty instead of drawing a fake mock target. The Debug window is also easier to use because the smoke action is visible and the panel scrolls.

**Verification**
- Direct local server probe returned `200` with `mode: unavailable` and `providerName: dev-smoke-server`.
- Manual Debug `Real smoke` check showed provider unavailable, request evidence, payload evidence, and no target.
- Desktop typecheck was not run by Codex for this UI patch per user instruction.

**Commits**
- `4702b4b show debug smoke action`
- `cfd3697 debug panel scroll container`
- `1ae2f2e docs: record smoke provider result`
- `99a81e5 docs: note smoke run result`


---

## Phase 10.5 Step 6 - Real Provider Plan Update
*Completed: 2026-06-27*

**What was built**
- `touchpilot/docs/roadmap.md` - Marks Phase 10.5 as continuing into target accuracy before safety.
- `touchpilot/docs/phase-10-voice-ux.md` - Explains that the smoke bridge is done but real target accuracy remains.
- `touchpilot/docs/guidance-provider-adapter.md` - Adds the target accuracy extension and provider acceptance rules.
- `learnings/toki/plan.md` - Splits completed smoke work from remaining target-accuracy work.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the target-accuracy path before Phase 11.

**In plain English**
Toki's docs now say the same thing we decided: the provider pipe works, but the app still needs a real screen target before safety work starts. The next work is not more mock guidance; it is a real provider behind the existing smoke endpoint, with strict validation and one known-screen accuracy test.

**Verification**
- Documentation-only step.
- Changes pushed to `GargiGupta-io/toki`.
- Changes pushed to `GargiGupta-io/learnings`.

**Commits**
- `47883c2 docs: extend provider accuracy roadmap`
- `058fe10 docs: clarify phase 10.5 accuracy`
- `7e5eb12 docs: add target accuracy extension`
- `8504db6 docs: extend toki provider plan`
- `e8a6609 docs: note target accuracy path`


---

## Phase 10.5 Step 7 - Provider Mode Config
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/guidance-smoke-server.mjs` - Adds server-side provider mode config with safe `unavailable` default and `local-retired-local-vision-runtime` placeholder mode.
- `touchpilot/scripts/guidance-smoke-server.test.mjs` - Tests provider config defaults, local retired local vision runtime config, unsupported provider handling, and placeholder responses.
- `touchpilot/package.json` - Adds `npm run guidance:smoke:retired-local-vision-runtime` for local retired local vision runtime-mode smoke runs.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents provider env vars, supported modes, and local run commands.
- `learnings/toki/plan.md` - Marks provider config as completed in the learning plan.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the provider mode config decision.

**In plain English**
Toki's smoke server now has a real switch for provider mode. By default it stays honest and says no provider is available. If local retired local vision runtime mode is selected, the server records the endpoint and model but still refuses to draw a target until the adapter is actually wired.

**Verification**
- `node --check scripts/guidance-smoke-server.mjs` passed.
- `node --check scripts/guidance-smoke-server.test.mjs` passed.
- `npm run test:guidance:smoke` passed with 8 tests.

**Commits**
- `66578dc guidance provider mode config`
- `8805556 test provider mode config`
- `eecd864 guidance retired-local-vision-runtime smoke script`
- `22481e5 docs: explain provider modes`
- `6308495 docs: mark provider config done`
- `237a173 docs: note provider mode config`


---

## Phase 10.5 Step 8 - Local Vision Provider Adapter
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/guidance-smoke-server.mjs` - Sends screenshot payload and user goal to a configured local retired local vision runtime `/api/generate` endpoint.
- `touchpilot/scripts/guidance-smoke-server.test.mjs` - Tests the retired local vision runtime request payload, provider error handling, and smoke endpoint adapter path.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents that `local-retired-local-vision-runtime` now calls the local vision model server.
- `learnings/toki/plan.md` - Marks the local retired local vision runtime adapter as completed.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the adapter wiring and remaining strict-validation step.

**In plain English**
Toki's smoke server can now actually talk to a local vision model server. It sends the screenshot and the user's goal to retired local vision runtime and asks for JSON back. If retired local vision runtime fails or returns unusable text, Toki still reports unavailable instead of pretending it found a target.

**Verification**
- `node --check scripts/guidance-smoke-server.mjs` passed.
- `node --check scripts/guidance-smoke-server.test.mjs` passed.
- `npm run test:guidance:smoke` passed with 10 tests.

**Commits**
- `d1b5f10 wire local retired-local-vision-runtime guidance`
- `fc54b70 test local retired-local-vision-runtime guidance`
- `c7e0e73 docs: note retired-local-vision-runtime adapter path`
- `25b997f docs: mark retired-local-vision-runtime adapter done`
- `b0749ab docs: note retired-local-vision-runtime adapter wiring`


---

## Phase 10.5 Step 9 - Response Parsing And Validation
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/guidance-smoke-server.mjs` - Validates real provider output before returning it to the desktop.
- `touchpilot/scripts/guidance-smoke-server.test.mjs` - Tests offscreen targets, invalid confidence, malformed provider JSON, and valid local retired local vision runtime output.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents the strict validation rules for provider replies.
- `learnings/toki/plan.md` - Marks provider response validation as completed.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the validation boundary and remaining manual known-screen test.

**In plain English**
Toki no longer trusts a model just because it answered. The smoke server now checks that a real provider returned a proper target, valid confidence, valid risk, correct confirmation behavior, and a box that fits on the screen. If the provider sends bad output, Toki reports unavailable instead of drawing a wrong target.

**Verification**
- `node --check scripts/guidance-smoke-server.mjs` passed.
- `node --check scripts/guidance-smoke-server.test.mjs` passed.
- `npm run test:guidance:smoke` passed with 13 tests.

**Commits**
- `7db594f validate provider guidance output`
- `498445f test provider guidance validation`
- `42a51f3 docs: note provider validation`
- `c5816ce docs: mark provider validation done`
- `010a8bf docs: note provider output validation`


---

## Phase 10.5 Step 10 - Manual Known-Screen Test
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/guidance-known-screen-smoke.mjs` - Posts a known screenshot and goal to the guidance smoke endpoint and prints the returned provider target.
- `touchpilot/package.json` - Adds `npm run guidance:known-screen`.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents the known-screen smoke flow and manual useful/wrong verdict.
- `learnings/toki/plan.md` - Notes that the known-screen runner exists and that the local provider verdict is pending.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the known-screen runner and local provider availability result.

**In plain English**
Toki now has a repeatable way to test whether a real provider can find the right thing on a known screen. You give it a screenshot and a goal, it asks the smoke provider for one target, and it prints the target so we can mark it useful or wrong. On this machine, the local retired local vision runtime endpoint was not reachable, so the runner is ready but the actual accuracy verdict is still pending.

**Verification**
- `node --check scripts/guidance-known-screen-smoke.mjs` passed.
- `node --check scripts/guidance-smoke-server.mjs` passed.
- `node --check scripts/guidance-smoke-server.test.mjs` passed.
- `npm run test:guidance:smoke` passed with 13 tests.

**Commits**
- `87af0ca known screen guidance runner`
- `ccc83f0 add known screen smoke script`
- `cccc7d8 docs: add known screen smoke flow`
- `2b79bc7 docs: add known screen runner note`
- `4cba107 docs: note known screen smoke runner`


---

## Phase 10.5 Step 11 - Accuracy Notes
*Completed: 2026-06-27*

**What was built**
- `touchpilot/docs/guidance-provider-adapter.md` - Records the current target-accuracy status, manual verdict fields, and OCR/accessibility escalation rule.
- `learnings/toki/plan.md` - Marks accuracy notes completed and records that the provider pipeline is ready but target accuracy is unproven.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Adds the lesson that valid provider JSON is not the same as a useful target.

**In plain English**
Toki now has an honest accuracy record. The provider pipeline exists, but we are not pretending it is accurate until a real provider returns one useful target on a known screen. If the provider returns a valid but wrong target, the next serious fix is adding OCR/accessibility evidence before safety work.

**Verification**
- `git diff --check` passed in the Toki repo.
- `git diff --check` passed in the learnings repo.

**Commits**
- `bd698b7 docs: record target accuracy notes`
- `23851b3 docs: note target accuracy status`
- `62e2c9c docs: add accuracy escalation note`


---

## Phase 10.5 Step 12 - Close Or Escalate
*Completed: 2026-06-27*

**What was built**
- `touchpilot/docs/roadmap.md` - Closes Phase 10.5 as provider-pipeline-ready and inserts Phase 10.6 before safety.
- `touchpilot/docs/guidance-provider-adapter.md` - Records the close/escalate decision for the provider smoke phase.
- `learnings/toki/plan.md` - Adds Phase 10.6: Target Accuracy And Screen Intelligence.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the decision to avoid starting safety on unproven target accuracy.

**In plain English**
Phase 10.5 is now closed, but only for the backend/provider pipeline. We are not pretending target accuracy is solved. The next work is Phase 10.6, where Toki must prove it can point to the right target on a known screen or add OCR/accessibility evidence before safety work.

**Verification**
- `git diff --check` passed in the Toki repo.
- `git diff --check` passed in the learnings repo.

**Commits**
- `46985e7 docs: add target accuracy phase`
- `f9a8ad8 docs: close provider smoke phase`
- `1d719d5 docs: add phase 10.6 accuracy plan`
- `99566bb docs: close phase 10.5 milestone`


---

## Phase 10.6 Step 1 - Provider Readiness Check
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/guidance-provider-check.mjs` - Checks whether the local retired local vision runtime provider and configured model are ready.
- `touchpilot/package.json` - Adds `npm run guidance:provider:check`.
- `touchpilot/docs/roadmap.md` - Records that local provider setup is currently blocked.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents the readiness check before known-screen accuracy testing.
- `learnings/toki/plan.md` - Records the Phase 10.6 Step 1 provider blocker.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Notes that target accuracy still needs local provider setup before a useful/wrong verdict.

**In plain English**
Toki now has a simple check that tells us whether the local vision provider is ready before we try to test target accuracy. On this machine, the check says the provider is not ready: no retired local vision runtime app or binary path was found, no provider environment variables were set, and the local retired local vision runtime endpoint was not reachable.

**Verification**
- `node --check scripts/guidance-provider-check.mjs` passed.
- `npm run guidance:provider:check` ran and reported the provider as blocked.
- `git diff --check` passed in the Toki repo.
- `git diff --check` passed in the learnings repo.

**Commits**
- `0a6f2de guidance provider readiness check`
- `36f54cd add provider readiness script`
- `5895430 docs: note provider setup blocker`
- `b1a8cc7 docs: add provider readiness check`
- `7bd4f39 docs: record provider readiness blocker`
- `f1a4872 docs: note provider readiness check`

---

## Phase 10.6 Step 2 - Local Vision Provider Setup
*Completed: 2026-06-27*

**What was built**
- `touchpilot/docs/roadmap.md` - Records that retired local vision runtime is now installed, `llava:latest` is pulled, and the provider readiness check passes.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents the local retired local vision runtime setup result and the sandbox caveat for local network checks.
- `learnings/toki/plan.md` - Updates Phase 10.6 so the next task is known-screen accuracy, not provider setup.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the local provider setup result and the remaining known-screen gate.

**In plain English**
Toki now has a local vision model ready for the next real target test. retired local vision runtime is running, the `llava:latest` model is installed, and the provider readiness check passes outside the Codex sandbox. The next check is whether this model can pick a useful target on a known screen.

**Verification**
- `retired-local-vision-runtime pull llava:latest` completed successfully.
- `npm run guidance:provider:check` passed outside the Codex sandbox.
- `git diff --check` passed in the Toki repo.
- `git diff --check` passed in the learnings repo.

**Commits**
- `5cbbe35 docs: mark local provider ready`
- `825bfe8 docs: record retired local vision runtime setup result`
- `a17c4fd docs: mark retired local vision runtime provider ready`
- `80cff86 docs: note local provider setup`

---

## Phase 10.6 Step 3 - Known-Screen Provider Run
*Completed: 2026-06-27*

**What was built**
- `touchpilot/docs/roadmap.md` - Records the first known-screen result and the next target-accuracy blocker.
- `touchpilot/docs/guidance-provider-adapter.md` - Adds the exact known-screen run details and unavailable verdict.
- `learnings/toki/plan.md` - Updates Phase 10.6 with the known-screen run result.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the learning that prompt/parser repair comes before coordinate accuracy.

**In plain English**
Toki tried a real local model against a real screenshot. The request reached retired local vision runtime, but the model did not return the exact structured answer Toki requires, so the app correctly refused to draw a target. That means we are not ready to judge target accuracy yet; first we need to capture the raw model response and make the provider return valid guidance.

**Verification**
- `npm run guidance:smoke:retired-local-vision-runtime` started the local provider smoke server.
- `screencapture -x /tmp/toki-known-screen.png` captured the known screen.
- `npm run guidance:known-screen` reached `local-retired-local-vision-runtime` and returned `unavailable`.
- `git diff --check` passed in the Toki repo.
- `git diff --check` passed in the learnings repo.

**Commits**
- `e168bdf docs: record known-screen blocker`
- `a62a172 docs: add known-screen run result`
- `f06f500 docs: mark known-screen unavailable`
- `7fbd500 docs: note provider output blocker`

---

## Phase 10.6 Step 4 - Provider Output Repair
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/guidance-smoke-server.mjs` - Captures raw local-model output, improves the retired local vision runtime prompt, and rejects normalized target boxes.
- `touchpilot/scripts/guidance-smoke-server.test.mjs` - Covers direct guidance output and normalized-coordinate rejection.
- `touchpilot/scripts/guidance-known-screen-smoke.mjs` - Prints validation issues and raw model output when a known-screen run fails.
- `touchpilot/docs/roadmap.md` - Records the current Phase 10.6 blocker.
- `touchpilot/docs/guidance-provider-adapter.md` - Records the known-screen retest and normalized-coordinate failure.
- `learnings/toki/plan.md` - Updates the Phase 10.6 plan with the raw-output result.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Adds the learning that raw screenshot prompting is not enough yet.

**In plain English**
Toki now shows what the local vision model actually said when guidance fails. The retest proved that the model was returning tiny normalized numbers instead of real screen coordinates, so Toki now rejects that output instead of drawing a misleading target. The next useful move is to give the model structured screen evidence, such as OCR or accessibility candidates, instead of asking it to guess from pixels alone.

**Verification**
- `node --test touchpilot/scripts/guidance-smoke-server.test.mjs` passed.
- `npm run guidance:smoke:retired-local-vision-runtime` started the local provider smoke server outside the sandbox.
- `npm run guidance:known-screen` reached `local-retired-local-vision-runtime` and correctly rejected normalized coordinates.

**Commits**
- `89e340a fix: expose provider raw output`
- `cf1e4ab test provider coordinate rejection`
- `32e0e3f show provider validation details`
- `d6a826c docs: update phase 10.6 blocker`
- `49fcac0 docs: record normalized target output`
- `77e6a0e docs: update toki accuracy plan`
- `3172d28 docs: note normalized provider output`

---

## Phase 10.6 Step 5 - Candidate-Assisted Guidance
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/guidance-smoke-server.mjs` - Lets guidance requests include trusted UI candidates and anchors matching provider output to candidate boxes.
- `touchpilot/scripts/guidance-smoke-server.test.mjs` - Tests candidate validation, prompt evidence, and candidate anchoring.
- `touchpilot/scripts/guidance-known-screen-smoke.mjs` - Lets known-screen tests pass candidate boxes through `TOKI_KNOWN_SCREEN_CANDIDATES`.
- `touchpilot/docs/roadmap.md` - Records that candidate-assisted guidance passed the known-screen smoke gate.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents the candidate-assisted run and caveat.
- `learnings/toki/plan.md` - Updates the Phase 10.6 path toward automatic candidate extraction.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the learning that structured candidates beat raw pixel guessing.

**In plain English**
Toki can now give the model a short menu of possible screen targets instead of asking it to guess coordinates from the screenshot. In the known-screen test, one candidate for the message input was supplied, the model selected it, and Toki used the trusted candidate box as the final target. This proves the candidate-selection path works, but the next step is still important: Toki needs to create those candidates automatically from OCR or accessibility.

**Verification**
- `node --test touchpilot/scripts/guidance-smoke-server.test.mjs` passed.
- `npm run guidance:smoke:retired-local-vision-runtime` started the local provider smoke server outside the sandbox.
- `npm run guidance:known-screen` passed with `TOKI_KNOWN_SCREEN_CANDIDATES`.
- Candidate-assisted target returned: `Message input box at 20,790 1430x60`.
- `git diff --check` passed in the Toki repo.
- `git diff --check` passed in the learnings repo.

**Commits**
- `e02eb8e add candidate anchored guidance`
- `fbc564c test candidate guidance anchoring`
- `4e28fe2 known-screen candidate input`
- `abdf25e docs: mark candidate smoke pass`
- `a0d65c1 docs: record candidate-assisted target`
- `b8055cb docs: update candidate accuracy path`
- `7edb49c docs: note candidate-assisted smoke`

---

## Phase 10.6 Step 6 - Automatic Mac Candidate Extraction
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/macos-accessibility-candidates.mjs` - Collects labeled UI candidates from the macOS Accessibility tree.
- `touchpilot/scripts/macos-accessibility-candidates.test.mjs` - Tests candidate normalization, filtering, mocked macOS collection, and non-Mac fallback.
- `touchpilot/scripts/guidance-known-screen-smoke.mjs` - Uses manual candidates first, then automatically tries macOS Accessibility candidates.
- `touchpilot/package.json` - Runs the new candidate tests with the guidance smoke tests.
- `touchpilot/docs/roadmap.md` - Records automatic candidate extraction as the Step 10.6.6 result.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents env flags, fallback behavior, and permission caveats.
- `learnings/toki/plan.md` - Updates the target-accuracy plan with automatic candidate extraction.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the macOS Accessibility tradeoff and probe result.

**In plain English**
Toki can now try to gather possible click targets from the Mac itself. Instead of manually typing a target box, the known-screen test can ask macOS what labeled buttons, fields, and controls are visible, then pass those boxes to the model. The real probe ran without script errors, but returned zero candidates in the current frontmost context, so the next work is to target the right app and then wire this into live guidance.

**Verification**
- `node --check touchpilot/scripts/guidance-known-screen-smoke.mjs` passed.
- `node --check touchpilot/scripts/macos-accessibility-candidates.mjs` passed.
- `npm run test:guidance:smoke` passed with 24 tests.
- Real macOS collector probe ran without script error and returned `count: 0`.
- `git diff --check` passed in the Toki repo.
- `git diff --check` passed in the learnings repo.

**Commits**
- `84e5616 add mac accessibility candidates`
- `0e4065a test mac accessibility candidates`
- `db5e9fa wire automatic known-screen candidates`
- `f007006 run accessibility candidate tests`
- `9059750 docs: note automatic candidates`
- `a293a81 docs: describe mac candidate extraction`
- `7333a84 docs: update automatic candidate plan`
- `2870d2a docs: note accessibility candidate caveat`

---

## Phase 10.6 Step 7 - App-Targeted Mac Candidate Probe
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/macos-accessibility-candidates.mjs` - Reports app/window metadata and surfaces macOS Accessibility permission errors instead of silently returning zero candidates.
- `touchpilot/scripts/macos-accessibility-candidate-probe.mjs` - Lists visible Mac apps and targets a named app for candidate extraction.
- `touchpilot/package.json` - Adds `npm run qa:mac:candidates`.
- `touchpilot/scripts/macos-accessibility-candidates.test.mjs` - Tests visible-app listing and assistive-access error reporting.
- `touchpilot/docs/roadmap.md` - Records the named-app probe and the current permission blocker.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents the candidate probe command and Accessibility permission fix.
- `learnings/toki/plan.md` - Updates the target-accuracy plan with the Step 7 result.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the learning that the blocker is macOS assistive access, not the guidance provider.

**In plain English**
Toki can now aim the candidate scanner at the actual app we care about instead of accidentally scanning Terminal or Codex. The live probe correctly found Microsoft Edge, but macOS refused to let `osascript` read its windows because Accessibility permission is not granted. That means the next step is a permission rerun, not more model prompting.

**Verification**
- `node --check touchpilot/scripts/macos-accessibility-candidate-probe.mjs` passed.
- `node --check touchpilot/scripts/macos-accessibility-candidates.mjs` passed.
- `npm run test:guidance:smoke` passed with 26 tests.
- `npm run qa:mac:candidates -- --app "Microsoft Edge"` resolved `Microsoft Edge` and reported `osascript is not allowed assistive access`.

**Commits**
- `2a452b7 surface accessibility probe errors`
- `95f1455 add mac candidate probe`
- `dce307d add mac candidate probe script`
- `d52adf2 test mac candidate probing`
- `dd35be7 docs: document mac candidate probe`
- `0c4f190 docs: record accessibility blocker`
- `ab880ce docs: note mac candidate blocker`
- `2624a9c docs: add candidate probe learning`

---

## Phase 10.6 Step 8 - Accessibility Permission Rerun
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/macos-accessibility-candidates.mjs` - Chooses the matching browser process with real windows instead of a zero-window helper process.
- `touchpilot/scripts/macos-accessibility-candidate-probe.mjs` - Shows window counts next to visible app processes.
- `touchpilot/scripts/macos-accessibility-candidates.test.mjs` - Updates process-list tests for window counts.
- `touchpilot/docs/guidance-provider-adapter.md` - Records the Edge probe result and the next target-accuracy direction.
- `touchpilot/docs/roadmap.md` - Updates Phase 10.6 with the Edge accessibility limit.
- `learnings/toki/plan.md` - Notes that OCR or a native AX bridge is now the next target-accuracy path.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the Step 8 learning and tradeoff.

**In plain English**
The permission problem is no longer the first blocker. Toki can read candidates from Terminal, and the Edge probe now finds the real Edge window instead of a helper process. Edge still does not expose usable child elements through this lightweight `osascript` route, so the honest next path is OCR or a native Mac accessibility bridge.

**Verification**
- `node --check touchpilot/scripts/macos-accessibility-candidates.mjs` passed.
- `node --check touchpilot/scripts/macos-accessibility-candidate-probe.mjs` passed.
- `npm run test:guidance:smoke` passed with 26 tests.
- `npm run qa:mac:candidates -- --list` returned Terminal candidates.
- `npm run qa:mac:candidates -- --app "Microsoft Edge"` reached `Windows: 1` and reported `read children: Error: Can't get object`.

**Commits**
- `6f8d6df pick browser process with windows`
- `1e88df2 show candidate process window counts`
- `e9dcc73 test candidate process window counts`
- `4fc2619 docs: record edge candidate result`
- `c76dab7 docs: update target accuracy path`
- `54612ea docs: update edge candidate path`
- `e7e95c3 docs: note edge accessibility limit`

---

## Phase 10.6 Step 9 - Mac Vision OCR Candidates
*Completed: 2026-06-27*

**What was built**
- `touchpilot/scripts/macos-vision-ocr-candidates.mjs` - Uses Apple Vision through Swift to turn screenshot text into target candidates.
- `touchpilot/scripts/macos-vision-ocr-candidate-probe.mjs` - Runs OCR candidate extraction against a screenshot from the command line.
- `touchpilot/package.json` - Adds the OCR probe script and includes OCR tests in the guidance smoke suite.
- `touchpilot/scripts/macos-vision-ocr-candidates.test.mjs` - Tests OCR coordinate conversion, filtering, parsing, and non-Mac fallback.
- `touchpilot/scripts/guidance-known-screen-smoke.mjs` - Falls back to OCR candidates when manual and Accessibility candidates are not available.
- `touchpilot/docs/guidance-provider-adapter.md` - Documents OCR candidate usage, env flags, and tradeoffs.
- `touchpilot/docs/roadmap.md` - Records the OCR candidate pass and next target-accuracy step.
- `learnings/toki/plan.md` - Adds OCR as the active candidate path before target verdict testing.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the OCR evidence source and tradeoff.

**In plain English**
Toki can now read visible text from a screenshot and turn that text into possible targets for the model. This helps with browser screens where Mac Accessibility does not expose buttons and fields clearly. The live probe returned 14 OCR candidates from the known-screen image, so the next step is testing whether the provider can use those candidates to choose the correct target.

**Verification**
- `node --check scripts/macos-vision-ocr-candidates.mjs` passed.
- `node --check scripts/macos-vision-ocr-candidate-probe.mjs` passed.
- `node --check scripts/guidance-known-screen-smoke.mjs` passed.
- `npm run test:guidance:smoke` passed with 31 tests.
- `npm run qa:mac:ocr:candidates -- --image /tmp/toki-known-screen.png --scale 2` returned 14 OCR candidates.

**Commits**
- `f1849ca add mac vision ocr candidates`
- `52fecd9 add mac ocr candidate probe`
- `fc2fcd4 add mac ocr probe script`
- `3e446bb test mac vision ocr candidates`
- `7ed1d25 use ocr fallback for known screens`
- `8127013 docs: describe ocr candidates`
- `7de7033 docs: record ocr candidate pass`
- `3e042c4 docs: add ocr candidate path`
- `bbb09ff docs: note vision ocr candidates`

---

## Phase 10.6 Step 10 - OCR-Backed Provider Verdict
*Completed: 2026-06-27*

**What was built**
- `touchpilot/docs/guidance-provider-adapter.md` - Records the OCR-backed known-screen command, provider result, and useful verdict.
- `touchpilot/docs/roadmap.md` - Marks OCR-backed target selection as useful and points the next work at live desktop guidance.
- `learnings/toki/plan.md` - Updates Phase 10.6 with the useful OCR target result.
- `learnings/toki/phase-10-voice-architecture-reset.md` - Records the learning that OCR candidates work for text-visible targets.

**In plain English**
Toki used OCR text from the screenshot as possible targets, sent those choices to the local provider, and got back a useful real target. The provider selected `> Find and fix a bug in @filename` at the correct OCR box. This proves the candidate route can produce a real target when the desired control is visible as text.

**Verification**
- `npm run guidance:provider:check` reported `[READY] local retired local vision runtime provider is reachable`.
- `npm run guidance:smoke:retired-local-vision-runtime` started the local guidance smoke server.
- `npm run guidance:known-screen` used `macos-vision-ocr` candidates.
- Known-screen run returned `Provider mode: real`.
- Returned target: `> Find and fix a bug in @filename at 9,809 235x17`.
- Manual verdict: useful.

**Commits**
- `20bc9db docs: record ocr provider verdict`
- `99e8eda docs: mark ocr target useful`
- `4c51e50 docs: record ocr target verdict`
- `5a8ae12 docs: note ocr provider result`
