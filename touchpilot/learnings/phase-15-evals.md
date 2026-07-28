# Toki Phase 15: Evals

## Step 15.1: Evals Plan

Phase 15 starts after Phase 14 closed visual polish.

The goal is to make Toki measurable.

Until now, a lot of quality checks were manual or fixture-specific:

- known-screen browser checks
- fallback candidate checks
- workflow known-screen checks
- visual motion checks
- manual visual review

Phase 15 turns the main guidance questions into repeatable scores:

- Did Toki choose the right target?
- How close was the target box?
- Did the expected candidate rank highly?
- Did safety policy return the right action?
- Did workflows advance or block correctly?
- Did provider changes improve or regress output?

## Why This Matters

Without evals, every provider/ranking/prompt change can feel like guesswork.

The product can look better but still click the wrong thing. A model can sound confident but return a bad coordinate. A workflow can look active but advance at the wrong time.

Evals give us a way to say:

```text
before change: target top-1 = 40%
after change:  target top-1 = 65%
```

or:

```text
this model improved labels but worsened coordinates
```

## Step 15.1 Outcome

Created the Phase 15 plan:

- `docs/phase-15-evals.md`
- `docs/roadmap.md`

## Step 15.2 Outcome

Added the first eval dataset and annotation schema:

- `packages/evals/src/schema.ts`
- `packages/evals/src/fixtures.ts`
- `packages/evals/src/index.ts`
- `docs/phase-15-evals.md`
- `docs/roadmap.md`

The schema defines what an eval case means before we start writing scoring code. Each case now has a stable id, a kind, a user goal, a fixture source, and expected results for target boxes, ranking, safety, or workflow status.

The first fixture dataset uses the known browser bridge payload. It gives us two controlled cases:

- `known-create-project-target`: safe navigation should rank and target `Create project`.
- `known-delete-project-risk`: delete guidance should rank the delete target but require confirmation.

This is intentionally small. The point is not broad accuracy yet; the point is to make future scoring deterministic.

## Why Step 15.2 Matters

Before this step, Toki had checks and manual QA, but no common shape for eval cases. Every future scorer would have needed to invent its own input format.

Now the eval package has a contract:

- where the input comes from
- what the user asked for
- which target is correct
- how close the returned box must be
- which candidate should rank highly
- what safety action is expected

That makes the next steps simpler. Target scoring, ranking scoring, safety scoring, and reports can all read the same dataset shape.

## Step 15.2 Tradeoffs

### TypeScript Schema First

We used TypeScript types instead of JSON Schema first.

Tradeoff: external tools cannot validate the dataset yet.

Benefit: the app packages get immediate editor/typecheck feedback while the schema is still changing.

### Known Fixture First

We started from a deterministic browser fixture instead of live desktop screenshots.

Tradeoff: it is less realistic.

Benefit: failures are repeatable. If scoring changes, we know whether the math changed instead of wondering whether the screen changed.

### Small Dataset First

The first dataset has only two cases.

Tradeoff: it does not prove broad product quality.

Benefit: each case is easy to understand, and the scorer behavior will be obvious when Step 15.3 adds metrics.

## Step 15.3 Outcome

Added target scoring helpers in `@toki/evals`:

- `packages/evals/src/targetScoring.ts`
- `packages/evals/src/index.ts`
- `docs/phase-15-evals.md`
- `docs/roadmap.md`

The new helpers can score an actual target against an expected annotated target using:

- center distance
- center hit inside the expected target box
- intersection-over-union
- normalized label match
- candidate id match
- threshold-based pass/fail messages

## Why Step 15.3 Matters

This is the first point where evals stop being just a data format and start becoming measurable.

Instead of saying "the target looks close", the eval package can now say:

```text
center distance: 12.4 px
IoU: 0.86
candidate match: yes
label match: yes
passed: true
```

That matters because guidance quality has to be judged by geometry, not vibes. A model can choose a target that sounds right but lands far away from the real button. These helpers make that difference visible.

## Step 15.3 Tradeoffs

### Strict Candidate And Label Matching

The helper currently fails when the candidate id or label does not match.

Tradeoff: this can be strict for provider outputs that only return coordinates.

Benefit: fixture-based evals stay honest. If the candidate id is known, the scorer should not silently accept the wrong element.

### Geometry Before Provider Quality

This step does not call retired local vision runtime, FreeLLMAPI, OCR, accessibility, or browser extension code.

Tradeoff: it does not improve real target accuracy by itself.

Benefit: it gives every future provider comparison the same measuring stick.

### Simple Failure Messages

The helper returns string failures instead of a richer report object.

