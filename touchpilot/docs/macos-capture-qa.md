# macOS Capture QA

Toki needs screen pixels before it can tell the user what to click. On macOS, that means the capture path must be tested from a real desktop process, not only from a sandboxed automation shell.

## Run The Probe

From `toki`:

```bash
npm run qa:mac:capture
```

Expected pass output looks like:

```text
Toki capture probe

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
- grant access to the terminal app or Toki app
- quit and relaunch the app/terminal

The relaunch matters. macOS often does not apply Screen Recording permission to an already-running process.

## Expected Failure Copy

If capture fails because macOS does not expose displays or denies capture, Toki should show an actionable message:

```text
no display available for capture. On macOS, grant Screen Recording permission to Toki or the terminal app, then quit and relaunch it.
```

Any generic capture error without this Screen Recording hint should be treated as a bug in the permission guidance layer.

## Phase M2 Status

Current Mac result:

- capture probe passed outside the sandbox
- display metadata was `1470x956` at scale `2`
- screenshot image was `2940x1912`

That means the capture dimensions line up with Retina scaling: logical display size multiplied by scale factor equals screenshot pixel size.

## Coordinate Mapping Check

The overlay/guidance layer works in logical screen coordinates. Retina screenshots are larger because each logical point can contain multiple physical pixels.

For the current Mac:

```text
logical display: 1470 x 956
scale factor:    2
screenshot:      2940 x 1912
```

Expected screenshot size:

```text
1470 * 2 = 2940
956 * 2  = 1912
```

So the capture path is internally consistent.

Toki now checks this relationship when it builds calibration metadata. A mismatch should show in the debug Capture/Guidance readout as `needs_check`.
