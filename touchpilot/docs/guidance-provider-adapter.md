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
| `TOKI_FREELLMAPI_ENDPOINT` | `http://127.0.0.1:3001/v1/chat/completions` | OpenAI-compatible FreeLLMAPI dev endpoint |
| `TOKI_FREELLMAPI_MODEL` | `auto` | FreeLLMAPI dev model name |
| `TOKI_FREELLMAPI_API_KEY` | empty | Optional local FreeLLMAPI bearer token |

Supported provider modes:

| Mode | Current behavior |
| --- | --- |
| `unavailable` | Safe default. Returns unavailable and no target. |
| `local-ollama` | Sends screenshot + goal to a local Ollama vision model and returns the provider JSON. |
| `freellmapi-dev` | Sends screenshot + goal to an OpenAI-compatible FreeLLMAPI dev endpoint and validates the returned JSON. Development only, not a production provider path. |

Run the default safe server:

```bash
npm run guidance:smoke:dev
```

Run the server in local Ollama mode:

```bash
npm run guidance:smoke:ollama
```

Run the server in FreeLLMAPI dev mode:

```bash
npm run guidance:smoke:freellmapi
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
| `TOKI_KNOWN_SCREEN_OCR_CANDIDATES` | Set to `0` to disable macOS Vision OCR fallback candidates |
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

Step 10.6.9 OCR candidate update:

- added macOS Vision OCR candidate extraction
- added `npm run qa:mac:ocr:candidates`
- the known-screen runner now tries manual candidates first, then macOS Accessibility, then OCR
- OCR candidates use the same `{ id, label, role, x, y, width, height }` shape as Accessibility candidates
- OCR candidate boxes are converted from Vision's normalized bottom-left coordinate system into Toki CSS/display coordinates
- live result: `npm run qa:mac:ocr:candidates -- --image /tmp/toki-known-screen.png --scale 2` returned 14 OCR candidates

Example:

```bash
npm run qa:mac:ocr:candidates -- --image /tmp/toki-known-screen.png --scale 2
```

Tradeoff:

OCR can see text even when browser Accessibility traversal is poor, but it does not know semantics. It can find labels like `Download`, `Search`, or `Manage`; it cannot always know whether the text is a button, tab, link, or paragraph. The provider still needs to choose from OCR candidates carefully, and OCR should eventually be combined with native AX and screenshot geometry.

Step 10.6.10 OCR-backed provider run:

```bash
TOKI_KNOWN_SCREEN_IMAGE=/tmp/toki-known-screen.png \
TOKI_KNOWN_SCREEN_GOAL='Click the text that says Find and fix a bug in @filename' \
TOKI_KNOWN_SCREEN_SCALE=2 \
TOKI_KNOWN_SCREEN_APP_NAME='Microsoft Edge' \
npm run guidance:known-screen
```

Result:

| Field | Value |
| --- | --- |
| Candidate source | `macos-vision-ocr` |
| Candidate count | `14` |
| Provider | `local-ollama` / `llava:latest` |
| Mode | `real` |
| Returned target | `> Find and fix a bug in @filename at 9,809 235x17` |
| Confidence | `0.9` |
| Risk | `safe_navigation` |
| Verdict | `useful` |

This is the first useful local-provider target from automatically extracted candidates. It proves that OCR candidates can bridge the browser Accessibility gap for text-visible targets. It does not prove icon-only targets, unlabeled controls, or complex form layouts yet.

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

## Phase 10.7 FreeLLMAPI Dev Run

Phase 10.7 adds `freellmapi-dev` only as a development comparison provider. It should help compare target accuracy against local Ollama, but it does not change the production rule: production provider calls need a backend/proxy.

Step 10.7.2 attempted a known-screen run with `/tmp/toki-known-screen.png`.

Result:

- Toki smoke server started in `freellmapi-dev` mode.
- The known-screen runner reached the Toki smoke endpoint.
- FreeLLMAPI itself was not running at `http://127.0.0.1:3001`, so the provider returned `unavailable`.
- No useful/wrong target verdict was possible yet.

FreeLLMAPI local setup was then completed under `/Users/pumba/tools/freellmapi`:

- dependencies installed with `npm install`
- local `.env` created with `ENCRYPTION_KEY` and `PORT=3001`
- `npm run dev` started the dashboard and API
- authenticated `GET /v1/models` worked with the generated local FreeLLMAPI key

The next blocker is upstream vision capacity, not the local server. A known-screen request reached FreeLLMAPI, but FreeLLMAPI returned `429 Too Many Requests` because its router had no usable vision provider:

- most free/anonymous routes reported `no vision support`
- vision-capable models such as Gemini reported `no enabled+healthy key for platform`

