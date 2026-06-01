# Phase 5: AI Guidance Loop

> Phase 5 turned TouchPilot from a screen-capture overlay into a guarded guidance loop that can ask for next-step advice, validate the result, and show a target safely.

---

## In Plain English

Phase 5 is the first version of the assistant brain loop.

Before this phase, TouchPilot could capture the screen and draw overlay pieces. That was useful, but it was still more like a visual prototype than an assistant. Phase 5 added the basic conversation between the desktop app and an AI guidance layer: the app gathers screen context, asks for guidance, receives a structured answer, checks whether that answer is safe and well-shaped, then shows the result as a pointer ring and instruction bubble.

Think of it like asking a helper, "What should I click next?" The helper is not allowed to answer in random text only. It must return a clean checklist: what mode it is in, what the instruction is, where the target is, how confident it is, and whether the action needs confirmation. If anything is missing or malformed, TouchPilot rejects it instead of drawing bad UI on the screen.

This matters because production assistants fail in expensive ways when their output is trusted blindly. A bad coordinate could highlight the wrong button. A missing confirmation flag could guide a user into sending, deleting, paying, or changing security settings without enough friction. Phase 5 builds the protective contract that future real AI providers must obey.

## What Is An AI Guidance Loop?

An AI guidance loop is the repeatable path from user goal to on-screen instruction.

In this project, the loop is:

1. The user wants help with the current screen.
2. The desktop app captures display and screenshot metadata.
3. The app builds a typed `GuidanceRequest`.
4. The AI package returns a typed `GuidanceResult`.
5. The app validates that result.
6. If valid, the overlay points to the target.
7. If invalid, the overlay enters an error state and shows validation issues.

The key idea is not "call an LLM" yet. The key idea is "define the contract that any LLM must satisfy before the overlay believes it." That contract is what lets us replace the mock guidance client later with OpenAI, local vision models, OCR, accessibility-tree reasoning, or a hybrid router.

## The Problem It Solves

Without a guidance loop, the overlay has no trusted source of truth.

The UI might show a fake target. The screen capture might exist, but nothing interprets it. A future AI response might come back as prose like "click the export button near the top right," but that is not enough for an overlay. The overlay needs actual numbers and safety labels:

- target x/y coordinates
- target width and height
- instruction text
- confidence score
- risk class
- confirmation requirement

Phase 5 solves this by creating a structured bridge between the screen capture side and the overlay rendering side.

It also solves the "bad AI output" problem early. The validator checks the response shape before the UI uses it. This is exactly where schema validation belongs: inside Phase 5, before real providers arrive.

Accuracy metrics are intentionally not in Phase 5. Accuracy metrics answer questions like "did the assistant point to the correct UI element?" That requires labeled datasets and expected boxes. Phase 5 only answers "is this response shaped safely enough for the overlay to consume?"

## What We Built

Phase 5 added four major things:

1. Shared guidance types in `packages/shared`.
2. A mock AI guidance client and validator in `packages/ai`.
3. Desktop wiring that builds a guidance request from real capture data.
4. Overlay/debug UI for target, validation, risk, and confirmation state.

The current flow is still mock-driven. That is intentional. The goal was to build the production boundary first, so real AI can plug into a disciplined interface instead of being wired straight into UI state.

## Key Files

| File | Role |
|------|------|
| `touchpilot/packages/shared/src/index.ts` | Defines the guidance request/result schema shared across packages. |
| `touchpilot/packages/ai/src/index.ts` | Creates mock guidance and validates guidance results. |
| `touchpilot/apps/desktop/src/App.tsx` | Calls capture commands, builds guidance requests, validates results, and renders guidance UI. |
| `touchpilot/apps/desktop/src/App.css` | Styles the target, step bubble, debug readouts, and confirmation states. |

## How It Works

### 1. Shared Guidance Schema

Plain English: this is the checklist the AI answer must follow.

