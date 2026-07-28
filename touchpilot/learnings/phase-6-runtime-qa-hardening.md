# Phase 6: Runtime QA And Hardening

> Phase 6 made TouchPilot's guidance loop testable, diagnosable, and harder to trust incorrectly before adding real AI, gestures, or fluid puck motion.

---

## In Plain English

Phase 6 was about making sure the assistant does not only work when everything goes perfectly.

Before this phase, TouchPilot could ask the mock AI layer for guidance, validate the response, and draw a target. That was enough to prove the basic loop. But production software needs more than a happy path. It needs to show what happens when guidance is safe, risky, invalid, loading, rejected, or affected by screen-size mismatches.

Think of this phase like crash-testing a car before painting it. We did not add the fluid water puck yet. We did not add real AI yet. Instead, we added controlled test modes and checks so we can repeatedly prove the assistant handles important runtime situations without lying to the user.

The main idea is simple: if TouchPilot has not accepted a valid guidance step, it should not point at anything. No stale pointer. No fake fallback target pretending to be AI output. No old screenshot preview implying a fresh capture succeeded. Phase 6 tightened those behaviors.

## What Is Runtime QA?

Runtime QA means checking how the app behaves while it is actually running.

Unit tests can prove a validator rejects bad data. TypeScript can prove the code shapes line up. Build commands can prove the project compiles. But runtime QA asks a different question:

> What does the user actually see when the app is loading, failing, resizing, or switching between safe/risky/invalid guidance?

For TouchPilot, runtime QA matters because the UI is an overlay that guides user action. If it points to the wrong thing, leaves stale information visible, or hides a risky confirmation requirement, the product becomes unsafe.

Phase 6 added a small QA system inside the prototype:

- a safe guidance fixture
- a risky guidance fixture
- an invalid guidance fixture
- validator unit tests
- a debug fixture switcher
- stricter accepted-target rendering
- live viewport/calibration diagnostics
- a manual smoke checklist
- a full verification pass

## The Problem It Solves

The Phase 5 guidance loop worked, but it still had a few production risks.

### Risk 1: Happy Path Bias

Plain English: if we only test the good answer, we do not know what happens when the assistant gives a bad one.

Technical detail: Phase 5 had a valid mock result. It did not have built-in ways to intentionally generate a valid risky result or an invalid rejected result from the UI.

Phase 6 fixed this by adding:

- `createRiskyMockGuidance()`
- `createInvalidMockGuidance()`
- a desktop fixture selector with `Safe`, `Risky`, and `Invalid`

### Risk 2: Stale Guidance

Plain English: old instructions should not stay on screen while the app is checking the screen again.

Technical detail: if refresh starts and old `guidanceResult` remains active, the pointer ring can stay visible even though the next result has not been accepted yet.

Phase 6 fixed this by clearing guidance state at refresh start:

```ts
setGuidanceIssues([]);
setGuidanceRequest(null);
setGuidanceResult(null);
setCaptureMetadata(null);
setScreenshotCapture(null);
setOverlayState("thinking");
```

### Risk 3: Invalid Guidance Showing A Fallback Target

Plain English: when guidance is rejected, the overlay should not quietly show a fake target.

Technical detail: the old prototype target was useful during early overlay work, but it became dangerous once validation existed. A rejected model result should render no pointer.

Phase 6 fixed this with `hasAcceptedGuidance`, so pointer and step bubble only render after a valid step with a target exists.

### Risk 4: Coordinate Drift Is Hard To See

Plain English: if the overlay size and captured display size do not match, the assistant may point in the wrong place.

Technical detail: Phase 6 added viewport metrics and calibration deltas so QA can see overlay/display mismatch directly in the debug panel.

## What We Built

Phase 6 built runtime QA support across three places:

1. The AI package got test fixtures and unit tests.
2. The desktop app got fixture controls, stricter state transitions, and live calibration readouts.
3. The docs got a manual runtime smoke checklist.

Key files:

