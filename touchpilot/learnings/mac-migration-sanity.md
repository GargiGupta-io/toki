# Mac Migration Sanity

> Toki moved from a Windows development machine to a Mac, so the first job was proving the project can build, launch, and stay clean on the new platform.

---

## In Plain English

Moving the project to a Mac is like moving a workshop to a new room. The tools are the same in theory, but the outlets, shelves, and lighting are different. Before building anything new, we had to check whether the tools actually worked in the new room.

The main result is good: the Mac can typecheck, build, compile Rust, and launch the Tauri desktop shell. The problems we found were migration problems, not product-code problems.

## Doc Consolidation Rule

This is the single learning doc for Mac-specific work.

Keep these topics here instead of creating separate Mac learning docs:

- Mac migration and checkout sanity
- macOS runtime shell behavior
- Mac screen capture and permission behavior
- Mac microphone and transcription QA
- Mac Clicky-style menu-bar/popup/overlay behavior
- Mac camera and gesture re-tests
- Mac-specific voice guidance findings

General Phase 10 voice architecture belongs in `phase-10-voice-architecture-reset.md`. That doc should stay platform-neutral. If a voice finding is about the Mac runtime, local Mac setup, permissions, or Mac QA, it belongs here instead.

## What Changed

Mac is now the primary product target for the next stretch.

That means:

- macOS gets daily manual QA.
- Windows stays supported but moves to CI/manual-later while no Windows machine is available.
- Linux stays build/best-effort until the main product loop is stable.

## What M0 Proved

The following checks passed on macOS:

- `npm --workspace @toki/shared run typecheck`
- `npm --workspace @toki/desktop run typecheck`
- `cargo check --workspace`
- `npm --workspace @toki/desktop run build`
- `tauri dev` launched the desktop shell

## Problems Found

### Missing Rust

Plain English: the Mac did not yet have the Rust toolchain available in the shell.

Fix:

- installed Rust with rustup
- sourced Cargo with `. "$HOME/.cargo/env"`

### Copied Node Binaries Were Not Executable

Plain English: `node_modules` came from the Windows environment and the Mac could see files like `tsc`, but it was not allowed to run them.

Fix:

- ran `npm install`
- repaired executable bits for package binaries

### Cargo Needed Network Access

Plain English: Cargo had to download crates for the Mac build the first time.

Fix:

- reran `cargo check --workspace` with network access

### Git Push Used A Windows Credential Helper

Plain English: Git on the Mac was still trying to call `C:\Program Files\GitHub CLI\gh.exe`, which only exists on Windows.

Fix:

- removed the broken Windows GitHub credential helper
- added the Mac `gh` credential helper

### Line Ending Churn

Plain English: many source files looked modified even though their code had not really changed. The content was mostly the same, but line endings had flipped between Windows and Mac styles.

Fix:

- added `.gitattributes`
- normalized source/docs as LF
- reserved CRLF for Windows script files

## Mac Runtime Finding

The Tauri desktop shell launches on macOS, but transparent windows print this warning:

```text
The window is set to be transparent but the `macos-private-api` is not enabled.
```

This is not an M0 blocker. It belongs to Phase M1 because M1 is specifically about the macOS runtime shell and transparent overlay behavior.

## Phase M1 Runtime Shell Update

Plain English: macOS did not only need the window to be marked transparent. Tauri also requires an explicit private-API opt-in before transparent windows behave without warnings on Mac.

The warning pointed to `app.macOSPrivateApi` in `tauri.conf.json`. Adding that config alone was not enough: the Rust build then failed because the Cargo feature list did not match the config allowlist.

The fix needed both sides:

- `touchpilot/apps/desktop/src-tauri/tauri.conf.json` sets `app.macOSPrivateApi` to `true`.
- `touchpilot/apps/desktop/src-tauri/Cargo.toml` enables the Tauri `macos-private-api` feature.

After both were set, `cargo check --workspace` passed and `tauri dev` launched without the old transparent-window warning.

The tradeoff is important: macOS private APIs can affect App Store eligibility. For TouchPilot, this is acceptable for the current direction because the product needs a Clicky-style transparent desktop overlay, and distribution can target direct download/beta builds before App Store packaging is considered.

## Phase M1 Settings Popup Update

Plain English: the settings popup should move like one small native utility surface, not like a React element pretending to be a window.

The previous settings drag path manually tracked pointer coordinates in the webview and called a custom Rust command to move the window. That path is brittle on macOS because a tiny transparent popup can lose pointer movement as soon as the cursor leaves its bounds.

The better Mac-shell approach is to use Tauri's native window drag primitive:

- the settings header calls `getCurrentWindow().startDragging()`
- the old `move_settings_window` command was removed
- the close command stays native through `hide_settings_window`

This keeps the popup closer to a real macOS utility panel while avoiding custom coordinate movement code.

## Phase M1 Overlay QA Update

Plain English: the Mac overlay cannot be accepted only because the code says it is transparent. It needs a repeatable local check plus a manual visual gate, because the real product requirement is how the desktop feels while the overlay is running.

