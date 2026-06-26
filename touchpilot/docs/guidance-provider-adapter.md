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

Conceptual interface:

```ts
type GuidanceProviderRequest = GuidanceRequest & {
  providerMode: GuidanceProviderMode;
};

type GuidanceProviderResponse = {
  mode: GuidanceProviderMode;
  result?: GuidanceResult;
  error?: string;
  rawProvider?: unknown;
};
```

The real adapter should validate provider output with the existing `validateGuidanceResult()` before anything renders in the overlay.

## First Provider Choice

Best first provider for smoke testing:

- cloud vision-language model through a dev key or backend
- input: screenshot + user goal
- output: JSON matching `GuidanceResult`

Reason: it is the fastest way to prove whether screenshot-to-target guidance works. Local-only vision models can come later if we need cost/privacy optimization.

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