```ts
export type GuidanceStep = {
  instruction: string;
  target?: TargetBox;
  confidence: number;
  risk: RiskClass;
  requiresConfirmation: boolean;
};

export type GuidanceResult = {
  mode: "guide" | "answer" | "clarify";
  summary: string;
  step?: GuidanceStep;
};
```

Technical detail:

`GuidanceResult` describes the whole AI response. It can be in `guide`, `answer`, or `clarify` mode. The actual actionable fields live inside `GuidanceStep`, not directly on `GuidanceResult`.

This distinction matters. In Step 8, the UI first tried to read `guidanceResult.risk`, `guidanceResult.confidence`, and `guidanceResult.requiresConfirmation`. TypeScript correctly rejected that. The schema says those fields belong to `guidanceResult.step`. That type error was useful because it prevented the UI from drifting away from the contract.

### 2. Risk Classes

Plain English: every guidance step gets a safety label.

```ts
export type RiskClass =
  | "safe_navigation"
  | "form_entry"
  | "external_send"
  | "delete"
  | "payment"
  | "security_change"
  | "account_change"
  | "permission_change"
  | "unknown_risky";
```

Technical detail:

The risk class is not just decoration. It controls whether a guidance step requires confirmation. Safe navigation can be shown directly. Destructive or external actions must be gated.

The important risky classes are:

- `external_send`
- `delete`
- `payment`
- `security_change`
- `account_change`
- `permission_change`
- `unknown_risky`

This creates a clear future path for guardrails. Later phases can make confirmation interactive, log decisions, require voice confirmation, or block execution entirely for certain classes.

### 3. Guidance Request Context

Plain English: the assistant gets enough information to reason about the screen, without sending unnecessary image data through the debug request object.

```ts
export type GuidanceRequest = {
  goal: string;
  screen: GuidanceScreenContext;
  previousStep?: GuidanceStep | null;
};

export type GuidanceScreenContext = {
  display: DisplayContext;
  capture?: CaptureMetadata;
  screenshot?: ScreenshotMetadata;
  calibration?: CoordinateCalibration;
};
```

Technical detail:

The request includes the user's goal, display metadata, capture metadata, screenshot metadata, calibration state, and the previous step. The screenshot field is `ScreenshotMetadata`, not `ScreenshotCapture`.

That is deliberate. `ScreenshotCapture` includes `imageBase64`. For debug visibility and provider boundary clarity, the guidance request snapshot uses metadata only:

```ts
function getScreenshotMetadata(screenshot: ScreenshotCapture): ScreenshotMetadata {
  return {
    source: screenshot.source,
    display: screenshot.display,
    cursor: screenshot.cursor,
    activeWindow: screenshot.activeWindow,
    capturedAt: screenshot.capturedAt,
    format: screenshot.format,
    byteLength: screenshot.byteLength,
    imageWidth: screenshot.imageWidth,
    imageHeight: screenshot.imageHeight,
  };
}
```

The actual screenshot preview still uses base64 in the desktop UI, but the request readout proves that the AI-facing request context is clean and metadata-only at this stage.

## Mock Guidance Client

Plain English: before using a real AI model, we use a predictable fake answer so the app flow can be built and tested.

```ts
export function createMockGuidance(request: GuidanceRequest): GuidanceResult {
  const targetWidth = 112;
  const targetHeight = 48;
  const x = Math.round(request.screen.display.width / 2);
  const y = Math.round(request.screen.display.height / 2);

  return {
    mode: "guide",
    summary: `Mock guidance for: ${request.goal}`,
    step: {
      instruction: "Click the highlighted target to continue.",
      target: {
        label: "Mock target",
        x,
        y,
        width: targetWidth,
        height: targetHeight,
      },
      confidence: 0.82,
      risk: "safe_navigation",
      requiresConfirmation: false,
    },
  };
}
```

Technical detail:

The mock client centers a target on the captured display dimensions. This proves that the guidance layer is using real screen context rather than a hardcoded target. It returns a valid `GuidanceResult` with a step, target, confidence, risk class, and confirmation flag.