Tradeoff: reports may need more structure later.

Benefit: the first CLI/report step can print useful failures immediately without extra formatting work.

## Step 15.4 Outcome

Added candidate ranking helpers in `@toki/evals`:

- `packages/evals/src/rankingScoring.ts`
- `packages/evals/src/index.ts`
- `docs/phase-15-evals.md`
- `docs/roadmap.md`

The new helpers can grade whether the expected UI candidate is present in a ranked candidate list:

- candidate found or missing
- actual rank
- top-1
- top-3
- within expected max rank
- normalized label match
- source breakdown
- failure messages

## Why Step 15.4 Matters

Target accuracy is not only about the final box. Before Toki asks a provider or chooses a target, it often has a ranked list of possible candidates from browser DOM, OCR, accessibility, or manual fixtures.

If the correct candidate is already ranked high, the provider has a much better chance of selecting the right target. If the correct candidate is missing or ranked low, the guidance result will probably be weak even if the model is good.

This step lets us measure that middle layer directly.

## Step 15.4 Tradeoffs

### Ranking Before Final Provider Output

This helper scores the candidate list, not the final guidance answer.

Tradeoff: it does not prove the provider selected the right final target.

Benefit: it tells us whether the candidate-ranking layer is helping or hurting before the provider sees the screen.

### Source Breakdown Is Simple

The helper counts candidates by `source` when available, otherwise by role.

Tradeoff: it is not a deep quality report yet.

Benefit: reports can quickly show whether a case was mostly DOM, OCR, accessibility, or manual data.

### Stable Ranking Rule

The helper uses explicit `rank.position` when present, otherwise it falls back to input order.

Tradeoff: bad input order can still create misleading results.

Benefit: fixture authors can use either already-ranked arrays or explicit rank metadata without changing the eval schema.

## Step 15.5 Outcome

Added safety policy eval helpers in `@toki/evals`:

- `packages/evals/src/safetyScoring.ts`
- `packages/evals/src/index.ts`
- `packages/evals/package.json`
- `docs/phase-15-evals.md`
- `docs/roadmap.md`

The new helpers call the real `evaluateSafetyPolicy()` function from `@toki/ai` and compare its output against the expected safety annotation in an eval case.

The score reports:

- expected action
- actual action
- expected risk
- actual risk
- policy reason
- confirmation requirement
- pass/fail
- failure messages

## Why Step 15.5 Matters

Toki should not only be accurate. It also has to be cautious.

If a provider points at the right button but the action is risky, the app should not treat that the same as a normal safe navigation target. Delete, payment, security, permission, account, and unknown risky actions need different behavior.

This step lets evals measure whether the safety layer made the right decision instead of only checking target geometry.

## Step 15.5 Tradeoffs

### Reuse The Real Policy

The eval helper calls `evaluateSafetyPolicy()` instead of duplicating the policy logic.

Tradeoff: the eval package now depends on `@toki/ai`.

Benefit: evals measure the actual policy gate used by the app. If runtime policy changes, safety evals automatically test the same rule.

### Action And Risk First

The helper currently checks expected action and risk.

Tradeoff: it does not yet score every detail string or policy message.

Benefit: the most important pass/fail behavior is covered first: allow, confirm, clarify, or block.

### Fixed Default Confidence Threshold

The helper defaults to `minConfidence: 0.5`.

Tradeoff: cases with different confidence requirements must pass an option.

Benefit: simple fixtures can run without repeating config in every case.

## Step 15.6 Outcome

Added the known-screen eval CLI:

- `packages/evals/src/knownScreenCli.ts`
- `packages/evals/src/fixtures.ts`
- `packages/evals/package.json`
- `package.json`
- `package-lock.json`
- `docs/phase-15-evals.md`
- `docs/roadmap.md`

The new command is:

```bash
npm run qa:eval:known-screen
```

It runs without launching the Toki desktop app. It loads the known browser fixture, normalizes older candidate roles, scores the target annotation, scores the candidate ranking annotation, scores the safety annotation, prints one pass/fail line per case, and exits with a failure code if any case fails.

Current result:

```text
[PASS] known-create-project-target
[PASS] known-delete-project-risk
Summary: 2/2 passed
```

## Why Step 15.6 Matters

This is the first complete eval loop in Phase 15.

Before this step, we had schema and scoring helpers, but no single command that a person could run to prove the pieces work together. Now there is a small deterministic check that answers:

- can the dataset load?
- can the fixture load?
- can targets be scored?
- can candidate ranking be scored?
- can safety policy be scored?
- does the command fail when expectations fail?