| File | What changed |
|------|--------------|
| `touchpilot/packages/ai/src/index.ts` | Added risky and invalid mock guidance fixtures. |
| `touchpilot/packages/ai/src/index.test.ts` | Added Node test coverage for validator and fixtures. |
| `touchpilot/packages/ai/package.json` | Added AI test script using Node test runner and `tsx`. |
| `touchpilot/apps/desktop/src/App.tsx` | Added fixture switcher, refresh hardening, accepted-guidance guard, live viewport metrics. |
| `touchpilot/apps/desktop/src/App.css` | Styled fixture switcher and viewport readout. |
| `touchpilot/docs/phase-6-runtime-qa.md` | Added Phase 6 QA checklist and smoke runbook. |

## AI Fixtures

Plain English: fixtures are controlled fake answers that let us test specific situations.

Without fixtures, we would have to wait for a real AI provider to return a safe result, a risky result, or a bad result. That is slow and unreliable. Fixtures make the behavior repeatable.

### Safe Fixture

Plain English: this is the normal "everything is fine" guidance path.

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

The safe fixture returns a valid `GuidanceResult`. It places a target in the center of the captured display, gives confidence `0.82`, uses risk `safe_navigation`, and does not require confirmation.

This verifies the normal accepted guidance path:

```text
safe fixture -> validate -> valid -> render pointer ring + step bubble
```

### Risky Fixture

Plain English: this lets us test a dangerous action without doing a dangerous action.

```ts
export function createRiskyMockGuidance(request: GuidanceRequest): GuidanceResult {
  const targetWidth = 138;
  const targetHeight = 44;
  const x = Math.round(request.screen.display.width / 2);
  const y = Math.round(request.screen.display.height / 2 + 86);

  return {
    mode: "guide",
    summary: `Risky mock guidance for: ${request.goal}`,
    step: {
      instruction: "Review this payment action, then confirm before continuing.",
      target: {
        label: "Pay now",
        x,
        y,
        width: targetWidth,
        height: targetHeight,
      },
      confidence: 0.76,
      risk: "payment",
      requiresConfirmation: true,
    },
  };
}
```

Technical detail:

The risky fixture is valid guidance. It uses `risk: "payment"` and `requiresConfirmation: true`, so the validator accepts it.

This verifies the confirmation path:

```text
risky fixture -> validate -> valid -> render target + enable confirmation controls
```

Important: this fixture is not testing whether payment detection is accurate. It is testing whether the app responds correctly when a valid risky step is provided.

### Invalid Fixture

Plain English: this intentionally broken answer proves the app rejects bad guidance.

```ts
export function createInvalidMockGuidance(request: GuidanceRequest): GuidanceResult {
  return {
    mode: "guide",
    summary: `Invalid mock guidance for: ${request.goal}`,
    step: {
      instruction: "This intentionally invalid fixture should be rejected.",
      target: {
        label: "Broken target",
        x: Number.NaN,
        y: Math.round(request.screen.display.height / 2),
        width: 0,
        height: 44,
      },
      confidence: 1.4,
      risk: "payment",
      requiresConfirmation: false,
    },
  };
}
```

Technical detail:

The invalid fixture fails for multiple reasons:

- confidence is `1.4`, outside the `0..1` range
- risk is `payment`
- `requiresConfirmation` is false
- target x is `NaN`
- target width is `0`

The expected validation issue paths are:

```text
step.confidence
step.requiresConfirmation
step.target.x
step.target
```

This verifies the rejection path:

```text
invalid fixture -> validate -> invalid -> clear guidance -> show validation issues -> error state
```

## Validator Tests

Plain English: these tests are a checklist that proves bad guidance is rejected before the UI can trust it.

Phase 6 added Node's built-in test runner with `tsx`, so TypeScript tests can run without adding a heavy framework.

The package script:

```json
{
  "scripts": {
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
    "typecheck": "tsc --project tsconfig.json"
  }
}
```

Technical detail:

The tests live in:

```text
touchpilot/packages/ai/src/index.test.ts
```

The test suite covers:

- safe fixture is valid and centered
- risky fixture is valid and confirmation-gated
- invalid fixture is rejected with expected issue paths
- missing result is rejected
- guide mode without step is rejected
- unknown mode and empty summary are rejected
- confidence outside `0..1` is rejected
- unknown risk class is rejected
- risky guidance without confirmation is rejected
- risky guidance with confirmation is accepted
- non-finite target geometry is rejected
- zero or negative target size is rejected

