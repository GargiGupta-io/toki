# Phase 9: Gesture MVP

> Phase 9 adds the smallest useful gesture layer: use the laptop camera locally, detect hand landmarks, classify pinch/open-palm ourselves, and connect those gestures to TouchPilot activation without making the product hardware-specific too early.

---

## In Plain English

Phase 9 is about letting the user activate TouchPilot without clicking a button.

The experience should feel simple: the user makes a small gesture near the laptop camera, TouchPilot notices it, and the cursor assistant reacts. A pinch can mean "start" or "activate." An open palm can mean "pause" or "stop."

The important part is that this should not become a giant camera app. The camera work is internal. The normal product should still feel cursor-first and mostly invisible. The user should not be staring at a camera preview unless they opened the debug window.

This phase is called an MVP because we are not trying to build the final perfect gesture system yet. MVP means Minimum Viable Product: the smallest version that proves the feature can work in real life.

For TouchPilot, the Gesture MVP means:

- camera can turn on
- permission flow is understandable
- hand can be detected
- pinch can activate the assistant
- open palm can pause or stop it
- accidental triggers are reduced with smoothing and cooldowns
- camera can be turned off
- debug tooling can show what the gesture system thinks is happening

## What MVP Means

MVP means Minimum Viable Product.

It does not mean cheap or sloppy. It means we choose the smallest version that proves the core idea. If that version works, we can improve it. If it fails, we learn before building a large system on top of it.

For Phase 9, the MVP is not:

- perfect hand tracking
- cinematic gesture visuals
- every possible gesture
- multi-hand choreography
- native depth-camera integration
- cloud vision
- camera support for every unusual device

The MVP is:

- one local camera stream
- one hand-tracking engine
- two gestures
- one activation action
- one pause/stop action
- good enough smoothing to avoid obvious false triggers
- privacy controls

That is enough to prove whether gesture activation belongs in the product.

## Final Technical Decision

The Phase 9 MVP should use:

```text
getUserMedia
  -> MediaPipe Hand Landmarker
  -> custom TouchPilot gesture classifier
  -> smoothed gesture event
  -> overlay/action state
```

In plain English:

The browser part of Tauri asks Windows for camera video. MediaPipe finds the hand points in that video. Our own code checks those points and decides whether the user is pinching or showing an open palm. TouchPilot then maps that gesture to an action.

The chosen stack:

- `navigator.mediaDevices.getUserMedia()` for camera access
- MediaPipe Tasks Vision `HandLandmarker` for hand landmarks
- custom pinch/open-palm classifier written in TypeScript
- smoothing and cooldown logic written by us
- debug preview only inside the debug window
- no camera frames sent to AI or external servers

## Why This Is The Best Option

TouchPilot needs gesture detection, not a general computer-vision platform.

For the first useful version, we only need to answer:

- is there a hand?
- is the hand pinching?
- is the hand open?
- is the signal stable enough to trust?

MediaPipe Hand Landmarker gives us the exact raw material for that: 21 points on the hand.

Those points include:

- wrist
- thumb joints
- thumb tip
- index finger joints
- index fingertip
- middle finger joints
- ring finger joints
- pinky joints

Once we have those points, pinch and open palm are geometry problems.

Pinch:

```text
thumb tip is close to index fingertip
```

Open palm:

```text
fingers are extended and spread
```

This is better than using a fully built gesture recognizer because TouchPilot needs product-specific gestures. We need a gesture system that can be tuned for our activation rules, not just a black-box label.

## How The Gesture System Works

The full flow is:

```text
Laptop camera
  -> getUserMedia()
  -> hidden/debug video element
  -> MediaPipe Hand Landmarker
  -> 21 hand landmark points
  -> custom gesture classifier
  -> smoothing/hold/cooldown
  -> TouchPilot action
```

### 1. Camera Stream

Plain English: this asks Windows for permission to use the camera and gives the app live video if the user allows it.

