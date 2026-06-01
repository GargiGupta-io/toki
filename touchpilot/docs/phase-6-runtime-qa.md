# Phase 6: Runtime QA And Hardening

Phase 6 makes the Phase 5 guidance loop testable and harder to break before real AI providers, gesture controls, or the fluid water puck are added.

The goal is not to add a major new user-facing feature. The goal is to prove that the app can handle good guidance, risky guidance, invalid guidance, capture errors, resize/calibration changes, and repeatable verification in a way we can trust.

## Scope

Phase 6 covers runtime quality for the current desktop app:

- AI guidance schema validation
- accepted guidance state
- rejected guidance state
- risky-action confirmation display
- capture refresh loading and error states
- screenshot metadata request boundaries
- overlay coordinate/calibration diagnostics
- repeatable manual and automated checks

Phase 6 does not cover:

- real AI provider integration
- evaluation metrics against labeled screenshots
- gesture recognition
- voice mode
- water puck animation
- full native installer/release QA

Those stay in later phases.

## Step Plan

1. Define Phase 6 runtime QA checklist.
2. Add AI validator unit coverage.
3. Add risky guidance fixture and confirmation QA path.
4. Add invalid guidance fixture and rejected-state QA path.
5. Harden guidance refresh state transitions.
6. Add viewport resize and calibration diagnostics.
7. Add desktop runtime smoke checklist.
8. Run full Phase 6 verification pass.
9. Document Phase 6 completion and deeplearn.

## Runtime Behaviors To Prove

### Valid Guidance

The app should accept a valid `GuidanceResult` and render:

- pointer ring
- step bubble
- target label
- instruction
- risk class
- confirmation state
- confidence value in debug UI

Expected outcome:

- overlay state becomes `guiding`
- validation issue list is empty
- target coordinates come from the accepted guidance step

### Risky Guidance

The app should surface risky guidance differently from safe guidance.

Risk classes that must require confirmation:

- `external_send`
- `delete`
- `payment`
- `security_change`
- `account_change`
- `permission_change`
- `unknown_risky`

Expected outcome:

- validator rejects risky guidance if `requiresConfirmation` is false
- UI shows confirmation-required state when the risky step is valid
- confirm/decline controls become enabled only when confirmation is required

### Invalid Guidance

The app should reject malformed guidance before rendering it.

Invalid cases:

- missing result
- invalid mode
- empty summary
- guide mode without step
- non-finite confidence
- confidence below 0 or above 1
- unknown risk class
- risky action without confirmation
- non-finite target coordinates
- zero or negative target width/height

Expected outcome:

- `guidanceResult` is cleared
- validation issues are visible in the debug panel
- overlay state becomes `error`
- stale target data is not treated as accepted guidance

### Capture Failures

The app should show capture failures without crashing.

Expected outcome:

- capture error message is displayed
- overlay state becomes `error`
- refresh button is re-enabled after failure
- stale screenshot preview does not imply a new capture succeeded

### Calibration And Resize

The app should make coordinate mismatch visible.

Expected outcome:

- calibration readout shows overlay dimensions
- calibration readout shows display dimensions
- calibration status updates when dimensions mismatch
- notes explain whether overlay and display dimensions align

## Automated Checks

Minimum automated checks for Phase 6:

```bash
npm --workspace @touchpilot/ai run typecheck
npm --workspace @touchpilot/desktop run typecheck
npm --workspace @touchpilot/desktop run build
npm run check
cargo fmt --all --check
cargo test --workspace
```

Additional target for this phase:

- unit tests for `validateGuidanceResult()`

## Manual Smoke Checklist

Run the desktop app locally and verify:

- app opens without immediate runtime error
- refresh capture completes or shows a clear error
- screenshot preview appears when capture succeeds
- guidance request readout shows metadata-only screenshot context
- pointer ring appears at the mock target
- step bubble shows instruction and risk strip
- debug risk readout shows risk, confirmation, confidence, and mode
- pause/resume/stop buttons still change overlay state
- no obvious text overlap in the debug panel at desktop size

## Exit Criteria

Phase 6 is done when:

- validator has focused unit coverage
- safe, risky, and invalid guidance paths can be tested intentionally
- refresh state does not leave confusing stale state
- calibration/resize diagnostics are visible enough for QA
- runtime smoke checklist is documented
- full repo verification passes
- Phase 6 deeplearn doc is written and committed
