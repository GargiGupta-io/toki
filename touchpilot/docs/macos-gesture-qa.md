# macOS Gesture QA

M5 retests the gesture layer on Mac. The goal is to decide whether gestures are ready to stay in the main flow or need Mac-specific fixes.

## Step M5.1 Camera Enumeration

Camera enumeration checks whether Toki can see Mac video input devices before testing landmarks or gestures.

### How To Test

1. Start Toki on Mac.
2. Open the Toki menu-bar item.
3. Open Debug.
4. Go to the Gesture tab.
5. Find Camera Devices.
6. Press Refresh.

### Pass

Camera enumeration passes when:

- the probe status becomes `ready`
- at least one video input appears
- the app does not request camera capture just from pressing Refresh
- the normal overlay stays cursor-first and does not show a camera preview

### Acceptable Mac Behavior

macOS may hide camera labels until camera permission is granted. This means a real camera may appear as:

```text
Camera 1
```

instead of a specific device name.

That is acceptable for M5.1. It proves enumeration works. The permission and preview behavior is tested in M5.2.

### Fail

Camera enumeration fails when:

- status becomes `unsupported`
- status becomes `error`
- no video input appears on a Mac with a working camera
- pressing Refresh starts camera capture
- camera preview appears outside the debug window

## Current M5.1 Decision

The debug window is the right place for enumeration. The settings panel should stay focused on user controls and should not become a camera configuration surface.

M5.1 only proves that devices can be listed. It does not prove:

- camera permission
- camera preview
- hand landmarks
- pinch detection
- open palm detection

## Step M5.2 Camera Permission Flow

Camera permission checks whether Toki can request camera access safely and explain blocked states clearly.

### How To Test

1. Start Toki on Mac.
2. Open Debug.
3. Go to the Gesture tab.
4. Use the gesture/camera controls to enable Camera.
5. Watch the Camera Preview status.

### Pass

Camera permission passes when:

- status moves from `requesting_permission` to `active`
- macOS permission prompt appears if permission was not granted before
- camera preview appears only inside the debug window
- normal overlay stays cursor-first
- disabling Camera stops the preview and returns status to `disabled`

### Permission Denied

If status becomes `permission_denied`, fix it here:

```text
System Settings
  -> Privacy & Security
  -> Camera
  -> enable Toki or the terminal app running Toki
```

After changing camera permission, quit and relaunch Toki. macOS often does not apply privacy changes to already-running processes.

### Fail

Camera permission fails when:

- permission is requested before Camera is enabled
- preview appears in the normal overlay
- status gets stuck on `requesting_permission`
- denied permission shows only a raw browser error with no Mac guidance
- disabling Camera leaves the camera indicator or preview active

## Current M5.2 Decision

Camera permission remains debug/advanced for now. The normal user flow should stay voice-first, and camera/gesture activation should become user-facing only after landmark and gesture reliability are proven.

## Step M5.3 MediaPipe Hand Landmarks

MediaPipe landmark testing checks whether Toki can turn the camera preview into hand points.

### How To Test

1. Complete M5.2 so Camera Preview is `active`.
2. Keep Debug open on the Gesture tab.
3. Find Hand Landmarks.
4. Put one open hand clearly inside the camera frame.
5. Watch Status, Frame, Hand, Confidence, and Landmarks.

### Pass

Hand landmarks pass when:

- status becomes `running`
- frame number increases
- hand becomes `left`, `right`, or `unknown`
- confidence is above `0`
- landmarks count becomes `21`

### Acceptable Intermediate States

These states are not failures by themselves:

- `loading`: MediaPipe model is downloading or initializing.
- `no_hand`: the model is running, but no hand is visible enough.
- `idle`: camera is off.

### Fail

Hand landmarks fail when:

- status stays `loading` for a long time with internet available
- status becomes `error`
- status stays `no_hand` even with a well-lit open hand in frame
- landmarks count never reaches `21`
- camera preview is active but frame number never changes

### Mac/WebView Note

The hand landmarker tries GPU first and falls back to CPU. This matters because GPU delegates can fail inside some WebView/GPU combinations even when the camera stream itself works.

The current model and WASM files load from MediaPipe CDN URLs. If the Mac is offline or the CDN is blocked, landmark loading can fail even though camera preview works.

## Current M5.3 Decision

