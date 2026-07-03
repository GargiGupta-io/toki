# Phase 16: Production Readiness

Phase 16 turns Toki from a working local assistant into something that can be shipped, updated, diagnosed, and trusted by real users.

This phase is not about adding new assistant intelligence. It is about making the existing Mac-first app safer and more reliable outside the development machine.

## Goal

Make Toki ready for a controlled beta release.

The app should:

- install cleanly
- launch reliably
- identify itself clearly as Toki
- avoid exposing provider keys
- store local secrets safely
- recover from crashes
- explain required permissions
- support updates
- produce useful diagnostic logs
- have a repeatable release checklist

## Product Rules

1. Mac remains the primary product-feel platform.
2. Tauri/Rust/React remain the cross-platform core.
3. Native Mac bridges are allowed where product feel or platform trust requires them.
4. Windows and Linux should stay structurally alive, but must not block Mac beta progress.
5. Paid provider keys must not live in the desktop app.
6. Privacy-sensitive features must be explicit: screen capture, microphone, camera, Accessibility, and local logs.
7. Toki should guide users, not secretly act for them.

## Step Plan

### Step 16.1: Production Readiness Plan

Define this phase, acceptance criteria, release risks, and step order.

Result: completed when this document exists and the roadmap points to it.

### Step 16.2: Release Build Inventory

Audit the current build commands and artifacts:

- dev app
- no-bundle release executable
- packaged app bundle
- installer/dmg path if available
- Mac-specific release command
- Windows/Linux status notes

Acceptance:

- one clear command exists for local Mac release testing
- one clear command exists for full package/release output
- known slow or flaky build paths are documented

Result: completed. `docs/phase-16-release-build-inventory.md` records the current dev, web-build, check, Mac release, full Tauri package, and Windows release commands. The preferred Mac release-test command is `npm run desktop:release:mac`; full package checkpoints use `npm run desktop:build`. Stale Windows `TouchPilot` artifacts were found and recorded as a Step 16.3 identity cleanup risk.

### Step 16.3: App Identity And Bundle Metadata

Make sure the product identity is consistent:

- visible app name
- bundle identifier
- package name
- menu bar label
- app icon status
- installer names
- docs references

Acceptance:

- user-facing runtime says Toki, not old project names
- learning docs can preserve historical names, but product docs should use Toki
- bundle metadata is ready for signing/notarization work

### Step 16.4: Signing And Notarization Plan

Document and wire the Mac signing path.

Acceptance:

- required Apple Developer assets are listed
- local unsigned build remains possible
- signed/notarized release path is documented
- missing credentials fail with a clear message

### Step 16.5: Auto-Update Plan

Decide how Toki updates after install.

Acceptance:

- update provider choice is recorded
- update signing requirements are recorded
- dev channel and beta channel are separated
- updater is not enabled until signing trust is ready

### Step 16.6: Crash Reporting And Local Diagnostics

Add a diagnostics approach that is useful without being invasive.

Acceptance:

- local logs capture startup, permissions, provider mode, and major failures
- crash reporting is opt-in or beta-scoped
- logs do not store raw screenshots, transcripts, or provider keys by default
- Debug can show diagnostic status

### Step 16.7: Secure Key Storage

Move any user or developer secrets into the correct storage boundary.

Acceptance:

- desktop app does not embed paid provider keys
- local provider config is explicit
- future backend/proxy key ownership is documented
- user tokens, if added, use OS keychain/secure storage

### Step 16.8: Backend Gateway And Rate Limits

Define the production provider boundary.

Acceptance:

- desktop talks to a backend/proxy for paid model calls
- backend owns provider keys
- rate limits and abuse controls are planned
- unavailable provider mode remains honest when backend is missing

### Step 16.9: Privacy And Permission Docs

Write the user-facing privacy and permission explanation.

Acceptance:

- screen recording permission is explained
- microphone permission is explained
- camera permission is explained
- Accessibility permission is explained
- local/offline vs cloud behavior is clear

### Step 16.10: Release QA Checklist

Create a manual release QA checklist.

Acceptance:

- install
- launch
- menu bar behavior
- settings popup
- overlay click-through
- puck proximity
- voice push-to-talk
- local transcription fallback
- provider unavailable behavior
- safety confirmation behavior
- workflow cue behavior

### Step 16.11: Beta Feedback Channel

Define how beta users report problems.

Acceptance:

- feedback destination exists
- logs can be attached intentionally
- users can describe target accuracy failures
- screenshots are never uploaded silently

### Step 16.12: Phase Closure

Close Phase 16 when the Mac beta release path is documented and the release checklist passes on the current machine.

## Acceptance Criteria

Phase 16 is done when:

- Mac release build path is clear.
- Product identity is clean.
- Signing/notarization plan is ready.
- Updater decision is recorded.
- Crash/logging strategy is in place.
- Secrets stay out of the desktop app.
- Backend/provider ownership is documented.
- Privacy/permission docs exist.
- Release QA checklist exists and passes manually.

## Non-Goals

- Full App Store submission.
- Production billing.
- Public launch.
- Enterprise admin controls.
- Perfect Windows/Linux release parity.
- Fully automatic clicking or typing.

Those are later release tracks after Mac beta readiness is solid.