The Mac overlay keeps the Windows Phase 8 Option 1 architecture: a monitor-sized borderless transparent popup instead of native fullscreen. That avoids the normal "fullscreen app window" path and better matches the Clicky-style product contract.

The new runtime QA path is:

- `npm run qa:mac:runtime` checks that TouchPilot is running.
- when macOS allows System Events access, it reports TouchPilot window names, positions, and sizes.
- `touchpilot/docs/macos-runtime-qa.md` defines the manual accept/fail checks for click-through, titlebar absence, puck following, and settings behavior.

The important limitation is honest: this environment can compile and launch the app, but it cannot fully prove click-through and visual feel without looking at the real Mac desktop. That manual check remains required before accepting M1 overlay behavior.

## Phase M1 Default Runtime Cleanup

Plain English: after moving to Mac, the default app should not talk like it is still running on Windows.

The app still had one user-facing Windows assumption in the debug camera permission message. If camera access was denied, it told the user to enable camera access in "Windows privacy settings." That is wrong on macOS and makes the product feel like a port rather than a native-feeling Mac utility.

The copy now says "system privacy settings," which works on macOS, Windows, and Linux.

The package scripts were also clarified:

- `desktop:release:mac` builds the macOS app bundle.
- `desktop:release:windows:exe` is the explicit Windows no-bundle executable path.
- the older `desktop:release:exe` alias remains so existing Windows workflow notes do not break immediately.

This does not remove Windows support. It removes Windows as the assumed default.

## Phase M2 Capture QA Update

Plain English: Mac screen capture works, but it must be tested from a process that macOS lets see the desktop.

The first capture probe run inside the restricted shell failed with:

```text
[FAIL] metadata - no display available for capture
```

That looked like a capture failure, but it was actually an environment boundary. Running the same probe outside the sandbox succeeded:

```text
[PASS] metadata - display=1 1470x956 scale=2
[PASS] screenshot - image=2940x1912 bytes=2145981 base64_chars=2861308
```

This proves the existing Rust capture crate can enumerate the Mac display and capture pixels. It also shows the Retina relationship clearly:

- logical display size: `1470x956`
- scale factor: `2`
- captured image size: `2940x1912`

That relationship matters for overlay coordinate mapping. The model/overlay may reason in logical coordinates while screenshots are pixel-dense Retina images.

The new command is:

```bash
npm run qa:mac:capture
```

If this fails from a normal terminal, the likely next issue is macOS Screen Recording permission.

## Phase M2 Screen Recording Permission Update

Plain English: when Mac capture fails, the app should tell the user exactly where to fix it instead of showing a raw technical error.

TouchPilot now formats permission-like capture failures with a macOS-specific hint:

```text
On macOS, grant Screen Recording permission to TouchPilot or the terminal app, then quit and relaunch it.
```

The relaunch part matters because macOS privacy permissions usually do not apply to already-running processes.

The app treats these messages as permission-related:

- `no display available`
- `permission`
- `denied`
- `not authorized`

This makes the capture failure path more useful without changing the underlying capture architecture.

## Phase M2 Capture Coordinate Update

Plain English: Retina screens report two related sizes. The app sees a logical desktop size for UI placement, while screenshots come back at physical pixel size.

The Mac capture probe currently reports:

```text
display metadata: 1470x956 scale=2
screenshot:       2940x1912
```

That is correct because:

```text
1470 * 2 = 2940
956 * 2  = 1912
```

TouchPilot now checks this relationship when building calibration metadata. It still keeps the existing shared calibration shape, but the note/status now considers whether screenshot dimensions match `display * scaleFactor`.

Why this matters:

- the overlay/puck uses logical coordinates
- the screenshot sent to guidance is pixel-dense
- target coordinates must not accidentally mix those two spaces

If the screenshot size does not match the expected Retina scale, calibration reports `needs_check` and the debug readout should surface the mismatch.

## Phase M3 Native Mic Capture Update

Plain English: the Mac can now prove that TouchPilot can hear audio before we ask OpenAI to transcribe anything.

The new command is:

```bash
npm run qa:mac:mic
```

It opens the default CPAL microphone stream, records for two seconds, counts samples, and reports the peak audio level.

The current Mac result:

```text
[INFO] device - External Microphone, sample_rate=48000, channels=1, format=F32
[PASS] microphone captured - samples=96256 peak=0.0281
```

This means native microphone capture is working on macOS. If this probe fails later, the likely causes are:

- no default microphone
- macOS Microphone permission not granted
- the terminal/app needs to be relaunched after permission changes
- CPAL cannot open the selected input device

This is intentionally separate from transcription. M3 Step 1 proves "can we record audio?" before M3 Step 2 proves "can we send that audio for transcription?"

## Phase M3 Local Whisper Transcription Pivot

Plain English: OpenAI transcription worked as a technical path, but the account quota blocked the test. TouchPilot now needs a free transcription path so voice work can continue without requiring paid OpenAI credits during development.

The updated QA probe defaults to local `whisper.cpp` instead of OpenAI. That means the Mac records microphone audio locally, writes a temporary WAV file, sends it to a local Whisper binary, and reads the resulting transcript from disk.

