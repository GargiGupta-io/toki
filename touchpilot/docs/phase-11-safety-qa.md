# Phase 11 Safety QA

Use this checklist to verify the safety gate from Debug before closing Phase 11.

## Setup

1. Launch Toki in dev or release mode.
2. Open Debug from the menu bar.
3. Go to the `Guidance` tab.
4. Keep the `Safety Review` section visible.

## QA 1: Safe Guidance Allows

1. In Fixture Controls, choose `Safe`.
2. Click `Test guidance`.

Expected:

- Overlay shows normal guidance.
- Safety Review `Action` is `allow`.
- Safety Review `Reason` is `safe_navigation`.
- `Confirm` is `Not required`.

## QA 2: Risky Guidance Confirms

1. In Fixture Controls, choose `Risky`.
2. Click `Test guidance`.

Expected:

- Overlay does not show the target marker before acknowledgment.
- The focused top utility shows the warning and a `Show target` button.
- Overlay state is `Confirm`.
- Safety Review `Action` is `confirm`.
- Safety Review `Reason` is `risky_action`.
- `Risk` is `payment`.
- `Confirm` is `Required`.
- Clicking `Show target` reveals only the target ring and does not click or change the underlying app.

## QA 3: Invalid Guidance Blocks

1. In Fixture Controls, choose `Invalid`.
2. Click `Test guidance`.

Expected:

- Overlay does not show normal target guidance.
- Overlay state is `Error`.
- Safety Review `Action` is `block`.
- Safety Review `Reason` is `validation_failed`.
- Validation shows one or more issues.

## QA 4: Low Confidence Clarifies

1. In Fixture Controls, choose `Low confidence`.
2. Click `Test guidance`.

Expected:

- Overlay does not show a normal target.
- Safety Review `Action` is `clarify`.
- Safety Review `Reason` is `low_confidence`.
- Safety Review details include the confidence and minimum threshold.

## QA 5: Real Provider Smoke

1. Start the guidance smoke server if testing a real provider.
2. In Debug, click `Real smoke`.

Expected:

- Safety Review shows `allow`, `confirm`, `clarify`, or `block`.
- If provider output is invalid or unavailable, no confident target is shown.
- If provider output is strongly risky, the `Show target` gate appears and no marker is visible before acknowledgment.
- If provider output is an account or permission change, the marker appears immediately with a warning.

## Pass Criteria

Phase 11 safety QA passes when:

- safe guidance renders normally,
- account/permission guidance warns without blocking the marker,
- strong-risk guidance enters confirmation state with the marker hidden until `Show target`,
- invalid guidance is blocked,
- low-confidence guidance clarifies instead of rendering,
- Debug clearly explains every safety decision.
