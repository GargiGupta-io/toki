# Toki Browser Extension

Development-only browser companion for exact DOM candidates.

## Why it exists

Screenshots, OCR, and macOS Accessibility are not reliable enough for browser pages by themselves. A browser extension can see the page DOM directly and return exact candidates with labels, roles, and bounding boxes.

## Current scope

- Manifest V3 unpacked extension.
- Content script collects visible buttons, links, inputs, tabs, menu items, ARIA labels, and test IDs.
- Popup shows the first candidates for manual QA.
- No production bridge to the Toki desktop app yet.

## Load in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable developer mode.
3. Choose `Load unpacked`.
4. Select `apps/browser-extension`.
5. Start the fixture server:

   ```bash
   npm --workspace @toki/browser-extension run fixture:serve
   ```

6. Open `http://127.0.0.1:8788/fixtures/candidate-page.html` in the browser.
7. Click `Collect candidates`.

Do not open the fixture through `file://` for normal QA. The extension content script is intentionally scoped to normal `http` and `https` pages, matching how it will run on real browser dashboards.

## Manual acceptance

The fixture should return candidates for at least:

- `Create project`
- `Delete project`
- `Open settings`
- `Project name`
- `Environment selector`
- `Add notes`

The candidate output should include:

- `source: "browser-extension"`
- page `url`
- page `title`
- viewport width and height
- candidate `label`
- candidate `role`
- candidate box `x`, `y`, `width`, and `height`

This step passes when the extension sees these DOM candidates on the fixture page. It does not require the desktop app to consume them yet.

## Development bridge

After collecting candidates, use:

- `Send to Toki` to post the payload to `http://127.0.0.1:8787/api/browser-candidates/latest`.
- `Copy JSON` to copy the bridge payload.
- `Download` to save `toki-browser-candidates.json`.

The bridge payload is the temporary handoff shape for the desktop app:

```json
{
  "schemaVersion": 1,
  "source": "browser-extension",
  "capturedAt": "2026-07-02T00:00:00.000Z",
  "page": {
    "url": "https://example.com",
    "title": "Example"
  },
  "viewport": {
    "width": 1280,
    "height": 720,
    "scrollX": 0,
    "scrollY": 0,
    "devicePixelRatio": 2
  },
  "candidates": []
}
```

This is not the final live bridge. It is a stable dev payload so Toki can later import exact browser candidates and rank them before provider calls.

For `Send to Toki`, start the local smoke server first:

```bash
npm run guidance:smoke:freellmapi
```

Restart the smoke server after pulling new bridge code. An older running server will return `route not found` for `/api/browser-candidates/latest`.

Then open a normal web page, collect candidates in the browser popup, and click `Send to Toki`.

## Real browser page QA

Use this when testing the live extension path before target accuracy work:

1. Start FreeLLMAPI and make sure it has a working unified key.
2. Start the Toki guidance smoke server:

   ```bash
   npm run guidance:smoke:freellmapi
   ```

3. Load the unpacked extension from `apps/browser-extension`.
4. Open a real dashboard page in Chrome or Edge.
5. Open the extension popup and click `Collect candidates`.
6. Confirm the popup shows page-specific candidates, not only browser chrome.
7. Click `Send to Toki`.
8. Check that Toki received a real-page payload:

   ```bash
   npm run qa:browser:candidates
   ```

9. Run the known-screen smoke without `TOKI_BROWSER_CANDIDATE_PAYLOAD`; the runner should read the latest payload from the live bridge automatically.

This step proves that the extension can collect DOM candidates from an actual browser page and hand them to Toki. It does not prove final target accuracy by itself; accuracy still depends on candidate ranking and the selected provider.

For the controlled fixture page, the same bridge check is allowed with:

```bash
npm run qa:browser:candidates -- --allow-fixture
```

## Use with the known-screen runner

After downloading `toki-browser-candidates.json`, run:

```bash
TOKI_BROWSER_CANDIDATE_PAYLOAD=/path/to/toki-browser-candidates.json \
TOKI_KNOWN_SCREEN_IMAGE=/tmp/toki-known-screen.png \
TOKI_KNOWN_SCREEN_SCALE=2 \
npm run guidance:known-screen
```

When this env var is set, the known-screen runner uses browser-extension candidates before manual, Accessibility, or OCR candidates.

If no file path is provided, the known-screen runner tries the live bridge automatically:

```bash
TOKI_KNOWN_SCREEN_IMAGE=/tmp/toki-known-screen.png \
TOKI_KNOWN_SCREEN_SCALE=2 \
npm run guidance:known-screen
```

Set `TOKI_BROWSER_CANDIDATE_BRIDGE=0` to disable this automatic bridge lookup.

## Candidate shape

The extension returns candidates compatible with Toki's shared `ScreenCandidate` type:

```json
{
  "id": "dom-submit-1",
  "label": "Submit",
  "role": "dom_button",
  "source": "dom",
  "x": 120,
  "y": 240,
  "width": 80,
  "height": 32
}
```
