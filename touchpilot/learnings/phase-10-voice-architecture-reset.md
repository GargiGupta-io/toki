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

## Phase 10.5: Real Guidance Provider Backend Smoke

Phase 10.5 is the bridge between voice and safety.

Plain English: voice can now tell Toki what the user wants, but Toki still needs a real screen-understanding service to decide what should be clicked. Phase 10.5 gives that service a small backend/proxy path without putting paid provider keys inside the desktop app.

The phase exists because a voice transcript alone is not useful enough. The app needs to send:

- the spoken goal
- screenshot metadata
- screenshot payload
- display/calibration information
- previous step context when available

and receive:

- a structured `GuidanceResult`
- one target box
- confidence
- risk class
- confirmation requirement
- a short instruction

### Phase 10.5 Steps

1. Define the provider backend contract.
2. Add a small dev backend/proxy.
3. Keep provider keys out of the desktop app.
4. Connect Debug `Real smoke` to the backend endpoint.
5. Add server-side provider mode config such as `local-retired-local-vision-runtime` or `unavailable`.
6. Add a local vision provider adapter behind the smoke endpoint.
7. Parse provider output into strict `GuidanceResult` JSON and reject invalid coordinates.
8. Run one known-screen provider test.
9. Record provider errors, quota behavior, target misses, and target accuracy.
10. Close Phase 10.5 only if one real target works, or explicitly escalate OCR/accessibility before Phase 11.

### Tradeoffs

| Choice | Why |
| --- | --- |
| Backend/proxy | Protects paid provider keys and gives us rate-limit/billing control |
| Dev endpoint first | Lets us test target accuracy before building production auth |
| Structured JSON only | Keeps provider output compatible with the existing validator |
| One controlled smoke test | Avoids pretending the model is broadly accurate too early |
| Keep mock mode | Still useful for UI regression checks, but not product proof |

Done when Toki can run one real provider request from a screenshot plus goal, validate the returned target, and clearly show useful/wrong in Debug.

Current status:

- `GuidanceProviderRequest` is the existing `GuidanceRequest`.
- `GuidanceProviderResponse` carries `real`, `mock`, or `unavailable` provider mode.
- The dev endpoint contract is `POST /api/guidance/smoke`.
- The AI adapter preserves explicit `unavailable` responses instead of hiding provider errors.
- The local dev server skeleton runs with `npm run guidance:smoke:dev`.
- The skeleton validates the request and returns `unavailable` until a real provider is wired.
- The desktop smoke run script is `npm run desktop:dev:guidance-smoke`.
- `VITE_TOKI_GUIDANCE_ENDPOINT` is the explicit local endpoint bridge between desktop and backend.
- The local smoke bridge has been manually verified.
- The smoke server now supports `TOKI_GUIDANCE_PROVIDER=unavailable|local-retired-local-vision-runtime`.
- `unavailable` remains the safe default.
- `local-retired-local-vision-runtime` now calls the configured retired local vision runtime `/api/generate` endpoint.
- The local adapter sends the screenshot payload in `images`, includes the goal/display/calibration context in the prompt, and requests JSON output.
- The smoke server now validates real provider output before returning it to the desktop.
- Invalid JSON, missing guidance fields, bad confidence/risk/confirmation, and off-screen target boxes return `unavailable` instead of drawing a target.
- `npm run guidance:known-screen` now posts a known screenshot + goal to the smoke endpoint for repeatable manual target checks.
- Accuracy notes now distinguish pipeline readiness from product proof.
- Target accuracy remains open: the local provider is reachable outside the Codex sandbox, but the first known-screen run returned `unavailable` because the model output failed strict `GuidanceResult` validation.
- If a reachable screenshot-only provider returns a wrong target, OCR/accessibility should move before Phase 11 instead of treating safety as the next blocker.
- Phase 10.5 is closed as provider-pipeline-ready, not target-accuracy-proven.
- Phase 10.6 is inserted before Phase 11 to solve real target accuracy and screen intelligence.
- Phase 10.6 Step 1 added a provider readiness check.
- Phase 10.6 Step 2 installed/started retired local vision runtime from the official macOS app path, pulled `llava:latest`, and confirmed readiness with `npm run guidance:provider:check`.
- Phase 10.6 Step 3 ran the known-screen path against `/tmp/toki-known-screen.png` with the goal `Click the message input box at the bottom.` The request reached `local-retired-local-vision-runtime`, but the response was rejected as an invalid `GuidanceResult`, so the verdict is `unavailable`; the next target-accuracy step is raw provider-output capture and prompt/parser repair.
- Phase 10.6 Step 4 added raw provider-output capture and stricter coordinate validation. The retest showed `llava:latest` returning normalized `0..1` target coordinates (`0.389,0.781 0.520x0.412`) even after the prompt asked for CSS pixels. Toki now rejects those as invalid instead of drawing a misleading target; the next useful direction is OCR/accessibility candidate evidence or a better local vision strategy.
- Phase 10.6 Step 5 added candidate-assisted guidance. The known-screen runner can send trusted UI candidates, the provider prompt asks the model to choose one, and Toki anchors matching provider output to the candidate box before validation. The first candidate-assisted run returned a real target for `Message input box at 20,790 1430x60`, proving the candidate-selection path works. It does not yet prove automatic OCR/accessibility candidate generation.
- Phase 10.6 Step 6 added automatic macOS Accessibility candidate extraction for known-screen tests. This gives the provider labels, roles, and boxes from the accessibility tree when permission is available, while still allowing manual candidates and safe no-candidate fallback.
- Phase 10.6 Step 7 added a live app-targeted candidate probe. It can list visible apps, target a named app, and print resolved app/window/visited-element metadata. The live `Microsoft Edge` probe resolved the correct app but macOS blocked `osascript` with `assistive access` denied, so the next task is a permission rerun rather than more provider prompt work.
- Phase 10.6 Step 8 verified the permission rerun and fixed multi-process browser selection. Terminal candidate extraction works, and Edge now resolves to the real window process, but Edge still returns zero candidates because `osascript` cannot read child elements from the browser window. The next target-accuracy move should be OCR or a native AX bridge, not more blind model prompting.
- Phase 10.6 Step 9 added macOS Vision OCR candidates. This gives browser-like screens a second structured evidence source when Accessibility cannot traverse child elements. The live OCR probe returned 14 text candidates from `/tmp/toki-known-screen.png`; the next target-accuracy check is whether the provider can use those OCR candidates to return a useful target.
- Phase 10.6 Step 10 ran the OCR-backed known-screen provider test. Local retired local vision runtime selected the OCR candidate `> Find and fix a bug in @filename at 9,809 235x17` with `real` mode and `0.9` confidence. This is the first useful target produced from automatically extracted candidates, so the next work is bringing candidates into live desktop guidance.
- Phase 10.6 Step 11 wired screen candidates into the live desktop guidance request. The desktop app now has a `collect_screen_candidates` Tauri command, passes the latest screenshot payload through macOS Vision OCR, attaches candidate boxes to `GuidanceRequest.screen`, and shows candidate count/source/error in Debug. The tradeoff is that live OCR currently shells through `/usr/bin/swift`, which is acceptable for smoke testing but should become a native bridge or persistent worker if latency becomes visible.
- Phase 10.6 Step 12 added a live desktop real-guidance smoke path. The app can now launch with `TOKI_AUTO_REAL_SMOKE=true`, capture the live desktop, collect macOS Vision OCR candidates, downscale the screenshot payload for the provider, and automatically send a real guidance request to the local smoke endpoint. The first fresh live run reached `local-retired-local-vision-runtime` with 20 OCR candidates and returned `mode=real`, `target=USER`, and `error=none`. This proves the live desktop pipeline is connected end-to-end, but it does not yet prove target accuracy: for the goal `Click the message input box at the bottom.`, `USER` is not a clearly correct target. The next useful work is candidate ranking, stronger prompt constraints, OCR grouping, or accessibility/DOM evidence before Phase 11 safety.
- Phase 10.6 Step 13 is native cursor tracking. The Clicky reference uses native macOS cursor data, not WebView cursor events, and Toki's current passive overlay shows the same need: Tauri/WebView `cursorPosition()` can leave the puck far from the real pointer on macOS. The selected approach is a shared native cursor-position command with a macOS implementation first, a Tauri cursor fallback for unsupported platforms, and later Windows/Linux native adapters. This keeps the product-feel fix inside Phase 10 because voice/guidance depends on the cursor-first overlay feeling correct before Phase 11 safety.
- Phase 10.6 Step 13 implementation added `native_cursor_position` in Rust. On macOS it calls CoreGraphics directly with `CGEventCreate` and `CGEventGetLocation`, returns a normalized Tauri command payload, and lets the frontend prefer native cursor polling before falling back to Tauri's WebView cursor API. This keeps the API cross-platform while fixing the primary Mac product-feel path first.

