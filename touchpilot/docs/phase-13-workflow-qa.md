# Phase 13 Workflow QA

This records the controlled workflow QA path for Phase 13.

## Current Scope

The current QA proves workflow state behavior against controlled candidate fixtures.

It does not prove live desktop product feel yet. Live overlay QA still needs a running Toki app and a real browser page.

## Commands

```bash
npm run qa:workflow:known-screen
npm run qa:browser:known-screen
npm run qa:fallback:known-screen
npm --workspace @toki/browser-extension run check
```

## Step 13.8 Result

`npm run qa:workflow:known-screen` passed.

The controlled workflow check verified:

- the create-project workflow has three steps,
- step 1 can verify the visible `Project name` candidate,
- Next moves to step 2,
- Back returns to step 1,
- step 2 can verify the visible `Environment selector` candidate,
- step 3 blocks when `Project created` is missing,
- step 3 can complete when a post-action `Project created` candidate is present,
- the workflow can reach completed state.

## Related Candidate QA

Browser fixture QA passed:

- `Create a project` ranks `Create project`,
- `Open settings` ranks `Open settings`,
- `Add notes` ranks `Add notes`,
- `Delete project` ranks `Delete project`.

Fallback OCR/Accessibility QA passed:

- `Download the report` ranks `Download`,
- `Invite a team member` ranks `Invite`,
- `Search for a project` ranks `Search`.

## Fix Found During QA

The checked-in browser fixture had a stale role for the environment selector:

- old: `dom_combobox`
- corrected: `dom_select`

The browser extension extraction code already emits `dom_select` for `<select>` elements, so the fixture was out of sync with the real extractor and shared candidate contract.

## Remaining Manual QA

Still required before Phase 13 closure:

- launch Toki,
- start a mock workflow from Debug,
- confirm the overlay cue appears near the cursor,
- confirm Back/Next/Stop are usable in the real window stack,
- confirm a live browser candidate payload can drive verification,
- record any native overlay click-through limitation.
