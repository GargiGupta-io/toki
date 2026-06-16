# Phase 10 Voice Runtime QA

## Purpose

This checklist originally verified the first Web Speech MVP path:

- settings/debug can start and stop voice mode
- microphone capability probing reports the real platform state
- browser speech recognition either captures text or fails honestly
- final recognized text routes into the guidance loop
- voice can be interrupted without stale transcript state

Phase 10 does not require production-quality voice yet. The pass bar is that the app clearly proves what this Windows WebView can and cannot support.

Step 10.10 changed the target architecture. Web Speech is no longer the preferred default runtime path because manual QA showed it can reintroduce unwanted platform/browser chrome while voice is active.

Corrected target:

- native Rust microphone capture
- cloud transcription
- push-to-talk activation
- Web Speech as debug-only fallback
- tabbed debug UI
- camera/gesture controls moved out of normal settings

## Preconditions

- Phase 8 overlay behavior is already accepted.
- Settings opens from the tray and remains movable.
- Debug opens from the tray.
- Desktop typecheck passes.
- Camera/gesture work may be present, but voice QA should not depend on gestures.

## Launch

Use one of these paths:

```powershell
npm run desktop:dev
```

or, for release-exe testing:

```powershell
npm run desktop:release:exe
Start-Process .\target\release\touchpilot-desktop.exe
```

If release compilation stalls around the final Rust target, prefer `desktop:dev` for this QA pass. Full release packaging is not required to validate voice UI behavior.

## Settings QA

1. Open settings from the tray.
2. Confirm the popup has a `Voice` row.
3. Turn `Voice` on.
4. Confirm the row changes from `Idle` to a listening/requesting/unsupported/error state.
5. Turn `Voice` off.
6. Confirm voice returns to idle/cancelled state and no stale command remains visible.
7. Press `Pause assistant`.
8. Confirm active voice listening stops.

Pass:

- Voice can be toggled from settings.
- Stop/pause cancels voice cleanly.
- The settings popup remains usable and movable.

Fail:

- Voice toggle does nothing.
- Old transcript text stays active after stop.
- Pause leaves voice listening in the background.

## Debug QA

1. Open debug from the tray.
2. In `Voice Capabilities`, click `Probe`.
3. Record:
   - microphone permission
   - media devices support
   - `getUserMedia` support
   - speech recognition API value
   - detected microphone list
4. Click `Request mic`.
5. Confirm permission and microphone list update.
6. In `Voice Runtime`, click `Start listening`.
7. Speak a short command, for example:

```text
show me what to click next
```

8. Watch `Transcript`, `Command`, `Status`, and `Error`.
9. Click `Stop`.

Pass:

- If speech recognition is supported, final text appears in `Transcript` and `Command`.
- If speech recognition is unsupported, `Error` explains that clearly.
- Stop clears active listening and prevents stale command routing.

Fail:

- The UI claims to listen but no status/error ever changes.
- Speech recognition fails silently.
- Stop does not reset runtime state.

## Overlay QA

1. Start voice from settings or debug.
2. Confirm a small voice status cue appears near the cursor.
3. Speak a command.
4. Confirm the cue changes through a sensible state:
   - requesting/listening
   - processing
   - command ready or error
5. Confirm the overlay remains click-through.

Pass:

- Voice status is visible without adding a permanent panel.
- The overlay remains cursor-first.
- The desktop stays clickable.

Fail:

- Voice creates a large panel in the overlay.
- The cue blocks clicks.
- The cue stays visible forever after stop.

## Guidance Routing QA

1. Use a safe fixture in debug.
2. Start voice.
3. Speak a final command.
4. Confirm a new guidance request is created with the spoken text as the goal.
5. Confirm the mock target/ring appears if the request validates.

Pass:

- Voice text becomes the guidance goal.
- The guidance loop runs after final voice text.
- Invalid guidance still fails through the normal validation path.

Fail:

- Voice text appears but does not trigger guidance.
- Guidance still uses the generic fallback goal after a voice command.

## Known Limits

- Windows WebView may not expose `SpeechRecognition` or `webkitSpeechRecognition`.
- If the API is unavailable, Phase 10 should record that as an unsupported platform result, not as a UI failure.
- This pass does not evaluate speech accuracy, wake words, hotkeys, model routing, or production-grade transcription.
- A later step may need a local/remote transcription fallback if WebView speech recognition is unavailable on the target machine.

## Acceptance

Phase 10 voice runtime QA passes when:

- settings can start/stop voice
- debug can probe microphone and speech support
- supported speech recognition creates transcript/command state
- unsupported speech recognition produces a clear error
- final command text routes into the guidance loop
- stop/pause clears active voice state
- overlay remains invisible/cursor-first

## Step 10.10 Manual QA Result

Status: failed as product acceptance, useful as diagnostic proof.

Observed:

- Speech recognition captured the command text.
- Transcript and command state reached debug.
- The mock guidance target appeared after the command.
- Voice capability probing reported `SpeechRecognition` and microphone availability.
- The overlay/puck still followed cursor behavior.

Failures:

1. A blue platform/browser strip appeared while voice mode was active.
2. Voice behaved like a settings toggle instead of push-to-talk.
3. Normal settings exposed Camera and Gestures as implementation toggles.
4. The mock target was not useful enough as a user-facing proof of guidance.
5. Debug was too crowded to read quickly.
6. Debug used too many large boxed controls.

Conclusion:

- The current Web Speech path proves a possible transcript-to-guidance pipeline.
- It should be kept for debug fallback only.
- The product path should move to native microphone capture plus cloud transcription.

## Replacement Step 10.10 Plan

1. Keep the current Web Speech support behind debug-only controls.
2. Replace the normal settings voice toggle with push-to-talk behavior.
3. Hide Camera and Gestures toggles from normal settings.
4. Add native Rust microphone capture commands.
5. Add cloud transcription adapter behind the native audio path.
6. Route cloud transcripts into the existing guidance loop.
7. Add voice command handling for camera/gesture activation.
8. Add debug `Test guidance` action for mock target checks.
9. Convert debug to tabs:
   - Runtime
   - Voice
   - Gesture
   - Capture
   - Guidance
10. Remove oversized boxed button treatment where dense controls are enough.
11. Re-run manual QA and fail if any platform/app strip appears during voice.