Example:

```ts
test("createInvalidMockGuidance returns a rejected QA fixture", () => {
  const result = createInvalidMockGuidance({
    goal: "Force a rejected guidance state.",
    screen: {
      display: {
        id: "display-1",
        width: 1440,
        height: 900,
        scaleFactor: 1,
      },
    },
  });

  const validation = validateGuidanceResult(result);

  assert.equal(validation.valid, false);
  assert.deepEqual(
    validation.issues.map((issue) => issue.path),
    [
      "step.confidence",
      "step.requiresConfirmation",
      "step.target.x",
      "step.target",
    ],
  );
});
```

Technical detail:

This test does not just check that invalid guidance fails. It checks the exact issue paths. That matters because the debug UI depends on useful issue paths for diagnosis.

## Desktop Fixture Switcher

Plain English: the debug panel now has buttons that let QA choose what kind of answer the assistant should pretend to return.

The type:

```ts
type GuidanceFixture = "safe" | "risky" | "invalid";
```

The UI:

```tsx
<div className="fixture-switcher" aria-label="Guidance QA fixture">
  <span>Guidance fixture</span>
  <div>
    <button
      className="fixture-button"
      data-active={guidanceFixture === "safe"}
      type="button"
      onClick={() => onGuidanceFixtureChange("safe")}
    >
      Safe
    </button>
    <button
      className="fixture-button"
      data-active={guidanceFixture === "risky"}
      type="button"
      onClick={() => onGuidanceFixtureChange("risky")}
    >
      Risky
    </button>
    <button
      className="fixture-button"
      data-active={guidanceFixture === "invalid"}
      type="button"
      onClick={() => onGuidanceFixtureChange("invalid")}
    >
      Invalid
    </button>
  </div>
</div>
```

Technical detail:

The desktop app stores the selected fixture in React state:

```ts
const [guidanceFixture, setGuidanceFixture] = useState<GuidanceFixture>("safe");
```

Then refresh chooses the mock generator:

```ts
const nextGuidance =
  guidanceFixture === "invalid"
    ? createInvalidMockGuidance(nextGuidanceRequest)
    : guidanceFixture === "risky"
      ? createRiskyMockGuidance(nextGuidanceRequest)
      : createMockGuidance(nextGuidanceRequest);
```

This gives QA a stable way to test:

- accepted safe guidance
- accepted risky guidance
- rejected invalid guidance

## Refresh State Hardening

Plain English: when the app starts refreshing, it clears old guidance so the user does not see stale instructions.

The refresh start now does this:

```ts
setIsRefreshingCapture(true);
setCaptureError(null);
setGuidanceIssues([]);
setGuidanceRequest(null);
setGuidanceResult(null);
setCaptureMetadata(null);
setScreenshotCapture(null);
setOverlayState("thinking");
```

Technical detail:

This sequence prevents stale UI:

- old validation issues disappear
- old request disappears
- old accepted result disappears
- old capture metadata disappears
- old screenshot preview disappears
- state visibly changes to `thinking`

If capture fails, the app clears guidance again:

```ts
setCaptureError(message);
setGuidanceRequest(null);
setGuidanceIssues([]);
setGuidanceResult(null);
setOverlayState("error");
```

This is important because a capture failure means the app does not have a fresh screen. It should not keep pointing at a target from a previous screen.

## Accepted Guidance Guard

Plain English: no accepted target means no pointer.

Phase 6 added explicit accepted-target logic:

```ts
const activeStep = guidanceResult?.step ?? null;
const acceptedStep = activeStep?.target != null ? activeStep : null;
const acceptedTarget = acceptedStep?.target ?? null;
const hasAcceptedGuidance = acceptedTarget != null;
const activeTarget: RenderedGuidanceTarget =
  acceptedTarget != null && acceptedStep != null
    ? {
        ...acceptedTarget,
        instruction: acceptedStep.instruction,
      }
    : testTarget;
```

Technical detail:

The old `testTarget` still exists as a fallback object, but the important part is the render guard:

```tsx
{overlayState !== "idle" && hasAcceptedGuidance && (
  <>
    <PointerRing target={activeTarget} />
    <StepBubble step={activeStep} target={activeTarget} guidance={guidanceResult} />
  </>
)}
```

