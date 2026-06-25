# macOS Voice QA

TouchPilot's voice path starts with native microphone capture. Before transcription or command routing, the Mac must prove it can open a microphone and receive audio samples.

## Native Mic Capture Probe

From `touchpilot`:

```bash
npm run qa:mac:mic
```

Expected pass output looks like:

```text
TouchPilot microphone capture probe

[INFO] device - External Microphone, sample_rate=48000, channels=1, format=F32
[INFO] recording - listening for 2 seconds
[PASS] microphone captured - samples=96256 peak=0.0281
```

## What This Checks

The probe uses the same native audio stack as the desktop app:

- CPAL default input device
- default input config
- native input stream
- two seconds of sample capture

It confirms:

- macOS exposes a default microphone
- TouchPilot can open the microphone stream
- samples arrive from the microphone
- the stream can be stopped cleanly

## Permission Notes

If the probe fails, check:

- System Settings
- Privacy & Security
- Microphone
- grant access to the terminal app or TouchPilot app
- quit and relaunch the app/terminal

The relaunch matters because macOS privacy permissions often do not apply to already-running processes.

## Phase M3 Status

Current Mac result:

- device: `External Microphone`
- sample rate: `48000`
- channels: `1`
- format: `F32`
- samples captured: `96256`

Native mic capture is working on Mac.

## Native Transcription Probe

This checks microphone capture plus transcription. The default provider is free local Whisper through `whisper.cpp`.

Recommended local setup for this Mac:

```bash
git clone https://github.com/ggml-org/whisper.cpp.git ~/tools/whisper.cpp
python3 -m pip install --user cmake
cd ~/tools/whisper.cpp
make base.en
~/Library/Python/3.9/bin/cmake -B build
~/Library/Python/3.9/bin/cmake --build build --target whisper-cli -j 4 --config Release
```

The probe auto-detects:

```text
~/tools/whisper.cpp/build/bin/whisper-cli
~/tools/whisper.cpp/models/ggml-base.en.bin
```

Then run the probe:

```bash
npm run qa:mac:transcribe
```

When it says:

```text
[INFO] recording - say: show me what to click next
```

say this out loud:

```text
show me what to click next
```

Expected pass output includes:

```text
[PASS] microphone captured
[PASS] transcription - model=local-whisper:/Users/pumba/tools/whisper.cpp/models/ggml-base.en.bin
Transcript: show me what to click next
```

If the probe hears `[BLANK_AUDIO]`, `[inaudible]`, or text that does not include `click`, the command now fails intentionally. That means the local Whisper engine ran, but the recording did not capture a usable spoken command.

If it fails with `local Whisper binary not found`, build `whisper.cpp` or set `WHISPER_CPP_BIN`.

If it fails with `WHISPER_CPP_MODEL is not set`, set `WHISPER_CPP_MODEL` to a local model file.

## App Runtime Transcription

The desktop app uses the same provider rule as the QA probe:

```text
default: local-whisper
optional: TOUCHPILOT_TRANSCRIPTION_PROVIDER=openai
```

That means push-to-talk can transcribe through the local `whisper.cpp` install without OpenAI credits. The app auto-detects the same local Mac paths:

```text
~/tools/whisper.cpp/build/bin/whisper-cli
~/tools/whisper.cpp/models/ggml-base.en.bin
```

## Optional OpenAI Transcription

OpenAI transcription is still available for later cloud testing, but it is not the free/default path.

To use it:

```bash
export TOUCHPILOT_TRANSCRIPTION_PROVIDER="openai"
export OPENAI_API_KEY="your_key_here"
npm run qa:mac:transcribe
```

If OpenAI returns `insufficient_quota`, the account needs billing or usable credits. Use local Whisper instead.
