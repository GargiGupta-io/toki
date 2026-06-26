# Phase 10 Voice Architecture Reset

> Phase 10 learned that browser speech recognition is useful for experiments, but the real Toki product needs native microphone capture, push-to-talk, and a quieter debug surface.

---

## In Plain English

Voice is supposed to make Toki feel like a small assistant living near the cursor, not like a web app asking the user to turn on a pile of settings. The first Web Speech pass proved that spoken words can become a command, but it also showed the wrong product feel: a blue platform strip appeared during voice, settings had too many implementation toggles, and debug became hard to read.

The better direction is push-to-talk. The user holds a control, says what they want, releases, and Toki turns that into guidance. Camera and gesture setup should not look like normal user settings. Those are capabilities the assistant can request or debug tools we use internally.

The most important lesson is that a working demo path is not always the right product path. Web Speech worked enough to capture text, but it leaked browser-like behavior. Toki needs tighter control over the microphone and listening state, so the voice engine should move down into native Rust capture and then use a transcription provider adapter.

## What Changed In The Plan

The old Phase 10 direction was:

```text
settings/debug voice toggle
  -> Web Speech recognition
  -> transcript
  -> guidance loop
```

That was fast, but not good enough for the product.

The corrected direction is:

```text
push-to-talk
  -> native Rust microphone capture
  -> transcription provider
  -> transcript
  -> guidance loop
```

Web Speech stays useful, but only as a debug fallback.

## Manual QA Findings

The manual pass showed several concrete failures.

1. **Blue bar during voice**
   In plain English: Toki looked like it had become a visible app again right when voice activated.
   Technical reading: the Web Speech/WebView path likely exposed browser or platform UI while the microphone path was active.

2. **Voice toggle felt wrong**
   In plain English: turning voice on like a setting makes the user wonder whether the app is always listening.
   Better model: hold-to-talk, release-to-submit.

3. **Camera toggle in settings was confusing**
   In plain English: users should not need to think about camera internals just to ask the assistant for help.
   Better model: camera controls are debug/advanced, and voice can request gesture mode when needed.

4. **Mock target was not convincing**
   In plain English: a hardcoded target proves plumbing but does not prove useful guidance.
   Better model: keep a debug `Test guidance` action for mock targets, and do not treat it as product acceptance.

5. **Debug was too crowded**
   In plain English: the debug panel had too many boxes and readouts competing at once.
   Better model: tabs for Runtime, Voice, Gesture, Capture, and Guidance.

## Tradeoffs

### Web Speech API

Plain English: This is the quick browser-provided microphone-to-text feature.

Pros:

- fastest to implement
- no backend required
- good for experiments
- already proved transcript-to-guidance can work

Cons:

- WebView support is inconsistent
- browser/platform UI can appear
- less control over recording lifecycle
- not reliable enough as the default product voice engine

Decision:

- keep as debug fallback
- remove from normal product path

### Native Rust Microphone Capture

Plain English: Toki records audio itself through the desktop layer instead of asking the browser to do speech recognition.

Pros:

- better control over push-to-talk
- avoids Web Speech browser chrome
- clearer permission and cancellation lifecycle
- fits a desktop assistant better

Cons:

- more Rust/Tauri work
- audio encoding/streaming must be designed
- permission errors need careful handling

Decision:

- use this as the main Phase 10 voice capture path

### Cloud Transcription

Plain English: Toki sends recorded audio to a speech model and gets text back.

Pros:

- better accuracy than local lightweight experiments
- faster to reach useful behavior
- works across machine types

Cons:

- needs provider/API integration
- privacy and key storage matter
- network latency can affect feel

Decision:

- support cloud transcription behind a provider adapter
- keep production paid provider keys behind a backend/proxy

### Local Transcription

Plain English: Toki runs speech-to-text on the laptop without sending audio out.

Pros:

- private
- offline
- no per-request provider cost

Cons:

- heavier install
- more CPU/battery use
- more platform-specific tuning

