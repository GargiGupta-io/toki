# Guidance Provider Adapter Plan

Toki should treat real guidance as a provider behind a narrow adapter, not as model-specific code spread through the desktop app.

## Goal

Voice already turns a spoken command into a guidance goal. The next problem is choosing the right target on the screen. This provider layer is the boundary between Toki's local runtime and whichever model or backend decides the target.

The adapter must accept:

- the user's goal text
- display metadata
- screenshot metadata
- optional screenshot payload
- calibration status
- previous step context

The adapter must return:

- one structured `GuidanceResult`
- target label
- target box in overlay/display coordinates
- confidence
- risk level
- confirmation requirement
- a short instruction

## Provider Modes

Toki should keep three modes visible in debug:

| Mode | Meaning | When to use |
| --- | --- | --- |
| `mock` | deterministic local fixture | UI, QA, and regression checks |
| `real` | model/provider generated target | manual smoke tests and product behavior |
| `unavailable` | provider cannot run | missing backend, missing local model, network failure, quota failure |

Mock mode is not product acceptance. It only proves the UI plumbing.

## Desktop Boundary

The desktop app should own:

- capture
- local screenshots
- calibration
- voice transcript routing
- visual overlay rendering
- debug visibility
- local developer provider calls when explicitly enabled

The desktop app should not own production secrets, billing enforcement, abuse prevention, or shared paid provider keys.

## Production Rule

Production builds must not ship paid API keys inside the desktop app.

Production flow:

```text
Toki desktop
  -> authenticated backend/proxy
  -> paid model provider
  -> validated GuidanceResult
  -> Toki overlay
```

The backend/proxy owns:

- provider API keys
- user identity
- billing/rate limits
- quota handling
- abuse prevention
- request logging policy
- provider swapping

## Local Dev Rule

Local dev may use direct provider access for smoke tests only.

Allowed local paths:

1. `TOKI_GUIDANCE_PROVIDER=mock`
2. `TOKI_GUIDANCE_PROVIDER=local`
3. `TOKI_GUIDANCE_PROVIDER=cloud-dev`

`cloud-dev` can read a key from the developer environment for testing, but that must never become the production app path.

## Payload Strategy

VG.3 added the payload gate. The first smoke test can send the screenshot payload directly if the payload is small enough.

Initial rule:

- under 2 MB: okay for smoke test
- over 2 MB: downscale or compress first
- missing payload: provider unavailable
- calibration `needs_check`: provider may run, but debug must flag the result as coordinate-risky

Longer-term options:

| Option | Tradeoff |
| --- | --- |
| Full screenshot payload | easiest first test, larger and slower |
| Downscaled screenshot | cheaper/faster, can lose small UI text |
| Region crop | precise and cheap, needs OCR/accessibility or user focus area |
| Accessibility tree | structured and cheap, platform-specific and incomplete |
| OCR + screenshot | stronger targeting, more moving pieces |

## Adapter Shape

Phase 10.5 uses the existing `GuidanceRequest` as the provider request body. That keeps the desktop-to-provider boundary simple: whatever the overlay already uses for mock guidance is the same shape the real provider receives.

```ts
type GuidanceProviderRequest = GuidanceRequest;

type GuidanceProviderResponse = {
  mode: GuidanceProviderMode;
  result?: GuidanceResult;
  error?: string;
  validation?: GuidanceValidationResult;
  providerName?: string;
};
```

The real adapter should validate provider output with the existing `validateGuidanceResult()` before anything renders in the overlay.

## Dev Endpoint Contract

The first backend/proxy endpoint should be intentionally small.

```text
POST /api/guidance/smoke
content-type: application/json
```

Request body:

```ts
GuidanceProviderRequest
```

Required request fields for the first smoke test:

- `goal`
- `screen.display`
- `screen.screenshot`
- `screen.screenshotPayload`
- `screen.calibration`

Success response:

```json
{
  "mode": "real",
  "result": {
    "mode": "guide",
    "summary": "The next target is the Export button.",
    "step": {
      "instruction": "Click Export.",
      "target": {
        "label": "Export",
        "x": 120,
        "y": 80,
        "width": 96,
        "height": 40
      },
      "confidence": 0.72,
      "risk": "safe_navigation",
      "requiresConfirmation": false
    }
  },
  "providerName": "dev-provider"
}
```

Unavailable response:

```json
{
  "mode": "unavailable",
  "error": "provider quota exceeded",
  "providerName": "dev-provider"
}
```

Important rule: the desktop adapter must preserve `unavailable` instead of converting it into a mock target or a generic invalid-result error.

## Dev Smoke Server

Phase 10.5 includes a tiny local server skeleton:

```bash
npm run guidance:smoke:dev
```

Default endpoint:

```text
http://127.0.0.1:8787/api/guidance/smoke
```

Health check:

```text
GET http://127.0.0.1:8787/health
```

The skeleton currently validates the request shape and returns:

```json
{
  "mode": "unavailable",
  "error": "dev guidance smoke server is running, but no real provider is wired yet",
  "providerName": "dev-smoke-server"
}
```

That is intentional. Step 10.5.3 proves the backend/proxy boundary exists without pretending target accuracy is solved.

To point the desktop smoke action at it during local development:

```bash
VITE_TOKI_GUIDANCE_ENDPOINT=http://127.0.0.1:8787/api/guidance/smoke npm run desktop:dev
```

or use the helper script:

```bash
npm run desktop:dev:guidance-smoke
```

Local run flow:

1. Terminal A: `npm run guidance:smoke:dev`
2. Terminal B: `npm run desktop:dev:guidance-smoke`
3. Open Debug.
4. Go to Guidance.
5. Click `Real smoke`.

Expected result for this step:

- the desktop sends the captured guidance request to the local smoke server
- Debug shows provider mode `unavailable`
- Debug shows `dev-smoke-server`
- no fake mock target is rendered as a real result

Manual result on 2026-06-26:

- direct server probe returned `200`
- response mode was `unavailable`
- provider was `dev-smoke-server`
- Debug `Real smoke` showed provider unavailable
- Debug showed request and payload evidence
- target, box, and coordinates remained `None`

That is the correct result for the smoke server. It proves the app reached the backend boundary without pretending a mock target is real.

Later steps can wire a real provider inside the server without putting provider keys in the desktop app.

## Target Accuracy Extension

The local smoke bridge is complete, but target accuracy is not complete yet. `dev-smoke-server` proves that the desktop can send a screenshot plus goal to a backend boundary; it intentionally does not choose a target.

Step 10.5.7 adds explicit server-side provider mode config:

| Env var | Default | Meaning |
| --- | --- | --- |
| `TOKI_GUIDANCE_PROVIDER` | `unavailable` | Chooses the server-side provider mode |
| `TOKI_OLLAMA_ENDPOINT` | `http://127.0.0.1:11434/api/generate` | Local Ollama generate endpoint for the next adapter step |
| `TOKI_OLLAMA_MODEL` | `llava:latest` | Local Ollama vision model name for the next adapter step |

Supported provider modes:

| Mode | Current behavior |
| --- | --- |
| `unavailable` | Safe default. Returns unavailable and no target. |
| `local-ollama` | Sends screenshot + goal to a local Ollama vision model and returns the provider JSON. |

Run the default safe server:

```bash
npm run guidance:smoke:dev
```

Run the server in local Ollama mode:

```bash
npm run guidance:smoke:ollama
```

Step 10.5.8 wires the local Ollama adapter:

- the server builds an Ollama `/api/generate` request
- the prompt includes the user goal, display dimensions, scale factor, and calibration status
- the screenshot payload is sent in Ollama's `images` array
- the request uses `format: "json"` and `stream: false`
- provider HTTP failures return `unavailable`
- parse failures return `unavailable`
- successful provider JSON is normalized before it is returned to the desktop

Step 10.5.9 adds strict provider response validation:

