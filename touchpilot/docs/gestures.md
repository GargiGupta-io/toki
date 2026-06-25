# Gesture Control

Toki uses camera gestures as a control layer. The camera should not be the main intelligence system; it should trigger assistant commands while screen understanding and the AI model decide what guidance to show.

## First Gestures

| Gesture | Command |
|---|---|
| two-finger pinch | toggle voice/input mode |
| open palm | pause assistant |

These two gestures are enough for the first demo and lower the risk of false positives.

## Later Gestures

| Gesture | Command |
|---|---|
| index finger point | ask about pointed region |
| pinch and drag | select screen region |
| swipe right | next step |
| swipe left | previous step |
| thumb up | confirm |
| thumb down | cancel |
| two hands apart/together | expand/collapse overlay |

## Pipeline

```text
camera frame
  -> hand landmark detection
  -> gesture classification
  -> confidence smoothing
  -> cooldown/rate limit
  -> assistant command
```

## Safety And Privacy

- Process camera frames locally by default.
- Show a visible camera-on indicator.
- Provide a camera-off switch.
- Avoid storing frames unless the user enables debugging.
- Provide keyboard and mouse alternatives for every gesture.
