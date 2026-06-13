# Phase 9 Gesture Runtime QA

This QA pass verifies the Phase 9 gesture MVP at runtime.

The goal is not final gesture polish. The goal is to prove the current local camera pipeline works safely:

- camera can be enabled and disabled
- debug preview can request permission
- hand landmarks are detected locally
- pinch becomes a stable recognized gesture
- open palm becomes a stable recognized gesture
- cooldown prevents repeated firing
- pinch maps to listening
- open palm maps to paused
- camera failure states are safe
- normal overlay stays cursor-first

## Scope

This checklist covers the Phase 9 MVP through Step 9.12.

Included:

- settings camera toggle
- settings gesture toggle
- debug camera device probe
- debug camera preview
- MediaPipe hand landmarks
- pinch classifier
- open-palm classifier
- smoothing and cooldowns
- pinch activation wiring
- open-palm pause wiring
- camera-off/permission/no-camera fallbacks

Not included:

- voice mode
- final WebGL/liquid cursor rendering
- multi-hand gesture support
- Surface IR/depth stream optimization
- native camera pipeline
- packaged offline MediaPipe asset verification

## Important Runtime Note

The current MediaPipe prototype loads WASM/model assets from public MediaPipe/CDN URLs.

That is acceptable for this prototype QA step, but production readiness will need one of these later:

- package the WASM/model assets locally
- verify Tauri CSP/network permissions
- add an explicit offline failure state

Do not treat offline packaged gesture support as proven yet.

## Preflight

Run from:

```powershell
C:\Users\Pumba\Documents\codex\clicky\touchpilot
```

Recommended checks:

```powershell
npm --workspace @touchpilot/desktop run typecheck
npm --workspace @touchpilot/desktop run build
```

If native packaging is needed:

```powershell
npm run desktop:build:windows
```

If only launching the current built executable:

```powershell
Start-Process .\target\release\touchpilot-desktop.exe
```

## Open Debug Surface

1. Launch TouchPilot.
2. Use the tray menu.
3. Open the debug window.
4. Confirm the normal overlay still has no camera panel or debug panel.

Pass:

- debug window opens intentionally
- normal overlay remains cursor-first
- no camera preview appears in the normal overlay

Fail:

- camera preview appears in overlay
- debug tools appear in normal runtime
- overlay becomes a panel/dashboard again

## Camera Device Probe

In the debug window:

1. Find `Camera Devices`.
2. Click `Refresh`.
3. Confirm the available video devices appear.

Expected on the Surface machine:

- normal camera-like device may appear
- IR/Windows Hello-related hardware may appear only if exposed by Windows
- unknown/virtual devices should not crash the UI

Pass:

- device list renders
- kind labels are visible
- refresh does not request camera permission

Fail:

- refresh starts camera capture
- device probe crashes
- device list blocks the normal overlay

## Camera Preview Permission

1. Open settings from tray.
2. Turn `Camera` on.
3. Return to debug window.
4. Confirm camera permission prompt/preview behavior.

Pass:

- camera permission is requested only after Camera is turned on
- preview appears only in debug window
- `Camera Preview` status becomes `active` when allowed
- `Gesture Settings` shows permission/status

Fail:

- camera starts before user enables it
- camera preview appears in normal overlay
- permission denial crashes the app

## Hand Landmarks

With camera active:

1. Place one hand in front of the camera.
2. Confirm `Hand Landmarks` updates.
3. Move hand out of frame.
4. Confirm status changes away from running/landmarks.

Pass:

- frame id increments while detecting
- handedness appears when available
- confidence appears
- landmark count is `21` when a hand is visible
- no hand state is handled cleanly

Fail:

- app freezes when no hand is visible
- landmark count is missing when hand is clearly visible
- status gets stuck after camera is disabled

## Pinch Classifier

With camera and gestures enabled:

1. Make a clear thumb/index pinch.
2. Hold it briefly.
3. Watch `Pinch Classifier`.
4. Watch `Smoothed Gesture`.
5. Watch `Gesture Action`.

Pass:

- raw pinch label becomes `pinch`
- smoothed phase moves through `holding`
- smoothed phase reaches `recognized`
- gesture action becomes `activate_assistant`
- runtime state becomes `Listening`
- cooldown starts after recognition

Fail:

- one-frame pinch fires instantly
- pinch repeatedly fires while held
- pinch never reaches recognized despite clear stable gesture
- pinch activates when gestures are disabled

## Open Palm Classifier

With camera and gestures enabled:

1. Show a clear open palm.
2. Hold it briefly.
3. Watch `Open Palm Classifier`.
4. Watch `Smoothed Gesture`.
5. Watch `Gesture Action`.

Pass:

- extended finger count reaches expected value
- spread is above threshold
- smoothed phase reaches `recognized`
- gesture action becomes `pause_assistant`
- runtime state becomes `Paused`
- cooldown starts after recognition

Fail:

- open palm fires from a curled hand
- open palm repeatedly fires while held
- open palm pauses when gestures are disabled

## Cooldown Behavior

1. Trigger pinch or open palm.
2. Keep holding the same gesture.
3. Watch cooldown.

Pass:

- one recognized gesture creates one action
- cooldown remaining counts down
- repeated action does not fire during cooldown

Fail:

- action fires every frame
- cooldown never clears
- cooldown blocks all future gestures permanently

## Camera Off Behavior

1. Turn `Camera` off in settings.
2. Watch debug preview and gesture state.

Pass:

- camera preview stops
- video track is cleared
- hand landmarks clear
- smoothed gesture resets to inactive
- gestures disable safely
- no camera frames are captured or processed

Fail:

- camera indicator remains active
- landmarks continue updating after camera off
- gesture action fires after camera off

## Permission Denied Behavior

If reproducible:

1. Deny camera permission.
2. Confirm debug state.

Pass:

- status becomes `permission_denied`
- user-facing overlay remains usable
- gestures are disabled
- debug message explains the failure

Fail:

- app crashes
- gestures remain enabled
- camera retry loops forever

## No Camera Behavior

If reproducible:

1. Disable camera device in Windows or test on a no-camera environment.
2. Enable Camera in settings.

Pass:

- status becomes `no_camera`
- gestures are disabled
- manual/tray controls still work

Fail:

- app crashes
- overlay blocks desktop
- gesture state remains active without camera

## Acceptance Criteria

Phase 9 runtime QA passes when:

- camera work is debug-only
- camera can be turned off
- permission/no-camera states are safe
- landmarks appear for a visible hand
- pinch reaches recognized after hold
- open palm reaches recognized after hold
- cooldown prevents repeat firing
- pinch maps to listening
- open palm maps to paused
- normal overlay remains cursor-first

## Remaining Risks

- MediaPipe assets currently load from remote URLs.
- Lighting and camera angle thresholds need real-world tuning.
- Surface IR/Windows Hello devices are only probed, not used.
- No automated browser/runtime test exists for camera permission yet.
- Final packaged/offline MediaPipe behavior still needs verification.