The default command stays the same:

```bash
npm run qa:mac:transcribe
```

But the expected default provider is now:

```text
local-whisper
```

The local setup requires:

```bash
brew install whisper-cpp
export WHISPER_CPP_MODEL="/path/to/ggml-base.en.bin"
```

Optional environment variables:

- `WHISPER_CPP_BIN` - points to a specific `whisper.cpp` binary if it is not on `PATH`.
- `WHISPER_CPP_MODEL` - points to the downloaded Whisper model file.
- `TOUCHPILOT_TRANSCRIPTION_PROVIDER=openai` - explicitly switches the probe back to OpenAI.

The important design decision is that free local transcription is now the default for development. OpenAI remains available, but it is not the only path.

### Why Not Wispr Flow Direct Integration

Plain English: Wispr Flow is useful as a reference product, but it is not a clean engine dependency for TouchPilot.

Wispr Flow behaves like a polished dictation app. Its command mode can write into other apps, but the public docs do not expose a stable developer API or CLI that TouchPilot can call directly as a transcription backend. Relying on it would mean brittle automation through focus, clipboard, accessibility events, or app-specific shortcuts.

That would create the wrong dependency shape:

- TouchPilot would depend on another desktop app being installed.
- The integration would be hard to test in CI.
- Command behavior could change when Wispr Flow updates.
- It would not give us clean audio-in/transcript-out control.

So Wispr Flow stays useful as UX inspiration, while `whisper.cpp` is the practical free transcription backend for local QA.

### Tradeoff

Local Whisper is free and private, but it requires a model download and can be slower than cloud transcription on weaker machines. OpenAI is simpler to call and usually faster, but it requires API quota and should eventually be routed through a backend, not embedded directly in a shipped desktop app.

For the Mac phase, the best path is:

```text
native mic capture -> local whisper.cpp QA -> later app integration -> optional backend/cloud provider
```

## Phase M3 Local Whisper Install Update

Plain English: the Mac now has a local Whisper engine installed for TouchPilot QA. This means the voice probe can run without OpenAI credits and without passing environment variables every time.

What was installed locally:

```text
~/tools/whisper.cpp
~/tools/whisper.cpp/build/bin/whisper-cli
~/tools/whisper.cpp/models/ggml-base.en.bin
```

Homebrew was not installed on the Mac, so we avoided making a global package-manager change. The path used instead was:

1. Clone official `ggml-org/whisper.cpp` under `~/tools`.
2. Run `make base.en` to download the `base.en` model.
3. Install user-local CMake through Python because the repo now requires CMake to build.
4. Build only the `whisper-cli` target.
5. Teach TouchPilot's QA probe to auto-detect the local `~/tools/whisper.cpp` binary and model.

The command now works without extra environment variables:

```bash
npm run qa:mac:transcribe
```

The current result:

```text
[PASS] microphone captured
[PASS] transcription - model=local-whisper:/Users/pumba/tools/whisper.cpp/models/ggml-base.en.bin
Transcript: [BLANK_AUDIO]
```

This is a useful partial pass. It proves:

- native microphone capture works
- the local Whisper binary runs
- the model is found automatically
- TouchPilot can invoke the local transcription path

It does not yet prove:

- spoken command recognition is clean in a real user-run scenario
- the transcript is routed into the main app voice loop

The `[BLANK_AUDIO]` result likely means the tool-run recording did not capture clear speech. The next manual test should be run from the user's normal terminal while speaking clearly during the recording prompt.

## Phase M3 Voice Acceptance Update

Plain English: a transcription engine running is not the same as the app understanding a usable command. TouchPilot now treats placeholder transcripts as failed QA so we do not accidentally accept a broken voice path.

The probe now rejects these placeholder results:

- `[BLANK_AUDIO]`
- `[inaudible]`
- `[silence]`
- `(silence)`

It also expects the transcript to include `click`, because the current manual test phrase is:

```text
show me what to click next
```

This changes the QA meaning:

```text
old behavior: engine ran -> pass
new behavior: engine ran and heard a useful command -> pass
```

That is stricter and better for the product. Phase M3 is about proving that voice can drive the guidance loop, not just proving that a microphone can send bytes to a speech engine.

## Phase M3 App Runtime Local Whisper Update

Plain English: local Whisper is no longer only a standalone test. The actual desktop app now uses the same free local transcription path when push-to-talk submits recorded audio.

The native app command `transcribe_voice_capture` now follows this provider rule:

```text
default: local-whisper
optional: TOUCHPILOT_TRANSCRIPTION_PROVIDER=openai
```

This matters because the app runtime no longer depends on OpenAI quota for the normal Mac voice path. The user can press/hold the voice control, speak, and the captured WAV is routed through the locally installed `whisper.cpp` binary.

The runtime auto-detects:

```text
~/tools/whisper.cpp/build/bin/whisper-cli
~/tools/whisper.cpp/models/ggml-base.en.bin
```

The frontend transcription type now accepts both provider names:

```text
local-whisper
openai
```

The architecture is now:

```text
Settings/debug voice control
  -> native mic capture start
  -> native mic capture stop
  -> base64 WAV
  -> transcribe_voice_capture
  -> local whisper.cpp by default
  -> transcript
  -> pending voice command
  -> guidance loop
```

OpenAI remains a future/cloud option, but it is explicit instead of default.

## Phase M3 Manual App Voice Test

Plain English: the voice path now works inside the app, not just in terminal probes.

Manual test result:

```text
Input: show me what to click
Observed: TouchPilot entered guidance mode and rendered a mock target cue
Status: passed for voice-to-guidance activation
```

The screenshot showed the target cue was not accurate. That is not a voice bug. It is the known limitation that guidance still uses the mock target path. Real target accuracy depends on the later screen-intelligence work: OCR, accessibility data, model target matching, and coordinate scoring.

The important M3 conclusion is:

```text
voice capture -> local Whisper transcript -> app command -> guidance activation
```

works on Mac.

## Product Rename Update

Plain English: the product name changed from TouchPilot to Toki because the old name felt too enterprise and off-putting for a cute cursor companion.

The rename now covers:

- app product name
- Tauri bundle product name
- npm workspace/package names
- Rust crate names
- UI labels
- QA script text
- project docs
- GitHub repository name
- local git remote URL

The GitHub repository is now:

```text
https://github.com/GargiGupta-io/toki
```

The local working folder may still be named `touchpilot` until the active dev process and local references are migrated. The app and repo identity are now Toki.

## Phase M4 Clicky Reference Alignment Update

Plain English: Toki is now using Clicky as the Mac behavior reference more directly. The goal is not to copy Clicky's Swift code. The goal is to match the shape of the product: a menu-bar utility, a compact panel, a transparent cursor overlay, and push-to-talk voice that routes into guidance.

The M4 alignment decision is:

```text
menu bar control
  -> compact Toki panel
  -> transparent click-through overlay
  -> push-to-talk voice
  -> transcript
  -> command routing
  -> guidance cue
```

What changed in this slice:

- The tray/menu action now says `Open Toki` instead of generic settings wording.
- The quit action now says `Quit Toki`.
- The tray icon is now marked as a macOS template icon, which lets the system render it like a menu-bar utility icon instead of treating it as a colored app badge.
- On macOS, the compact Toki panel opens automatically on launch so the app is discoverable even though it behaves like a menu-bar utility.
- When opened on macOS, the compact Toki panel is now placed near the top-right menu bar area instead of centered on the screen.
- The settings copy now explicitly says the local shortcut: hold Space or press the talk control, then release to guide.
- The Clicky reference notes now mark which pieces are already aligned and which remain as follow-up work.

The important tradeoff is discoverability versus purity. A perfect menu-bar utility might launch silently and only live in the menu bar. That is clean, but it confused testing because the app looked like it had disappeared. For now, auto-opening the compact panel on Mac is the better development and first-run behavior. Later, this can become a first-launch-only behavior once onboarding exists.

The panel placement tradeoff is similar. Clicky can anchor its panel to the exact menu-bar icon because it owns a native AppKit `NSPanel` flow. Toki is still using Tauri windows, so the practical M4 version positions the panel near the top-right menu-bar area using monitor bounds and the real window size. That is not a perfect native popover anchor yet, but it already stops the panel from feeling like a normal centered app window.

The other important tradeoff is Tauri shell versus native Swift shell. Clicky gets `NSPanel`, global shortcut monitoring, and menu-bar behavior directly from Swift/AppKit. Toki is staying in Tauri/Rust/React for now, so we recreate the same behavior with Tauri windows and native helpers. That keeps the cross-platform app architecture alive, but it means some Mac behaviors need careful native patches instead of being automatic.

M4 is complete as a reference-alignment phase. The remaining items are follow-up implementation work, not blockers for closing M4:

- a custom cursor-like template artwork if the current app icon still does not read clearly enough in the menu bar
- a true native global push-to-talk shortcut, likely Control+Option hold
- Accessibility permission UX for global shortcuts
- deeper multi-monitor overlay validation
- backend/proxy integration before any paid cloud API key ships in production

The backend/proxy rule is now part of the product contract: local Whisper can stay as the free/private default, but paid cloud transcription keys must not be embedded into public desktop builds.

### M4 Global Push-To-Talk Decision

Plain English: Space works as a local fallback, but the final Mac product needs a shortcut that works while the user is inside another app.

The chosen target is:

```text
hold Control+Option
  -> start native mic capture
release Control+Option
  -> stop capture
  -> transcribe
  -> route command into guidance
```

The best final implementation is a native macOS event monitor or Swift/AppKit bridge, similar in spirit to Clicky's `CGEvent` monitor. This path can observe press/release transitions without making the settings panel stay focused.

The shortcut must not be treated as complete until the permission flow is clear, because macOS requires Accessibility permission for global keyboard monitoring. The settings-panel push-to-talk button remains necessary as the fallback.

The detailed contract now lives in:

