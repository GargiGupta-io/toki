# Clicky Reference

Clicky is a useful reference for product flow, but Toki should not be built on top of its codebase.

## Decision

Use Clicky as a reference implementation, not a foundation.

## Why

- Clicky is Swift/macOS-first.
- Toki must support Windows, macOS, and Linux.
- Clicky's capture and overlay decisions are tied to Apple APIs.
- Toki needs camera gestures, React overlay visuals, Rust native modules, and cross-platform packaging from the start.

## Useful Ideas To Borrow

- Menu/tray-style app presence.
- Screenshot-to-model guidance loop.
- Push-to-talk interaction.
- Overlay pointer behavior.
- Model gateway/API proxy pattern.
- Streaming assistant response flow.
- Structured target protocol.

## Ideas To Avoid Carrying Over Directly

- Swift app shell.
- AppKit overlay model.
- ScreenCaptureKit assumptions.
- macOS-only permissions.
- Hardcoded provider choices.
- Chat-first UI if it competes with overlay-first guidance.

## Toki Direction

Toki should feel like a cross-platform OS-level guidance layer:

```text
screen understanding
  + gesture control
  + voice/text prompt
  + safe visual guidance
```
