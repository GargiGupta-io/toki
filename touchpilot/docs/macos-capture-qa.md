# macOS Capture QA

TouchPilot needs screen pixels before it can tell the user what to click. On macOS, that means the capture path must be tested from a real desktop process, not only from a sandboxed automation shell.

## Run The Probe

From `touchpilot`:

```bash
npm run qa:mac:capture
```

Expected pass output looks like:

```text
TouchPilot capture probe

[PASS] metadata - display=1 1470x956 scale=2
[PASS] screenshot - image=2940x1912 bytes=2145981 base64_chars=2861308
```

## What This Checks

The probe calls the same Rust capture functions used by the Tauri app:

- `capture_primary_display_metadata()`
- `capture_primary_display()`

It confirms:

- macOS can enumerate a display
- display dimensions and scale factor are available
- a screenshot can be captured
- the screenshot can be encoded as PNG/base64

## Sandbox Finding

The same probe can fail inside a restricted shell with:

```text
[FAIL] metadata - no display available for capture
```

That does not necessarily mean the app capture code is broken. It means the process cannot see macOS display APIs from that environment.

For real QA, run the probe from a normal terminal or with the app launched as a normal macOS process.

## Permission Notes

If screenshot capture fails from a normal terminal, check:

- System Settings
- Privacy & Security
- Screen Recording
- grant access to the terminal app or TouchPilot app
- quit and relaunch the app/terminal

## Phase M2 Status

Current Mac result:

- capture probe passed outside the sandbox
- display metadata was `1470x956` at scale `2`
- screenshot image was `2940x1912`

That means the capture dimensions line up with Retina scaling: logical display size multiplied by scale factor equals screenshot pixel size.
