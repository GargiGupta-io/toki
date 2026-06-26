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

The remaining Phase 10.5 work is:

1. Add server-side provider mode config such as `TOKI_GUIDANCE_PROVIDER=local-ollama|unavailable`.
2. Keep `unavailable` as the default so local runs never pretend accuracy exists.
3. Add a local vision-provider adapter behind `/api/guidance/smoke`.
4. Send the existing screenshot payload and goal to that provider.
5. Parse the provider reply into strict `GuidanceResult` JSON.
6. Validate the result before returning it to the desktop.
7. Run one known-screen manual test and mark the result useful or wrong.
8. Record whether misses are provider limits, coordinate issues, or evidence that OCR/accessibility is needed before Phase 11.

## First Provider Choice

Best first provider for target-accuracy smoke testing:

- local vision-language model through a local HTTP server when available
- input: screenshot + user goal
- output: JSON matching `GuidanceResult`

Reason: it avoids paid API quota and keeps provider keys out of the desktop app while still proving whether screenshot-to-target guidance can work. A cloud provider can come later if local model accuracy is not enough.

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