The confidence score is not an accuracy metric yet. It is a schema field and display value. Later evaluation phases will measure whether confidence is calibrated against actual correctness.

## Schema Validation

Plain English: the validator is the bouncer at the door. If the AI answer is malformed or unsafe, it does not get into the overlay.

```ts
export function validateGuidanceResult(
  result: GuidanceResult | null | undefined,
): GuidanceValidationResult {
  const issues: GuidanceValidationIssue[] = [];

  if (result == null) {
    return {
      valid: false,
      issues: [{ path: "result", message: "Guidance result is missing." }],
    };
  }

  if (!["guide", "answer", "clarify"].includes(result.mode)) {
    issues.push({ path: "mode", message: "Guidance mode is not recognized." });
  }

  if (result.summary.trim().length === 0) {
    issues.push({ path: "summary", message: "Guidance summary is required." });
  }
```

Technical detail:

The validator starts with top-level shape checks:

- result must exist
- mode must be one of the known modes
- summary must not be empty
- guide mode must include a step

Then it validates the step:

```ts
if (result.step != null) {
  const { confidence, requiresConfirmation, risk, target } = result.step;

  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    issues.push({
      path: "step.confidence",
      message: "Confidence must be a number from 0 to 1.",
    });
  }

  if (!validRiskClasses.includes(risk)) {
    issues.push({ path: "step.risk", message: "Risk class is not recognized." });
  }

  if (confirmationRequiredRisks.includes(risk) && !requiresConfirmation) {
    issues.push({
      path: "step.requiresConfirmation",
      message: "Risky guidance must require confirmation.",
    });
  }
}
```

This is the core guardrail in Phase 5.

It checks:

- confidence is finite
- confidence is between 0 and 1
- risk class is valid
- risky actions require confirmation

Then it checks the target box:

```ts
if (target != null) {
  const fields = ["x", "y", "width", "height"] as const;

  for (const field of fields) {
    if (!Number.isFinite(target[field])) {
      issues.push({
        path: `step.target.${field}`,
        message: "Target coordinates and size must be finite numbers.",
      });
    }
  }

  if (target.width <= 0 || target.height <= 0) {
    issues.push({
      path: "step.target",
      message: "Target width and height must be positive.",
    });
  }
}
```

This protects the overlay from invalid geometry. A target with `NaN`, `Infinity`, zero width, or negative height must not be rendered.

## Desktop Guidance Wiring

Plain English: the app captures the screen, asks for guidance, checks the answer, and then updates the overlay.

```ts
const [guidanceRequest, setGuidanceRequest] = useState<GuidanceRequest | null>(null);
const [guidanceResult, setGuidanceResult] = useState<GuidanceResult | null>(null);
const [guidanceIssues, setGuidanceIssues] = useState<GuidanceValidationIssue[]>([]);
```

Technical detail:

The desktop app tracks three separate guidance states:

- `guidanceRequest`: the exact request context sent to the mock client
- `guidanceResult`: the accepted guidance result after validation
- `guidanceIssues`: validation errors when the result is rejected

Keeping those separate is important. It lets the debug panel show what was requested and why a response was accepted or rejected.

The refresh flow:

```ts
const [metadata, screenshot] = await Promise.all([
  invoke<CaptureMetadata>("capture_metadata"),
  invoke<ScreenshotCapture>("capture_screenshot"),
]);

setCaptureMetadata(metadata);
setScreenshotCapture(screenshot);
const nextGuidanceRequest: GuidanceRequest = {
  goal: "Show me what to click next.",
  screen: {
    display: metadata.display,
    capture: metadata,
    screenshot: getScreenshotMetadata(screenshot),
    calibration: getCalibration(metadata),
  },
  previousStep: guidanceResult?.step ?? null,
};
const nextGuidance = createMockGuidance(nextGuidanceRequest);
const validation = validateGuidanceResult(nextGuidance);

setGuidanceRequest(nextGuidanceRequest);
setGuidanceIssues(validation.issues);
setGuidanceResult(validation.valid ? nextGuidance : null);
setOverlayState(validation.valid ? "guiding" : "error");
```

