# Phase 13: Multi-Step Workflows

Phase 13 turns one-shot guidance into a guided sequence of steps.

## Goal

Toki should be able to help with a task that needs more than one click. Instead of returning one target and stopping, Toki should keep track of the current workflow, show the current step, verify that the screen changed after the user acts, and then move to the next step.

## Why This Phase Exists

The current guidance loop is mostly single-step:

```text
voice command
  -> capture screen
  -> choose one target
  -> show ring/cue
```

That is useful for "what should I click next?" but not enough for real workflows such as:

- creating a project,
- configuring an integration,
- exporting a report,
- changing a setting,
- filling a form,
- fixing a setup issue.

Those tasks need state. Toki needs to know what it already asked the user to do, what screen it expects after the user acts, whether the task is complete, and whether it should ask for confirmation before risky steps.

## Phase 13 Product Rule

Toki still does not click automatically.

Phase 13 is about planning, tracking, verification, and guidance. The user still performs the action. This keeps the app in the assistant category instead of turning it into an autonomous desktop agent too early.

## Workflow Shape

The target flow is:

```text
user command
  -> create workflow plan
  -> show current step target
  -> user clicks manually
  -> screen capture verifies result
  -> next step becomes active
  -> repeat until done or blocked
```

## Core Concepts

### Workflow Plan

A workflow plan is the whole task broken into steps.

Example:

```text
Goal: create a project
1. Click Create project
2. Enter project name
3. Choose environment
4. Click Save
```

### Current Step

The current step is the one Toki is guiding right now. The overlay should only show one active target at a time.

### Step Verification

After the user acts, Toki should re-capture the screen and check whether the expected change happened.

Examples:

- after clicking `Create project`, a dialog appears,
- after typing a name, the field contains text,
- after clicking `Save`, the project appears in a list.

### Blocked State

If Toki cannot verify progress, it should say the workflow is blocked instead of confidently continuing.

### Completion

When the final expected state is visible, the workflow should end and the puck should return to quiet mode.

## Phase 13 Steps

### Step 13.1: Workflow Contract

Define the plan shape, workflow states, safety rules, acceptance criteria, and non-goals.

Result: this document defines the Phase 13 workflow contract. The phase starts from the rule that Toki remains a manual-guidance assistant: it can plan, point, verify, and advance, but it does not click or type for the user.

### Step 13.2: Shared Workflow Schema

Add shared types for workflow plans, workflow steps, step status, verification expectations, and workflow runtime state.

Result: `@toki/shared` now defines the Phase 13 workflow contract: `WorkflowPlan`, `WorkflowStep`, `WorkflowStepStatus`, `WorkflowStatus`, `WorkflowVerificationExpectation`, `WorkflowVerificationResult`, and `WorkflowRuntimeState`. These types let the desktop runtime, Debug, provider/planner code, and future QA scripts talk about workflows in the same shape.

### Step 13.3: Mock Workflow Planner

Create a deterministic mock planner for controlled tasks such as `create project`, `open settings`, and `export report`.

Result: `@toki/ai` now exports `createMockWorkflowPlan()`. It returns deterministic shared `WorkflowPlan` objects for controlled goals: create project, open settings, and export/download report. Unknown vague goals return `null` instead of pretending Toki has a real planner.

### Step 13.4: Runtime Workflow State

Store the active workflow, current step index, previous step result, and blocked/completed state in the desktop runtime.

Result: completed. The desktop overlay runtime now owns a `WorkflowRuntimeState`, publishes it to Debug snapshots, and accepts debug-only commands to start or clear a deterministic mock workflow. This proves the runtime can hold an active plan without adding workflow controls to the user overlay yet.

### Step 13.5: Overlay Step Controls

Show minimal current-step UI near the cursor and add next/back/stop controls without turning the overlay into a dashboard.

Result: completed. The overlay can now show a compact workflow step cue with the current step number, title, instruction, and Back/Next/Stop controls. Workflow targets can drive the existing pointer ring and puck target vector, while screen verification remains deferred to Step 13.7.

### Step 13.6: Debug Workflow View

Add a Debug tab or section that shows the full workflow plan, current step, verification result, and blocked reason.

Result: completed. Debug now has a dedicated Workflow tab with mock workflow starters, current-step navigation, full plan summary, blocked reason, verification status, and a step-by-step plan list with active-step highlighting.

### Step 13.7: Step Verification Stub

Add a first verification path that checks expected labels/candidates on the next capture, using the Phase 12 screen-intelligence candidate map.

Result: completed. Workflow Next now captures the screen, collects Phase 12 candidates, checks the active step's expected labels/roles, and advances only when verification passes. Failed, blocked, manual, or unsupported verification updates workflow blocked state instead of pretending the step succeeded.

### Step 13.8: Manual Workflow QA

Run a controlled workflow against a known browser fixture or known app screen and record whether next/back/blocked/completion behavior works.

Result: completed. Added `npm run qa:workflow:known-screen` and recorded the result in `docs/phase-13-workflow-qa.md`. The controlled create-project workflow now verifies step 1, moves next, moves back, verifies step 2, blocks when the completion candidate is missing, and reaches completed state when a post-action candidate is supplied. Existing browser and OCR/AX fallback known-screen QA also passed.

### Step 13.9: Safety Integration

Make workflow steps respect Phase 11 safety: risky steps must require confirmation and invalid/unavailable guidance must block the workflow.

### Step 13.10: Phase Closure

Close Phase 13 if a controlled multi-step workflow works end to end, or escalate if verification/candidate accuracy blocks useful workflow behavior.

## Acceptance Criteria

Phase 13 is complete when:

- Toki has a shared workflow plan schema,
- the desktop runtime can hold an active workflow,
- Debug can show the full plan and current step,
- the overlay can guide one workflow step at a time,
- next/back/stop behavior works,
- at least one controlled multi-step workflow can be manually tested,
- verification failures become blocked state instead of fake progress,
- safety rules still apply to risky steps.

## Non-Goals

- no autonomous clicking,
- no autonomous typing,
- no long-term memory,
- no production workflow library,
- no full browser automation,
- no multi-app workflow planner yet,
- no paid provider requirement for the first workflow pass.

## Tradeoffs

### Mock Planner First

The first workflow planner should be deterministic and mockable.

Tradeoff: it will not understand arbitrary tasks yet.

Reason: workflow state is complex enough by itself. We should prove the runtime can track and verify steps before relying on a model to produce plans.

### Manual User Actions

The user still clicks and types.

Tradeoff: the app is less magical.

Reason: it is safer, easier to debug, and consistent with Toki's current product promise.

### Verification Before Automation

Toki should verify screen changes before advancing confidently.

Tradeoff: verification can fail even when the user did the right thing.

Reason: fake progress is worse. A blocked state is more honest than guiding the user from a stale assumption.

### Debug Visibility

Workflow internals should be visible in Debug.

Tradeoff: Debug gets more complex.

Reason: multi-step workflows will be hard to reason about without seeing the plan, active step, and verification result.