That gives us a base for future CLI expansion.

## Step 15.6 Tradeoffs

### No Desktop App Required

The CLI reads fixture files directly.

Tradeoff: it does not test live capture, overlay rendering, or provider calls.

Benefit: it is fast, deterministic, and useful in CI.

### Fixture Compatibility Layer

The CLI normalizes older `dom_textbox` roles to current `dom_input` or `dom_textarea` roles.

Tradeoff: the CLI contains fixture cleanup logic.

Benefit: old fixtures can keep running while shared schemas stay stricter.

### Risky Case Allows Top-3

The delete-project ranking expectation now allows max rank 3.

Tradeoff: the raw fixture order does not prove delete ranks first.

Benefit: the baseline CLI remains honest about raw fixture order while still proving that the risky candidate exists, is near the top, and is safety-gated.

## Step 15.7 Outcome

Added workflow eval helpers in `@toki/evals`:

- `packages/evals/src/workflowScoring.ts`
- `packages/evals/src/index.ts`
- `docs/phase-15-evals.md`
- `docs/roadmap.md`

The new helpers can score:

- workflow verification status,
- matched candidate ids,
- next movement,
- back movement,
- blocked status,
- completed status,
- confirmation-required blocking behavior.

## Why Step 15.7 Matters

Workflows are more complicated than one target.

For a workflow to be trustworthy, Toki has to know whether the current step passed, whether it moved to the next step at the right time, whether back went to the previous step, whether blocked really means blocked, and whether risky confirmation-required steps do not advance like normal safe steps.

This step gives Phase 15 a reusable measuring layer for those workflow behaviors.

## Step 15.7 Tradeoffs

### Helper First, CLI Later

This step adds reusable scoring helpers but does not yet expand the known-screen CLI to print workflow scores.

Tradeoff: users cannot run workflow evals through the new eval CLI yet.

Benefit: the workflow scoring rules are now isolated and typechecked before being wired into a broader report.

### Verification And Transition Are Separate

The helper separates "did this screen verification pass?" from "did the workflow move correctly?"

Tradeoff: reports have two result types to show.

Benefit: failures are easier to understand. A candidate may be missing, or the workflow may have moved incorrectly; those are different bugs.

### Confirmation Required Means Blocked

The transition helper treats confirmation-required as a blocking state until confirmation exists.

Tradeoff: this matches the current Phase 13/11 behavior, not every possible future UX.

Benefit: it preserves the current safety rule: risky workflow steps cannot advance as normal Next actions.

## Step 15.8 Outcome

Added provider comparison helpers in `@toki/evals`:

- `packages/evals/src/providerComparison.ts`
- `packages/evals/src/index.ts`
- `docs/phase-15-evals.md`
- `docs/roadmap.md`

The new helper layer can compare provider results for:

- `mock`
- `local-retired-local-vision-runtime`
- `freellmapi-dev`
- `unavailable`

Each provider/case result can be:

- `passed`
- `failed`
- `skipped`

The skipped state is important because local provider evals depend on optional developer setup. If retired local vision runtime, FreeLLMAPI, a local server, or a credential is missing, the eval harness should record that clearly without breaking the deterministic baseline.

## Why Step 15.8 Matters

Toki has multiple provider paths, and we already learned that each one behaves differently:

- mock is stable but not real intelligence,
- local retired local vision runtime is useful offline but weak with raw coordinates,
- FreeLLMAPI/Gemini is stronger for development comparison but depends on provider setup,
- unavailable is the honest state when nothing usable is configured.

This step gives Phase 15 a common result shape for comparing those modes without pretending that every machine has every provider ready.

## Step 15.8 Tradeoffs

### Pure Harness, Not Network Runner

This step does not call retired local vision runtime or FreeLLMAPI directly.

Tradeoff: it does not prove live provider accuracy by itself.

Benefit: the comparison logic is deterministic, typechecked, and can accept provider responses from any runner later.

### Skipped Is A First-Class Result

Provider runs can be marked skipped.

Tradeoff: a skipped provider is not a quality measurement.

Benefit: missing local servers or credentials do not make CI or local deterministic evals look broken.

### Target And Safety First

The provider comparison helper currently scores target and safety expectations.

Tradeoff: ranking/workflow provider comparison will need a later report layer.

Benefit: this covers the main provider question first: did this provider return a usable target, and did safety accept it correctly?

## Step 15.9 Outcome

Step 15.9 added regression report helpers for the eval package.

Files updated:

- `packages/evals/src/reporting.ts`
- `packages/evals/src/index.ts`
- `docs/phase-15-evals.md`
- `docs/roadmap.md`