```text
touchpilot/docs/macos-global-push-to-talk.md
```

### M4 Overlay QA Update

Plain English: the overlay cannot be accepted only because a config says it is transparent. The Mac product has to pass a visual contract: Toki should not add titlebars, centered app panels, or debug surfaces to the normal desktop.

The macOS runtime QA script now checks for obvious app-chrome regressions when Toki is running:

- overlay/title text in visible window names
- visible debug window during default-runtime acceptance
- large visible Toki windows that might be app-like panels

It still cannot fully prove click-through or puck feel by itself. Those remain manual desktop checks because the product requirement is visual and behavioral: the user should feel like a tiny cursor companion is present, not like a desktop app is covering the screen.

The current command is:

```bash
npm run qa:mac:runtime
```

If Toki is not running, this correctly fails with:

```text
[FAIL] process exists - no running toki-desktop process found
```

That is not a code failure. It means the app must be launched first, then the runtime QA command rerun.

### M4 Closure

Plain English: M4 is now closed because the app has a documented Clicky-style Mac contract and the current shell follows it closely enough to move forward.

Closed M4 outcomes:

- Toki is menu-bar-first on Mac.
- Toki uses template tray icon behavior.
- The compact settings panel opens on launch for discoverability.
- The settings panel opens near the menu-bar area instead of centered.
- Debug stays separate from the user panel.
- Transparent overlay QA is stricter and tied to the Clicky contract.
- Native global push-to-talk is planned with the right permission model.
- Local Whisper remains the free default.
- Paid API keys must go through a backend/proxy before production.

What remains after M4:

- M5 should retest camera/gesture behavior on Mac.
- Later Mac shell work should add true global Control+Option push-to-talk.
- Later production work should add the backend/proxy for paid providers.
- Later polish should improve the menu-bar artwork if the current icon still does not read clearly.

## Why This Matters

TouchPilot is a cursor-first overlay product. If the development machine cannot reliably run the desktop shell, every later feature becomes guesswork.

M0 gives us a stable base:

- the repo pushes correctly
- source files no longer look dirty for fake reasons
- checks pass
- the app launches
- the next Mac-specific issue is known

## Next

Phase M5 should focus on:

- camera enumeration on Mac
- MediaPipe hand landmarks on Mac
- pinch and open palm gesture checks
- deciding whether gesture work remains complete or needs Mac-specific fixes

## Phase M5 Gesture Re-Test Start

Plain English: M5 starts by checking whether Toki can see the Mac camera before trying to recognize hands or gestures.

M5.1 adds a focused camera-enumeration QA path:

- Debug remains the place for camera device inspection.
- Settings stays a simple user panel, not a camera configuration window.
- The new Mac gesture QA doc explains how to run the Camera Devices refresh check.
- The debug UI now explains a common macOS behavior: camera names may appear as generic `Camera 1` until camera permission is granted.

That generic label is not a failure by itself. M5.1 only proves that a video input can be listed. M5.2 is where permission and camera activation should be tested.

### M5.2 Camera Permission Flow

Plain English: seeing a camera in the device list is not the same as being allowed to use it. macOS has a separate Camera privacy permission, and the app needs to explain that clearly.

M5.2 adds a specific Mac permission acceptance path:

- Camera permission should only be requested when Camera is enabled from debug/advanced controls.
- The camera preview should only appear inside the debug window.
- If permission is denied, Toki now tells the user to enable Camera access in macOS System Settings and relaunch.
- The QA doc now separates camera enumeration from camera permission, so we do not confuse "device exists" with "stream is active."

The important product decision remains: camera/gesture controls stay debug-first until landmark and gesture reliability are proven. The normal user surface should remain voice-first and cursor-first.

### M5.3 MediaPipe Landmark Flow

Plain English: after the camera turns on, Toki needs to prove it can see a hand as structured points, not just display a webcam preview.

M5.3 adds two safety improvements:

- The MediaPipe hand landmarker now tries GPU first and falls back to CPU if GPU setup fails.
- The debug window now explains `loading` and `no_hand` states so model loading is not confused with gesture failure.

The acceptance target is one visible hand producing a 21-point landmark frame. If camera preview is active but landmarks never reach 21 points, the gesture layer is not ready.

The important Mac/WebView tradeoff is that GPU acceleration may fail in a WebView even when the camera works. CPU fallback is slower, but it is the correct reliability baseline for this phase.

### M5.4 Pinch Gesture Test

Plain English: pinch detection is not just "did the label briefly say pinch?" It needs to become a stable command trigger.

The debug surface now tells the tester how to read pinch:

```text
Pinch Classifier
  -> raw per-frame distance check
Smoothed Gesture
  -> hold and cooldown logic
Gesture Action
  -> command actually fired
```

M5.4 documents that pinch only passes if it moves from raw candidate to smoothed `recognized` to a single action. This matters because noisy camera frames can flicker into pinch for one frame, which should not be accepted as a reliable activation gesture.

The product decision is still conservative: if pinch is noisy on Mac, voice remains the primary activation path.

### M5.5 Open Palm Gesture Test

