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
npm --workspace @toki/ai run typecheck
npm --workspace @toki/desktop run typecheck
npm --workspace @toki/desktop run build
npm run check
cargo fmt --all --check
cargo test --workspace
```

Additional target for this phase:

- unit tests for `validateGuidanceResult()`

## Desktop Runtime Smoke Checklist

Use this checklist whenever Phase 6 runtime behavior needs to be manually verified.

### Before Starting

Run the automated checks first:

```bash
npm --workspace @toki/ai run test
npm --workspace @toki/desktop run typecheck
npm --workspace @toki/desktop run build
npm run check
```

Then start the desktop app:

```bash
npm run desktop:dev
```

The app should open without a React error screen, Rust panic window, or immediate Tauri startup failure.

### Smoke 1: Initial Capture And Safe Guidance

1. Leave the guidance fixture set to `Safe`.
2. Click `Refresh capture`.
3. Wait for the button text to return from `Refreshing capture` to `Refresh capture`.

Pass criteria:

- State pill becomes `Guiding`.
- Capture status says `Capture ready`.
- Screenshot preview is visible when platform capture succeeds.
- `Guidance fixture` shows `Safe` as selected.
- Target readout shows an accepted target, not `None accepted`.
- Pointer ring appears.
- Step bubble appears.
- Step bubble risk strip says `safe_navigation`.
- Step bubble says `No confirmation`.
- Debug risk readout shows:
  - `Risk`: `safe_navigation`
  - `Confirm`: `Not required`
  - `Confidence`: `82%`
  - `Mode`: `guide`
- Confirm and Decline buttons are disabled.

Fail conditions:

- Pointer ring appears while target readout says `None accepted`.
- Validation issues appear for the safe fixture.
- Capture status says ready while screenshot/capture metadata are still waiting after refresh completes.

### Smoke 2: Risky Guidance Confirmation Path

1. Select `Risky` in the guidance fixture switcher.
2. Click `Refresh capture`.
3. Wait for refresh to finish.

Pass criteria:

- State pill becomes `Guiding`.
- Target label becomes `Pay now`.
- Pointer ring appears at the risky target.
- Step bubble instruction mentions reviewing a payment action.
- Risk strip says `payment`.
- Risk strip says `Confirm first`.
- Confirmation warning appears.
- Debug risk readout shows:
  - `Risk`: `payment`
  - `Confirm`: `Required`
  - `Confidence`: `76%`
  - `Mode`: `guide`
- Confirm and Decline buttons are enabled.
- Validation issues are not shown.

Fail conditions:

- Risky guidance is rejected.
- `payment` guidance appears without confirmation required.
- Confirm/Decline remain disabled for valid risky guidance.

### Smoke 3: Invalid Guidance Rejection Path

1. Select `Invalid` in the guidance fixture switcher.
2. Click `Refresh capture`.
3. Wait for refresh to finish.

Pass criteria:

- State pill becomes `Error`.
- Target readout says `None accepted`.
- Coordinate header says `Target: none accepted`.
- Pointer ring is not visible.
- Step bubble is not visible.
- Debug panel shows `Guidance rejected`.
- Validation issues include:
  - `step.confidence`
  - `step.requiresConfirmation`
  - `step.target.x`
  - `step.target`
- Confirm and Decline buttons are disabled.

Fail conditions:

- Invalid fixture renders a pointer ring.
- Invalid fixture renders a step bubble.
- Old safe/risky target remains visible after invalid refresh.
- Validation issues are empty for the invalid fixture.

### Smoke 4: Refresh Loading State

1. Select either `Safe` or `Risky`.
2. Click `Refresh capture`.
3. Watch the UI while refresh is in progress.

Pass criteria:

- State changes to `Thinking` during refresh.
- Refresh button is disabled while work is in progress.
- Target readout clears to `None accepted` or waiting state while new guidance is pending.
- Screenshot preview clears while new capture is pending.
- After success, state becomes `Guiding`.

Fail conditions:

- Old pointer target remains visible during refresh.
- Old screenshot preview implies the new capture already succeeded.
- Refresh button can be clicked repeatedly while already refreshing.

### Smoke 5: Viewport And Calibration Diagnostics

1. Start with a successful capture.
2. Resize the app window.
3. Watch the calibration and viewport readouts.

Pass criteria:

- Viewport width/height update after resize.
- DPR value is visible.
- Resized timestamp changes after resizing.
- Delta readout changes when viewport and captured display differ.
- Calibration status remains `aligned` only when viewport, display dimensions, and scale match.
- Calibration notes explain mismatch with dimension delta and DPR/capture scale comparison.

Fail conditions:

- Viewport readout does not change after resizing.
- Calibration says `aligned` while the viewport and capture display visibly differ.
- Calibration notes are blank during mismatch.

### Smoke 6: Overlay State Controls

1. Click `Pause`.
2. Click `Resume`.
3. Click `Stop`.
4. Use the debug state buttons to select `Listening`, `Thinking`, `Guiding`, `Paused`, and `Error`.

Pass criteria:

- Pause changes the state pill to `Paused`.
- Resume returns to `Guiding`.
- Stop moves to `Idle`.
- Debug state buttons update the assistant puck label.
- Idle hides pointer ring and step bubble.
- Error state does not create an accepted target by itself.

Fail conditions:

- State buttons break capture refresh.
- Idle still shows pointer ring or step bubble.
- Error state shows a stale accepted target after invalid guidance.

### Smoke 7: Capture Error Handling

This is platform-dependent and may require denying screen-capture permission, running in an unsupported environment, or temporarily forcing the capture command to fail during local debugging.

Pass criteria:

- Capture status says `Capture error`.
- Error message is visible.
- State pill becomes `Error`.
- Refresh button is re-enabled.
- Guidance request/result are cleared.
- Pointer ring and step bubble are not visible.

Fail conditions:

- App crashes instead of showing capture error.
- Refresh remains permanently disabled.
- Stale accepted guidance remains visible after capture failure.

### Smoke 8: Layout Sanity

Check at normal desktop size and a narrower window.

Pass criteria:

- Debug panel text does not overlap.
- Fixture buttons remain readable.
- Confirmation buttons fit their containers.
- Screenshot preview stays inside the debug panel.
- Step bubble text stays readable.
- Pointer ring does not resize surrounding layout.

Fail conditions:

- Text overlaps in the debug panel.
- Buttons clip labels.
- Screenshot preview pushes content into incoherent overlap.

## Exit Criteria

Phase 6 is done when:

- validator has focused unit coverage
- safe, risky, and invalid guidance paths can be tested intentionally
- refresh state does not leave confusing stale state
- calibration/resize diagnostics are visible enough for QA
- runtime smoke checklist is documented
- full repo verification passes
- Phase 6 deeplearn doc is written and committed
