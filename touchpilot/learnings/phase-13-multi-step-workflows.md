# Phase 13: Multi-Step Workflows

> Phase 13 is about turning Toki from a one-target guide into a step-by-step workflow guide while keeping the user in control.

---

## In Plain English

Until now, Toki has mostly answered one question at a time: "what should I click next?" That is useful, but real tasks usually need multiple steps. Creating a project, exporting a report, connecting an integration, or changing a setting all require a sequence.

Phase 13 starts the move from one-shot guidance to workflow guidance. Toki should remember the current task, know which step is active, check whether the screen changed after the user acted, and then move to the next step.

The important product rule is that Toki still does not click for the user. It plans, points, verifies, and explains. The user still performs the action.

## What We Decided

Phase 13 should begin with a workflow contract before runtime code.

The first workflow system should be conservative:

- deterministic planner first,
- manual user actions,
- one active step at a time,
- verification before advancing,
- blocked state when verification fails,
- Debug visibility for the full plan.

This avoids turning Toki into an autonomous desktop agent before the targeting, safety, and verification layers are strong enough.

## Step 13.1 Result

Step 13.1 added `docs/phase-13-multi-step-workflows.md`.

That document defines:

- why multi-step workflows exist,
- the workflow plan shape,
- the current-step model,
- step verification,
- blocked/completed states,
- all Phase 13 steps,
- acceptance criteria,
- non-goals,
- tradeoffs.

## Key Tradeoff

The biggest tradeoff is choosing manual guided workflows before automation.

This is less flashy, but it is the right product step. Toki's promise is "guide me on my screen", not "take over my computer." Once workflow planning and verification work reliably, later phases can decide whether some actions should ever become automated.

## Updates

- 2026-07-03 - Step 13.1 created the Phase 13 workflow contract. The important decision is to keep Toki as a manual-guidance assistant while adding workflow planning, current-step state, verification, blocked state, and completion tracking.
- 2026-07-03 - Step 13.2 added the shared workflow schema. Toki now has common types for workflow plans, steps, statuses, verification expectations, verification results, and runtime state. The key decision is to model blocked and verification states from the beginning instead of treating a workflow as a simple list of instructions.
- 2026-07-03 - Step 13.3 added the deterministic mock workflow planner in `@toki/ai`. It creates controlled plans for create project, open settings, and export/download report, while returning `null` for vague unknown goals. This keeps Phase 13 honest: runtime workflow behavior can be tested without pretending arbitrary task planning is solved.
- 2026-07-03 - Step 13.4 wired workflow runtime state into the desktop overlay and Debug snapshot. Debug can start or clear a deterministic mock workflow, and the runtime records active, blocked, completed, and untested verification state without exposing workflow controls in the user overlay yet.
- 2026-07-03 - Step 13.5 added a compact workflow cue to the overlay. It shows the current step number, title, instruction, and Back/Next/Stop controls, and workflow targets can now drive the pointer ring and puck target vector. Verification is still intentionally separate so Toki does not pretend a step succeeded before checking the screen.
- 2026-07-03 - Step 13.6 added a dedicated Debug Workflow tab. It shows mock workflow starters, current-step navigation, the full plan summary, blocked reason, verification status, and a highlighted step list so workflow state is inspectable before screen verification is added.
- 2026-07-03 - Step 13.7 added the first workflow verification stub. Pressing Next now captures the screen, collects Phase 12 candidates, checks the current step's expected label/role, and only advances when that check passes. Failed or unsupported verification blocks the workflow, which is more honest than pretending a step succeeded.
- 2026-07-03 - Step 13.8 added controlled workflow QA. `npm run qa:workflow:known-screen` verifies next, back, blocked, and completed behavior against known candidate states. This also caught and fixed a stale browser fixture role: the environment selector should be `dom_select`, matching the extension extractor and shared candidate contract.
- 2026-07-03 - Step 13.9 integrated Phase 11 safety into workflows. Risky workflow steps now default to confirmation-required, the delete-project workflow provides a controlled risky plan, runtime Next blocks confirmation-required steps, and the overlay cue marks risky workflow steps instead of making them look like normal guidance.
- 2026-07-03 - Step 13.10 closed Phase 13 as the controlled multi-step workflow foundation. The phase now proves schema, deterministic plans, runtime state, Debug inspection, overlay step cues, next/back/stop, candidate verification, controlled QA, and risky-step safety gating. The explicit limitation is that arbitrary live dashboard accuracy is not solved by this phase; that remains browser-extension/provider/live QA work.
- 2026-07-04 - Added Phase 13.5: Click-Aware Step Advancement. This phase sits between manual workflows and later polish/eval work. The key idea is that Toki can observe the user's own click near the active target, wait briefly, recapture the screen, and use existing verification to decide whether to advance. It still does not click for the user. The main tradeoffs are privacy, false triggers, missed clicks, macOS permissions, and platform-specific native APIs. The selected mitigation is Mac-first native click observation only while a workflow is waiting for user action, target-box hit testing with padding, screen verification before advancing, Debug visibility, and manual Continue as fallback.
- 2026-07-04 - Implemented Phase 13.5 code. `@toki/shared` now has click-aware runtime types, the Rust desktop layer has a Mac-first CoreGraphics click monitor, and the React overlay arms that monitor only while an active workflow click target is visible and safe. A native click must land inside the target box plus padding before Toki waits briefly, recaptures the screen, and reuses the existing workflow verification path. Debug now shows armed state, target label, last click coordinates, hit/miss state, distance from target center, and the current message. The important product decision is unchanged: Toki observes the user's click and advances after verification; it does not click or type for the user. Manual runtime QA is still needed because compile checks cannot prove real desktop click timing and coordinate alignment.
