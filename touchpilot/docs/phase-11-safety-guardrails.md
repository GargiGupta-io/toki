# Phase 11: Safety And Guardrails

Phase 11 makes sure Toki does not confidently guide the user into risky actions without slowing down, explaining the risk, and asking for confirmation.

## Goal

Toki is a guidance assistant, not an automation bot. It can point at real UI targets, but the user stays in control. The safety layer exists so real voice/provider guidance does not become dangerous when the target is a destructive, financial, account, permission, or security action.

## Why This Starts Now

Phase 10 proved the provider pipeline can return real targets from screenshots, OCR, accessibility candidates, and browser DOM candidates. That means Toki is no longer only showing mock guidance.

Once guidance can be real, safety has to sit between the provider result and the overlay.

## Safety Rules

1. Safe navigation can show guidance immediately.
2. Form entry can show guidance, but should explain what will change.
3. Delete, send, pay, security, account, and permission actions require confirmation.
4. Unknown risky actions require confirmation.
5. Low-confidence guidance should ask for clarification instead of drawing a confident target.
6. Toki must never silently click for the user in this phase.
7. Toki must never hide that a target is risky.
8. Toki must prefer showing no target over showing an unsafe target.

## Risk Classes

These are the existing shared risk classes:

```text
safe_navigation
form_entry
external_send
delete
payment
security_change
account_change
permission_change
unknown_risky
```

## Confirmation Gate

Before a risky step is allowed through, the user should see:

1. the target/action Toki is about to guide toward,
2. why it might be risky,
3. what the user should verify manually,
4. a clear confirm action,
5. a clear cancel action.

For now, confirmation means "allow Toki to show the risky guidance target." It does not mean Toki clicks the target.

## Phase 11 Steps

### Step 11.1: Safety Contract

Write the safety rules, phase plan, and pass/fail acceptance criteria.

### Step 11.2: Shared Policy Types

Add shared safety policy types for decisions such as `allow`, `confirm`, `clarify`, and `block`.

Result: shared policy types now live in `@toki/shared`:

- `SafetyPolicyAction`
- `SafetyPolicyReason`
- `SafetyPolicyDecision`
- `SafetyPolicyInput`

These types define the contract for the later policy engine without changing runtime behavior yet.

### Step 11.3: Policy Engine

Add a pure safety policy engine that evaluates guidance result risk, confidence, target quality, and candidate metadata.

Result: `evaluateSafetyPolicy()` now lives in `@toki/ai`. It blocks unavailable or invalid provider results, asks for clarification when guidance is missing a target or below the confidence threshold, asks for confirmation for risky actions, and allows safe navigation or form-entry guidance.

### Step 11.4: Policy Tests

Add focused tests for safe navigation, form entry, delete/payment/security risks, unknown risks, and low-confidence outputs.

Result: `@toki/ai` tests now cover allow, confirm, clarify, and block outcomes for safe navigation, form entry, risky classes, unknown risk, low confidence, provider unavailability, validation failure, missing targets, invalid targets, missing steps, and clarify-mode responses.

### Step 11.5: Provider Integration

Run provider results through the safety policy before the overlay accepts them.

Result: real-provider guidance now runs through `evaluateSafetyPolicy()` before the overlay accepts the result. `allow` shows normal guidance, `confirm` enters `confirmation_required`, `clarify` hides the target and returns to idle, and `block` hides the target and enters error. Debug also receives the safety action and reason.

### Step 11.6: Confirmation UI

Add a small confirmation state in the user-facing overlay for risky guidance.

Result: the overlay now renders a compact confirmation cue when safety returns `confirm`. The target marker can remain visible for review, but the normal step cue is replaced with a "Confirm first" message and the puck does not send normal guidance droplets.

### Step 11.7: Debug Safety Review

Show policy decision, reason, risk class, and confirmation requirement in Debug.

Result: Debug now has a dedicated Safety Review section with action, reason, risk, confirmation requirement, policy message, and policy details. This makes manual QA easier because a tester can see exactly why guidance rendered, confirmed, clarified, or blocked.

### Step 11.8: Manual Safety QA

Run safe, risky, invalid, and low-confidence fixture paths.

Result: Debug fixture QA now covers all four safety outcomes. `Safe` should allow, `Risky` should confirm, `Invalid` should block, and `Low confidence` should clarify. The checklist lives in `docs/phase-11-safety-qa.md`.

### Step 11.9: Docs And Learning

Update safety docs, roadmap, and learning notes with what was actually built.

Result: safety documentation now summarizes the actual Phase 11 runtime behavior: provider results and mock fixtures both pass through the same policy gate, safe guidance can render normally, risky guidance enters confirmation, weak guidance clarifies, and invalid/unavailable guidance blocks.

### Step 11.10: Close Phase 11 Or Escalate

Close Phase 11 if risky guidance is confirmation-gated and unsafe results do not render as confident targets. If the policy cannot reliably classify browser actions, escalate browser candidate metadata before continuing.

Result: Phase 11 is closed. Risky guidance is confirmation-gated, low-confidence guidance clarifies, invalid or unavailable guidance blocks, Debug explains the decision, and Toki still does not click automatically. Browser target accuracy and richer candidate metadata remain important, but they are Phase 12 screen-intelligence work rather than a blocker for the safety gate.

## Closure Decision

Phase 11 closes as a safety-foundation phase.

What is done:

- one shared policy vocabulary exists: `allow`, `confirm`, `clarify`, and `block`,
- provider guidance passes through the policy gate before the overlay accepts it,
- mock fixtures also pass through the same gate for repeatable QA,
- risky guidance renders as a confirmation state instead of normal guidance,
- low-confidence guidance does not show a confident target,
- invalid and unavailable provider results remain blocked,
- Debug exposes the policy action, reason, risk, message, and details,
- manual QA has a repeatable checklist.

What is intentionally not solved here:

- final browser target accuracy,
- full OCR/accessibility/DOM candidate ranking,
- production legal/compliance policy,
- autonomous clicking or action execution.

## Acceptance Criteria

Phase 11 is done when:

- risky guidance requires confirmation before rendering as a normal target,
- low-confidence guidance asks for clarification or blocks,
- invalid/offscreen targets remain rejected,
- debug shows the safety decision clearly,
- manual QA covers safe/risky/invalid paths,
- Toki still does not click anything automatically.

## Non-Goals

- no autonomous clicking,
- no payment or destructive automation,
- no full legal/compliance engine,
- no production billing or abuse system,
- no final browser-extension production packaging.
