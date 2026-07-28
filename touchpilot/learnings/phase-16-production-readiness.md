# Phase 16: Production Readiness

> Phase 16 is the point where Toki stops being only a local development project and starts being prepared for a controlled beta release.

---

## In Plain English

Until now, most work focused on making Toki useful: the cursor puck, screen capture, voice, guidance, safety, workflows, browser candidates, visual polish, and evals.

Production readiness is different. It asks whether someone else can install the app, trust it, update it, recover from problems, and understand what permissions it needs. A feature can work on one developer machine and still be unready for users if signing, updates, logs, privacy, and release checks are missing.

For Toki, this matters more than a normal app because it touches sensitive surfaces: screen capture, microphone, camera, Accessibility, local provider calls, and eventually backend/provider routing. Phase 16 makes those boundaries explicit before beta users try the app.

## What We Decided

Step 16.1 created the production-readiness plan.

The main decision is that Mac is still the primary product-feel platform for beta readiness, while Tauri/Rust/React stays as the cross-platform core.

That means:

- Mac behavior gets priority for manual product testing.
- Windows and Linux should stay structurally alive.
- Native Mac bridges are allowed when product trust or feel needs them.
- Paid provider keys must stay out of the desktop app.
- Privacy-sensitive features must be explained clearly.

## What Was Added

Files updated:

- `docs/phase-16-production-readiness.md`
- `docs/roadmap.md`

The new phase doc defines:

- goal
- product rules
- step plan
- acceptance criteria
- non-goals

## Why This Phase Exists

Toki already has many working pieces, but shipping changes the questions.

During development, the question is:

> Can we make this work?

During production readiness, the question becomes:

> Can someone else install this, trust it, recover from problems, and understand what it is doing?

That is why Phase 16 includes:

- release build inventory
- app identity cleanup
- signing and notarization
- auto-update plan
- crash reporting and local diagnostics
- secure key storage
- backend gateway/rate limits
- privacy and permission docs
- release QA checklist
- beta feedback channel

## Tradeoffs

### Mac-First Beta

We are prioritizing Mac for the beta path.

Tradeoff: Windows and Linux release polish will lag behind.

Benefit: product-feel testing happens on the machine we actually use daily, and it matches the Clicky-style menu bar/overlay direction better.

### Keep Tauri/Rust/React

We are not switching fully to Swift.

Tradeoff: some Mac-native polish may need bridge code instead of being automatic.

Benefit: the app remains cross-platform at the core, and the React/Rust architecture already supports the overlay, settings, debug, voice, guidance, and eval systems.

### Backend Owns Paid Provider Keys

The desktop app should not ship paid provider keys.

Tradeoff: production guidance needs backend work before paid models are safe to use.

Benefit: billing, abuse prevention, rate limits, and provider secrets stay controllable.

### Privacy Before Convenience

Toki should explain sensitive permissions before broad beta.

Tradeoff: permission docs and diagnostics slow down feature momentum.

Benefit: users can understand why screen recording, microphone, camera, and Accessibility are needed.

## Step 16 Plan

1. Production Readiness Plan
2. Release Build Inventory
3. App Identity And Bundle Metadata
4. Signing And Notarization Plan
5. Auto-Update Plan
6. Crash Reporting And Local Diagnostics
7. Secure Key Storage
8. Backend Gateway And Rate Limits
9. Privacy And Permission Docs
10. Release QA Checklist
11. Beta Feedback Channel
12. Phase Closure

## What Step 16.1 Proves

Step 16.1 does not ship anything by itself.

It proves that we have a clear release-readiness route before we start changing packaging, signing, update, logging, and privacy behavior.

That matters because production work can become messy quickly if each piece is added without an order.

## Step 16.2 Outcome

Step 16.2 inventoried the current release build commands and local artifacts.

Files updated:

- `docs/phase-16-release-build-inventory.md`
- `docs/phase-16-production-readiness.md`
- `docs/roadmap.md`

Plain English: we now know which command is for day-to-day testing, which command checks the web bundle, which command builds the Mac app bundle, and which command should only be used for full release checkpoints.

Technical view:

- `npm run desktop:dev` is the dev app path.
- `npm run desktop:web:build` checks the frontend production bundle.
- `npm run check` runs the wider TypeScript/Rust check set.
- `npm run check:fast` runs desktop TypeScript plus Rust.
- `npm run desktop:release:mac` calls `tauri build --bundles app`.
- `npm run desktop:build` calls full `tauri build`.
- Windows helper scripts still exist but are not Mac-release blockers.

## Step 16.2 Finding: Stale Windows Artifacts

The local `target/release/bundle` folder still contains old Windows artifacts named `TouchPilot`.

Observed:

