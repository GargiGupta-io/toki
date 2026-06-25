# Phase 9: Gesture MVP

Phase 9 adds the first local camera gesture controls to Toki.

The product rule from Phase 8 still applies: the normal runtime must stay cursor-first. The camera is an activation layer, not a new visible app surface.

## Goal

Build the smallest useful gesture system:

- use the local laptop camera
- detect one hand
- classify pinch and open palm
- smooth noisy signals
- connect gestures to assistant actions
- keep camera preview/debug details out of the normal overlay

## MVP Meaning

MVP means Minimum Viable Product.

For Phase 9, that means the smallest gesture version that proves the interaction works:

- camera permission can be requested
- hand landmarks can be detected
- pinch can activate Toki
- open palm can pause/stop Toki
- false triggers are reduced
- camera can be turned off
- failure states are handled without breaking the overlay

It does not mean final gesture polish, full hardware optimization, or cinematic gesture visuals.

## Final Technical Direction

Use:

```text
getUserMedia
  -> MediaPipe Hand Landmarker
  -> custom Toki gesture classifier
  -> smoothing/cooldown
  -> assistant action
```

This means:

- `navigator.mediaDevices.getUserMedia()` provides the camera stream.
- MediaPipe Hand Landmarker finds 21 hand points.
- Toki classifies gestures from those points.
- The normal overlay receives only final gesture events.

## Supported Gestures

### Pinch

Purpose:

- activate assistant
- later: start voice/input mode

Initial detection rule:

```text
normalizedDistance(thumb_tip, index_tip) <= pinchThreshold
```

Use a normalized distance instead of raw pixels:

```text
pinchDistance = distance(thumb_tip, index_tip)
palmSize = distance(wrist, middle_finger_mcp)
normalizedPinch = pinchDistance / palmSize
```

Initial MVP behavior:

- pinch must be stable for a short hold duration
- pinch fires once
- cooldown prevents repeated activation from one held pinch

### Open Palm

Purpose:

- pause assistant
- later: stop/cancel current flow

Initial detection rule:

```text
index, middle, ring, and pinky fingers appear extended
fingertips are spread enough
hand signal is stable long enough
```

Initial MVP behavior:

- open palm pauses/stops the current assistant flow
- open palm uses hold duration and cooldown
- low-confidence open palm does not fire

## Initial Tuning Defaults

These are starting values, not permanent constants:

| Setting | Initial value | Reason |
|---|---:|---|
| Min detection confidence | `0.6` | Avoid firing from weak hand detections |
| Pinch hold duration | `180ms` | Prevent one-frame accidental activation |
| Open palm hold duration | `220ms` | Open palm should feel intentional |
| Gesture cooldown | `700ms` | Prevent repeated triggers from one gesture |
| Max tracked hands | `1` | MVP keeps classification simple |

These values should be visible in debug output so they can be tuned.

## Surface Camera Decision

The user's Surface exposes IR/Windows Hello-related hardware, but Phase 9 must not depend on it.

MVP rule:

- use the normal RGB camera path first
- add a camera capability probe
- list available camera devices in debug/settings
- only add Surface-specific IR/depth behavior later if Windows exposes a usable stream

Reason:

Windows Hello / IR devices can appear in device lists but still be unavailable to normal apps. Building the MVP around them would make Phase 9 fragile and hardware-specific.

## Privacy Rules

Camera handling must be conservative:

- camera processing is local by default
- no frames are sent to AI services
- no frames are uploaded
- no camera preview appears in the normal overlay
- debug preview appears only in the debug window
- user can turn the camera off
- permission denied must not crash the app
- no camera fallback must still leave Toki usable

## Runtime Surface Rules

The surfaces stay split:

| Surface | Gesture responsibility |
|---|---|
| Overlay | receives final gesture events only |
| Settings | camera on/off, gesture enable/disable |
| Debug | camera preview, landmarks status, current gesture, confidence, cooldown |

The overlay must not show:

- camera preview
- landmark points
- gesture debug cards
- camera permission panels
- developer metadata

## Data Contract Requirements

Step 9.2 should add types for:

- camera permission state
- camera device summary
- camera stream state
- hand landmark point
- hand landmark frame
- gesture label
- gesture confidence
- gesture phase
- hold duration
- cooldown state
- gesture action event

## Failure States

### Permission Denied

Expected behavior:

- gestures disabled
- settings/debug show permission denied
- overlay continues to work normally

### No Camera

Expected behavior:

- gestures disabled
- debug window shows no usable camera
- manual/tray controls remain available

### Low Confidence

Expected behavior:

- no gesture fires
- debug window shows low confidence
- overlay remains quiet

### Camera Disabled

Expected behavior:

- camera stream is stopped
- no inference loop runs
- gesture state becomes inactive

## Done Criteria

Phase 9 is complete when:

- camera can be enabled from settings
- camera can be disabled from settings
- debug window can show camera status
- MediaPipe landmarks run locally
- pinch can activate Toki
- open palm can pause/stop Toki
- smoothing and cooldown prevent obvious repeated triggers
- permission denied/no camera cases are handled
- normal overlay remains cursor-first and clean
- docs and learning notes are updated

## Out Of Scope

Do not build these in Phase 9:

- final liquid/WebGL puck
- native Rust camera pipeline
- Surface-only IR/depth mode
- cloud vision
- complex gesture vocabulary
- multi-hand workflows
- sign-language-style controls
- camera preview in the normal overlay

## Phase 9 Step Order

1. Gesture MVP spec
2. Gesture data contracts
3. Camera capability probe
4. Camera settings controls
5. Debug camera preview
6. MediaPipe Hand Landmarker prototype
7. Pinch classifier
8. Open palm classifier
9. Gesture smoothing and cooldowns
10. Pinch activation wiring
11. Open palm pause wiring
12. Camera privacy and failure handling
13. Gesture runtime QA
14. Phase 9 checks
15. Phase 9 closeout and learning update
