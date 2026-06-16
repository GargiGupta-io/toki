# Phase 10 Voice Runtime QA

## Purpose

This checklist verifies the first voice MVP path:

- settings/debug can start and stop voice mode
- microphone capability probing reports the real platform state
- browser speech recognition either captures text or fails honestly
- final recognized text routes into the guidance loop
- voice can be interrupted without stale transcript state

Phase 10 does not require production-quality voice yet. The pass bar is that the app clearly proves what this Windows WebView can and cannot support.

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