- `target/release/bundle/msi/TouchPilot_0.1.0_x64_en-US.msi`
- `target/release/bundle/nsis/TouchPilot_0.1.0_x64-setup.exe`

Plain English: those files are old package outputs and should not be trusted as current Toki releases.

Technical view: they are generated artifacts under `target/`, not source files. The right fix is not to rename them manually. The right fix is Step 16.3: clean app identity and bundle metadata, then rebuild fresh artifacts.

## Step 16.2 Tradeoffs

### Inventory Before Changing Build Scripts

We documented the current commands before changing release behavior.

Tradeoff: this step does not make packaging better yet.

Benefit: Step 16.3 can now fix identity and metadata with a clear picture of the current build surface.

### Mac App Bundle First

The preferred Mac release-test command is `npm run desktop:release:mac`.

Tradeoff: this does not produce every possible installer format.

Benefit: it is focused on the current Mac-first beta path and avoids unnecessary full packaging until checkpoint builds.

### Keep Windows Helpers Visible

The Windows helper scripts stay documented.

Tradeoff: stale Windows artifacts can look confusing if someone sees them locally.

Benefit: Windows parity remains recoverable later, while Mac progress stays unblocked.

## Step 16.3 Outcome

Step 16.3 locked Toki's current product identity and bundle metadata.

Files updated:

- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `docs/phase-16-app-identity.md`
- `docs/phase-16-production-readiness.md`
- `docs/roadmap.md`

Plain English: Toki now has one cleaner identity for release work. The app is called Toki, the bundle identifier is `app.toki.desktop`, the publisher is `GargiGupta-io`, and stale `TouchPilot` build artifacts are treated as old outputs that must be rebuilt, not renamed.

Technical view: Tauri bundle metadata now includes supported fields for publisher, category, short description, long description, and copyright. The Rust desktop crate no longer has the placeholder `authors = ["you"]`.

## Why Step 16.3 Matters

Signing, notarization, installers, updates, and crash logs all depend on identity metadata.

If product identity is inconsistent, the app can look untrustworthy:

- installer says one name,
- menu bar says another,
- bundle id says something else,
- crash logs point to an old project name,
- stale artifacts get mistaken for release builds.

Step 16.3 prevents that confusion before the signing and updater steps begin.

## Step 16.3 Tradeoffs

### Source Metadata First

We fixed source metadata instead of manually renaming generated artifacts.

Tradeoff: stale local files can still exist until a clean rebuild.

Benefit: future artifacts will be generated from the correct source identity, which is safer than editing build outputs by hand.

### Keep Blank Runtime Titles

The overlay and settings native titles remain blank.

Tradeoff: some debugging tools may show less obvious window names.

Benefit: normal users do not see an app titlebar or a visible overlay label, which preserves the cursor-first product feel.

### Publisher Is Practical, Not Final Legal Setup

The publisher is set to `GargiGupta-io`.

Tradeoff: final legal/company identity may still change before public launch.

Benefit: package metadata no longer falls back to placeholder or inferred values while beta release work continues.

## Runtime Fixture Leak Fix

Step 16 also exposed a production-readiness bug: the normal runtime could show mock guidance.

Plain English: the app was still behaving like a demo harness in one path. If a user opened Toki and ran a guidance refresh or voice command without a real provider configured, the app could fall back to the old mock target instead of honestly showing that no real guidance provider was active.

Technical view: `refreshCaptureMetadata()` defaulted to `providerMode = "mock"`, and the overlay debug snapshot also started in mock mode. That made mock fixtures too easy to trigger from normal runtime commands.

The fix changed the default provider mode to `unavailable` and made mock guidance explicit. Debug can still run mock fixtures, but it must pass `providerMode: "mock"` deliberately. Normal settings refresh and voice commands no longer silently create `Mock target` guidance.

Production rule: fixture targets are QA tools. They must never be the default user-facing behavior.

Tradeoff: if no real provider endpoint is configured, Toki now shows no target instead of a fake helpful-looking one.

Benefit: this is more honest and safer. Showing no guidance is better than showing a fake target that looks like product intelligence.

## Next Step

Step 16.4 should document the Mac signing and notarization path, including required Apple Developer credentials and how unsigned local builds remain possible.

## Updates

- 2026-07-03 - Created the Phase 16 learning note after adding the production-readiness plan.
- 2026-07-03 - Added Step 16.2 release build inventory, including the Mac release command and stale Windows artifact warning.
- 2026-07-03 - Added Step 16.3 app identity notes, bundle metadata decisions, and stale artifact rebuild rule.
- 2026-07-03 - Added the runtime fixture leak rule after fixing mock guidance so it is debug-only and no longer the normal fallback.