Plain English: Toki can now turn raw eval results into a readable report. Instead of reading scattered pass/fail objects, we can produce one markdown-style summary that says how many cases passed, how many failed, which area failed, and why.

Technical view: `createEvalReport()` builds a report object with summary counts, `summarizeEvalReportCases()` counts pass/fail/skipped cases, and `formatEvalReport()` renders a compact table with target, ranking, safety, workflow, and provider columns. It also deduplicates failure messages so a failing case has one readable failure list.

## Why Step 15.9 Matters

The eval layer is only useful if failures are easy to understand.

Before this step, the project had separate scoring helpers:

- target scoring
- ranking scoring
- safety scoring
- workflow scoring
- provider comparison

Those are useful by themselves, but they are not a human-friendly regression report. Step 15.9 creates the first shared report shape so future CI or local commands can show one readable output instead of making us manually inspect each scoring result.

## Step 15.9 Tradeoffs

### Markdown First

The formatter produces markdown-style text.

Tradeoff: it is not a rich dashboard.

Benefit: it is simple, portable, easy to paste into GitHub, and works well for local terminal reports.

### Formatter Only

This step does not run evals itself.

Tradeoff: no new accuracy measurement was added.

Benefit: it keeps reporting separate from scoring and provider execution, so each piece stays easier to test and reuse.

### Single Case Shape

The report case can carry target, ranking, safety, workflow, and provider results together.

Tradeoff: some rows may have empty columns when a case only tests one area.

Benefit: one report can summarize mixed eval runs without creating a different report format for every eval type.

## Planned Measurement Areas

### Target Accuracy

Measure whether the selected target matches the expected UI element.

Signals:

- center distance
- center hit
- IoU
- label match
- candidate id match

### Candidate Ranking

Measure whether the correct candidate appears near the top of ranked candidates.

Signals:

- top-1
- top-3
- rank position
- source breakdown

### Safety Classification

Measure whether risky/safe guidance gets the right policy action.

Expected actions:

- `allow`
- `confirm`
- `clarify`
- `block`

### Workflow Verification

Measure whether workflows advance or block correctly based on expected screen state.

Signals:

- next
- back
- blocked
- completed
- false advance
- false block

## Tradeoffs

### Deterministic First

Start with known fixtures, not live random desktop state.

Tradeoff: less realistic.

Benefit: failures are repeatable and debuggable.

### Local First

Do not require paid providers by default.

Tradeoff: provider quality may be limited.

Benefit: the eval suite can run anytime.

### Small Dataset First

Start with a small set of high-quality annotated cases.

Tradeoff: not broad coverage.

Benefit: each failure is understandable.

## Step 15.10 Outcome

Step 15.10 closed Phase 15 as the deterministic eval foundation.

Closure checks:

- `npm --workspace @toki/evals run typecheck`
- `npm run qa:eval:known-screen`

Both passed.

Plain English: Toki now has a baseline measuring layer. It does not mean all future guidance is accurate, but it means we have a repeatable way to tell whether target scoring, candidate ranking, safety decisions, workflow checks, provider comparisons, and regression reports are improving or getting worse.

Technical view: Phase 15 now covers typed eval datasets, deterministic known-screen cases, target metrics, candidate ranking metrics, real safety-policy scoring, workflow scoring, optional provider comparison, and markdown-style report formatting.

## Phase 15 Closure Tradeoffs

### Foundation, Not Full Benchmark Suite

Phase 15 closes with a small deterministic baseline.

Tradeoff: this is not a large benchmark dataset across many apps and screens.

Benefit: failures are understandable, fast to reproduce, and suitable for local development.

### Deterministic First, Provider Optional

Provider comparison is available but skippable.

Tradeoff: a local eval run can pass without proving every live provider is available.

Benefit: the core suite can stay green without requiring paid keys, local model servers, or a browser session.

### Reports Are Readable, Not Automated Dashboards

The report output is markdown-style text.

Tradeoff: there is no web dashboard yet.

Benefit: it is easy to use in terminal output, GitHub comments, PR notes, and manual regression reviews.

## Next Direction

The next useful phase after Phase 15 is production readiness or broader benchmark expansion, depending on whether we want to ship the current Mac-first assistant or keep improving eval coverage first.

## Updates

- 2026-07-03 - Added Step 15.9 notes for regression report helpers and the markdown-first reporting tradeoff.
- 2026-07-03 - Closed Phase 15 after eval package typecheck and known-screen eval passed.
- 2026-07-10 - Added end-to-end guidance trace instrumentation and sanitized trace fixtures as the first accuracy-stabilization baseline after Phase 15.