Technical view:

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: false
});
```

The returned `MediaStream` can be attached to a `<video>` element. The video element does not need to be visible in the normal overlay. It can be hidden or shown only in the debug window.

This keeps the product clean:

- no camera preview in the user-facing overlay
- no big panel
- no app-like surface
- only debug mode shows raw camera details

### 2. Hand Landmarker

Plain English: MediaPipe looks at each video frame and marks where the hand is.

Technical view:

MediaPipe Hand Landmarker receives video frames and returns landmark arrays.

Each landmark is a normalized coordinate:

```ts
type Landmark = {
  x: number;
  y: number;
  z: number;
};
```

The `x` and `y` values are relative to the video frame. Usually:

- `x = 0` means left side of the frame
- `x = 1` means right side of the frame
- `y = 0` means top of the frame
- `y = 1` means bottom of the frame

That gives us a camera-space hand skeleton.

### 3. Pinch Detection

Plain English: pinch means the thumb tip and index fingertip are close together.

The core idea:

```text
distance(thumb_tip, index_tip) < threshold
```

But raw pixel distance is not enough because hands can be near or far from the camera. The same real pinch looks larger when the hand is close to the camera.

So the better rule is normalized distance:

```text
pinchDistance = distance(thumb_tip, index_tip)
palmSize = distance(wrist, middle_mcp)
normalizedPinch = pinchDistance / palmSize
```

Then:

```text
if normalizedPinch is small enough -> pinch candidate
```

This makes the gesture work better across different hand sizes and distances.

### 4. Open Palm Detection

Plain English: open palm means the fingers are extended instead of curled.

The system checks whether fingers are generally straight and separated.

Possible checks:

- index fingertip is farther from wrist than index middle joint
- middle fingertip is farther from wrist than middle middle joint
- ring fingertip is farther from wrist than ring middle joint
- pinky fingertip is farther from wrist than pinky middle joint
- fingertips are spread apart enough
- palm area is stable enough

This does not need to be perfect for MVP. It only needs to be reliable enough to pause or stop when the user clearly shows an open hand.

### 5. Smoothing

Plain English: the app should not react to one noisy frame.

Camera detection is jittery. One frame might say "pinch", the next frame might say "not pinch." If TouchPilot reacted instantly, it would misfire.

So we add a small stability rule:

```text
pinch candidate appears
hold for 150-250ms
confidence stays high
cooldown is not active
then trigger pinch
```

This means the user has to actually perform the gesture, not accidentally flash it for one frame.

### 6. Cooldown

Plain English: after a gesture fires, wait briefly before allowing it to fire again.

Without cooldown, one pinch could trigger activation many times.

Example:

```text
pinch detected at 10:00:00.100
activation fires
cooldown starts for 700ms
pinch cannot fire again until 10:00:00.800
```

This makes the gesture feel intentional instead of chaotic.

### 7. TouchPilot Action Mapping

Plain English: gestures become product actions.

The first mapping should be simple:

| Gesture | TouchPilot action |
|---|---|
| Pinch | activate assistant / begin command flow |
| Open palm | pause, stop, or cancel current flow |

We should not add five gestures in the MVP. Every new gesture adds confusion and false-positive risk.

## Surface Camera Hardware Decision

The user's Surface exposes extra camera-related hardware:

- `Intel(R) AVStream Camera 2500`
- `Microsoft Camera Front`
- `Microsoft IR Camera Front`
- `IntelIRCameraSensorGroup`
- `Windows Hello Face Software Device`

That means the laptop has normal camera hardware plus Windows Hello / IR-related hardware.

But this does not automatically mean TouchPilot can use it like LiDAR or a depth camera.

Windows Hello camera hardware is often protected for biometric authentication. It may appear in device lists but not expose a normal app-accessible depth stream.

So the decision is:

- build the MVP on normal RGB camera input
- add a camera capability probe
- detect whether IR/depth-like streams are visible
- only add a Surface-specific mode if the stream is actually accessible to normal app code

This avoids making Phase 9 depend on a hardware path that might be locked down by Windows.

## Tradeoffs

### Option 1: getUserMedia + MediaPipe Hand Landmarker + Custom Classifier

Plain English: use the normal camera, let MediaPipe find the hand, then make our own rules for pinch and open palm.

This is the chosen option.

Pros:

- fastest path to a working gesture MVP
- local-only camera processing
- no cloud dependency
- works on many laptops
- easier to debug in the existing Tauri app
- custom pinch logic is under our control
- avoids heavy Rust/OpenCV packaging work
- fits the existing React/Tauri architecture

Cons:

- normal RGB camera can struggle in low light
- WebView camera permissions can be annoying
- MediaPipe model/WASM assets must be packaged correctly
- raw frame processing can affect performance if not throttled
- final accuracy will need tuning on real users

Decision:

Use this for Phase 9.

### Option 2: MediaPipe Gesture Recognizer

Plain English: use a higher-level MediaPipe model that directly outputs some gesture labels.

Pros:

- built-in labels for gestures like open palm
- less custom logic for some gestures
- can be useful for comparison/debug

Cons:

- pinch is not the main built-in gesture we need
- still returns a black-box label
- less control over TouchPilot-specific thresholds
- we would still need custom pinch logic
- more likely to create confusion about what is trusted

Decision:

Do not use as the primary MVP path. Maybe use later as a comparison signal.

### Option 3: Native Rust/OpenCV/MediaPipe

Plain English: do camera and hand tracking in the Rust/native side instead of the WebView.

Pros:

- stronger access to native camera APIs
- better long-term control over threading and performance
- can support special hardware better later

Cons:

- much more build complexity
- heavier dependencies
- higher packaging risk on Windows
- slower iteration
- likely to reopen the build-resource problems from Phase 8

Decision:

Do not do this for Phase 9 MVP. Reconsider only after RGB WebView MVP proves the gesture UX is worth deepening.

### Option 4: Surface-Specific IR/Depth Version

Plain English: try to use the Surface's special Windows Hello / IR camera hardware.

Pros:

- could improve low-light behavior
- could provide cleaner hand separation if usable
- might make a premium Surface-specific mode possible

Cons:

- hardware may not expose usable streams to normal apps
- Windows Hello devices can be restricted
- different Surface models expose different devices
- would make the MVP laptop-specific
- could delay gesture work without proving the product interaction

Decision:

Probe capabilities, but do not build the MVP around it.

### Option 5: Python Sidecar

Plain English: run a separate Python process for hand tracking.

Pros:

- fast prototyping
- many computer vision libraries available

Cons:

- bad production packaging
- extra process lifecycle
- harder error handling
- worse installer story
- not aligned with Tauri product architecture

Decision:

Reject for this product path.

### Option 6: Cloud Vision

Plain English: send camera frames to a server for interpretation.

Pros:

- less local ML setup
- could use stronger models

Cons:

- privacy problem
- latency problem
- internet dependency
- cost
- user trust issue
- unnecessary for pinch/open palm

Decision:

Reject.

## What Phase 9 Should Build

Phase 9 should build the smallest complete gesture loop:

```text
Settings
  -> camera on/off
  -> gesture activation toggle

