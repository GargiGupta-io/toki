# macOS Global Push-To-Talk

Toki should feel like Clicky here: the user holds a shortcut while working in any app, speaks, releases, and Toki routes the transcript into guidance.

## Current State

- The settings panel supports local push-to-talk.
- The local shortcut is Space while the settings panel is focused.
- Native microphone capture works.
- Local Whisper transcription works.
- Transcript-to-guidance activation works with the current mock guidance path.

This is enough for Mac voice QA, but it is not enough for the final product because the shortcut only works while Toki's settings panel is focused.

## Target Behavior

Final Mac behavior:

1. User works in another app.
2. User holds Control+Option.
3. Toki starts native mic capture.
4. User speaks a command.
5. User releases Control+Option.
6. Toki stops native mic capture.
7. Toki transcribes locally by default.
8. Toki routes the transcript into guidance.

The settings button remains as a visible fallback, but the normal workflow should be global push-to-talk.

## Why Control+Option

Clicky uses a modifier-style hold shortcut because it is quick and does not require clicking a panel first.

Control+Option is a good first default because:

- it is easy to hold with one hand
- it avoids ordinary typing
- it feels like a temporary mode, not a toggle
- it can work while another app has focus

It still needs to be configurable later because user keyboard layouts and accessibility needs differ.

## Required macOS Permission

Global key monitoring on macOS requires Accessibility permission.

Plain English: macOS will not let a background app watch global keyboard events unless the user explicitly allows it in System Settings.

Expected permission path:

```text
System Settings
  -> Privacy & Security
  -> Accessibility
  -> enable Toki
```

After changing this permission, the app often needs to be quit and relaunched.

## Best Implementation Direction

Use a native macOS event monitor in Rust or a small Swift/AppKit bridge.

The important part is that the event monitor must be listen-only. It should observe the shortcut and trigger Toki, but it should not steal normal keyboard input from the active app.

Target event flow:

```text
CGEvent tap / native monitor
  -> Control+Option down
  -> emit toki://overlay-command start-voice-listening
  -> Control+Option up
  -> emit toki://overlay-command submit-voice-listening
```

## Alternatives

### Tauri Global Shortcut Plugin

Pros:

- simpler API
- cross-platform shape
- less custom native code

Cons:

- global shortcuts usually fire command events, not reliable press-and-hold transitions
- modifier-only shortcuts may not behave like Clicky
- permission UX is still needed on macOS

Use this only if it can prove press/release behavior cleanly.

### Web Keyboard Events

Pros:

- already works for Space inside settings
- easy to test

Cons:

- only works while Toki has focus
- does not match Clicky
- makes the user keep the settings panel open

Keep this as the fallback, not the final path.

### Native CGEvent Tap / Swift Bridge

Pros:

- closest to Clicky
- supports press/release transitions
- can observe modifier-only shortcuts
- works while another app is active

Cons:

- macOS-specific
- requires Accessibility permission
- must be carefully cleaned up on app quit
- needs manual QA because permission behavior cannot be fully proven by TypeScript tests

This is the preferred final path.

## Acceptance Checks

Before this is considered complete:

- Toki asks for or clearly explains Accessibility permission.
- Holding Control+Option starts listening while another app is focused.
- Releasing Control+Option submits the command.
- Normal typing in the active app is not blocked.
- The settings button still works as fallback.
- The debug window shows the voice state changing.
- The overlay shows the small voice cue near the puck.

## Product Rule

Do not ship global push-to-talk as the only activation path until the permission experience is clear. The visible settings push-to-talk control must remain as a fallback.
