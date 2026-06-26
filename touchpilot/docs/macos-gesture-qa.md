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