## Phase 10.7: Browser And Provider Accuracy Upgrade

Phase 10.7 exists because the provider pipeline now works, but browser target accuracy is still weak.

Plain English: Toki can hear the user, look at the screen, gather text candidates, and ask a model what to click. The weak part is that the current local provider can still pick a bad browser target. Phase 10.7 improves the development provider options and the browser candidate strategy before safety policy work.

The chosen development-only provider option is `freellmapi-dev`. FreeLLMAPI can help compare stronger free/limited vision models during development, but it is not the production provider plan. The production plan still needs a backend/proxy with paid keys, rate limits, billing, and abuse controls.

Phase 10.7 steps:

1. Add `freellmapi-dev` provider mode.
2. Run known-screen tests through FreeLLMAPI vision models.
3. Compare accuracy against local retired local vision runtime.
4. Add browser candidate strategy notes:
   - short term: OCR plus layout heuristics
   - mid term: native macOS AX bridge
   - long term: browser extension companion
5. Add candidate ranking before provider calls.
6. Run browser known-screen tests on Edge/Chrome.
7. Record which path is reliable enough before Phase 11.

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
- 2026-06-26 - Added Phase 10.5 as the provider backend smoke bridge before Phase 11 Safety.
- 2026-06-26 - Added the Phase 10.5 provider contract: request shape, response envelope, dev endpoint path, and unavailable-mode handling.
- 2026-06-26 - Added the Phase 10.5 dev backend skeleton for `/api/guidance/smoke`; it validates requests and honestly returns unavailable until provider wiring exists.
- 2026-06-26 - Added the Phase 10.5 provider configuration flow: typed desktop endpoint env var and a helper script for running the app against the local smoke server.
- 2026-06-26 - Completed the first local provider smoke run: the desktop Debug `Real smoke` action reached `dev-smoke-server`, displayed `unavailable`, kept target/box/coordinates empty, and avoided rendering a fake mock target as a real provider result. The debug panel was also made scrollable and the smoke action was promoted near `Sync` because the original tab-only placement was too easy to miss.
- 2026-06-27 - Reframed the remaining Phase 10.5 work around real target accuracy before Phase 11: add provider mode config, wire a local vision provider behind the smoke endpoint, validate strict `GuidanceResult` JSON, run one known-screen target test, and then either close Phase 10.5 or escalate OCR/accessibility first.
- 2026-06-27 - Added server-side provider mode config for Phase 10.5: `unavailable` stays the default, `local-retired-local-vision-runtime` is recognized with endpoint/model config, and unsupported provider modes fail safely instead of producing a target.
- 2026-06-27 - Wired the local retired local vision runtime adapter behind `/api/guidance/smoke`: it sends the screenshot payload and user goal to `/api/generate`, asks for JSON, preserves provider errors as `unavailable`, and returns parsed provider JSON for the next strict validation step.
- 2026-06-27 - Added strict server-side response validation for real provider output: malformed JSON, incomplete `GuidanceResult` objects, invalid risk/confirmation states, and target boxes outside display bounds are rejected as `unavailable`, so the desktop cannot accidentally render bad model output as a real target.
- 2026-06-27 - Added the known-screen guidance smoke runner. It builds a real `GuidanceRequest` from a PNG/JPEG screenshot and goal, posts it to the smoke endpoint, and prints the returned provider target for a manual useful/wrong verdict. The current machine did not expose a reachable local retired local vision runtime endpoint, so the runner is ready but the accuracy verdict remains pending.
- 2026-06-27 - Added the Phase 10.5 accuracy notes: the provider pipeline is ready, but target accuracy is not proven until a reachable provider returns one useful known-screen target. If the first reachable provider returns valid but wrong targets, the better next move is OCR/accessibility evidence before Phase 11 safety.
- 2026-06-27 - Closed Phase 10.5 as a provider-pipeline milestone and inserted Phase 10.6 before safety. The decision is conservative: do not build safety policy on top of unproven target selection. First prove a useful known-screen target, or add OCR/accessibility candidate evidence if raw screenshot targeting is not enough.
- 2026-06-27 - Started Phase 10.6 with provider readiness instead of a fake target test. The new `guidance:provider:check` script checks local retired local vision runtime availability and model readiness. It confirmed this environment has no reachable local provider yet, so the next real work is local vision-provider setup before any useful/wrong target verdict can be trusted.
- 2026-06-27 - Completed Phase 10.6 Step 2 local provider setup. retired local vision runtime was installed/started from the official macOS app path, `llava:latest` was pulled, and `npm run guidance:provider:check` reported `[READY] local retired local vision runtime provider is reachable`. The Codex sandbox can still block local network checks, so provider readiness should be verified outside the sandbox when needed. The next accuracy gate is the known-screen runner.
- 2026-06-27 - Completed Phase 10.6 Step 3 known-screen run. The local smoke server reached `local-retired-local-vision-runtime`, but the model output failed strict `GuidanceResult` validation and returned `unavailable`. This means the next blocker is not coordinate accuracy yet; first we need raw provider-output capture plus prompt/parser repair.
- 2026-06-27 - Completed Phase 10.6 Step 4 provider-output repair. Invalid responses now carry capped raw model text, the known-screen runner prints validation issues, and normalized target boxes are rejected. The retest proved the parser is now honest: `llava:latest` returned normalized coordinates for the message input, so Toki refused to mark it as a real target. The next accuracy move should be structured screen evidence, not more blind screenshot prompting.
- 2026-06-27 - Completed Phase 10.6 Step 5 candidate-assisted targeting. The provider can now choose from supplied UI candidates, and Toki uses the trusted candidate box instead of trusting model-invented coordinates. The known-screen smoke passed with one manual candidate, which makes the best next step automatic OCR/accessibility candidate extraction.
- 2026-06-27 - Completed Phase 10.6 Step 6 automatic candidate extraction for known-screen runs. The new macOS Accessibility collector inspects the target app's accessibility tree through `osascript`, normalizes labeled elements into candidate boxes, and lets the known-screen runner attach those candidates without manual JSON. The real collector probe ran without script errors but returned zero candidates for the current frontmost context, so the important caveat is permission, app targeting, and coverage: accessibility is stronger than blind pixels, but some apps expose poor labels or hidden bounds, so OCR may still be needed.
- 2026-06-27 - Completed Phase 10.6 Step 7 app-targeted accessibility probing. `npm run qa:mac:candidates -- --list` shows visible apps, and `npm run qa:mac:candidates -- --app "Microsoft Edge"` targets a specific app instead of whatever terminal is frontmost. The live probe now reports the real blocker clearly: macOS denies assistive access to `osascript`, so automatic candidates cannot be accepted until Accessibility permission is granted and the probe is rerun.
- 2026-06-27 - Completed Phase 10.6 Step 8 permission rerun. Accessibility permission is now available for the probe, and the collector was fixed to choose the matching browser process with real windows instead of a zero-window helper process. The Edge probe now reaches `Windows: 1`, but child traversal fails with `Can't get object`, so browser target accuracy needs OCR or a lower-level native macOS AX bridge.
- 2026-06-27 - Completed Phase 10.6 Step 9 OCR candidate extraction. The new macOS Vision OCR probe uses Apple Vision through a small Swift runner, converts normalized OCR boxes into CSS/display coordinates, and feeds those candidates into the known-screen candidate fallback path. The live probe returned 14 OCR text candidates, which gives the provider real visible text evidence even when browser Accessibility is incomplete.
- 2026-06-27 - Completed Phase 10.6 Step 10 OCR-backed provider verdict. The known-screen runner used `macos-vision-ocr` candidates, local retired local vision runtime returned `real` guidance, and the target matched the intended visible text. The important caveat is that this proves text-visible target selection, not icon-only UI or rich semantic understanding.
- 2026-06-27 - Completed Phase 10.6 Step 11 live desktop candidate wiring. `GuidanceScreenContext` now supports screen candidates, the app collects macOS Vision OCR candidates from the current screenshot only for real-provider requests, and Debug reports the candidate source/count/error. This moves OCR evidence from CLI-only known-screen tests into the real app path while keeping mock guidance fast.
- 2026-06-27 - Completed Phase 10.6 Step 12 live desktop real-guidance smoke. The QA-only auto-smoke path can trigger a real provider request after launch, logs capture/candidate stages from Rust, caps live OCR candidates, and downscales provider screenshots to keep local retired local vision runtime responsive. The simplified provider prompt now asks the model to select a candidate ID, and the server converts that into a strict `GuidanceResult`. The live test returned `mode=real` with target `USER`, so the plumbing works; target usefulness is still weak and should be solved before treating safety as the next main blocker.
- 2026-06-27 - Added Phase 10.6 Step 13 for native cursor tracking. The tradeoff is to add small platform-specific cursor code now instead of continuing CSS/WebView coordinate guesses. macOS comes first because it is the primary product-feel platform; Windows/Linux stay supported through the same command shape and fallback path until their native adapters are added.
- 2026-06-27 - Implemented Phase 10.6 Step 13 native cursor tracking. Rust now exposes `native_cursor_position`, macOS uses CoreGraphics for cursor location, and the overlay frontend calls that command before falling back to Tauri `cursorPosition()`. `cargo check --workspace` and `npm --workspace @toki/desktop run typecheck` passed. Visual edge testing is still required after relaunch because cursor feel is product QA, not just compiler QA.
- 2026-07-01 - Added Phase 10.7 as the browser/provider accuracy upgrade before Phase 11. FreeLLMAPI is accepted as a development-only provider aggregator, while production provider access remains a backend/proxy problem.
- 2026-07-01 - Completed Phase 10.7 Step 1. The smoke server now supports `TOKI_GUIDANCE_PROVIDER=freellmapi-dev`, sends screenshot plus goal to an OpenAI-compatible `/v1/chat/completions` endpoint, and runs the response through the same strict `GuidanceResult` validation as local retired local vision runtime. The key tradeoff is that FreeLLMAPI is useful for dev comparison, but it must not become the production provider plan.
- 2026-07-01 - Attempted Phase 10.7 Step 2. The FreeLLMAPI default was corrected to `http://127.0.0.1:3001/v1/chat/completions`, optional `TOKI_FREELLMAPI_API_KEY` bearer auth was added, and the known-screen runner reached the Toki smoke server. The actual FreeLLMAPI backend was not running locally, so the provider returned `unavailable` and no accuracy verdict was possible yet.
- 2026-07-01 - Completed FreeLLMAPI local setup for Phase 10.7 Step 2. FreeLLMAPI is installed in `/Users/pumba/tools/freellmapi`, starts with `npm run dev`, and responds on port `3001` with the generated local key. The known-screen request now reaches FreeLLMAPI, but it returns `429 Too Many Requests` because no vision-capable upstream provider key is enabled. This means the blocker is no longer Toki integration; it is FreeLLMAPI provider configuration.
- 2026-07-01 - Completed the first FreeLLMAPI real known-screen run after adding a Google/Gemini key. `gemini-2.5-flash` returned `mode=real` through `freellmapi-dev` with target `next at 50,390 50x20`. This proves FreeLLMAPI can now act as a reachable dev provider; it does not yet prove browser target accuracy because OCR/accessibility candidates were disabled for the reachability test.
- 2026-07-01 - Completed Phase 10.7 Step 3 provider comparison. On the same known-screen image and goal, FreeLLMAPI/Gemini returned a validated real target, while local retired local vision runtime/llava returned normalized `0..1` coordinates around `Hello World` and was rejected by strict validation. The current best provider choice for raw screenshot dev testing is FreeLLMAPI/Gemini; local retired local vision runtime should be kept as offline fallback or candidate-ID selector.
- 2026-07-01 - Completed Phase 10.7 Step 4 browser candidate strategy. The decision is to stop relying on raw screenshot coordinate guessing: short term use OCR plus layout heuristics, mid term build a native macOS AX bridge, and long term add a browser extension companion for exact DOM targets. Phase 11 safety should wait for ranked browser candidates because safety decisions depend on knowing what the target actually is.
- 2026-07-01 - Completed Phase 10.7 Step 5 candidate ranking. Known-screen and live desktop provider calls now rank candidates before sending them to the model, using goal text, clickable roles, OCR visibility, button-like boxes, duplicate penalties, large-region penalties, and risky-label flags. This does not solve browser understanding by itself, but it reduces noisy candidate lists before FreeLLMAPI/Gemini or retired local vision runtime chooses a target.
- 2026-07-01 - Completed Phase 10.7 Step 6 browser known-screen testing. The provider path can run with ranked candidates, but browser candidate extraction is still not reliable enough: Accessibility returned coarse window-level targets, active browser process names did not match the Edge/Chrome assumption in this session, Firefox app-targeting failed through AppleScript, and macOS Vision OCR returned `nilError` on the current known-screen PNG even after a safer image loader patch. The important learning is that target accuracy is now blocked more by browser candidate extraction than by the model provider. Best next alternatives are a native macOS AX bridge or a browser extension companion for exact DOM candidates.
- 2026-07-01 - Completed Phase 10.7 Step 7 reliability decision. The current path is not reliable enough for real browser guidance: FreeLLMAPI/Gemini is the strongest development provider, strict validation is working, and candidate ranking is the correct provider shape, but the browser candidate source is still weak. The best next phase is Browser Candidate Extraction, starting with a browser extension companion for exact DOM targets. Native macOS AX and OCR should remain fallback sources, not the primary browser strategy. Phase 11 safety should wait unless it is limited to policy scaffolding only.
- 2026-07-01 - Started Phase 10.8 Browser Candidate Extraction. Step 1 added a development-only Manifest V3 browser extension scaffold that collects visible DOM candidates from the active page and reports labels, roles, bounds, URL, title, and viewport context. This is intentionally separate from the desktop app for now: first prove the browser can expose useful candidates, then bridge them into Toki's provider request path.
- 2026-07-01 - Completed Phase 10.8 Step 2 fixture verification setup. The browser extension now has a controlled candidate fixture page and manual acceptance list before testing real dashboards. This keeps QA honest: if the extension cannot extract obvious buttons, links, inputs, selects, and textareas from the fixture, it should not be trusted on complex SaaS screens.
- 2026-07-02 - Completed Phase 10.8 Step 3 local bridge shape. The browser extension now exports a stable `schemaVersion: 1` payload by copy/download, including page context, viewport, and DOM candidates compatible with Toki's `ScreenCandidate` model. This is a deliberately low-risk bridge before adding a live desktop connection: prove the candidate payload first, then wire ingestion.
- 2026-07-02 - Completed Phase 10.8 Step 4 known-screen browser payload ingestion. The known-screen runner now accepts `TOKI_BROWSER_CANDIDATE_PAYLOAD`, normalizes extension candidates into Toki's screen candidate shape, and ranks them before provider calls. This gives browser DOM candidates priority over manual, macOS Accessibility, and OCR sources for controlled provider testing.
- 2026-07-02 - Completed Phase 10.8 Step 5 real provider test with extension DOM candidates. `freellmapi-dev` selected the fixture browser candidate `Create project` and returned a validated real target at `100,100 120x40`. This is the first clean proof that exact DOM candidates solve the model's coordinate guessing problem in the provider path. The remaining gap is live ingestion from the actual extension/desktop app and real SaaS-page candidate quality.
- 2026-07-02 - Completed Phase 10.8 Step 6 local live bridge. The guidance smoke server now accepts browser candidate payloads at `/api/browser-candidates/latest`, and the extension popup has a `Send to Toki` action. This is still a dev bridge, not production IPC, but it removes the manual JSON download loop and lets the extension push exact DOM candidates into Toki's local provider environment.
- 2026-07-02 - Completed Phase 10.8 Step 7 automatic bridge consumption. The known-screen runner now tries the live browser-candidate bridge when no file payload is supplied, while preserving file payload priority and an opt-out env var. This makes the intended dev loop practical: extension sends candidates, known-screen test consumes the latest candidates, provider chooses from DOM evidence. Manual live testing hit a stale smoke server that did not yet expose `/api/browser-candidates/latest`, so restart the server before accepting the live bridge manually.
- 2026-07-02 - Completed Phase 10.8 Step 8 live bridge provider test. After restarting the smoke server with the local FreeLLMAPI unified key, the bridge accepted the browser candidate fixture and the known-screen runner consumed it automatically without a payload file path. FreeLLMAPI returned `real` guidance for `Create project at 100,100 120x40`. This proves the local bridge path works; the remaining gap is testing a real page through the actual extension popup.
- 2026-07-02 - Completed Phase 10.8 Step 9 real browser extension QA path. The browser extension manifest intentionally injects content scripts only on `http` and `https` pages, so the old instruction to open the fixture directly as a local file was a manual-test trap. A tiny localhost fixture server now serves the controlled page at `http://127.0.0.1:8788/fixtures/candidate-page.html`, the extension check validates that server script, and the README documents the real loop: collect candidates from a normal browser page, send them to Toki's bridge, then run known-screen guidance without a payload file. The important tradeoff is that we avoid special browser file-access permissions and test the extension in the same page class it will use on real dashboards.
- 2026-07-02 - Completed Phase 10.8 Step 10 bridge payload QA. A new `qa:browser:candidates` command reads the latest browser-extension payload from the local bridge and checks whether it is a real `http`/`https` page with usable DOM candidates. It intentionally fails when the latest payload is still the controlled fixture unless `-- --allow-fixture` is passed. This creates a quick manual gate before running provider accuracy tests: first prove the browser extension actually sent page-specific candidates, then ask the provider to choose a target.
- 2026-07-03 - Added the first global push-to-talk pass. Toki now registers a native `Option + Space` shortcut through Tauri's global shortcut plugin and emits the same overlay voice commands used by the settings popup. Press starts native voice capture with source `hotkey`; release submits capture for transcription. The important design rule is that settings push-to-talk remains a fallback/debug path, while the product path no longer depends on the settings popup being open or focused. The tradeoff is that `Option + Space` can conflict with a user's system shortcuts, so the shortcut should become configurable before public release.
- 2026-07-04 - Added the first GuidanceSession memory layer. Shared types now define the session id, original goal, current step index, previous targets, completed targets, failed targets, last screenshot, and status. The desktop app creates/continues a session for real provider guidance, sends compact session context with the next guidance request, records returned targets, and shows session state in Debug. This is not the full click-recognition loop yet; it is the memory foundation that Phase C can use for recapture, verification, and next-step generation.
- 2026-07-04 - Added the first manual GuidanceSession step loop. Sessions now have a `lastVerification` field, Debug has a `Continue` action, and the overlay can recapture the screen after the user clicks a shown target. The loop conservatively compares the previous session screenshot signature to the new capture; if the screen appears unchanged, Toki blocks instead of asking for another target. If the screen changed, Toki runs another real guidance request using the same original goal and session context. This is still a manual/debug continuation button, not automatic click detection yet.
- 2026-07-08 - Updated live retired local vision runtime vision targeting after the first successful Spotify guidance run. The important bug class changed from "can Toki capture and see the screen?" to "can Toki trust the target box the model returned?" The desktop retired local vision runtime adapter now rejects placeholder labels such as `button label or visual description`, prompts the model to return tight boxes around the actual clickable icon center, gives command-specific generic guidance for add/invite/play/next controls, and normalizes rough icon targets into a small click-center box before rendering. This keeps the overlay honest: if the model copies an example or points at chrome/menu controls, Toki should refuse instead of drawing a believable but fake target. It does not fully solve semantic accuracy; stronger provider/candidate evidence and calibration debug remain the next target-quality work.