Plain English: open palm should pause the assistant, but only when it is a stable open-hand gesture, not because a camera frame briefly looked like one.

M5.5 mirrors the pinch QA structure:

```text
Open Palm Classifier
  -> raw finger and spread check
Smoothed Gesture
  -> hold and cooldown logic
Gesture Action
  -> pause command actually fired
```

The pass condition is strict: at least four fingers extended, spread above threshold, smoothed gesture reaches `recognized`, and one `pause_assistant` action fires.

The conservative product decision is that open palm should remain debug-first if it creates accidental pauses in normal laptop use.

### M5.6 Gesture Debug Cleanup

Plain English: the debug window should help test gestures quickly, not force the tester to scan too many separate boxes.

M5.6 groups the gesture readouts into one recognition area:

- Pinch
- Open Palm
- Smoothed
- Action

This keeps the necessary signals visible while reducing the feeling that gesture QA is scattered across many unrelated panels. Camera devices, camera preview, hand landmarks, and gesture settings remain separate because those are different failure layers.

The main correction in this cleanup was also practical: the pinch section had the wrong hint text from the open-palm section. Grouping the cards made that easier to catch and fix.

### M5.7 Gesture Readiness Decision

Plain English: the Mac gesture pipeline is now ready to test properly, but gestures should not become the main user interface yet.

M5 produced the right QA structure:

- camera enumeration
- camera permission
- camera preview
- MediaPipe hand landmarks
- pinch raw/smoothed/action checks
- open palm raw/smoothed/action checks
- grouped gesture debug readouts

The decision is conservative:

```text
voice remains primary
gestures stay debug-first
promote gestures only after manual Mac reliability testing
```

This is the right call because camera gestures can easily create false positives under bad lighting, awkward laptop camera angles, or partial hands. A voice-first app can still work while gesture reliability is being tuned.

M5 is closed as a QA-readiness phase. The next real gesture work should be hands-on threshold tuning after manual tests, not more architecture.

## Next Phase: Voice Guidance Quality

Plain English: voice works, but the app is still guiding with a mock target. That means the product can hear the user, but it cannot yet prove it understands the screen.

The next phase should focus on guidance quality, not more activation methods.

The reason is simple:

```text
if the command is heard
but the target is fake
the app still does not solve the user's problem
```

The new Voice Guidance Quality phase should add a clear acceptance gate:

- show whether guidance came from mock or real provider
- show the transcript/goal that was sent
- show the target and validation state
- let a tester mark the result useful or wrong
- keep mock guidance as a fixture, not product proof

This keeps momentum focused on the actual user value: "I said what I want, and Toki showed me the right thing on screen."

### VG.1 Provider Mode

Plain English: Toki now labels whether guidance is mock or real, so we do not accidentally accept a fake target as product-quality guidance.

The first Voice Guidance Quality change adds:

- shared `GuidanceProviderMode`
- current debug provider mode: `mock`
- fixture visibility beside provider mode
- a warning that mock guidance proves plumbing only

This is small, but important. Before this, a tester could hear voice work, see a ring appear, and think the app understood the screen. Now Debug makes the truth visible: the current result is mock guidance until a real provider path is added.

### VG.2 Debug Result Review

Plain English: Toki now gives the tester a simple place to judge whether the guidance result was actually useful.

The debug Guidance tab now includes:

- the goal text that was sent into guidance
- the current provider mode
- the target label
- the target coordinates and size
- a local verdict control: `useful` or `wrong`

This does not make the guidance smarter yet. It gives us a scoreboard for manual testing. Without this, every voice test ends with a vague feeling like "the ring appeared." With it, we can say exactly what the app heard, what it highlighted, and whether that highlight helped.

The important tradeoff is that verdicts are currently local UI state only. That keeps the step small and avoids inventing a feedback database too early. Later, when real guidance exists, these verdicts can become saved evaluation examples.

### VG.3 Screenshot Payload Gate

Plain English: Toki now checks whether it has the screen evidence a real guidance model would need.

The guidance request can now carry:

- the user's goal
- display metadata
- screenshot dimensions
- screenshot payload as base64
- calibration state

The debug Guidance tab shows these as a Payload Gate. This matters because voice alone is not enough. A real model needs both the command and the screen. Without the screenshot payload, the model can only guess.

The current tradeoff is that the payload is still raw base64. That is acceptable for a first smoke test, but large screenshots can become expensive or slow. The debug gate now flags payloads over 2 MB with a "Downscale before provider" plan so we do not accidentally build the final provider path around oversized images.

### VG.4 Real Provider Adapter Plan

Plain English: Toki now has a written rule for where real AI guidance should live and where it should not live.

The key decision is:

```text
desktop app = capture, voice, overlay, debug
backend/proxy = paid API keys, billing, rate limits, provider calls
```

This matters because a desktop app can be inspected by users. If we put a paid provider key directly inside the shipped app, someone can extract it and abuse it. So production guidance must go through a backend/proxy. Local development can still use a direct provider key temporarily for smoke tests, but that is only a developer shortcut.