Technical detail:

The app uses Tauri `invoke` to request both metadata and screenshot data. It stores both for UI/debugging. Then it builds a `GuidanceRequest` with metadata-only screenshot context, calls the mock guidance client, validates the result, and only stores the result if valid.

This is the important safety behavior:

```ts
setGuidanceResult(validation.valid ? nextGuidance : null);
setOverlayState(validation.valid ? "guiding" : "error");
```

Invalid guidance cannot accidentally remain active.

## Overlay Rendering

Plain English: once guidance is valid, the app turns it into a target ring and instruction bubble.

```ts
const activeStep = guidanceResult?.step ?? null;
const activeTarget: RenderedGuidanceTarget =
  activeStep?.target != null
    ? {
        ...activeStep.target,
        instruction: activeStep.instruction,
      }
    : testTarget;
```

Technical detail:

The overlay prefers the validated AI target. If there is no active AI target, it falls back to the original test target. This keeps the prototype usable while the guidance loop is still incomplete.

The pointer ring receives a plain `TargetBox`:

```tsx
<PointerRing target={activeTarget} />
```

The step bubble receives both the target and the guidance result:

```tsx
<StepBubble step={activeStep} target={activeTarget} guidance={guidanceResult} />
```

That lets the bubble show instruction text and safety state in one place.

## Risk And Confirmation Display

Plain English: the user can see whether the assistant thinks the next action is safe or needs approval.

```tsx
const risk = guidance?.step?.risk ?? "safe_navigation";
const requiresConfirmation = guidance?.step?.requiresConfirmation ?? false;

<div
  className="risk-strip"
  data-confirmation={requiresConfirmation ? "required" : "not-required"}
>
  <span>{risk}</span>
  <strong>{requiresConfirmation ? "Confirm first" : "No confirmation"}</strong>
</div>
```

Technical detail:

The UI reads risk and confirmation state from `guidance.step`. It defaults to safe navigation only when there is no guidance yet. The `data-confirmation` attribute lets CSS style required-confirmation states differently.

The debug panel also exposes the raw values:

```tsx
<dl className="guidance-risk-readout">
  <div>
    <dt>Risk</dt>
    <dd>{guidanceResult?.step?.risk ?? "Waiting"}</dd>
  </div>
  <div>
    <dt>Confirm</dt>
    <dd>{guidanceResult?.step?.requiresConfirmation ? "Required" : "Not required"}</dd>
  </div>
  <div>
    <dt>Confidence</dt>
    <dd>
      {guidanceResult?.step
        ? `${Math.round(guidanceResult.step.confidence * 100)}%`
        : "Waiting"}
    </dd>
  </div>
  <div>
    <dt>Mode</dt>
    <dd>{guidanceResult?.mode ?? "Waiting"}</dd>
  </div>
</dl>
```

This is not final confirmation behavior. The confirm/decline buttons are present and disabled unless confirmation is required. Later phases will wire these buttons into state transitions and action authorization.

## Validation vs Evaluation Metrics

Plain English: Phase 5 checks whether the answer is safe to show, not whether it is correct in the real world.

Schema validation asks:

- Is the response shaped correctly?
- Are coordinates finite?
- Are width and height positive?
- Is confidence between 0 and 1?
- Is the risk class valid?
- Do risky actions require confirmation?

Evaluation metrics ask:

- Did the assistant point at the right UI element?
- Did the predicted box overlap the expected box?
- Did the center point land inside the expected target?
- Was the risk class correct?
- Was confidence calibrated?

Those are different jobs.

Phase 5 built schema validation. A later evaluation phase will build metrics such as:

- center-point hit test
- IoU
- center distance
- risk classification accuracy
- confidence calibration

