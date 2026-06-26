# Voice Guidance Quality

Voice now reaches the guidance loop on Mac, but the visible target is still mock guidance. This phase turns the working voice pipe into a useful assistant path.

## Current Problem

The current path proves plumbing:

```text
push-to-talk
  -> local Whisper transcript
  -> guidance request
  -> mock guidance target
  -> ring / step cue
```

That is not enough for product acceptance. A user can say the right thing and still see a target that does not match the screen.

## Goal

Make spoken commands produce guidance that can be judged against the current screen.

The first target is not perfect AI. The first target is a repeatable QA loop that tells us whether guidance is useful or fake.

## Product Acceptance

Voice guidance passes when:

- a spoken command becomes the guidance goal
- a fresh screenshot is captured after the command
- the guidance request records transcript, capture metadata, and provider mode
- debug shows whether the result came from mock, fixture, or real provider
- the overlay only shows a target if validation passes
- the target is visually plausible for the current screen
- a tester can mark the result as useful or wrong

Voice guidance fails when:

- the command is heard but the target stays generic
- the mock fixture is presented as real guidance
- the target is off-screen or obviously unrelated
- debug does not show which provider produced the result
- a bad target still looks accepted

## Implementation Steps

### VG.1 Acceptance And Provider Mode

Add a clear guidance-provider mode:

```text
mock
real
unavailable
```

Debug should show this mode so testers never confuse mock guidance with real screen understanding.

Current status:

- `GuidanceProviderMode` is a shared type.
- Debug Guidance shows the current provider mode.
- Current provider mode is explicitly `mock`.
- Debug warns that mock guidance proves plumbing only and is not real screen understanding.

### VG.2 Debug Result Review

Add a compact result review area in Debug:

- transcript / goal
- provider mode
- target label
- target coordinates
- confidence
- risk
- validation status
- tester verdict: useful / wrong

This does not train a model yet. It gives us a way to judge results.

Current status:

- Debug Guidance now shows the submitted goal text instead of only saying a request exists.
- Debug Guidance shows the target label and target box in a compact result review area.
- A tester can mark the current result as `useful` or `wrong`.
- The verdict is local QA state for now; it is not stored as a training dataset yet.

### VG.3 Screenshot Payload Gate

Confirm that real guidance requests can include:

- transcript goal
- display metadata
- screenshot dimensions
- screenshot payload or local screenshot reference
- calibration status

If the payload is too large for the final provider, add a compression/downscale plan.

### VG.4 Real Provider Adapter Plan

Add the provider adapter behind a backend/proxy rule.

For local dev, a direct environment key can be used temporarily. For production, paid model calls go through a backend.

### VG.5 First Real Guidance Smoke Test

Run one controlled screen:

```text
open a known page
say "show me what to click next"
capture screenshot
ask provider for one target
render target
mark useful/wrong
```

The first result can be rough. The point is to stop pretending the mock target proves accuracy.

## Tradeoffs

| Choice | Why |
| --- | --- |
| Keep mock mode | Useful for plumbing and UI regression checks |
| Label provider mode clearly | Prevents fake acceptance |
| Add result review before real model work | Gives us a measurable way to judge quality |
| Backend/proxy for paid providers | Prevents API keys from shipping in the app |
| Voice remains primary | Gestures are still debug-first after M5 |

## Out Of Scope

This phase does not need:

- full multi-step planning
- OCR/accessibility fusion
- automatic clicking
- final safety confirmation UX
- perfect target accuracy

Those come after the first real guidance loop can be measured.
