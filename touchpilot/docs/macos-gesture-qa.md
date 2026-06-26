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
