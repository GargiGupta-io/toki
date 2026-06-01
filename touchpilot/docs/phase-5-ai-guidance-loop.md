# Phase 5 AI Guidance Loop Foundation

Phase 5 connects captured screen data to guidance output. The goal is not to call a production model yet. The goal is to define the request and response contracts, add a mock guidance client, and feed validated target coordinates into the existing pointer ring and step bubble.

## Goal

Build the first AI guidance loop foundation:

1. define guidance request/response schemas,
2. add a mock guidance client in the AI package,
3. call the mock client from the desktop UI,
4. pass screenshot metadata into the request,
5. validate guidance output before rendering,
6. feed returned target coordinates into the pointer ring,
7. feed returned instruction text into the step bubble,
8. display risk and confirmation requirements.

## Why This Phase Matters

TouchPilot now has an overlay and real screenshots. The next product milestone is connecting those pieces:

```text
user goal
  -> screenshot context
  -> guidance request
  -> structured guidance response
  -> validated target
  -> overlay pointer and step bubble
```

This phase creates that loop without depending on an external model provider yet.

## Non-Goals

This phase should not add:

- real OpenAI/Anthropic calls,
- model gateway authentication,
- OCR,
- accessibility APIs,
- voice mode,
- camera gestures,
- automatic clicking,
- multi-step workflow planning.

Those come after the local guidance loop is stable.

## Request Shape

The guidance request should include:

```json
{
  "goal": "Show me what to click next",
  "screen": {
    "display": {
      "id": "primary",
      "width": 1920,
      "height": 1080,
      "scaleFactor": 1
    },
    "screenshot": {
      "format": "png",
      "imageWidth": 1920,
      "imageHeight": 1080,
      "byteLength": 123456
    }
  },
  "previousStep": null
}
```

The first implementation can omit full base64 image data from the mock request, but the schema should allow it later.

## Response Shape

The guidance response should be structured:

```json
{
  "mode": "guide",
  "summary": "You want to continue the workflow.",
  "step": {
    "instruction": "Click Export to continue.",
    "target": {
      "label": "Export",
      "x": 640,
      "y": 360,
      "width": 112,
      "height": 48
    },
    "confidence": 0.82,
    "risk": "safe_navigation",
    "requiresConfirmation": false
  }
}
```

The overlay should not render target guidance unless the response passes basic validation.

## Validation Rules

Minimum validation:

- mode must be known,
- summary must be present,
- guide mode must include a step,
- step confidence must be between 0 and 1,
- target x/y/width/height must be finite numbers,
- target width and height must be positive,
- risk must be one of the shared `RiskClass` values,
- risky steps should set `requiresConfirmation`.

## Mock Client

The first client should be deterministic.

Example:

```text
goal: "show me what to click"
response: target existing test coordinates
```

Why mock first:

- proves the UI data flow,
- makes tests deterministic,
- avoids provider keys,
- keeps safety validation separate from model behavior.

## Debug UI Requirements

The debug panel should show:

- guidance mode,
- confidence,
- risk class,
- confirmation requirement,
- target label,
- target coordinates,
- validation error if present.

## Done Criteria

Phase 5 is complete when:

- shared guidance request/response schemas exist,
- mock AI guidance client exists,
- desktop UI can request guidance,
- pointer ring uses returned target data,
- step bubble uses returned instruction data,
- risk/confirmation fields are visible,
- invalid guidance falls back safely,
- `npm run check` passes,
- desktop frontend build passes,
- Phase 5 docs and learning notes are saved.

## Suggested Step Order

1. Define this requirements doc.
2. Add guidance request and response schemas.
3. Add mock guidance client in `packages/ai`.
4. Wire desktop UI to request mock guidance.
5. Feed guidance target into pointer ring and step bubble.
6. Add validation and fallback state.
7. Include screenshot metadata in guidance request.
8. Add risk and confirmation UI fields.
9. Verify build and checks.
10. Document completion and deeplearn.