This split is important. A response can be valid but wrong. For example, a box can have finite positive coordinates but still point to the wrong button. Phase 5 protects runtime stability. The eval harness will measure correctness.

## Verification Results

Phase 5 Step 9 completed a stronger verification pass.

Commands that passed:

```bash
npm --workspace @touchpilot/desktop run build
npm run check
cargo fmt --all --check
cargo test --workspace
```

Notes:

- `rustfmt` was missing from the local Rust toolchain.
- It was installed with `rustup component add rustfmt`.
- `cargo fmt --all --check` then found one formatting-only issue in `crates/capture/src/lib.rs`.
- `cargo fmt --all` fixed it.
- `cargo test --workspace` initially timed out while first-time test-profile compilation was happening and parallel cargo commands were waiting on locks.
- After serial reruns and cached compilation, the full workspace test pass succeeded.

## Common Patterns

### Pattern 1: Shared Types First

What it is for: make every package agree on the same shape before wiring behavior.

Phase 5 put guidance types in `@touchpilot/shared`, then consumed them from both `@touchpilot/ai` and `@touchpilot/desktop`.

This avoids having the AI package return one shape while the UI expects another. TypeScript becomes a contract checker across package boundaries.

### Pattern 2: Validate Before Rendering

What it is for: prevent malformed AI output from reaching the user interface.

The desktop app does not trust `createMockGuidance` directly. It validates first:

```ts
const validation = validateGuidanceResult(nextGuidance);
setGuidanceResult(validation.valid ? nextGuidance : null);
```

This pattern must stay even when the mock client is replaced with a real AI provider.

### Pattern 3: Metadata Boundary

What it is for: keep heavy image payloads separate from debug request state.

The app stores `ScreenshotCapture` for preview, but sends `ScreenshotMetadata` into the guidance request snapshot. This makes the request easier to inspect and keeps the base64 payload from spreading through the state model.

### Pattern 4: Step-Level Safety

What it is for: attach safety to the actual action, not the whole response.

Risk, confidence, and confirmation live on `GuidanceStep`. That makes sense because an answer mode might not have a clickable step. A clarify response might ask a question instead of pointing to a target. Safety belongs to the action being proposed.

## Edge Cases And Gotchas

### Gotcha 1: Risk Fields Are Step-Level

In plain English: the safety label belongs to the specific instruction, not the envelope around the answer.

Technical cause: `GuidanceResult` has `mode`, `summary`, and optional `step`. The `step` contains `confidence`, `risk`, and `requiresConfirmation`.

How to avoid: always access safety fields through `guidanceResult?.step?.risk`, `guidanceResult?.step?.confidence`, and `guidanceResult?.step?.requiresConfirmation`.

### Gotcha 2: Valid Coordinates Are Not Accurate Coordinates

In plain English: a clean-looking address can still point to the wrong house.

Technical cause: schema validation can check finite numbers and positive size, but it cannot know whether the target matches the intended button.

How to avoid: keep schema validation in Phase 5, then build a dedicated evaluation harness later with expected boxes and accuracy metrics.

### Gotcha 3: Base64 Screenshot Data Can Spread Too Easily

In plain English: once the full image string gets passed everywhere, every debug object becomes huge and harder to reason about.

Technical cause: `ScreenshotCapture` extends `ScreenshotMetadata` with `imageBase64`, so it is structurally compatible with places expecting metadata unless we explicitly strip it.

How to avoid: use `getScreenshotMetadata()` at the provider/request boundary.

### Gotcha 4: Cargo Commands Can Fight Over Locks

In plain English: running several Rust checks at the same time can make them wait on each other.

Technical cause: cargo uses shared package cache and artifact directory locks. Parallel test/check/fmt commands can block, and first-time test-profile compilation can be slow.

How to avoid: run expensive cargo verification serially when diagnosing failures or timeouts.

### Gotcha 5: Missing Toolchain Components Look Like Project Failures