- raw provider replies must contain JSON
- `real` provider replies must contain a `GuidanceResult`
- guide results must include `summary`, `step.instruction`, and a target box
- confidence must be a number from `0` to `1`
- risk must be one of the known safety classes
- risky actions must set `requiresConfirmation: true`
- target boxes must be finite, positive, and inside the display bounds
- invalid provider output returns `unavailable` with validation issues instead of rendering a target

The remaining Phase 10.5 work is:

1. Run the known-screen smoke runner against an active local provider and mark the result useful or wrong.
2. Record whether misses are provider limits, coordinate issues, or evidence that OCR/accessibility is needed before Phase 11.

## First Provider Choice

Best first provider for target-accuracy smoke testing:

- local vision-language model through a local HTTP server when available
- input: screenshot + user goal
- output: JSON matching `GuidanceResult`

Reason: it avoids paid API quota and keeps provider keys out of the desktop app while still proving whether screenshot-to-target guidance can work. A cloud provider can come later if local model accuracy is not enough.

## Known-Screen Smoke Runner

Step 10.5.10 adds a repeatable manual runner:

```bash
npm run guidance:known-screen
```

Before running it, check provider readiness:

```bash
npm run guidance:provider:check
```

The readiness check verifies:

- local Ollama HTTP availability
- configured endpoint from `TOKI_OLLAMA_ENDPOINT`
- configured model from `TOKI_OLLAMA_MODEL`
- whether the next step should be provider setup or known-screen accuracy

Required environment:

| Env var | Meaning |
| --- | --- |
| `TOKI_KNOWN_SCREEN_IMAGE` | PNG/JPEG screenshot for the known test screen |
| `TOKI_KNOWN_SCREEN_GOAL` | User goal, for example `Click the Manage button` |
| `TOKI_KNOWN_SCREEN_SCALE` | Display scale factor, usually `2` on Retina Macs |
| `TOKI_GUIDANCE_ENDPOINT` | Optional provider endpoint, defaults to `http://127.0.0.1:8787/api/guidance/smoke` |
| `TOKI_KNOWN_SCREEN_CANDIDATES` | Optional JSON array of manual candidate boxes |
| `TOKI_KNOWN_SCREEN_AUTO_CANDIDATES` | Set to `0` to disable automatic macOS Accessibility candidates |
| `TOKI_KNOWN_SCREEN_APP_NAME` | Optional macOS app process name to inspect instead of the frontmost app |
| `TOKI_ACCESSIBILITY_APP_NAME` | Alternate shared app name env for macOS Accessibility candidate extraction |

Example:

```bash
# Terminal A
npm run guidance:smoke:ollama

# Terminal B
TOKI_KNOWN_SCREEN_IMAGE=/tmp/toki-known-screen.png \
TOKI_KNOWN_SCREEN_GOAL="Click the Manage button" \
TOKI_KNOWN_SCREEN_SCALE=2 \
npm run guidance:known-screen
```

The runner builds a `GuidanceRequest` from the screenshot, posts it to the smoke endpoint, and prints:

- provider mode
- provider name
- summary
- instruction
- confidence
- risk
- target label and box

Manual acceptance:

- `useful`: the target box clearly points to the intended control
- `wrong`: the target box points to the wrong thing or is too vague
- `unavailable`: the provider/server/model did not return a real validated result

Current local note:

- Ollama was installed from the official macOS app path and is available at `/Applications/Ollama.app`.
- `llava:latest` was pulled successfully.
- `npm run guidance:provider:check` reports `[READY] local Ollama provider is reachable`.
- The Codex sandbox can still block local `127.0.0.1:11434` checks, so provider readiness should be checked outside the sandbox when needed.
- the repeatable runner is ready, but the first useful/wrong known-screen verdict is still pending

## Accuracy Notes

Step 10.5.11 records the current target-accuracy state honestly:

| Check | Result | Meaning |
| --- | --- | --- |
| Provider mode config | Done | The server can choose `unavailable` or `local-ollama`. |
| Local vision adapter | Done | The server can send screenshot + goal to Ollama. |
| Response validation | Done | Bad model output is rejected before reaching the overlay. |
| Known-screen runner | Done | A repeatable screenshot + goal test path exists. |
| Local provider availability | Ready outside sandbox | Ollama is reachable at `127.0.0.1:11434` with `llava:latest`. |
| First useful/wrong verdict | Unavailable | The first reachable run failed strict provider response validation before returning a target. |

This means Phase 10.5 has the provider pipeline, but not the product proof. A validated `GuidanceResult` only proves the response has the right shape. It does not prove the target is actually useful.

When the local provider is reachable, record each known-screen run with:

| Field | What to record |
| --- | --- |
| Screenshot | File path or page/app name |
| Goal | The exact command sent to the provider |
| Provider | Provider mode and model |
| Returned target | Label and box |
| Confidence | Provider confidence |
| Verdict | `useful`, `wrong`, or `unavailable` |
| Failure type | provider unavailable, invalid output, wrong target, coordinate issue, or unclear UI |
| Next action | retry prompt, add OCR, add accessibility, or accept for smoke |

Current known-screen run:

| Field | Value |
| --- | --- |
| Screenshot | `/tmp/toki-known-screen.png` |
| Goal | `Click the message input box at the bottom.` |
| Scale | `2` |
| Provider | `local-ollama` / `llava:latest` |
| Returned target | Rejected: `Message input box` at normalized `0.389,0.781 0.520x0.412` |
| Verdict | `unavailable` |
| Failure type | coordinate issue: provider returned normalized `0..1` values instead of CSS pixels |
| Next action | add OCR/accessibility candidate evidence or change model/prompt strategy before judging coordinate accuracy |

Step 10.6.4 update:

- invalid provider responses now include capped `providerRawText`
- the known-screen CLI prints validation issues and raw provider output
- the Ollama prompt now explicitly forbids normalized coordinates and explains screenshot-pixel-to-CSS-pixel conversion
- target widths/heights smaller than practical CSS-pixel sizes are rejected as likely normalized output
- the retest reached `local-ollama`, but `llava:latest` still returned normalized coordinates, so the result correctly stayed `unavailable`

Step 10.6.5 candidate-assisted update:

- requests may now include `screen.candidates`
- each candidate carries `id`, `label`, `role`, and a trusted CSS-pixel box
- the Ollama prompt lists candidates and asks the provider to choose one instead of inventing coordinates
- if the provider returns a matching `candidateId` or label, Toki anchors the target to the trusted candidate box before validation
- `TOKI_KNOWN_SCREEN_CANDIDATES` lets the known-screen runner attach candidate evidence during manual smoke tests

Candidate-assisted known-screen run:

| Field | Value |
| --- | --- |
| Screenshot | `/tmp/toki-known-screen.png` |
| Goal | `Click the message input box at the bottom.` |
| Candidate | `message-input`, `Message input box`, `textbox`, `20,790 1430x60` |
| Provider | `local-ollama` / `llava:latest` |
| Returned target | `Message input box at 20,790 1430x60` |
| Verdict | `real` / candidate-assisted useful smoke |
| Caveat | This proves candidate selection and anchoring, not automatic OCR/accessibility candidate generation yet. |

Step 10.6.6 automatic candidate update:

- added a macOS Accessibility candidate collector
- the known-screen runner now uses manual candidates first, then tries macOS Accessibility automatically
- automatic candidates include label, role, and CSS-point box data from the target app's accessibility tree
- `TOKI_KNOWN_SCREEN_APP_NAME` can point the collector at a specific app when Terminal is frontmost
- if macOS Accessibility permission is missing, the runner keeps going with no candidates and prints the warning
- this is the first automatic candidate source, but it is not full OCR yet
- local probe result: the collector executed without script error, but returned zero candidates for the current frontmost context; use `TOKI_KNOWN_SCREEN_APP_NAME` when the target app is not frontmost or does not expose obvious window candidates