So FreeLLMAPI is installed and reachable, but it still needs at least one enabled vision-capable upstream provider key before it can be compared against Ollama for screenshot target accuracy.

After adding a Google/Gemini provider key, FreeLLMAPI exposed available Gemini models and the known-screen run reached a real provider result:

| Field | Result |
| --- | --- |
| Provider | `freellmapi-dev` |
| Model | `gemini-2.5-flash` |
| Candidate mode | auto candidates disabled |
| Result mode | `real` |
| Target | `next at 50,390 50x20` |
| Confidence | `0.9` |
| Verdict | Provider reachability proved; target usefulness still needs browser/candidate comparison. |

Step 10.7.3 compared FreeLLMAPI/Gemini against local Ollama on the same known-screen fixture with automatic candidates disabled:

| Provider | Model | Result | Target | Verdict |
| --- | --- | --- | --- | --- |
| `freellmapi-dev` | `gemini-2.5-flash` | `real` | `next at 50,390 50x20` | Validated provider result. Needs manual usefulness review. |
| `local-ollama` | `llava:latest` | `unavailable` | rejected normalized box around `Hello World` | Failed strict validation because it returned `0..1` coordinates instead of CSS pixels. |

Conclusion: FreeLLMAPI/Gemini is the stronger development provider for raw screenshot testing right now. Local Ollama remains useful as an offline fallback, especially when candidate IDs are supplied, but it should not be trusted for raw coordinate generation.

## Phase 10.7 Browser Candidate Strategy

Raw screenshots are not enough for reliable browser guidance. A browser page can contain many repeated labels, hidden controls, icon-only buttons, sticky headers, and nested panels. A vision model can guess, but it can also return plausible-looking wrong coordinates. Toki should give the provider a ranked list of candidate targets before asking it to choose.

### Short Term: OCR Plus Layout Heuristics

Use the evidence we already have:

- macOS Vision OCR text boxes
- existing Accessibility candidates when available
- screenshot/display calibration
- layout rules around browser pages

Candidate ranking should happen before the provider call. The provider should receive fewer, better candidates instead of a noisy list.

Initial ranking signals:

| Signal | Why it helps |
| --- | --- |
| Text match with the user command | `download`, `manage`, `search`, `add`, `revoke`, etc. should rise. |
| Button-like shape | Rectangles with interactive sizing are more likely targets than paragraph text. |
| Nearby icon/text grouping | Icon-only controls can inherit nearby visible labels. |
| Current viewport bounds | Ignore candidates hidden behind the dock/menu bar or outside the visible browser content. |
| Duplicate label penalty | If five `Info` labels exist, require stronger context before selecting one. |
| Dangerous-word flag | `Delete`, `Revoke`, `Pay`, `Send`, and account/security terms should carry safety metadata. |

Tradeoff: OCR is available now and works across browsers, but it does not understand semantics. It sees text, not whether the text is a button, link, tab, or decoration.

Best immediate use: ask FreeLLMAPI/Gemini or Ollama to choose from ranked OCR/accessibility candidate IDs, not raw screenshot coordinates.

### Mid Term: Native macOS AX Bridge

Replace brittle AppleScript Accessibility traversal with a native Rust/macOS bridge using the Accessibility APIs directly.

Why this is better:

- fewer AppleScript runtime failures
- better typed access to roles, labels, bounds, actions, and focus
- better control over browser process/window selection
- easier permission diagnostics

Tradeoff: native AX work is more platform-specific and slower to build correctly, but it gives more trustworthy UI semantics than OCR.

Best use: combine AX candidates with OCR candidates. AX provides roles/actions; OCR fills gaps when browsers expose poor trees.

### Long Term: Browser Extension Companion

Add an optional browser extension for Chrome/Edge/Safari that can expose exact DOM targets to Toki.

The extension can provide:

- element text
- ARIA labels
- role/button/link/input semantics
- bounding boxes from `getBoundingClientRect()`
- page URL/title
- scroll context
- exact clicked-target verification later

Tradeoff: extensions add install friction and browser-specific packaging, but they are the most accurate way to understand web pages.

Best use: web apps and SaaS dashboards where exact DOM targets matter. Keep OCR/AX as the no-extension fallback.

### Selected Direction Before Phase 11

Do not build Phase 11 safety on raw screenshot guessing alone.

Phase 10.7 should first add a candidate ranking layer:

1. collect OCR and any available AX candidates
2. normalize all boxes into display CSS coordinates
3. score candidates against the voice/user command
4. keep the top candidates only
5. ask the provider to choose one candidate ID
6. anchor the returned target to the trusted candidate box
7. mark safety metadata on risky labels before Phase 11