VG.4 also records how real guidance should fail. If the provider is unavailable, Toki should say `unavailable`; it should not quietly show a mock target and pretend guidance worked. Mock guidance remains a debug fixture, not a product result.

The first real provider should be a vision-language model because it can take the screenshot plus voice goal and return a structured target fastest. Local-only screen intelligence can come later if cost, privacy, or offline use becomes the priority.

### VG.5 First Real Guidance Smoke Path

Plain English: Toki now has a real-provider smoke-test path, but it refuses to fake a result when no real provider is connected.

The new path works like this:

```text
Debug "Real smoke"
  -> capture screen
  -> build guidance request with screenshot payload
  -> ask configured provider endpoint
  -> validate result
  -> render target only if provider returns valid guidance
```

If no endpoint is configured, Toki sets provider mode to `unavailable` and shows the provider error in Debug. This is the correct behavior. It is better to show no target than to show a fake mock target and make the tester think screen understanding worked.

The local development hook is `VITE_TOKI_GUIDANCE_ENDPOINT`. Later, this can point at a local backend or dev proxy that accepts the current `GuidanceRequest` and returns a validated `GuidanceResult`.

The important product decision is that mock and real are now separate buttons:

- `Test guidance` proves UI plumbing with mock fixtures.
- `Real smoke` proves provider readiness and must not silently fall back to mock.

This keeps our tests honest.

### Voice Guidance Quality Closure

Plain English: the voice-guidance quality gate is closed, but that does not mean Toki has perfect screen understanding yet.

What is now true:

- voice can route into guidance
- mock guidance is visibly labeled as mock
- real guidance has a separate smoke path
- the app can carry screenshot payload and calibration data into a provider request
- if no provider exists, Toki says `unavailable` instead of showing a fake target

This closes the honesty problem. Earlier, voice working plus a mock ring could look like real intelligence. Now the product tells us whether we are seeing a mock fixture, a real result, or no provider.

The next limitation is target quality. To make Toki actually useful, the next phases need either a real provider/backend or stronger screen intelligence such as OCR and accessibility mapping. Safety also matters before the app starts guiding users toward risky actions.

## Updates

