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

This checks microphone capture plus OpenAI transcription.

First make sure the key is set in the same terminal:

```bash
if [ -n "$OPENAI_API_KEY" ]; then echo set; else echo missing; fi
```

Then run:

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
[PASS] transcription - model=gpt-4o-transcribe
Transcript: show me what to click next
```

If it fails with `OPENAI_API_KEY is not set`, the app or terminal was launched without the environment variable. Export the key again, then rerun the command from that same terminal.