M5.3 accepts CPU fallback as correct. Final performance tuning can happen later; this step only proves that a hand can become a 21-point landmark frame on Mac.

## Step M5.4 Pinch Gesture Test

Pinch testing checks whether Toki can detect thumb-and-index pinch from a real Mac camera feed.

### How To Test

1. Complete M5.3 so Hand Landmarks is `running`.
2. Enable Gestures from debug/advanced controls.
3. Hold one hand in frame.
4. Slowly bring thumb tip and index finger tip together.
5. Watch Pinch Classifier, Smoothed Gesture, and Gesture Action.

### Pass

Pinch passes when:

- Pinch Classifier label becomes `pinch`
- Distance drops below Threshold
- Smoothed Gesture becomes `pinch`
- Smoothed phase moves through `holding`
- Smoothed phase reaches `recognized`
- Gesture Action records the pinch action

### Fail

Pinch fails when:

- landmarks are running but Distance never changes
- Distance drops below Threshold but label stays `none`
- label becomes `pinch` but Smoothed Gesture never reaches `recognized`
- recognition fires repeatedly without respecting cooldown
- pinch recognition triggers while the hand is open

### Debug Reading Guide

Raw pinch detection is not the same as command activation:

```text
Pinch Classifier
  -> raw per-frame candidate

Smoothed Gesture
  -> hold/cooldown logic

Gesture Action
  -> command actually fired
```

For M5.4, the important result is not just `pinch` appearing once. The important result is a stable transition from raw pinch to recognized smoothed gesture to one action.

## Current M5.4 Decision

Pinch remains debug-first until it is reliable under normal laptop lighting. If pinch is noisy, voice remains the primary activation path.

## Step M5.5 Open Palm Gesture Test

Open palm testing checks whether Toki can recognize a clear open hand and pause the assistant.

### How To Test

1. Complete M5.3 so Hand Landmarks is `running`.
2. Enable Gestures from debug/advanced controls.
3. Hold one hand in frame with fingers extended and spread.
4. Watch Open Palm Classifier, Smoothed Gesture, and Gesture Action.

### Pass

Open palm passes when:

- Open Palm Classifier label becomes `open_palm`
- Fingers reaches at least `4 / 4`
- Spread rises above Threshold
- Smoothed Gesture becomes `open_palm`
- Smoothed phase moves through `holding`
- Smoothed phase reaches `recognized`
- Gesture Action records `pause_assistant`
- overlay state becomes paused

### Fail

Open palm fails when:

- landmarks are running but Fingers never changes
- Fingers reaches `4 / 4` and Spread exceeds Threshold but label stays `none`
- label becomes `open_palm` but Smoothed Gesture never reaches `recognized`
- open palm fires repeatedly without respecting cooldown
- open palm triggers when the hand is closed or pinching
- overlay does not pause after the action fires

### Debug Reading Guide

Open palm has the same three-layer reading as pinch:

```text
Open Palm Classifier
  -> raw per-frame finger/spread check

Smoothed Gesture
  -> hold/cooldown logic

Gesture Action
  -> pause command actually fired
```

For M5.5, the important result is a stable open hand becoming one pause action. A flickering one-frame open palm is not enough.

## Current M5.5 Decision

Open palm remains debug-first until false positives are tested in normal laptop use. If it pauses accidentally, it should not become a primary user gesture yet.

## Step M5.6 Gesture Debug Cleanup

Gesture debug should show the few signals needed to make a decision, not every internal detail as separate panels.

### What The Gesture Tab Should Show

- Camera Devices
- Camera Preview
- Hand Landmarks
- Gesture Recognition
  - Pinch
  - Open Palm
  - Smoothed
  - Action
- Gesture Settings

### Pass

Debug cleanup passes when:

- raw classifier values are still visible
- smoothed gesture state is still visible
- final action is still visible
- pinch and open palm are grouped together
- the tab is easier to scan during manual gesture testing

### Fail

Debug cleanup fails when:

- tester cannot see whether pinch/open palm was detected
- tester cannot see whether smoothing recognized the gesture
- tester cannot see whether an action fired
- camera preview or permission status is hidden

## Current M5.6 Decision

Keep gesture internals in Debug, not Settings. The normal product surface should stay voice-first and cursor-first while gesture reliability is being evaluated.