This means:

- safe valid guidance renders
- risky valid guidance renders
- invalid guidance does not render
- loading state does not render stale target
- capture failure does not render stale target
- idle state does not render target

This is a safety fix, not just a UI cleanup.

## Live Viewport And Calibration Diagnostics

Plain English: the debug panel now shows whether the overlay window and captured display line up.

The viewport metrics:

```ts
type ViewportMetrics = {
  width: number;
  height: number;
  devicePixelRatio: number;
  updatedAt: string;
};
```

The collector:

```ts
function getViewportMetrics(): ViewportMetrics {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    updatedAt: new Date().toISOString(),
  };
}
```

The resize listener:

```ts
useEffect(() => {
  function handleResize() {
    setViewport(getViewportMetrics());
  }

  window.addEventListener("resize", handleResize);

  return () => {
    window.removeEventListener("resize", handleResize);
  };
}, []);
```

Technical detail:

The app no longer depends only on incidental rerenders to update overlay size. It stores viewport metrics in state, and the debug panel updates when the window resizes.

Calibration now receives both capture metadata and live viewport metrics:

```ts
function getCalibration(
  captureMetadata: CaptureMetadata | null,
  viewport: ViewportMetrics,
): CoordinateCalibration {
  const overlayWidth = viewport.width;
  const overlayHeight = viewport.height;
  const displayWidth = captureMetadata?.display.width ?? 0;
  const displayHeight = captureMetadata?.display.height ?? 0;
  const scaleFactor = captureMetadata?.display.scaleFactor ?? 1;
```

The mismatch note now includes actual delta and scale comparison:

```ts
notes:
  sizeMatches && scaleMatches
    ? "Overlay viewport matches captured display dimensions and scale."
    : `Overlay/display mismatch. Delta ${overlayWidth - displayWidth}, ${
        overlayHeight - displayHeight
      }; DPR ${viewport.devicePixelRatio} vs capture scale ${scaleFactor}.`,
```

This helps diagnose one of the hardest future problems: the model says "click x=500, y=300", but the overlay draws it in the wrong place because scale or dimensions do not match.

## Runtime Smoke Checklist

Plain English: the smoke checklist tells us exactly what to click and what should happen.

Phase 6 expanded:

```text
touchpilot/docs/phase-6-runtime-qa.md
```

The checklist covers:

- startup
- safe fixture
- risky confirmation path
- invalid rejection path
- refresh loading state
- viewport and calibration diagnostics
- overlay state controls
- capture error handling
- layout sanity

This matters because a checklist turns "looks good" into a repeatable process. Different sessions can run the same checks and compare results.

## Verification Pass

Plain English: Phase 6 ended only after the automated gates passed.

Commands that passed:

```bash
git status --short
npm --workspace @touchpilot/ai run test
npm --workspace @touchpilot/desktop run build
cargo fmt --all --check
npm run check
cargo test --workspace
```

Results:

- worktree was clean before verification
- AI tests passed: 12 tests
- desktop production web build passed
- Rust format check passed
- full TypeScript and Rust check passed
- Rust workspace tests passed

## Common Patterns

### Pattern 1: Controlled QA Fixtures

What it is for: testing runtime states without depending on real provider randomness.

The safe/risky/invalid fixtures let us force each behavior:

```text
Safe    -> accepted guidance
Risky   -> accepted guidance with confirmation
Invalid -> rejected guidance with validation issues
```

This pattern is useful anywhere AI output drives UI. Real AI is probabilistic. QA needs deterministic fixtures.

### Pattern 2: Accepted Data Gates Rendering

What it is for: making sure UI only renders trusted data.

The app computes:

```ts
const hasAcceptedGuidance = acceptedTarget != null;
```

Then renders pointer UI only when that is true.

This protects the user from stale data and rejected model output.

### Pattern 3: Clear On Refresh

What it is for: preventing old state from pretending to be new state.

At refresh start, the app clears old capture and guidance state. This makes the UI honest during loading.

### Pattern 4: Human-Readable Diagnostics

What it is for: making runtime mismatches visible without opening dev tools.

The debug panel shows:

- viewport size
- display size
- delta
- DPR
- capture scale
- calibration notes

This helps diagnose cross-platform screen-capture and overlay bugs.

## Edge Cases And Gotchas

### Gotcha 1: A Valid Shape Is Not Always A Safe Action

In plain English: the response can be well-formed and still require caution.

Technical cause: `payment` is a valid risk class, but it must require confirmation.

How to avoid: keep the validator rule that risky classes require `requiresConfirmation: true`.

### Gotcha 2: A Rejected Result Must Clear UI

In plain English: after a bad answer, showing the old answer is misleading.

Technical cause: React state persists until changed. If `guidanceResult` is not cleared, old accepted guidance can remain visible.

How to avoid: clear guidance state at refresh start and set `guidanceResult` to `null` when validation fails.

### Gotcha 3: Fallback Targets Can Become Dangerous

In plain English: a fake target is useful for early prototyping but unsafe once the app claims to validate guidance.

Technical cause: `testTarget` can fill UI fields even when no accepted guidance exists.

How to avoid: keep fallback data available for structure, but gate pointer and step bubble rendering behind `hasAcceptedGuidance`.

### Gotcha 4: Resizing Changes Calibration

In plain English: if the window changes size, the overlay coordinate map may no longer match the capture.

Technical cause: display dimensions, viewport dimensions, and device pixel ratio can diverge.

How to avoid: track viewport metrics in state and show delta/scale mismatch in the debug panel.

### Gotcha 5: Tests Do Not Replace Smoke Checks

In plain English: automated checks can prove code rules, but they cannot fully prove what the overlay looks like.

Technical cause: the app includes visual overlay behavior, screenshot previews, and layout constraints.

How to avoid: keep both automated tests and a manual runtime smoke checklist.

## How It Connects To Other Phases

Phase 6 is a gate before more exciting work.

It connects to:

- **Real AI providers**: fixtures prove the UI contract before provider output is connected.
- **Water puck phase**: animation can now attach to honest states like `thinking`, `guiding`, `error`, and accepted guidance.
- **Gesture phase**: gestures can trigger refresh, confirm, decline, pause, or stop against known state behavior.
- **Safety phase**: confirmation UI now has a valid risky path to build on.
- **Evaluation phase**: schema validation and runtime QA are separate from accuracy metrics, but both are needed.

## What Still Needs Future Work

Phase 6 did not solve everything.

Remaining future work:

- real provider adapters
- provider response schema parsing
- confidence calibration
- labeled screenshot datasets
- IoU and center-point metrics
- actual confirmation action handling
- capture permission UX
- multi-monitor coordinate validation
- full manual smoke run inside a live Tauri window
- visual regression checks with screenshots

## Quick Reference

### Fixture Meanings

| Fixture | Expected state | Expected UI |
|---------|----------------|-------------|
| Safe | `guiding` | Pointer and step bubble, no confirmation |
| Risky | `guiding` | Pointer and step bubble, confirmation required |
| Invalid | `error` | No pointer, no step bubble, validation issues visible |

### Important Commands

```bash
npm --workspace @touchpilot/ai run test
npm --workspace @touchpilot/desktop run typecheck
npm --workspace @touchpilot/desktop run build
npm run check
cargo fmt --all --check
cargo test --workspace
```

### Phase 6 Commits

```text
0c10365 docs: phase 6 runtime qa checklist
8c7109f test: cover guidance validator
563b3cd test risky guidance path
743019c test rejected guidance path
7fe9a66 harden guidance refresh state
efd1ffa add viewport calibration diagnostics
1ed15fe docs: add desktop smoke checklist
```

## Suggested Quiz Questions

1. Why does Phase 6 use safe, risky, and invalid fixtures instead of waiting for real AI output?
2. Why must pointer rendering be gated behind accepted guidance?
3. What is the difference between validation failure and capture failure in the UI?
4. Why does calibration need live viewport metrics?
5. Why do automated tests and manual smoke checks both matter for an overlay app?

---

*Generated: 2026-06-01 | Project: TouchPilot | Files: `packages/ai/src/index.ts`, `packages/ai/src/index.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/App.css`, `docs/phase-6-runtime-qa.md`*
