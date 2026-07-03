# Phase 13.5: Click-Aware Step Advancement

Phase 13.5 lets Toki notice when the user clicks the highlighted target and then continue the workflow safely.

## Goal

Toki should be able to move from one guided step to the next after the user clicks the current target, without requiring the user to open Debug and press Continue.

The user still performs the click. Toki only observes that a click happened near the active target, verifies the screen changed, and then asks for the next step.

## Why This Phase Exists

Phase 13 proved that Toki can hold a workflow, show one step at a time, and verify screen changes. The missing product piece is that the loop is still manual:

```text
Toki shows a target
  -> user clicks it
  -> user opens Debug
  -> user presses Continue
  -> Toki recaptures and advances
```

That is useful for development, but not good enough for the real cursor companion experience.

The target product loop is:

```text
Toki shows a target
  -> user clicks it
  -> Toki detects the click near the target
  -> Toki waits briefly
  -> Toki recaptures the screen
  -> Toki verifies progress
  -> Toki shows the next target
```

## Product Rule

Toki still does not click, type, submit, delete, pay, or change settings for the user.

Click-aware advancement means Toki watches for the user's own click during an active guidance session. It does not mean Toki controls the mouse.

## Why The Overlay Cannot Handle This Alone

The overlay is intentionally click-through. That is what lets the user click the real app underneath the target ring.

Because the overlay is click-through, React does not receive normal pointer events for the desktop click. A click on the highlighted target goes to Edge, Finder, Chrome, Doppler, or whichever app is underneath.

So automatic step advancement needs a native listener outside the overlay.

## Selected Approach

Build a Mac-first native click listener that only arms during an active workflow step.

The listener should:

1. watch mouse-down coordinates globally,
2. ignore clicks when no guidance step is waiting,
3. compare the click to the active target box with padding,
4. emit a small event to the overlay when the click matches,
5. let the existing screen recapture and verification path decide whether to advance.

## Tradeoffs And Mitigations

### Privacy And Trust

Tradeoff: global click listening can feel sensitive.

Mitigation:

- only listen while Toki is actively waiting for a guided click,
- store only whether the click hit the current target,
- do not log raw click streams,
- show a clear runtime/debug status when click-aware mode is armed.

### False Triggers

Tradeoff: a nearby accidental click could advance the workflow.

Mitigation:

- accept only clicks inside the target box plus a small padding,
- require an active workflow/session status of `waiting_for_user`,
- recapture and verify the screen before moving forward,
- keep manual Continue as a fallback.

### Missed Clicks

Tradeoff: if target coordinates are imperfect, Toki may miss a valid user click.

Mitigation:

- use generous but bounded hit padding,
- clamp target boxes to the visible screen,
- show missed-click state in Debug,
- allow manual Continue if the user clicked correctly but Toki did not detect it.

### macOS Permissions

Tradeoff: native global click monitoring may require Accessibility/Input Monitoring permission.

Mitigation:

- start Mac-first because Mac is the product-feel platform,
- document the permission requirement clearly,
- fail gracefully with manual Continue if the permission is missing.

### Cross-Platform Cost

Tradeoff: macOS, Windows, and Linux need different native APIs.

Mitigation:

- define one shared desktop event contract,
- implement macOS first,
- add Windows/Linux adapters later without changing the React workflow logic.

## Alternatives Considered

### Manual Continue

The user clicks the target and then presses Continue.

Pros:

- safest,
- already works,
- no native permission.

Cons:

- slow,
- debug-like,
- not product-ready for multi-step guidance.

Decision: keep as fallback only.

### Voice Continue

The user says "done" or "next" after clicking.

Pros:

- fits voice-first interaction,
- avoids global mouse listening.

Cons:

- slower than natural clicking,
- can fail transcription,
- annoying for repeated steps.

Decision: useful fallback later, not the primary flow.

### Screen-Change Polling

Toki repeatedly captures the screen and guesses whether the user acted.

Pros:

- no global click listener,
- simple conceptually.

Cons:

- expensive,
- unreliable,
- can advance because of unrelated page changes.

Decision: not primary. Use recapture only after a likely click.

### Browser Extension Click Events

For browser workflows, the extension can report DOM click events.

Pros:

- precise inside supported browsers,
- can include element id/role/text,
- avoids OS-wide mouse hooks for browser tasks.

Cons:

- browser-only,
- requires extension install,
- does not work for desktop apps.

Decision: add later as a browser-specific accuracy layer.

### Accessibility Action Tracking

Use macOS Accessibility APIs to learn which UI element was activated.

Pros:

- richer than raw coordinates,
- can identify buttons and controls semantically.

Cons:

- permission-heavy,
- inconsistent across apps,
- more complex than coordinate hit testing.

Decision: later upgrade after coordinate click detection works.

## Phase 13.5 Steps

### Step 13.5.1: Click-Aware Contract

Document the product rule, selected approach, tradeoffs, mitigations, alternatives, and acceptance criteria.

Result: this document defines click-aware advancement as observation plus verification, not autonomous clicking.

### Step 13.5.2: Shared Click Event Schema

Add shared types for click-aware events:

- click coordinates,
- target id,
- hit/miss result,
- timestamp,
- source platform,
- permission state.

### Step 13.5.3: Runtime Armed State

Teach the desktop runtime when click-aware advancement is armed:

- active workflow exists,
- current step has a target,
- session is waiting for user action,
- safety policy allows the step to render.

### Step 13.5.4: macOS Native Click Listener

Add a Mac-first native listener that emits click coordinates while armed.

The listener must not block the click or consume it.

### Step 13.5.5: Target Hit Testing

Check whether the native click landed inside the active target box plus safe padding.

Misses should be ignored or reported in Debug, not treated as failure.

### Step 13.5.6: Auto-Continue On Verified Hit

If the click hits the target, wait briefly, recapture the screen, run the existing verification path, and then advance or block.

### Step 13.5.7: Debug And Settings Visibility

Show click-aware status:

- armed,
- permission missing,
- last click hit,
- last click missed,
- last verification result.

Settings should keep this simple. Debug can show the detailed state.

### Step 13.5.8: Manual QA

Run a known-screen workflow:

1. start a guided workflow,
2. click the highlighted target,
3. confirm Toki advances without pressing Debug Continue,
4. click outside the target,
5. confirm Toki does not advance,
6. revoke or deny permission if practical,
7. confirm manual Continue fallback still works.

### Step 13.5.9: Learning And Closure

Update learning docs with:

- why click-through overlay cannot directly receive clicks,
- why native observation is needed,
- permission implications,
- false-trigger mitigations,
- cross-platform adapter plan.

## Acceptance Criteria

Phase 13.5 is complete when:

- the click-aware contract is documented,
- shared event/state types exist,
- the runtime knows when click-aware mode is armed,
- macOS can observe a user click without blocking it,
- only clicks near the active target can trigger advancement,
- screen verification still decides whether the workflow advances,
- manual Continue remains available,
- Debug explains the last hit/miss/permission state,
- no autonomous clicking or typing is added.

## Non-Goals

- no autonomous clicking,
- no autonomous typing,
- no browser extension click tracking yet,
- no Windows/Linux listener yet,
- no Accessibility action tracking yet,
- no raw click history logging.