Decision:

- keep local transcription as a valid provider option
- use the same `VoiceTranscript` contract regardless of local or cloud transcription

### Push-To-Talk

Plain English: the user holds a button to speak, then releases to send.

Pros:

- clear user intent
- privacy-friendly
- easy to cancel
- avoids always-listening confusion

Cons:

- requires one extra action
- needs a good input affordance

Decision:

- make this the default Phase 10 interaction

### Always-On Voice

Plain English: the assistant listens continuously.

Pros:

- feels magical when perfect

Cons:

- privacy concerns
- false activations
- battery/CPU cost
- harder to debug

Decision:

- not for this phase

## Corrected Step 10.10 Plan

1. Keep Web Speech debug-only.
2. Replace settings Voice toggle with push-to-talk behavior.
3. Hide normal settings Camera and Gesture toggles.
4. Add native Rust microphone capture commands.
5. Add transcription provider adapter.
6. Route final transcript text into the existing guidance loop.
7. Add voice command handling for camera/gesture activation.
8. Add debug-only `Test guidance` action.
9. Convert debug to tabs:
   - Runtime
   - Voice
   - Gesture
   - Capture
   - Guidance
10. Remove oversized boxed control treatment from debug where dense rows work better.
11. Re-run manual QA.

## Current General Status

Phase 10 now has the general voice architecture it was trying to reach:

- native microphone capture records push-to-talk audio
- the audio path produces a final transcript object
- transcript text routes into the existing guidance loop
- Web Speech is no longer the product path
- provider details stay behind an adapter boundary
- paid cloud provider keys must not ship inside public desktop builds

This doc intentionally does not track platform-specific setup, permission prompts, or local machine installation details. Those belong in the platform migration learning doc or in a future platform-specific doc if another platform is reopened.

## Acceptance Rules

Phase 10 should not pass unless:

- push-to-talk works
- no blue app/platform strip appears during voice
- normal settings do not show confusing camera internals
- debug is tabbed or otherwise readable
- transcript text can drive guidance
- stop/pause/release cancels cleanly
- Web Speech remains optional fallback, not the product engine

## How This Connects To Earlier Phases

Phase 8 made the overlay invisible and cursor-first. Phase 10 must preserve that. If voice activation makes the app look like a browser or normal window again, it violates the Phase 8 product contract.

Phase 9 added gesture foundations. Those can later start voice, but only after the voice path itself is reliable. Otherwise gesture bugs and voice bugs become impossible to separate.

Phase 11 safety will depend on voice commands becoming real task requests. That means Phase 10 needs clean command objects, clean cancellation, and clear transcript provenance.

## Updates

- 2026-06-16 - Created after Step 10.10 manual QA showed Web Speech should move to debug-only and native mic capture plus cloud transcription should become the product path.
- 2026-06-17 - Step 10.10D replaced the native voice placeholder with real CPAL microphone capture. The important implementation lesson was that `cpal::Stream` cannot live inside Tauri managed state because it is not `Send`; the working model is to keep the stream inside a dedicated recording thread and store only thread-safe controls in Tauri state. Push-to-talk now starts native capture, stop joins the worker, encodes the collected PCM as WAV, and returns base64 audio plus sample metadata to the frontend. Cloud transcription is still the next boundary.
- 2026-06-17 - Step 10.10E connected the native WAV payload to cloud transcription through a Rust-side Tauri command. The API key stays out of the webview by reading `OPENAI_API_KEY` in Rust, the command sends multipart audio to OpenAI's transcription endpoint, and `voiceTranscription.ts` converts successful responses into final `VoiceTranscript` objects that already route through the existing guidance loop. This keeps the product path native capture plus cloud transcript, while Web Speech remains debug-only.
- 2026-06-26 - Updated after the Toki rename and provider work: Phase 10 now describes a general transcription provider adapter instead of a cloud-only path, while platform-specific setup stays out of this doc.
