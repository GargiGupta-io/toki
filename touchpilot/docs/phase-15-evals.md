# Phase 15: Evals

Phase 15 turns Toki's guidance quality into something measurable.

The goal is not to make the model perfect immediately. The goal is to stop relying only on screenshots and vibes when deciding whether a target, risk decision, or workflow result is improving.

## Why This Phase Exists

Toki now has:

- voice commands
- local/browser/screen candidates
- provider modes
- safety policy decisions
- workflow steps
- visual guidance

But we still need a repeatable way to answer:

- Did the target land on the right UI element?
- Did candidate ranking improve or regress?
- Did provider output pass validation?
- Did risky actions get classified correctly?
- Did a workflow step advance only when the expected screen state appeared?

Phase 15 creates that measurement layer.

## Product Rules

1. Evals should measure behavior, not fake correctness.
2. Known-screen fixtures must be deterministic.
3. Target annotations must include coordinates and expected labels.
4. Risk annotations must include expected safety action.
5. Scoring should report failures clearly enough to debug the pipeline.
6. Evals must not require paid provider access by default.
7. Provider-specific runs can be optional dev commands.

## Metrics

### Target Accuracy

Measure whether Toki's selected target matches the expected target.

Useful metrics:

- center distance
- center hit inside expected box
- Intersection over Union
- label match
- candidate id match when available

### Candidate Ranking

Measure whether the expected UI element appears near the top of ranked candidates.

Useful metrics:

- top-1 match
- top-3 contains expected candidate
- rank position
- source used: browser, accessibility, OCR, manual fixture

### Risk Classification

Measure whether safety policy returns the expected action.

Useful actions:

- `allow`
- `confirm`
- `clarify`
- `block`

### Workflow Verification

Measure whether a workflow step advances only when the expected UI state is visible.

Useful metrics:

- pass
- blocked
- completed
- false advance
- false block

## Step Plan

### Step 15.1: Evals Plan

Define this plan, update the roadmap, and record the learning. No runtime code changes.

### Step 15.2: Dataset And Annotation Schema

Add shared eval data contracts:

- eval case id
- screenshot path or fixture source
- command/goal
- expected target box
- expected label/candidate id
- expected safety action
- expected workflow result

Result: completed. `@toki/evals` now exports typed eval dataset contracts plus a small known-screen baseline dataset. The schema covers fixture sources, target annotations, ranking expectations, safety expectations, and workflow expectations.

### Step 15.3: Target Scoring Helpers

Add pure scoring helpers:

- center distance
- center hit
- IoU
- label/candidate match
- pass/fail thresholds

Result: completed. `@toki/evals` now exports pure target scoring helpers for center distance, center hit, IoU, normalized label match, candidate id match, and threshold-based pass/fail failure messages.

### Step 15.4: Candidate Ranking Eval

Score ranked candidates against expected annotations:

- top-1
- top-3
- rank position
- source breakdown
- missing candidate report

Result: completed. `@toki/evals` now exports candidate ranking helpers that find expected candidates, calculate top-1/top-3/max-rank status, report label mismatch, preserve rank positions, and summarize candidate sources.

### Step 15.5: Safety Policy Eval

Run risk fixtures through `evaluateSafetyPolicy()` and report:

- expected action
- actual action
- reason
- pass/fail

Result: completed. `@toki/evals` now exports safety scoring helpers that run the real `evaluateSafetyPolicy()` gate and compare actual policy action/risk against expected eval annotations.

### Step 15.6: Known-Screen Eval CLI

Add a CLI that runs deterministic known-screen fixtures and outputs a report.

It should not require a running desktop app.

Result: completed. `npm run qa:eval:known-screen` now runs the known-screen baseline dataset without launching the desktop app. It loads the browser fixture, normalizes older DOM textbox roles, scores target/ranking/safety annotations, prints pass/fail lines per case, and exits nonzero on failures.

### Step 15.7: Workflow Eval

Reuse Phase 13 workflow fixtures to score:

- next
- back
- blocked
- completed
- confirmation-required

Result: completed. `@toki/evals` now exports workflow scoring helpers for verification status/matched candidates and basic workflow transitions: next, back, blocked, completed, and confirmation-required.

### Step 15.8: Provider Comparison Harness

Optional provider runs:

- mock
- local Ollama
- FreeLLMAPI dev
- unavailable

Provider evals should be skippable when local servers or credentials are missing.

Result: completed. `@toki/evals` now exports provider comparison helpers for mock, local Ollama, FreeLLMAPI dev, and unavailable modes. Provider results can be marked `passed`, `failed`, or `skipped`, so missing local servers or credentials do not break deterministic eval runs.

### Step 15.9: Regression Report

Create a report format that is easy to read:

- summary table
- failed cases
- target coordinate deltas
- candidate rank changes
- safety mismatches

### Step 15.10: Phase Closure

Close Phase 15 when Toki has a deterministic eval baseline for target accuracy, ranking, safety, and workflow verification.

## Non-Goals

- Perfect live dashboard accuracy.
- Paid cloud-provider benchmark suite.
- Large screenshot dataset.
- Automated UI clicking.
- Real user telemetry.

Those come later after the local deterministic harness is trustworthy.
