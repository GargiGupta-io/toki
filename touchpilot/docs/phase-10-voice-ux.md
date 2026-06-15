# Phase 10 Voice UX Spec

Phase 10 makes TouchPilot voice-first. The user should speak what they want, and the app should turn that into screen guidance without opening a chatbot-style command prompt.

## Decision

Voice is the product input. Text is only a debug fallback.

This means:

- no user-facing command prompt
- no permanent command panel
- no typed command box in the default runtime
- no overlay dashboard for commands
- a debug-only text field is allowed later for QA

## Target User Flow

```text
User is using any desktop app
  -> TouchPilot puck is present but quiet
  -> user activates voice
  -> small listening state appears
  -> user says what they want
  -> transcript becomes the command
  -> screen capture runs
  -> guidance result is produced
  -> puck/ring/step cue guide the user
```

The expected first command is simple:

```text
"How do I export this?"
```

## Activation

Phase 10 should support one reliable activation path first:

- settings/debug button for manual QA

Then it should connect gesture activation:

- pinch starts or toggles listening
- open palm pauses or cancels listening

Keyboard hotkey can be added if needed, but it should not become the main visual product surface.

## Listening State

The listening UI should be minimal.

Allowed:

- puck state changes
- small cursor-adjacent cue
- small settings status line
- debug readout

Not allowed:

- large transcript panel in the overlay
- full-screen listening modal
- chatbot-style text area
- persistent command history in the default runtime

## Voice States

Phase 10 should model voice as explicit states:

```text
idle
requesting_microphone
listening
transcribing
command_ready
error
```

These states should be visible in debug and lightly reflected in the user-facing UI.

## Transcript Handling

The transcript becomes a command string.

```text
spoken words
  -> transcript
  -> command request
  -> screen capture
  -> guidance loop
```

The app should not require perfect natural language understanding in Phase 10. The milestone is proving that a spoken command can enter the existing capture/guidance path.

## Debug Text Fallback

A text command fallback is allowed only in the debug window.

Purpose:

- test command-to-guidance when microphone fails
- separate voice bugs from guidance bugs
- speed up QA

It should not appear in:

- overlay
- settings popup
- default user runtime

## Error Handling

Phase 10 must handle:

- no microphone found
- microphone permission denied
- browser/WebView speech API missing
- empty transcript
- transcription failure
- user cancel
- gesture stop while listening

Errors should be calm and small. The overlay should not become a large error window.

## Manual QA

Phase 10 is acceptable only when this can be tested:

1. Open TouchPilot.
2. Start listening from settings/debug.
3. Speak a task.
4. See a transcript or command state in debug.
5. Trigger screen capture.
6. Get a guidance target.
7. Confirm the puck/ring/step cue visibly guide the user.

If voice fails on the platform, the debug text fallback must still prove the command-to-guidance loop.

## Tradeoffs

| Choice | Why |
| --- | --- |
| Voice-first | Matches the product idea and avoids a chatbot window |
| Debug-only text fallback | Keeps QA possible when voice is flaky |
| Minimal listening UI | Preserves cursor-first overlay behavior |
| Gesture integration after voice works | Avoids mixing gesture bugs with voice bugs |

## Out Of Scope

Phase 10 does not need:

- final speech provider selection
- final streaming voice polish
- text-to-speech responses
- persistent command history
- full natural language task planner
- final AI accuracy

Those can come after the basic voice-to-guidance loop works.
