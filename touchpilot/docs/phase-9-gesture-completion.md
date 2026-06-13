# Phase 9: Gesture MVP Completion

Phase 9 added the first local camera gesture layer to TouchPilot.

## What Phase 9 Changed

- defined the gesture MVP rules and privacy constraints
- added shared gesture/camera data contracts
- added camera device probing for RGB/IR/depth/virtual device visibility
- added camera and gesture toggles to settings
- added debug-only camera preview
- added MediaPipe Hand Landmarker prototype
- added pinch classification
- added open-palm classification
- added gesture smoothing and cooldowns
- mapped recognized pinch to assistant activation/listening
- mapped recognized open palm to assistant pause
- hardened camera-off, permission-denied, no-camera, and error states
- documented runtime QA and final build checks

## Product Direction

Phase 9 keeps the Phase 8 runtime shape:

- normal overlay stays cursor-first
- camera preview stays debug-only
- settings stays a small control surface
- gestures are an input layer, not a visible camera app

## Main Outcome

TouchPilot now has a local gesture MVP path:

```text
getUserMedia
  -> debug camera preview
  -> MediaPipe hand landmarks
  -> pinch/open-palm classifiers
  -> smoothing and cooldown
  -> gesture action
  -> overlay state
```

Current mappings:

| Gesture | Action | Result |
|---|---|---|
| Pinch | `activate_assistant` | overlay enters `listening` |
| Open palm | `pause_assistant` | overlay enters `paused` |

## Verification

Phase 9 verification is recorded in:

- `docs/phase-9-gesture-checks.md`
- `docs/phase-9-gesture-runtime-qa.md`

Checks that passed:

```powershell
npm --workspace @touchpilot/desktop run typecheck
cargo check --workspace
npm --workspace @touchpilot/desktop run build
```

## Remaining Risks

- MediaPipe WASM/model assets currently load from remote URLs.
- Runtime camera permission behavior still needs hands-on QA.
- Gesture thresholds need tuning under real lighting and camera angles.
- Surface IR/Windows Hello hardware is probed, not used.
- Offline packaged gesture behavior is not proven yet.

## What This Unlocks Next

Phase 9 prepares TouchPilot for Phase 10 voice work:

- pinch can become the start of voice/input mode
- open palm can remain the pause/cancel gesture
- debug camera/gesture state can help test voice-trigger flows
- the cursor-first overlay can react to non-click input