- 2026-06-25 - Created after Phase M0 completed on macOS.
- 2026-06-25 - Added Phase M1 transparent-window fix: `app.macOSPrivateApi` plus the matching Tauri `macos-private-api` Cargo feature.
- 2026-06-25 - Replaced custom settings popup movement with Tauri native window dragging for macOS shell behavior.
- 2026-06-25 - Added macOS runtime QA script and manual overlay checklist for transparent overlay validation.
- 2026-06-25 - Removed user-facing Windows camera permission copy and added explicit Mac/Windows release script names.
- 2026-06-25 - Added macOS capture probe and recorded successful Retina capture outside the sandbox.
- 2026-06-25 - Added macOS Screen Recording guidance for permission-like capture failures.
- 2026-06-25 - Added Retina screenshot scale validation to desktop calibration metadata.
- 2026-06-26 - Added macOS microphone capture probe and recorded successful native CPAL sample capture.
- 2026-06-26 - Switched transcription QA to free local `whisper.cpp` by default after OpenAI quota blocked cloud transcription.
- 2026-06-26 - Installed local `whisper.cpp`, auto-detected its binary/model from the QA probe, and confirmed the local transcription command runs without OpenAI.
- 2026-06-26 - Added strict transcript acceptance so placeholder speech results like `[BLANK_AUDIO]` fail the Mac voice QA probe.
- 2026-06-26 - Wired the desktop app runtime to use local `whisper.cpp` transcription by default for push-to-talk voice commands.
- 2026-06-26 - Confirmed manual app voice test: spoken command activates guidance with local Whisper; target accuracy remains mock-guidance scope.
- 2026-06-26 - Renamed the product and GitHub repository from TouchPilot/touchpilot to Toki/toki.
- 2026-06-26 - Started Phase M4 Clicky reference alignment: Mac auto-opens the compact Toki panel, tray labels are product-specific, Space push-to-talk copy is explicit, and the Clicky reference notes now track current alignment plus remaining native Mac follow-ups.
- 2026-06-26 - Marked the Toki tray icon as a macOS template icon so it behaves more like a native menu-bar utility icon.
- 2026-06-26 - Positioned the macOS settings panel near the top-right menu bar area when opened, using monitor bounds and the real panel size.
- 2026-06-26 - Documented the macOS global push-to-talk contract: Control+Option hold is the target, Space/settings remains the fallback, and native event monitoring plus Accessibility permission UX is the preferred final path.
- 2026-06-26 - Tightened macOS runtime QA for Clicky-style overlay acceptance and documented that the probe must be run after Toki is already running.
- 2026-06-26 - Closed Phase M4 as a Clicky-reference alignment phase and moved global shortcut implementation, provider backend, icon artwork, and multi-monitor polish into follow-up phases.
- 2026-06-26 - Started Phase M5 with Mac camera enumeration QA and added a debug hint for generic camera labels before permission is granted.
- 2026-06-26 - Added M5.2 Mac camera permission QA and clearer macOS Camera privacy guidance in the debug preview path.
- 2026-06-26 - Added M5.3 MediaPipe landmark QA, GPU-to-CPU fallback, and clearer debug hints for model loading versus no-hand states.
- 2026-06-26 - Added M5.4 pinch QA and clarified the difference between raw pinch detection, smoothed recognition, and the final gesture action.
- 2026-06-26 - Added M5.5 open palm QA and clarified the path from raw open-hand detection to one pause action.
- 2026-06-26 - Cleaned up the gesture debug tab by grouping pinch, open palm, smoothed state, and action into one recognition area.
- 2026-06-26 - Closed Phase M5 with the decision that gestures remain debug-first and secondary to voice until manual Mac camera testing proves reliability.
- 2026-06-26 - Added the Voice Guidance Quality phase as the next product step because voice works but target guidance is still mock-based.
- 2026-06-26 - Added VG.1 provider-mode visibility so mock guidance is clearly labeled and cannot be mistaken for real screen understanding.
- 2026-06-26 - Added VG.2 debug result review so manual voice guidance tests can mark a target useful or wrong.
- 2026-06-26 - Added VG.3 screenshot payload gate so real guidance readiness is visible before provider integration.
- 2026-06-26 - Added VG.4 provider adapter plan with backend/proxy rule, local dev exception, payload strategy, and unavailable-mode failure behavior.
- 2026-06-26 - Added VG.5 real smoke path that reports unavailable instead of rendering mock guidance when no provider endpoint is configured.
- 2026-06-26 - Closed Voice Guidance Quality as an honesty/readiness gate; next work should focus on provider-backed guidance, safety, or screen intelligence.
- 2026-06-26 - Consolidated learning-doc ownership: all Mac-specific migration/runtime/QA findings stay in this doc, while Phase 10 stays platform-neutral.
- 2026-07-06 - Fixed the active-window crop architecture: frontmost window bounds now use macOS `CGWindowListCopyWindowInfo` and `NSWorkspace` instead of Accessibility/AX window reads. This matters because guidance cropping should not open System Settings for Accessibility just to find the active window. Accessibility remains useful for UI-element candidates, but active-window cropping belongs to the Screen Recording/window-list path.
- 2026-07-07 - Added a macOS Screen Recording preflight before capture. Toki now checks `CGPreflightScreenCaptureAccess` before calling screenshot capture so failed permission state can be reported in-app instead of repeatedly provoking Apple's System Settings prompt. A short frontend cooldown also prevents voice/guidance paths from hammering capture after one permission-like failure.
- 2026-07-07 - Added Clicky-style macOS overlay behavior at the native `NSWindow` layer. The overlay now applies screen-saver window level, click-through mouse behavior, no hide-on-deactivate, no shadow, and collection behavior equivalent to `canJoinAllSpaces + stationary + fullScreenAuxiliary + ignoresCycle`. This is deliberately macOS-native because fullscreen apps live in separate Spaces; Windows keeps its existing HWND overlay path.
- 2026-07-08 - Tightened the live guidance pipeline after repeated wrong-target and permission-prompt failures. Live guidance now runs capture in a gated sequence instead of parallel capture/probe work, refuses to run full-desktop vision when the active-window crop is unavailable, filters OCR/accessibility candidates to the same active-window crop sent to retired local vision runtime, rejects off-image model coordinates instead of silently clamping them, and shows clearer Guidance debug fields for blocker, input region, provider, summary, target, and validation. This does not make target accuracy perfect yet, but it makes failures honest and keeps the model from being distracted by the macOS menu bar, Dock, desktop icons, or unrelated windows.
- 2026-07-08 - Added a voice-submit guard so stale key-up/submit events do not poison the voice state when native capture has already stopped. The UI now checks native capture status before stopping/transcribing and returns to idle when no recording is active. This reduces the “stuck listening/transcribing” class of failures without changing the push-to-talk contract.
- 2026-07-08 - Rebuilt and installed `/Applications/Toki.app` from the release macOS bundle, then ran `npm run qa:mac:runtime` successfully. Automated QA confirms the process exists, the debug window is hidden by default, no visible overlay title is reported, and no large app-like panel is reported. Manual acceptance is still required for fullscreen Spaces behavior, real guidance target accuracy, and whether macOS still prompts for Screen Recording under the installed app identity.
- 2026-07-08 - Fixed the macOS app trust metadata path for Screen Recording. The installed app had the stable bundle id in `Info.plist`, but the actual ad-hoc code signature used a generated executable identifier and did not bind `Info.plist` into the signed bundle, so macOS could still treat the current Toki build as untrusted. We added `NSScreenCaptureUsageDescription`, rebuilt the app, added `scripts/macos-sign-app.sh`, wired `desktop:release:mac` to sign the built bundle with `app.toki.desktop`, and added `desktop:install:mac` so future installs replace `/Applications/Toki.app` through the same signed/stable identity path. This is still a development ad-hoc signature, not production notarization; the final shipping fix needs Developer ID signing and notarization.