Acceptance: browser known-screen tests should show whether the provider chose a useful ranked candidate. If the ranked candidates do not include the right target, fix candidate extraction/ranking before changing provider prompts.

Step 10.7.5 added the first candidate ranking layer.

Ranking now happens before provider calls in:

- the known-screen CLI runner
- the live desktop guidance candidate path

Initial scoring signals:

- user-command text matches
- clickable/accessibility roles
- OCR-visible text
- button-sized boxes
- duplicate-label penalty
- large-region penalty
- risky-label flagging for words such as `delete`, `revoke`, `pay`, and `send`

This is intentionally simple. Its job is to make the first candidate list less noisy before the provider chooses a candidate ID. It is not the final browser understanding layer.

Next retry:

```bash
cd /Users/pumba/tools/freellmapi
npm run dev

cd /Users/pumba/Documents/Codex/clicky/touchpilot
npm run guidance:smoke:freellmapi
TOKI_KNOWN_SCREEN_IMAGE=/tmp/toki-known-screen.png \
TOKI_KNOWN_SCREEN_SCALE=2 \
TOKI_KNOWN_SCREEN_AUTO_CANDIDATES=0 \
npm run guidance:known-screen
```

Step 10.7.6 browser known-screen result:

- FreeLLMAPI and the Toki smoke server were already running locally.
- A ranked known-screen run through `freellmapi-dev` completed, but the provider selected a coarse browser/window candidate: `window at 0,0 1470x33`.
- The current macOS Accessibility path did not expose useful browser page controls in this session. The visible app list showed `firefox`, while `Microsoft Edge` and `Google Chrome` were not active process names; app-targeted browser probing failed through the AppleScript route.
- The OCR fallback path also failed on the current `/tmp/toki-known-screen.png` with Vision `nilError`. The Swift OCR helper was changed to use `CGImageSource` and return a cleaner error, but Vision still returned no candidates for that image.

Conclusion: Step 10.7.6 did not prove browser target accuracy. It proved the next blocker more precisely: candidate extraction for browser pages is not reliable enough yet. The next decision should be whether to build the native macOS AX bridge first or move to a browser-extension companion for exact DOM candidates.

Step 10.7.7 decision:

No current browser path is reliable enough to move into full real-action safety work.

What is reliable:

- FreeLLMAPI/Gemini is the best current development provider for comparison tests.
- The strict `GuidanceResult` validator prevents malformed or unsafe coordinates from rendering.
- Candidate ranking is the right shape for provider requests.

What is not reliable:

- AppleScript Accessibility does not consistently expose browser page controls.
- OCR is useful as a fallback, but the current Swift/Vision probe can fail on real captured images.
- Raw screenshot targeting still produces plausible-looking wrong targets.

Selected next direction:

Build Phase 10.8 as Browser Candidate Extraction before Phase 11. The first implementation should be a browser extension companion because it can expose exact DOM candidates: visible text, ARIA labels, roles, bounding boxes, URL, and scroll context. Keep native macOS AX and OCR as fallback sources, not the primary browser strategy.

Step 10.8.5 known-screen browser candidate result:

```bash
TOKI_BROWSER_CANDIDATE_PAYLOAD=apps/browser-extension/fixtures/bridge-payload.json \
TOKI_KNOWN_SCREEN_IMAGE=/tmp/toki-known-screen.png \
TOKI_KNOWN_SCREEN_SCALE=2 \
TOKI_KNOWN_SCREEN_GOAL="Click Create project" \
npm run guidance:known-screen
```

Result:

- candidate source: `browser-extension`
- candidates sent: `1`
- provider: `freellmapi-dev`
- mode: `real`
- target: `Create project at 100,100 120x40`
- risk: `safe_navigation`
- confirmation: `false`

This proves the provider can choose from exact DOM candidates when the extension payload is supplied. It does not yet prove live desktop ingestion or real SaaS-page candidate quality.

Step 10.8.8 live bridge result:

The smoke server was restarted with the local FreeLLMAPI unified key, the browser candidate fixture was posted to `/api/browser-candidates/latest`, and the known-screen runner was executed without `TOKI_BROWSER_CANDIDATE_PAYLOAD`.

Result:

- candidate source: `browser-extension`
- candidates sent: `1`
- provider: `freellmapi-dev`
- mode: `real`
- target: `Create project at 100,100 120x40`
- risk: `safe_navigation`
- confirmation: `false`

This proves the local live bridge works for the controlled fixture path. The remaining product test is a real browser page where the extension popup collects candidates from the page and sends them to the bridge.