## 2026-07-10 Guidance Trace Baseline

### In Plain English

Before this update, Toki could tell us the final target or final failure, but it could not reliably tell us where a request went wrong. A bad result might have started with the voice transcript, active-window selection, screenshot, candidate collection, provider response, coordinate mapping, validation, or overlay rendering. Those stages were visible in separate fields and logs, so two values shown in Debug could even belong to different requests.

The new guidance trace gives every request one identity. Think of it like a tracking number on a parcel: the same number follows the request from the moment speech becomes text until a target is either rendered or refused. Debug can now show the ordered journey instead of only the final symptom.

### The Shared Contract

`packages/shared/src/index.ts` now defines:

- `GuidanceTrace`
- `GuidanceTraceEvent`
- `GuidanceTraceStage`
- `GuidanceTraceStageStatus`
- `GuidanceTraceSource`

The eight stages are:

```text
transcript
  -> active_window
  -> screenshot
  -> candidates
  -> provider
  -> mapping
  -> validation
  -> render
```

Every event records its status, start time, completion time, duration, a short summary, and bounded structured details. Details are intentionally small. The trace records facts such as image dimensions, candidate count, provider name, and target box; it does not duplicate screenshot base64 data.

`VoiceTranscript`, `VoiceCommandRequest`, `GuidanceRequest`, and `GuidanceProviderResponse` can all carry the trace ID. That is the key continuity rule: the request does not get a new identity when it crosses a module boundary.

### Runtime Implementation

`apps/desktop/src/guidanceTrace.ts` is a pure helper module. It creates trace IDs, starts stages, completes stages, and finds existing stage events. Keeping this logic out of `App.tsx` prevents timestamps and event replacement rules from being rewritten at every call site.

`apps/desktop/src/App.tsx` now creates the ID when native transcription returns a final transcript. The ID is attached to the transcript and pending voice command, then reused when `refreshCaptureMetadata()` starts the guidance run. Manual, debug, and continued-session runs create their own trace with an explicit source.

The instrumentation wraps the existing flow without changing its decisions:

```text
voice transcript
  -> pending command with traceId
  -> refreshCaptureMetadata(traceId)
  -> active-window lookup
  -> screenshot capture
  -> candidate collection
  -> provider response with traceId
  -> coordinate mapping evidence
  -> schema and safety validation
  -> accepted target rendered or rendering skipped
```

If a stage throws, that stage is marked failed and later stages are marked skipped. This distinction matters. `provider failed` means a provider call was attempted and broke; `provider skipped` means an earlier capture failure prevented the call from happening.

### Debug Visibility

The Guidance tab now shows:

- trace ID
- trace source
- every recorded stage
- stage status
- stage summary
- stage duration

This makes accuracy work evidence-driven. For example, if a target is displaced, we can verify whether the screenshot crop was correct before changing coordinate math. If no target appears, we can see whether the provider returned nothing or whether validation refused a target that did exist.

### Sanitized Fixtures

`packages/evals/src/guidanceTraceFixtures.ts` adds two synthetic fixtures:

1. A complete voice-to-render success trace.
2. A provider/refusal trace where no target reaches rendering.

These fixtures use generic app names, commands, coordinates, and timestamps. They contain no real desktop screenshots, window titles, account data, or user content. Their purpose is to lock the trace shape before future regression tooling consumes real developer runs.

### Tradeoffs

#### Trace Before Accuracy Changes

This step does not improve target choice by itself.

Tradeoff: users see no immediate accuracy increase.

Benefit: every later accuracy change can be compared against the same request lifecycle, reducing blind patches and regressions.

#### Bounded Details Instead Of Full Artifacts

The trace stores metadata rather than full screenshots or raw model payloads.

Tradeoff: deep artifact inspection still needs the existing capture/provider debug fields.

Benefit: publishing debug snapshots remains much smaller and avoids copying sensitive image data into every trace event.

#### One Current Trace In Runtime State

The overlay currently exposes the latest trace, not an unbounded trace history.

Tradeoff: older runs are replaced in the live Debug window.

Benefit: normal runtime memory stays bounded. Persisted trace history can be added later through an explicit local QA recorder rather than accidental state growth.

### Verification

The following checks passed:

```text
npm --workspace @toki/shared run typecheck
npm --workspace @toki/evals run typecheck
npm --workspace @toki/desktop run typecheck
npm --workspace @toki/desktop run build
```

The dev app was relaunched so the Guidance tab can be checked with live requests. The critical acceptance rule is that a single request shows one unchanged trace ID from transcript through render or refusal.