Step 10.6.7 app-targeted probe update:

- added `npm run qa:mac:candidates`
- `npm run qa:mac:candidates -- --list` lists visible macOS apps and marks the frontmost app
- `npm run qa:mac:candidates -- --app "Microsoft Edge"` targets a specific app instead of accidentally inspecting Terminal or Codex
- the probe prints resolved app name, window count, visited element count, and candidate warnings
- live result: targeting `Microsoft Edge` resolves the right app, but macOS reports `osascript is not allowed assistive access`
- this means candidate extraction is currently blocked by macOS Accessibility permission, not by the provider contract

Permission fix before accepting automatic candidates:

1. Open macOS System Settings.
2. Go to Privacy & Security.
3. Open Accessibility.
4. Allow the terminal app used to run `npm run qa:mac:candidates`, and later allow Toki itself if the packaged app owns the probe.
5. Re-run `npm run qa:mac:candidates -- --app "Microsoft Edge"`.

Do not call automatic candidate extraction complete until the app-targeted probe returns real candidates or records that the target app exposes no useful accessibility elements after permission is granted.

Step 10.6.8 permission rerun:

- Accessibility permission was granted enough for the warning to disappear
- the visible-app probe can inspect Terminal and return candidates
- Microsoft Edge has multiple visible processes, so the collector now chooses the matching process with the most windows
- after that fix, the Edge probe resolves `Microsoft Edge` with `Windows: 1`
- Edge still returns `Candidates: 0`
- current blocker: `read children: Error: Can't get object`

Decision:

The current `osascript` Accessibility route is useful as a lightweight candidate source, but it is not reliable enough for browser target accuracy by itself. The next target-accuracy path should be either:

1. OCR candidate extraction from the screenshot, or
2. a native macOS Accessibility bridge using lower-level AX APIs instead of JXA/System Events.

Do not keep tuning the model prompt for Edge until the app has real candidate boxes to choose from.

Decision rule before Phase 11:

- If one known-screen target is useful, Phase 10.5 can close as a smoke-level provider path.
- If the provider returns valid JSON but the target is wrong, do not call it done. Record the miss and decide whether OCR/accessibility should move before Phase 11.
- If the provider is unavailable, keep Phase 10.5 open or explicitly close it as "provider pipeline ready, accuracy unproven."

Step 10.5.12 decision:

- Phase 10.5 is closed as `provider pipeline ready`.
- Phase 10.5 is not closed as `target accuracy proven`.
- Phase 11 Safety should not start yet.
- The next phase is Phase 10.6: Target Accuracy And Screen Intelligence.
- Phase 10.6 should first try a reachable local provider against the known-screen runner.
- If screenshot-only targeting misses, Phase 10.6 should add OCR/accessibility candidate evidence before returning to safety work.

Current best alternative if screenshot-only misses:

- Add OCR/accessibility evidence before safety work.
- Then ask the provider to choose from visible UI candidates instead of raw pixels only.
- This should improve target accuracy and make safety classification easier because the model gets structured labels and bounds.

## Failure Behavior

When the provider fails, Toki should not silently fall back to mock guidance.

Correct behavior:

- show provider mode as `unavailable`
- keep mock fixture selectable only in Debug
- show error in Debug Guidance
- do not render a fake target as if it were real

## Acceptance For VG.4

VG.4 is complete when:

- provider boundary is written down
- production backend/proxy rule is explicit
- local dev exception is explicit
- payload size strategy is explicit
- failure behavior does not allow fake acceptance

## Acceptance For Target Accuracy

The remaining Phase 10.5 target-accuracy extension is complete when:

- the smoke server supports explicit provider mode config
- the default provider remains `unavailable`
- a local vision provider can return one validated `GuidanceResult`
- invalid or malformed provider output is rejected
- Debug shows provider name, request evidence, validation, and tester verdict
- one known-screen target is tested manually
- the result is recorded as useful or wrong