In plain English: sometimes the project is fine but the local toolbox is incomplete.

Technical cause: `cargo fmt --all --check` failed because `cargo-fmt.exe` was not installed for `stable-x86_64-pc-windows-msvc`.

How to avoid: install missing Rust components with `rustup component add rustfmt`.

## How This Connects To Future Phases

Phase 5 is the foundation for several later phases.

- **Phase 6 Runtime QA**: now has a guidance loop to stress, inspect, and harden.
- **Phase 7 Water Puck**: can animate around real guidance states instead of fake-only overlay states.
- **Gesture phase**: can trigger guidance refresh, voice mode, pause, confirm, or next-step actions.
- **Safety phase**: can turn `requiresConfirmation` into real interaction gates.
- **Evaluation phase**: can test guidance targets against expected boxes.
- **Real AI provider phase**: can replace `createMockGuidance()` while keeping the same request/result contract.

## What Is Still Mocked

The AI client is still mocked.

That means:

- it does not inspect screenshot pixels
- it does not use OCR
- it does not call a real LLM
- it does not detect actual UI elements
- it always returns a centered mock target

This is acceptable for Phase 5 because the purpose was not AI accuracy. The purpose was request construction, response validation, state wiring, safety fields, and rendering.

## Next Best Improvements

1. Add unit tests for `validateGuidanceResult()`.
2. Add a synthetic risky mock result to test confirmation UI.
3. Add a runtime QA checklist for capture failure, invalid guidance, window resize, and multi-monitor behavior.
4. Add provider interface boundaries before wiring a real model.
5. Add eval fixtures later with expected boxes and target labels.

## Quick Reference

### Key Terms

| Term | Plain English meaning | Technical meaning |
|------|------------------------|-------------------|
| Guidance request | The question TouchPilot asks the assistant | `GuidanceRequest` with goal and screen context |
| Guidance result | The assistant's structured answer | `GuidanceResult` with mode, summary, optional step |
| Guidance step | The actual next instruction | `GuidanceStep` with instruction, target, confidence, risk, confirmation |
| Target box | The rectangle to point at | `TargetBox` with x, y, width, height |
| Risk class | Safety label for the step | `RiskClass` union |
| Schema validation | Checking the answer is safe to consume | `validateGuidanceResult()` |
| Eval metrics | Checking whether the answer is correct | Later harness with IoU, hit test, distance, calibration |

### Essential Flow

```text
Tauri capture commands
        |
        v
CaptureMetadata + ScreenshotCapture
        |
        v
GuidanceRequest with ScreenshotMetadata
        |
        v
createMockGuidance()
        |
        v
validateGuidanceResult()
        |
        +--> valid   -> render target + step bubble + safety status
        |
        +--> invalid -> clear guidance + show validation issues + error state
```

### Commands Used For Verification

```bash
npm --workspace @touchpilot/desktop run build
npm run check
cargo fmt --all --check
cargo test --workspace
```

### Phase 5 Commits

```text
2cff4ac docs: define AI guidance phase
b27a22c shared guidance schemas
4d79394 mock guidance client
0100270 wire mock guidance request
6f693e4 render mock guidance target
99d4ade validate guidance results
a5d4989 guidance request screenshot context
29a9530 show guidance risk confirmation
dfa2067 format capture crate
```

---

## Suggested Quiz Questions

1. Why does Phase 5 use schema validation before rendering AI guidance?
2. What is the difference between schema validation and evaluation metrics?
3. Why do `risk`, `confidence`, and `requiresConfirmation` live on `GuidanceStep` instead of `GuidanceResult`?
4. Why does the guidance request use `ScreenshotMetadata` instead of `ScreenshotCapture`?
5. Which risk classes should force `requiresConfirmation: true`?

---

*Generated: 2026-06-01 | Project: TouchPilot | Files: `packages/shared/src/index.ts`, `packages/ai/src/index.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/App.css`*