Debug window
  -> camera preview
  -> hand landmarks status
  -> current gesture
  -> confidence
  -> hold duration
  -> cooldown state

Gesture engine
  -> get camera stream
  -> run hand landmarker
  -> classify pinch/open palm
  -> smooth signal
  -> emit gesture event

Overlay/runtime
  -> receives gesture event
  -> pinch activates assistant
  -> open palm pauses/stops
```

The normal overlay should not become a camera dashboard.

## What Phase 9 Should Not Build

Do not build these yet:

- full gesture library
- native camera pipeline
- Surface-only mode as default
- 3D/animated gesture effects
- cloud camera analysis
- always-visible camera preview
- complex calibration wizard
- multi-person hand tracking
- sign-language-like gesture system

Those are later work if the MVP proves useful.

## Privacy Rules

The camera is sensitive. Phase 9 must treat it as a product trust boundary.

Rules:

- camera off by default unless explicitly enabled
- clear settings control for camera on/off
- no camera preview in normal runtime
- no frames sent to AI by default
- no frames sent to external servers
- debug preview is internal/debug-only
- user can disable camera quickly
- gesture state should degrade gracefully if permission is denied

This matters because TouchPilot is supposed to feel like an assistant, not surveillance software.

## Performance Rules

The camera loop must not make the overlay lag.

Rules:

- run hand detection at a controlled frame rate
- do not run inference faster than needed
- avoid blocking overlay render
- use `requestAnimationFrame` or timed polling carefully
- later move inference to a worker if the main thread suffers
- keep debug preview optional

Phase 9 can start simple, but it should leave room for a worker/off-main-thread version.

## Edge Cases

### Camera Permission Denied

Plain English: the user says no to camera access.

Expected behavior:

- gestures disabled
- settings show camera unavailable/denied
- overlay still works through tray/settings/manual controls
- no crash

### No Camera Found

Plain English: Windows does not provide a usable camera stream.

Expected behavior:

- gestures disabled
- debug window explains no camera stream
- app still works without gestures

### Low Light

Plain English: the camera cannot clearly see the hand.

Expected behavior:

- confidence drops
- no gesture fires
- debug window shows low confidence
- user can still use manual controls

### Hand Too Close Or Too Far

Plain English: the hand is visible but geometry is distorted.

Expected behavior:

- normalized distance helps
- classifier avoids obvious false triggers
- debug readout helps tune thresholds

### Accidental Pinch

Plain English: the user briefly moves fingers close together.

Expected behavior:

- hold duration prevents instant trigger
- cooldown prevents repeated triggers

### Multiple Hands

Plain English: more than one hand appears.

MVP behavior:

- use the most confident hand
- ignore extra hands
- document this limitation

## Done Criteria For Phase 9

Phase 9 is done when:

- user can enable camera in settings
- debug window can show camera status
- hand landmark detection runs locally
- pinch gesture can activate TouchPilot
- open palm can pause/stop TouchPilot
- gestures use smoothing and cooldown
- camera can be disabled
- permission denied/no camera cases are handled
- normal overlay remains cursor-first
- no camera preview leaks into normal runtime
- docs and learnings are updated

Phase 9 is not done if:

- camera preview appears in the user overlay
- gestures work only by accident
- pinch triggers repeatedly from one gesture
- camera permission failure crashes the app
- debug tooling leaks back into the product surface
- implementation depends on Surface-only hardware

## Recommended Step Order

1. Define gesture MVP requirements.
2. Add gesture data contracts.
3. Add camera capability probe.
4. Add camera permission/settings controls.
5. Add debug camera preview.
6. Add MediaPipe Hand Landmarker.
7. Add pinch classifier.
8. Add open palm classifier.
9. Add smoothing and cooldowns.
10. Wire pinch to activation.
11. Wire open palm to pause/stop.
12. Add privacy/camera-off controls.
13. Add gesture QA checklist.
14. Run checks and document completion.

## Key Terms

| Term | Plain English meaning | Technical meaning |
|---|---|---|
| MVP | Smallest useful version | Minimum Viable Product |
| `getUserMedia` | Ask for camera access | Browser/WebView API returning a `MediaStream` |
| MediaPipe | Google's local ML toolkit | Vision tasks package for browser/native ML inference |
| Hand Landmarker | Finds hand points | Model that returns 21 hand landmarks |
| Landmark | One point on the hand | Normalized x/y/z coordinate |
| Classifier | Decides what gesture happened | Code that maps landmarks to labels |
| Pinch | Thumb and index touch/near-touch | Normalized thumb-tip/index-tip distance below threshold |
| Open palm | Hand open and spread | Finger extension/spread geometry |
| Smoothing | Wait for stable signal | Temporal filter across frames |
| Cooldown | Short wait after firing | Prevents repeated triggers |
| Confidence | How trustworthy detection is | Score or derived stability estimate |

## Final Decision Summary

Phase 9 should start with a local, WebView-based gesture MVP:

```text
getUserMedia + MediaPipe Hand Landmarker + custom classifier
```

This is the best balance of:

- speed
- privacy
- control
- portability
- packaging safety

Surface-specific camera hardware is worth probing, but not worth making the default path. The MVP should work on the normal RGB camera first. If the Surface IR/Windows Hello camera exposes a usable stream later, it can become an optional optimization.

The most important product rule remains from Phase 8:

The user should experience TouchPilot as a cursor assistant, not as a camera app.

---

## Sources To Revisit During Implementation

- MediaPipe Hand Landmarker web docs: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- MediaPipe Gesture Recognizer web docs: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js
- MDN `getUserMedia`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

---

*Generated: 2026-06-13 | Project: TouchPilot | Phase: 9 Gesture MVP*
