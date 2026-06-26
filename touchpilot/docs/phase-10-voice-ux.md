# Phase 10 Voice UX Spec

Phase 10 makes Toki voice-first. The user should speak what they want, and the app should turn that into screen guidance without opening a chatbot-style command prompt.

## Decision

Voice is the product input. Text is only a debug fallback.

After the Step 10.10 manual QA pass, the default voice engine decision changed:

- production path: native Rust microphone capture plus cloud transcription
- default activation: push-to-talk
- fallback path: Web Speech API only in debug
- camera activation: voice command can enable camera/gesture mode when needed
- debug layout: tabbed and compact, not one crowded dashboard

This means:

- no user-facing command prompt
- no permanent command panel
- no typed command box in the default runtime
- no overlay dashboard for commands
- a debug-only text field is allowed later for QA
- no user-facing Web Speech toggle as the final voice model
- no normal-settings camera toggle as the main gesture/camera control

## Target User Flow

```text
User is using any desktop app
  -> Toki puck is present but quiet
  -> user presses and holds push-to-talk
  -> small listening state appears
  -> user says what they want
  -> user releases push-to-talk
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

- push-to-talk from the settings popup or a later hotkey/menu control

Then it should connect gesture activation:

- pinch starts or toggles listening
- open palm pauses or cancels listening

Keyboard hotkey can be added if needed, but it should not become the main visual product surface.

Voice should not be modeled as a permanent on/off toggle in the normal settings popup. The product should feel like:

```text
hold to speak
  -> release to submit
  -> guide me
```

not:

```text
turn on a microphone setting
  -> wonder whether it is listening forever
```

## Camera And Gesture Control

The normal settings popup should not expose camera internals as if the user is configuring a webcam app.

Preferred behavior:

- camera controls live in debug/advanced
- user can say a voice command such as "turn on gestures"
- app requests camera permission when gesture mode is actually needed
- open palm/pinch only become primary once the camera pipeline is stable

This keeps normal settings focused on the assistant, not implementation details.

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

## Debug Layout

Debug must remain useful, but it should not become a wall of boxes.

The corrected debug surface should be tabbed:

- Runtime
- Voice
- Gesture
- Capture
- Guidance

Buttons should be compact and grouped by task. State readouts should use dense rows instead of large repeated cards where possible.

Debug should also include a `Test guidance` action so the mock target can be tested without depending on voice, gestures, or a real AI provider.

## Error Handling

Phase 10 must handle:

- no microphone found
- microphone permission denied
- browser/WebView speech API missing
- empty transcript
- transcription failure
- user cancel
- gesture stop while listening
- unwanted Web Speech/browser microphone chrome
- native microphone capture failure
- cloud transcription failure

Errors should be calm and small. The overlay should not become a large error window.

## Step 10.10 Manual QA Findings

Manual QA exposed these product failures:

1. Web Speech mode can bring back an unwanted blue platform/browser strip while voice is active.
2. A normal voice on/off toggle feels wrong for the product. Push-to-talk is the better interaction.
3. The camera toggle in normal settings is confusing and should become debug/advanced behavior.
4. The mock target proves plumbing, but not real page understanding.
5. Debug is too crowded and needs tabs/compaction.
6. Rounded button boxes take too much space in debug and settings.

These findings mean the current Web Speech path is useful for debug learning, but it should not remain the default product voice engine.

## Manual QA

Phase 10 is acceptable only when this can be tested:

1. Open Toki.
2. Hold push-to-talk.
3. Speak a task.
4. Release push-to-talk.
5. See a transcript or command state in debug.
6. Trigger screen capture.
7. Get a guidance target.
8. Confirm the puck/ring/step cue visibly guide the user.

If native/cloud voice fails on the platform, the debug text fallback and Web Speech fallback must still prove the command-to-guidance loop.

## Phase 10.5 Provider Backend Smoke

Phase 10.5 adds the first real target-accuracy smoke test after voice works.

The user-facing behavior should not change much. The important change is behind Debug:

```text
voice goal + screenshot
  -> backend/proxy endpoint
  -> provider returns structured target
  -> Toki validates the target
  -> overlay renders the target only if valid
```

Rules:

- the desktop app does not contain paid provider keys
- missing provider means `unavailable`, not mock fallback
- mock guidance stays as `Test guidance`
- real guidance is tested through `Real smoke`
- the tester marks the result useful or wrong

Phase 10.5 passes when one controlled screen can produce one real provider target, even if the target quality is still rough.

Updated Step 10.5 direction:

1. The local smoke bridge is already proven: Debug `Real smoke` can reach `dev-smoke-server`, show `unavailable`, and avoid rendering a fake target.
2. The remaining Phase 10.5 work is real target accuracy, not voice wiring.
3. The next provider path should stay behind the smoke endpoint and use server-side provider mode config such as `local-ollama` or `unavailable`.
4. The provider must return strict `GuidanceResult` JSON and invalid coordinates must be rejected before rendering.
5. Phase 11 Safety should wait until one real known-screen target has been tested, or until we explicitly decide OCR/accessibility is required first.

## Tradeoffs

| Choice | Why |
| --- | --- |
| Voice-first | Matches the product idea and avoids a chatbot window |
| Debug-only text fallback | Keeps QA possible when voice is flaky |
| Minimal listening UI | Preserves cursor-first overlay behavior |
| Gesture integration after voice works | Avoids mixing gesture bugs with voice bugs |
| Native Rust mic capture | Avoids browser speech chrome and gives better control over push-to-talk |
| Cloud transcription | Faster to reach useful accuracy than local transcription |
| Web Speech debug fallback | Keeps the current experiment useful without making it the product path |
| Tabbed debug | Keeps internal tools understandable as Phase 10 grows |

## Out Of Scope

Phase 10 does not need:

- final streaming voice polish
- text-to-speech responses
- persistent command history
- full natural language task planner
- final AI accuracy

Those can come after the basic voice-to-guidance loop works.
