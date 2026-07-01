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
5. Open `apps/browser-extension/fixtures/candidate-page.html` in the browser.
6. Click `Collect candidates`.

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
