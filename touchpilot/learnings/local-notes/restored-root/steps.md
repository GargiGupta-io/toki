# Steps Log - Toki

---

## Step 1 - Compact Top Utility Geometry
*Completed: 2026-07-10*

**What was built**
- `apps/desktop/src/topUtility.ts` - aligns the cursor leave boundary with the compact expanded utility size.
- `apps/desktop/src-tauri/src/lib.rs` - gives native peek and expanded modes explicit dimensions and resizes the utility to the compact height.
- `apps/desktop/src-tauri/tauri.conf.json` - starts the hidden utility window with the same compact expanded height.

**In plain English**
The expanded Toki utility now ends immediately after its visible controls instead of continuing into a large empty black area. Its visible content, native window, and cursor boundary agree on the same size, so the old oversized panel cannot remain behind the tabs.

**Files changed**
~ modified: apps/desktop/src/topUtility.ts
~ modified: apps/desktop/src-tauri/src/lib.rs
~ modified: apps/desktop/src-tauri/tauri.conf.json

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.
- `cargo check -p toki-desktop` passed.
- Production macOS app rebuilt, signed, and installed.
- Manual visual check confirmed the empty black area is gone.

---

## Step 13A.13 - Unified Top-Edge Utility Surface
*Completed: 2026-07-10*

**What was built**
- `apps/desktop/src/topUtility.ts` - defines reveal zones, dwell timing, panel bounds, and hidden/peek/expanded fallback rules.
- `apps/desktop/src-tauri/src/lib.rs` - resizes and positions one native utility window and switches its focus and click-through behavior by mode.
- `apps/desktop/src/App.tsx` - moves runtime status into the settings route and reuses the native cursor stream to reveal or collapse the surface.
- `apps/desktop/src/TokiTopUtilitySurface.tsx` - keeps one status header mounted and reveals tabbed Voice and Controls content inside it when expanded.
- `apps/desktop/src/TokiTopUtilitySurface.css` - gives compact and expanded modes one background, border, shadow, and top-attached geometry.
- `apps/desktop/src/App.css` - removes the obsolete standalone settings and status styles.
- `docs/phase-13a-living-visual-identity.md` - records the unified utility architecture and its cross-platform boundary.

**In plain English**
Toki no longer has one popup for status and another for settings. It now uses one top-center object that stays hidden while idle, briefly peeks out when Toki is listening or guiding, and keeps that exact header visible when it expands. Voice and Controls appear as tabs inside the same box, so expansion no longer looks like a different window replacing the status surface.

**Files changed**
+ created: apps/desktop/src/topUtility.ts
+ created: apps/desktop/src/TokiTopUtilitySurface.tsx
+ created: apps/desktop/src/TokiTopUtilitySurface.css
- deleted: apps/desktop/src/TokiTopStatus.tsx
- deleted: apps/desktop/src/TokiTopStatus.css
~ modified: apps/desktop/src-tauri/src/lib.rs
~ modified: apps/desktop/src/App.tsx
~ modified: apps/desktop/src/App.css
~ modified: docs/phase-13a-living-visual-identity.md

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.
- `npm --workspace @toki/desktop run build` passed.
- `cargo check -p toki-desktop` passed.
- Dev app relaunched for manual visual and interaction QA.
- No commit or push was made pending visual acceptance.

---

## Step 13A.12 - Gesture-Reactive Creature Motion
*Completed: 2026-07-10*

**What was built**
- `apps/desktop/src/gestureVisuals.ts` - converts existing hand landmarks into a bounded visual pull around the cursor.
- `apps/desktop/src/tokiCreatureState.ts` - carries gesture label, phase, and visual response through the creature contract.
- `apps/desktop/src/App.tsx` - sends deduplicated hand anchors to the overlay and reports gesture state in the top status surface.
- `apps/desktop/src/BlobPuck.tsx` - compresses for pinch, broadens for open palm, and follows the hand within safe screen bounds.
- `apps/desktop/src-tauri/tauri.conf.json` and `apps/desktop/src-tauri/src/lib.rs` - remove the native shadow around the transparent settings host window.

**In plain English**
Toki now reacts when it sees a pinch or open palm. The creature gently leans toward the hand while staying attached to the real cursor, compresses for a pinch, and opens outward for an open palm. The settings popup also no longer carries a large outline from its invisible native window.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.
- `cargo check -p toki-desktop` passed.
- Dev app relaunched for manual gesture and settings-window inspection.

**Commits**
- Not committed or pushed pending visual acceptance.

---

## Step 16.3 - App Identity And Bundle Metadata
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src-tauri/tauri.conf.json` - adds supported release bundle metadata for publisher, category, descriptions, and copyright.
- `apps/desktop/src-tauri/Cargo.toml` - replaces placeholder Rust package author metadata.
- `docs/phase-16-app-identity.md` - records the current Toki product identity, window-title rules, and stale artifact warning.
- `docs/phase-16-production-readiness.md` and `docs/roadmap.md` - record Step 16.3 progress.
- `learnings/toki/phase-16-production-readiness.md` - records the identity tradeoffs.

**In plain English**
Toki now has one cleaner release identity. The source metadata says Toki, the bundle identifier is `app.toki.desktop`, the publisher is `GargiGupta-io`, and old TouchPilot build files are treated as stale outputs that must be rebuilt, not renamed manually.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.
- `cargo check --workspace` passed.

---

## Step 16.2 - Release Build Inventory
*Completed: 2026-07-03*

**What was built**
- `docs/phase-16-release-build-inventory.md` - records current dev, web build, check, Mac release, full package, and Windows release commands.
- `docs/phase-16-production-readiness.md` - marks Step 16.2 complete and points to the inventory.
- `docs/roadmap.md` - records the Step 16.2 result.
- `learnings/toki/phase-16-production-readiness.md` - records the build-command tradeoffs and stale artifact finding.

**In plain English**
Toki now has a clear map of how to build and package the app. We know the fastest dev command, the frontend check, the Mac app-bundle release command, and the full release checkpoint command. We also found old Windows artifacts still named TouchPilot, which should be fixed in the next identity step rather than trusted as current releases.

**Verification**
- Read-checked package scripts, Tauri config, Windows build helper, and current local release artifacts.

---

## Step 16.1 - Production Readiness Plan
*Completed: 2026-07-03*

**What was built**
- `docs/phase-16-production-readiness.md` - defines the production-readiness goal, product rules, step plan, acceptance criteria, and non-goals.
- `docs/roadmap.md` - points Phase 16 at the new active plan and records Step 16.1.
- `learnings/toki/phase-16-production-readiness.md` - records the release-readiness tradeoffs.

**In plain English**
Phase 16 now has a clear plan before we start changing release behavior. The goal is to make Toki installable, trustworthy, diagnosable, and ready for a controlled Mac-first beta. This step does not change the app runtime yet; it defines the shipping checklist we will follow.

**Verification**
- Markdown read check passed for the new phase doc and roadmap section.

---

## Step 15.10 - Phase Closure
*Completed: 2026-07-03*

**What was built**
- `docs/phase-15-evals.md` - closes Phase 15 and records the passed closure checks.
- `docs/roadmap.md` - records the Phase 15 closure result.
- `learnings/toki/phase-15-evals.md` - records the closure tradeoffs and what the eval foundation means.

**In plain English**
Phase 15 is now closed as Toki's measurement foundation. Toki has a small repeatable way to check whether targets, rankings, safety decisions, workflows, providers, and regression reports are working. This does not prove every live app target is perfect, but it gives us a baseline so future changes can be measured instead of guessed.

**Verification**
- `npm --workspace @toki/evals run typecheck` passed.
- `npm run qa:eval:known-screen` passed.

---

## Step 15.9 - Regression Report
*Completed: 2026-07-03*

**What was built**
- `packages/evals/src/reporting.ts` - adds readable eval report creation, summary counting, markdown formatting, and failure detail collection.
- `packages/evals/src/index.ts` - exports the report helpers from `@toki/evals`.
- `docs/phase-15-evals.md` and `docs/roadmap.md` - record Step 15.9 progress.
- `learnings/toki/phase-15-evals.md` - records the regression reporting lesson.

**In plain English**
Toki can now turn eval results into a readable report. Instead of looking through separate target, ranking, safety, workflow, and provider outputs, we can see one summary table and one failure list. This makes regressions easier to understand when accuracy or safety gets worse.

**Verification**
- `npm --workspace @toki/evals run typecheck` passed.

---

---

## Step 15.8 - Provider Comparison Harness
*Completed: 2026-07-03*

**What was built**
- `packages/evals/src/providerComparison.ts` - compares provider responses across mock, local retired local vision runtime, FreeLLMAPI dev, and unavailable modes.
- `packages/evals/src/index.ts` - exports the provider comparison helpers.
- `docs/phase-15-evals.md` - records Step 15.8 progress.
- `docs/roadmap.md` - records Phase 15 Step 15.8.
- `learnings/toki/phase-15-evals.md` - records the provider comparison lesson.

**In plain English**
Toki can now compare different provider results without assuming every provider is running. Mock, local retired local vision runtime, FreeLLMAPI, and unavailable provider paths can be marked as passed, failed, or skipped. That means missing local servers or credentials are recorded honestly instead of breaking the main eval flow.

**Verification**
- `npm --workspace @toki/evals run typecheck` passed.

**Commits**
- pending

---

## Step 15.7 - Workflow Eval
*Completed: 2026-07-03*

**What was built**
- `packages/evals/src/workflowScoring.ts` - scores workflow verification results and basic workflow transitions.
- `packages/evals/src/index.ts` - exports the workflow scoring helpers.
- `docs/phase-15-evals.md` - records Step 15.7 progress.
- `docs/roadmap.md` - records Phase 15 Step 15.7.
- `learnings/toki/phase-15-evals.md` - records the workflow eval lesson.

**In plain English**
Toki can now grade workflow behavior, not just one target. The eval helpers can check whether a step verification passed, whether the right candidates were matched, whether Next and Back moved correctly, whether a workflow became blocked or completed, and whether risky confirmation-required steps stay blocked until confirmation.

**Verification**
- `npm --workspace @toki/evals run typecheck` passed.

**Commits**
- pending

---

## Step 15.6 - Known-Screen Eval CLI
*Completed: 2026-07-03*

**What was built**
- `packages/evals/src/knownScreenCli.ts` - runs the known-screen eval dataset from the command line.
- `packages/evals/src/fixtures.ts` - relaxes the risky raw-fixture ranking expectation to top-3.
- `packages/evals/package.json` - adds the package-level known-screen eval script and CLI dev dependencies.
- `package.json` - adds the root `qa:eval:known-screen` script.
- `package-lock.json` - records the eval package dependency metadata.
- `docs/phase-15-evals.md` - records Step 15.6 progress.
- `docs/roadmap.md` - records Phase 15 Step 15.6.
- `learnings/toki/phase-15-evals.md` - records the known-screen CLI lesson.

**In plain English**
Toki now has one command that runs the first real eval loop without opening the app. It reads the known browser fixture, checks whether the expected targets are present, checks whether the expected candidates are ranked close enough, and checks whether safety decisions match the annotation. The current baseline passes both known cases.

**Verification**
- `npm --workspace @toki/evals run typecheck` passed.
- `npm run qa:eval:known-screen` passed with `2/2` cases.

**Commits**
- pending

---

## Step 15.5 - Safety Policy Eval
*Completed: 2026-07-03*

**What was built**
- `packages/evals/src/safetyScoring.ts` - scores expected safety annotations against the real safety policy decision.
- `packages/evals/src/index.ts` - exports the safety scoring helpers.
- `packages/evals/package.json` - declares the eval package dependency on `@toki/ai` and `@toki/shared`.
- `docs/phase-15-evals.md` - records Step 15.5 progress.
- `docs/roadmap.md` - records Phase 15 Step 15.5.
- `learnings/toki/phase-15-evals.md` - records the safety eval lesson.

**In plain English**
Toki can now grade whether its safety gate made the right choice. If a result should be safe, risky, blocked, or clarified, the eval helper compares that expectation with the real policy decision used by the app. This helps prove that risky guidance is not treated like normal guidance.

**Verification**
- `npm --workspace @toki/evals run typecheck` passed.

**Commits**
- pending

---

## Step 15.4 - Candidate Ranking Eval
*Completed: 2026-07-03*

**What was built**
- `packages/evals/src/rankingScoring.ts` - scores whether expected candidates are found and ranked highly.
- `packages/evals/src/index.ts` - exports the ranking scoring helpers.
- `docs/phase-15-evals.md` - records Step 15.4 progress.
- `docs/roadmap.md` - records Phase 15 Step 15.4.
- `learnings/toki/phase-15-evals.md` - records the candidate ranking lesson.

**In plain English**
Toki can now grade whether the right possible target appears near the top of its candidate list. It checks if the expected candidate exists, whether it is first, whether it is in the top three, whether it is within the allowed rank, and whether the label matches. This helps us tell whether Toki is finding useful choices before a model picks the final answer.

**Verification**
- `npm --workspace @toki/evals run typecheck` passed.

**Commits**
- pending

---

## Step 15.3 - Target Scoring Helpers
*Completed: 2026-07-03*

**What was built**
- `packages/evals/src/targetScoring.ts` - calculates target geometry and pass/fail scoring.
- `packages/evals/src/index.ts` - exports the target scoring helpers.
- `docs/phase-15-evals.md` - records Step 15.3 progress.
- `docs/roadmap.md` - records Phase 15 Step 15.3.
- `learnings/toki/phase-15-evals.md` - records the target scoring lesson.

**In plain English**
Toki can now grade whether a returned target is actually close enough to the expected button or UI element. It checks the distance between centers, overlap between boxes, whether the center lands inside the expected area, and whether the label/candidate id match. This turns "it looks close" into a measurable pass or fail.

**Verification**
- `npm --workspace @toki/evals run typecheck` passed.

**Commits**
- pending

---

## Step 15.2 - Dataset And Annotation Schema
*Completed: 2026-07-03*

**What was built**
- `packages/evals/src/schema.ts` - defines the shared eval case, fixture, target, ranking, safety, and workflow result shapes.
- `packages/evals/src/fixtures.ts` - adds the first known-screen eval dataset for safe and risky browser targets.
- `packages/evals/src/index.ts` - exports the eval schema and baseline dataset.
- `docs/phase-15-evals.md` - records Step 15.2 progress.
- `docs/roadmap.md` - records Phase 15 Step 15.2.
- `learnings/toki/phase-15-evals.md` - records the dataset schema lesson.

**In plain English**
Toki now has a standard way to describe a test case for guidance quality. A case can say what the user asked for, what screen data should be used, which target should be selected, how close the box should be, and what safety result should happen. This gives future eval commands a clean checklist to grade against.

**Verification**
- `npm --workspace @toki/evals run typecheck` passed.

**Commits**
- pending

---

## Step 15.1 - Evals Plan
*Completed: 2026-07-03*

**What was built**
- `docs/phase-15-evals.md` - defines the Phase 15 eval plan for target accuracy, candidate ranking, safety classification, workflow verification, provider comparison, and reporting.
- `docs/roadmap.md` - records Phase 15 Step 1.
- `learnings/toki/phase-15-evals.md` - records the evals planning lesson.

**In plain English**
Phase 15 now has a clear measurement plan. Instead of guessing whether Toki is getting better, we will add repeatable checks for whether it picked the right target, ranked the right candidate, made the right safety decision, and advanced workflows correctly. This phase is about turning quality into numbers we can track.

**Verification**
- Docs-only step; no app check needed.

**Commits**
- pending

---

## Step 14.11 - Phase Closure
*Completed: 2026-07-03*

**What was built**
- `docs/phase-14-visual-polish.md` - closes Phase 14 and records the final implementation/QA status.
- `docs/roadmap.md` - records Phase 14 closure.
- `learnings/toki/phase-14-visual-polish.md` - records the final Phase 14 learning update.

**In plain English**
Phase 14 is closed for implementation. Toki now has a more polished cursor companion, lighter target and workflow cues, tighter settings, cleaner Debug, motion QA, and a manual visual checklist. The only remaining visual acceptance step is the human one: launch Toki and walk through the checklist on a real screen.

**Verification**
- `npm run qa:visual:motion` passed.
- `npm run qa:visual:manual` passed.
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- pending

---

## Step 14.10 - Manual Visual QA
*Completed: 2026-07-03*

**What was built**
- `docs/phase-14-manual-visual-qa.md` - adds the manual visual acceptance checklist for Phase 14.
- `scripts/macos-visual-manual-qa.sh` - prints the Mac visual QA checklist from the command line.
- `package.json` - adds `npm run qa:visual:manual`.
- `docs/phase-14-visual-polish.md` and `docs/roadmap.md` - record Step 14.10 progress.
- `learnings/toki/phase-14-visual-polish.md` - records the manual visual QA lesson.

**In plain English**
Toki now has a clear manual checklist for judging whether the app actually feels right. It tells us what to inspect on the desktop: invisibility, puck distance, edge behavior, settings, target rings, workflow cues, Debug, and reduced motion. This matters because visual taste cannot be fully automated.

**Verification**
- `npm run qa:visual:manual` passed.
- `npm run qa:visual:motion` passed.

**Commits**
- pending

---

## Step 14.9 - Performance And Reduced Motion QA
*Completed: 2026-07-03*

**What was built**
- `scripts/visual-motion-qa.mjs` - adds a static QA check for reduced-motion coverage, cursor polling speed, and compositor-friendly puck motion.
- `package.json` - adds `npm run qa:visual:motion`.
- `docs/phase-14-visual-polish.md` and `docs/roadmap.md` - record Step 14.9 progress.
- `learnings/toki/phase-14-visual-polish.md` - records the motion QA lesson.

**In plain English**
Toki now has a quick check that catches obvious visual-motion regressions. It verifies that reduced-motion users are protected, that decorative animations can be disabled, and that cursor polling still runs at a responsive interval. This gives us a fast safety net before manual visual testing.

**Verification**
- `npm run qa:visual:motion` passed.
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- pending

---

## Step 14.8 - Optional WebGL/R3F Spike
*Completed: 2026-07-03*

**What was built**
- `docs/phase-14-webgl-r3f-spike.md` - records why WebGL/R3F is deferred, when to trigger it, and how to keep CSS as fallback.
- `docs/phase-14-visual-polish.md` and `docs/roadmap.md` - record Step 14.8 progress.
- `learnings/toki/phase-14-visual-polish.md` - records the WebGL/R3F spike decision.

**In plain English**
We decided not to add a heavy WebGL renderer yet. The current CSS puck and target visuals are good enough for the next QA pass, so adding Three.js now would make the app heavier before proving it improves the product. The future plan is written down: only add WebGL if manual testing shows CSS cannot reach the desired liquid cursor feel.

**Verification**
- Docs-only step; no app check needed.

**Commits**
- pending

---

## Step 14.7 - Debug Visual Cleanup
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src/App.css` - makes Debug denser, easier to scan, wider, lower-contrast, and keeps tabs sticky while long sections scroll.
- `docs/phase-14-visual-polish.md` and `docs/roadmap.md` - record Step 14.7 progress.
- `learnings/toki/phase-14-visual-polish.md` - records the Debug visual cleanup lesson.

**In plain English**
Debug still shows the internal information we need, but it takes up less visual space and is easier to scan. The tabs stay available while scrolling, cards are lighter, and dense sections like workflows and candidates are less bulky. This keeps Debug useful without making it look like the real product surface.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- pending

---

## Step 14.6 - Settings/Menu Panel Polish
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src/App.tsx` - shortens settings copy and makes push-to-talk wording clearer.
- `apps/desktop/src/App.css` - tightens the settings popup into a smaller menu-like surface with lighter spacing and footer actions.
- `docs/phase-14-visual-polish.md` and `docs/roadmap.md` - record Step 14.6 progress.
- `learnings/toki/phase-14-visual-polish.md` - records the settings polish lesson.

**In plain English**
The settings popup now feels more like a small menu utility instead of a mini app window. It uses shorter wording, a clearer push-to-talk action, and lighter controls. This keeps settings useful without letting it become the main product surface.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- pending

---

## Step 14.5 - Target Ring Polish
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src/App.css` - changes the target marker into a softer corner-ring highlight and removes the old coordinate shift.
- `docs/phase-14-visual-polish.md` and `docs/roadmap.md` - record Step 14.5 progress.
- `learnings/toki/phase-14-visual-polish.md` - records the target marker polish lesson.

**In plain English**
The target ring now looks more like a subtle highlight and less like a mock test marker. It sits on the actual target box, uses lighter corners instead of a heavy rectangle, and has a quieter pulse. This should make guidance feel more polished while still showing where to click.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- pending

---

## Step 14.4 - Puck Motion And Edge Behavior
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src/overlayGeometry.ts` - moves the puck closer to the cursor, flips it around screen edges, and measures target vectors from the actual puck position.
- `apps/desktop/src/App.tsx` - sends the current pointer-following puck position into target-vector geometry.
- `docs/phase-14-visual-polish.md` and `docs/roadmap.md` - record Step 14.4 progress.
- `learnings/toki/phase-14-visual-polish.md` - records the puck geometry lesson.

**In plain English**
The puck now behaves more like a companion attached to the cursor. It stays close by default, moves to the other side when the cursor reaches an edge, and target animations now start from the actual puck instead of an old hidden anchor point. This should make the puck feel less lost and more connected to guidance.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- pending

---

## Step 14.3 - Overlay Cue Polish
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src/App.tsx` - simplifies the workflow cue structure so it shows compact step meta, title, instruction, and flat controls.
- `apps/desktop/src/App.css` - restyles the workflow cue into a lighter cursor-adjacent instruction surface with a restrained confirmation state.
- `docs/phase-14-visual-polish.md` and `docs/roadmap.md` - record Step 14.3 progress.
- `learnings/toki/phase-14-visual-polish.md` - records the overlay cue polish lesson.

**In plain English**
The workflow cue now feels less like a small app card and more like a tiny instruction next to the cursor. It still lets you go back, continue, or stop, but the controls are visually lighter and the important instruction gets priority. Risky steps now have a clearer confirmation hint without making the overlay feel loud.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- pending

---

## Step 13.3 - Mock Workflow Planner
*Completed: 2026-07-03*

**What was built**
- `packages/ai/src/index.ts` - adds `createMockWorkflowPlan()` for controlled workflow plans.
- `packages/ai/src/index.test.ts` - tests create-project, open-settings, export/download, and unknown-goal behavior.
- `docs/phase-13-multi-step-workflows.md` - records the planner result.
- `docs/roadmap.md` - records Phase 13 Step 13.3.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the mock planner learning.

**In plain English**
Toki now has a simple planner for controlled workflow tests. It can build a known plan for creating a project, opening settings, or exporting a report. If the command is vague, it returns nothing instead of pretending it understands every task.

**Files changed**
~ modified: packages/ai/src/index.ts
~ modified: packages/ai/src/index.test.ts
~ modified: docs/phase-13-multi-step-workflows.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-13-multi-step-workflows.md

---

## Step 13.2 - Shared Workflow Schema
*Completed: 2026-07-03*

**What was built**
- `packages/shared/src/index.ts` - adds shared workflow plan, step, status, verification, and runtime-state types.
- `docs/phase-13-multi-step-workflows.md` - records the schema result.
- `docs/roadmap.md` - records Phase 13 Step 13.2.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the workflow schema learning.

**In plain English**
Toki now has a common language for workflows. A workflow can have a plan, steps, statuses, verification checks, and a blocked/completed runtime state. This lets future desktop, debug, planner, and QA code all talk about the same workflow shape.

**Files changed**
~ modified: packages/shared/src/index.ts
~ modified: docs/phase-13-multi-step-workflows.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-13-multi-step-workflows.md

---

## Step 13.1 - Workflow Contract
*Completed: 2026-07-03*

**What was built**
- `docs/phase-13-multi-step-workflows.md` - defines the Phase 13 workflow goal, product rule, step model, acceptance criteria, non-goals, and tradeoffs.
- `docs/roadmap.md` - records the Phase 13 Step 13.1 result.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the Phase 13 learning in the learning repo.

**In plain English**
Phase 13 now has a clear contract. Toki will become able to guide multi-step tasks, but it will still stay in assistant mode: it can plan, point, verify, and advance, but it does not click or type for the user. This gives us a safe structure before adding workflow state to the runtime.

**Files changed**
+ created: docs/phase-13-multi-step-workflows.md
~ modified: docs/roadmap.md
+ created: learnings/toki/phase-13-multi-step-workflows.md

---

## Step 12.11 - Close Or Escalate
*Completed: 2026-07-03*

**What was built**
- `docs/phase-12-screen-intelligence.md` - closes Phase 12 as a screen-intelligence foundation and records what accuracy work remains.
- `docs/roadmap.md` - records the Phase 12 closure decision.
- `learnings/toki/phase-12-screen-intelligence.md` - records the final Phase 12 learning in the learning repo.

**In plain English**
Phase 12 is now closed, but honestly. Toki has the right foundation for screen understanding: candidates, ranking, candidate IDs, fallback QA, and Debug explanation. Final real-world target accuracy is not claimed yet; that moves into later live browser dashboard testing and provider comparison.

**Files changed**
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---

## Step 12.10 - Accuracy Notes
*Completed: 2026-07-03*

**What was built**
- `docs/phase-12-screen-intelligence.md` - records current accuracy results, source reliability, misses, and escalation decision.
- `docs/roadmap.md` - records Step 12.10 in the Phase 12 roadmap.
- `learnings/toki/phase-12-screen-intelligence.md` - records the Step 12.10 learning in the learning repo.

**In plain English**
Toki now has an honest accuracy checkpoint. The notes say what is proven, what is not proven, which candidate sources are most reliable, and why browser DOM candidates should be trusted more than raw screenshot guessing. This prevents us from pretending target accuracy is solved when only the foundation is ready.

**Files changed**
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---

## Step 12.9 - Debug Screen Intelligence View
*Completed: 2026-07-03*

**What was built**
- `packages/shared/src/index.ts` - lets screen candidates carry optional rank metadata.
- `apps/desktop/src/App.tsx` - shows selected candidate ids and top ranked candidates in Debug.
- `apps/desktop/src/App.css` - styles the ranked candidate list in the Debug Guidance tab.
- `docs/phase-12-screen-intelligence.md` - records the Debug screen-intelligence result.
- `docs/roadmap.md` - records Step 12.9 in the Phase 12 roadmap.
- `learnings/toki/phase-12-screen-intelligence.md` - records the Step 12.9 learning in the learning repo.

**In plain English**
Debug now shows why Toki chose a target. Instead of only seeing the final result, you can inspect the candidate list, their ids, roles, boxes, scores, and ranking reasons. This makes wrong targets easier to understand and fix.

**Files changed**
~ modified: packages/shared/src/index.ts
~ modified: apps/desktop/src/App.tsx
~ modified: apps/desktop/src/App.css
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---

## Step 12.8 - Provider Prompt Update
*Completed: 2026-07-03*

**What was built**
- `packages/shared/src/index.ts` - lets guidance targets keep the selected candidate id.
- `scripts/guidance-smoke-server.mjs` - tells providers to choose candidate ids instead of inventing coordinates when candidates exist.
- `scripts/guidance-smoke-server.test.mjs` - checks that retired local vision runtime and FreeLLMAPI prompts include the candidate-id rule.
- `scripts/browser-candidate-payload.test.mjs` - updates the fixture expectation after the browser payload expanded to six candidates.
- `docs/phase-12-screen-intelligence.md` - records the candidate-id provider rule.
- `docs/roadmap.md` - records Step 12.8 in the Phase 12 roadmap.
- `learnings/toki/phase-12-screen-intelligence.md` - records the Step 12.8 learning in the learning repo.

**In plain English**
Toki now asks providers to choose from the real candidate list instead of guessing screen coordinates whenever candidates are available. The provider only needs to return a candidate id, and Toki copies the exact label and box from its own candidate data. This should make guidance less random and easier to validate.

**Files changed**
~ modified: packages/shared/src/index.ts
~ modified: scripts/guidance-smoke-server.mjs
~ modified: scripts/guidance-smoke-server.test.mjs
~ modified: scripts/browser-candidate-payload.test.mjs
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---

## Step 12.7 - OCR/AX Fallback QA
*Completed: 2026-07-03*

**What was built**
- `scripts/fallback-known-screen-qa.mjs` - checks fallback target ranking using only Accessibility and OCR candidates.
- `package.json` - adds `npm run qa:fallback:known-screen`.
- `docs/phase-12-screen-intelligence.md` - records the fallback QA result and acceptance rule.
- `docs/roadmap.md` - records Step 12.7 in the Phase 12 roadmap.
- `learnings/toki/phase-12-screen-intelligence.md` - records the fallback QA learning in the learning repo.

**In plain English**
Toki now has a quick test for the path it uses when browser DOM candidates are not available. The test checks that Accessibility can find proper controls like `Download` and `Search`, and OCR can still provide useful text targets like `Invite`. This does not replace live permission testing, but it proves the fallback ranking logic itself is healthy.

**Files changed**
+ created: scripts/fallback-known-screen-qa.mjs
~ modified: package.json
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---

## Step 12.6 - Browser Known-Screen QA
*Completed: 2026-07-03*

**What was built**
- `scripts/browser-known-screen-qa.mjs` - checks that browser DOM candidates rank to the expected target for known commands.
- `package.json` - adds `npm run qa:browser:known-screen`.
- `apps/browser-extension/fixtures/bridge-payload.json` - expands the controlled browser fixture payload to six realistic DOM targets from an HTTP page.
- `docs/phase-12-screen-intelligence.md` - records the Step 12.6 result and acceptance rule.
- `docs/roadmap.md` - records the browser known-screen QA result.
- `learnings/toki/phase-12-screen-intelligence.md` - records the Step 12.6 learning in the learning repo.

**In plain English**
Toki now has a repeatable browser accuracy check that does not depend on a model server being online. It takes browser page targets from the extension payload and verifies that commands like "Create a project" or "Open settings" rank the right page element first. This proves the browser candidate path is working before we ask a provider to make decisions from it.

**Files changed**
+ created: scripts/browser-known-screen-qa.mjs
~ modified: package.json
~ modified: apps/browser-extension/fixtures/bridge-payload.json
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---

## Step 10.8.8 - Live Bridge Provider Smoke
*Completed: 2026-07-02*

**What was built**
- `docs/roadmap.md` - records the live bridge provider result.
- `docs/guidance-provider-adapter.md` - records the exact live bridge flow and result.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the learning in the learnings repo.

**In plain English**
The local bridge worked end to end. After restarting the smoke server with the FreeLLMAPI key, Toki accepted browser candidates through the bridge, the known-screen runner used those candidates automatically, and the provider returned the correct `Create project` target. The remaining test is doing the same thing from the actual browser extension popup on a real page.

**Files changed**
~ modified: docs/roadmap.md
~ modified: docs/guidance-provider-adapter.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.8.7 - Automatic Bridge Lookup
*Completed: 2026-07-02*

**What was built**
- `scripts/browser-candidate-payload.mjs` - reads the latest browser candidate payload from the local bridge.
- `scripts/browser-candidate-payload.test.mjs` - verifies live bridge payload parsing.
- `scripts/guidance-known-screen-smoke.mjs` - tries the live browser bridge when no payload file is provided.
- `apps/browser-extension/README.md` - documents automatic lookup and stale-server caveat.
- `docs/roadmap.md` - records the automatic bridge lookup step.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the learning in the learnings repo.

**In plain English**
The known-screen test no longer needs a downloaded JSON path if the extension has already sent candidates to Toki. It will ask the local bridge for the latest browser candidates and use those first. If the smoke server was already running before this change, it must be restarted before the bridge endpoint exists.

**Files changed**
~ modified: scripts/browser-candidate-payload.mjs
~ modified: scripts/browser-candidate-payload.test.mjs
~ modified: scripts/guidance-known-screen-smoke.mjs
~ modified: apps/browser-extension/README.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.8.6 - Local Browser Candidate Bridge
*Completed: 2026-07-02*

**What was built**
- `scripts/guidance-smoke-server.mjs` - adds `POST/GET /api/browser-candidates/latest` for live extension candidate payloads.
- `scripts/guidance-smoke-server.test.mjs` - verifies storing and reading browser bridge payloads.
- `apps/browser-extension/src/popup.*` - adds `Send to Toki` in the extension popup.
- `apps/browser-extension/README.md` - documents the local bridge workflow.
- `docs/roadmap.md` - records the local bridge step.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the learning in the learnings repo.

**In plain English**
The extension no longer has to rely only on manual JSON download. It can send the current page's DOM candidates straight to Toki's local development server. This is still a dev bridge, but it removes the slow copy/download loop.

**Files changed**
~ modified: scripts/guidance-smoke-server.mjs
~ modified: scripts/guidance-smoke-server.test.mjs
~ modified: apps/browser-extension/src/popup.html
~ modified: apps/browser-extension/src/popup.css
~ modified: apps/browser-extension/src/popup.js
~ modified: apps/browser-extension/README.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.8.5 - DOM Candidate Provider Smoke
*Completed: 2026-07-02*

**What was built**
- `docs/roadmap.md` - records the provider smoke result with browser-extension candidates.
- `docs/guidance-provider-adapter.md` - records the exact command, result, and caveat.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the learning in the learnings repo.

**In plain English**
Toki proved that the provider can choose an exact browser DOM target when the extension payload is supplied. The model selected `Create project` and returned a valid target box. This means DOM candidates solve the raw screenshot guessing problem in the provider path, but we still need a live bridge from the browser extension into the desktop app.

**Files changed**
~ modified: docs/roadmap.md
~ modified: docs/guidance-provider-adapter.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.8.4 - Browser Payload Ingestion
*Completed: 2026-07-02*

**What was built**
- `scripts/browser-candidate-payload.mjs` - normalizes browser extension payloads into Toki screen candidates.
- `scripts/browser-candidate-payload.test.mjs` - verifies valid and invalid browser payloads.
- `scripts/guidance-known-screen-smoke.mjs` - loads `TOKI_BROWSER_CANDIDATE_PAYLOAD` before manual, Accessibility, or OCR candidates.
- `apps/browser-extension/README.md` - documents how to use downloaded extension JSON with the known-screen runner.
- `docs/roadmap.md` - records the browser payload ingestion step.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the learning in the learnings repo.

**In plain English**
Toki can now use the browser extension's exported JSON in the provider test path. That means exact DOM candidates from the browser can be ranked and sent to the model instead of relying first on screenshots, OCR, or macOS Accessibility.

**Files changed**
+ created: scripts/browser-candidate-payload.mjs
+ created: scripts/browser-candidate-payload.test.mjs
~ modified: scripts/guidance-known-screen-smoke.mjs
~ modified: package.json
~ modified: apps/browser-extension/README.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.8.3 - Browser Bridge Payload
*Completed: 2026-07-02*

**What was built**
- `packages/shared/src/index.ts` - defines the browser candidate payload shape.
- `apps/browser-extension/src/popup.*` - adds copy/download controls for candidate JSON.
- `apps/browser-extension/fixtures/bridge-payload.json` - example bridge payload.
- `apps/browser-extension/scripts/bridge-payload-smoke.mjs` - validates the bridge payload shape.
- `docs/roadmap.md` - records the bridge step.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the learning in the learnings repo.

**In plain English**
The browser extension can now hand Toki a stable JSON packet. That packet contains the page URL, title, viewport, and exact DOM candidates. This is still a development bridge, but it gives us a clean handoff before building a live connection to the desktop app.

**Files changed**
+ created: apps/browser-extension/fixtures/bridge-payload.json
+ created: apps/browser-extension/scripts/bridge-payload-smoke.mjs
~ modified: packages/shared/src/index.ts
~ modified: apps/browser-extension/src/popup.html
~ modified: apps/browser-extension/src/popup.css
~ modified: apps/browser-extension/src/popup.js
~ modified: apps/browser-extension/package.json
~ modified: apps/browser-extension/README.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.8.2 - Extension Fixture QA
*Completed: 2026-07-01*

**What was built**
- `apps/browser-extension/fixtures/candidate-page.html` - controlled test page with known buttons, links, inputs, selects, and textareas.
- `apps/browser-extension/scripts/fixture-smoke.mjs` - verifies the fixture still contains the expected labels.
- `apps/browser-extension/README.md` - adds manual extension loading and pass/fail rules.
- `docs/roadmap.md` - records the fixture verification step.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the learning in the learnings repo.

**In plain English**
Toki now has a simple browser page for testing whether the extension can see real web controls. Before trying messy SaaS pages, we can load this page and confirm the extension finds obvious targets like Create project, Delete, Open settings, Project name, Environment selector, and Add notes.

**Files changed**
+ created: apps/browser-extension/fixtures/candidate-page.html
+ created: apps/browser-extension/scripts/fixture-smoke.mjs
~ modified: apps/browser-extension/package.json
~ modified: apps/browser-extension/README.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.8.1 - Browser Extension Scaffold
*Completed: 2026-07-01*

**What was built**
- `packages/shared/src/index.ts` - extends Toki's screen candidate type so browser DOM targets can use the same shape as OCR and Accessibility targets.
- `apps/browser-extension/` - adds a development-only Manifest V3 extension that collects visible DOM candidates from the active browser page.
- `package.json` - adds a root check command for the browser extension.
- `docs/roadmap.md` - records the start of Phase 10.8.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the Phase 10.8 learning in the learnings repo.

**In plain English**
Toki now has a first browser companion extension. It can inspect the actual web page and list visible buttons, links, inputs, ARIA labels, and test IDs with their screen boxes. This does not connect to the desktop app yet; it proves the browser can give us better target candidates than raw screenshots.

**Files changed**
+ created: apps/browser-extension/
~ modified: packages/shared/src/index.ts
~ modified: package.json
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.7.7 - Browser Reliability Decision
*Completed: 2026-07-01*

**What was built**
- `docs/roadmap.md` - adds the final Phase 10.7 decision and creates Phase 10.8 for browser candidate extraction.
- `docs/guidance-provider-adapter.md` - records what is reliable, what is not reliable, and why browser extension candidates are the next best path.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the reliability decision in the learning repo.

**In plain English**
Toki is not ready to trust browser guidance yet. The model provider works and the validator is doing its job, but the app still cannot reliably see browser buttons and fields. The next best move is to build a browser candidate extraction phase so Toki can receive exact page targets instead of guessing from screenshots.

**Files changed**
~ modified: docs/roadmap.md
~ modified: docs/guidance-provider-adapter.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.7.6 - Browser Known-Screen Tests
*Completed: 2026-07-01*

**What was built**
- `scripts/macos-vision-ocr-candidates.mjs` - makes the macOS Vision OCR helper load images more safely and report Vision failures cleanly.
- `docs/roadmap.md` - records that browser known-screen testing is still blocked by browser candidate extraction.
- `docs/guidance-provider-adapter.md` - records the FreeLLMAPI/browser QA result and the next accuracy decision.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the phase learning in the separate learnings repo.

**In plain English**
Toki can run the provider test with ranked candidates, but it still cannot reliably understand browser pages yet. The model path is alive, but the browser candidate sources are weak: Accessibility gives coarse window-level items, and OCR failed on the current screenshot. This means the next accuracy work should focus on better browser candidate extraction, not prompt tuning.

**Files changed**
~ modified: scripts/macos-vision-ocr-candidates.mjs
~ modified: docs/roadmap.md
~ modified: docs/guidance-provider-adapter.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---
## Step 12.5 - Ranking Improvements
*Completed: 2026-07-03*

**What was built**
- `scripts/candidate-ranking.mjs` - improves known-screen candidate scoring with source trust, exact labels, weak-region penalties, and hidden/disabled penalties.
- `scripts/candidate-ranking.test.mjs` - verifies trusted DOM targets beat broad regions and hidden candidates rank lower.
- `apps/desktop/src/candidateRanking.ts` - applies the same improved ranking signals in the live desktop runtime.
- `docs/phase-12-screen-intelligence.md` - documents the current ranking signals.
- `docs/roadmap.md` - records the Step 12.5 result.
- `learnings/toki/phase-12-screen-intelligence.md` - records why the ranking changes matter.

**In plain English**
Toki is now better at deciding which possible screen target deserves attention first. A real browser button should beat a giant browser window rectangle, hidden or disabled targets are pushed down, and exact text matches get stronger priority. This should make the provider see cleaner target choices before it tries to guide the user.

**Files changed**
~ modified: scripts/candidate-ranking.mjs
~ modified: scripts/candidate-ranking.test.mjs
~ modified: apps/desktop/src/candidateRanking.ts
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---
## Step 12.4 - Candidate Fusion Layer
*Completed: 2026-07-03*

**What was built**
- `packages/ai/src/index.ts` - adds `fuseScreenCandidates()` to convert and merge candidate evidence into `UiElement[]`.
- `packages/ai/src/index.test.ts` - tests conversion, duplicate merging, risky hints, and invalid-candidate filtering.
- `docs/phase-12-screen-intelligence.md` - records the first fusion layer.
- `docs/roadmap.md` - records the Step 12.4 result.
- `learnings/toki/phase-12-screen-intelligence.md` - records the fusion-layer tradeoff.

**In plain English**
Toki can now take a list of possible screen targets and turn them into richer screen elements. If the browser and OCR both see the same button, the fusion layer can treat that as one element with multiple pieces of evidence instead of two separate guesses. This is the first step toward a cleaner, explainable screen map.

**Files changed**
~ modified: packages/ai/src/index.ts
~ modified: packages/ai/src/index.test.ts
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---
## Step 12.3 - Unified Element Schema
*Completed: 2026-07-03*

**What was built**
- `packages/shared/src/index.ts` - expands the shared `UiElement` shape for fused screen elements.
- `docs/phase-12-screen-intelligence.md` - records how `UiElement` differs from `ScreenCandidate`.
- `docs/roadmap.md` - records the Step 12.3 result.
- `learnings/toki/phase-12-screen-intelligence.md` - records why the richer schema matters.

**In plain English**
Toki now has a stronger shared shape for screen elements. The older candidate shape is still there for provider requests, but the new element shape can remember where evidence came from, whether it is visible or clickable, what labels it has, and how it was ranked. This is the foundation for merging browser, OCR, Accessibility, and manual targets into one map.

**Files changed**
~ modified: packages/shared/src/index.ts
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---
## Step 12.2 - Candidate Source Inventory
*Completed: 2026-07-03*

**What was built**
- `docs/phase-12-screen-intelligence.md` - lists the current browser DOM, manual, bridge, Accessibility, OCR, desktop live OCR, and ranking candidate paths.
- `docs/roadmap.md` - records the Step 12.2 result.
- `learnings/toki/phase-12-screen-intelligence.md` - records the decision to build on the existing `ScreenCandidate` contract.

**In plain English**
We now know exactly what screen-understanding tools Toki already has. The problem is not that there are no candidate sources; the problem is that they are still separate pieces. The next work is to turn those pieces into one clean map of possible things the user can click or inspect.

**Files changed**
~ modified: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-12-screen-intelligence.md

---
## Step 12.1 - Screen Intelligence Contract
*Completed: 2026-07-03*

**What was built**
- `docs/phase-12-screen-intelligence.md` - defines the Phase 12 goal, evidence sources, steps, acceptance criteria, and non-goals.
- `docs/roadmap.md` - expands Phase 12 from a short bullet list into an explicit step plan.
- `learnings/toki/phase-12-screen-intelligence.md` - records why raw screenshots are not enough and why Toki needs a unified screen element map.

**In plain English**
Phase 12 now has a clear plan. The big idea is that Toki should not ask a model to guess from a screenshot alone. It should collect possible screen targets from the browser, OCR, Accessibility, and known test fixtures, then rank those targets before asking the provider what to choose.

**Files changed**
+ created: docs/phase-12-screen-intelligence.md
~ modified: docs/roadmap.md
+ created: learnings/toki/phase-12-screen-intelligence.md

---
## Step 11.10 - Close Phase 11 Or Escalate
*Completed: 2026-07-02*

**What was built**
- `docs/phase-11-safety-guardrails.md` - records the Phase 11 closure decision and what remains out of scope.
- `docs/roadmap.md` - marks Phase 11 closed as the safety-foundation phase.
- `learnings/toki/phase-11-safety-guardrails.md` - records why browser target accuracy moves to Phase 12 instead of blocking safety closure.

**In plain English**
Phase 11 is now closed. Toki has a safety checkpoint before guidance reaches the overlay: safe guidance can show, risky guidance asks for confirmation, weak guidance asks for clarification, and bad guidance is blocked. Better browser understanding is still needed, but that is now the next screen-intelligence problem rather than a missing safety gate.

**Files changed**
~ modified: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-11-safety-guardrails.md

---
## Step 11.9 - Docs And Learning
*Completed: 2026-07-02*

**What was built**
- `docs/safety.md` - summarizes the current Phase 11 policy outcomes.
- `docs/phase-11-safety-guardrails.md` - records that Step 11.9 consolidated the docs around actual runtime behavior.
- `docs/roadmap.md` - records the Step 11.9 result.
- `learnings/toki/phase-11-safety-guardrails.md` - records the main learning: real provider results and mock fixtures now share one safety gate.

**In plain English**
The safety docs now describe what Toki actually does today, not just what Phase 11 planned to do. The key idea is simple: every guidance result goes through one safety checkpoint before the overlay shows it. That checkpoint decides whether Toki should show the target, ask for confirmation, ask for clarification, or block it.

**Files changed**
~ modified: docs/safety.md
~ modified: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-11-safety-guardrails.md

---
## Step 11.8 - Manual Safety QA
*Completed: 2026-07-02*

**What was built**
- `packages/ai/src/index.ts` - adds a low-confidence mock guidance fixture for the clarify safety path.
- `packages/ai/src/index.test.ts` - verifies the low-confidence fixture is valid guidance.
- `apps/desktop/src/App.tsx` - routes mock QA fixtures through the same safety policy gate as real provider results.
- `docs/phase-11-safety-qa.md` - adds the manual safety QA checklist.
- `docs/phase-11-safety-guardrails.md` - records the Step 11.8 result.
- `docs/roadmap.md` - records the manual QA step.
- `learnings/toki/phase-11-safety-guardrails.md` - records why mock fixtures now go through policy.

**In plain English**
Safety QA is now repeatable from Debug without needing a live provider. Safe guidance should show normally, risky guidance should show the confirmation cue, invalid guidance should block, and low-confidence guidance should ask for clarification instead of showing a confident target.

**Files changed**
~ modified: packages/ai/src/index.ts
~ modified: packages/ai/src/index.test.ts
~ modified: apps/desktop/src/App.tsx
+ added: docs/phase-11-safety-qa.md
~ modified: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-11-safety-guardrails.md

---
## Step 11.7 - Debug Safety Review
*Completed: 2026-07-02*

**What was built**
- `apps/desktop/src/App.tsx` - adds a dedicated Safety Review section to Debug.
- `docs/phase-11-safety-guardrails.md` - records the Step 11.7 result.
- `docs/roadmap.md` - records the debug safety review step.
- `learnings/toki/phase-11-safety-guardrails.md` - records why Debug needs to explain safety decisions.

**In plain English**
Debug now explains why safety did what it did. It shows the action, reason, risk, confirmation requirement, message, and details. This matters because sometimes the correct safety behavior is that nothing appears on the overlay, and Debug needs to tell us whether that was a block, a clarification, or a missing result.

**Files changed**
~ modified: apps/desktop/src/App.tsx
~ modified: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-11-safety-guardrails.md

---

## Step 11.6 - Confirmation UI
*Completed: 2026-07-02*

**What was built**
- `apps/desktop/src/App.tsx` - adds a compact `ConfirmationBubble` for safety-confirmation guidance.
- `apps/desktop/src/App.css` - styles the confirmation cue so it is distinct from normal step guidance.
- `docs/phase-11-safety-guardrails.md` - records the Step 11.6 result.
- `docs/roadmap.md` - records the confirmation UI step.
- `learnings/toki/phase-11-safety-guardrails.md` - records the confirmation cue learning.

**In plain English**
Risky guidance now looks different from normal guidance. Instead of showing the usual step bubble, Toki shows a small "Confirm first" cue so the user knows this target needs review. The target marker can still help the user inspect the risky target, but the puck does not treat it like ordinary safe guidance.

**Files changed**
~ modified: apps/desktop/src/App.tsx
~ modified: apps/desktop/src/App.css
~ modified: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-11-safety-guardrails.md

---

## Step 11.5 - Provider Integration
*Completed: 2026-07-02*

**What was built**
- `apps/desktop/src/App.tsx` - routes real-provider guidance through `evaluateSafetyPolicy()` before accepting it into the overlay.
- `apps/desktop/src/puckMotion.ts` - adds a `confirmation_required` overlay state that does not animate as normal safe guidance.
- `docs/phase-11-safety-guardrails.md` - records the Step 11.5 result.
- `docs/roadmap.md` - records the provider integration step.
- `learnings/toki/phase-11-safety-guardrails.md` - records the runtime safety gate learning.

**In plain English**
Real provider guidance now has to pass the safety gate before Toki shows it. Safe guidance can appear normally, risky guidance moves into a confirmation-needed state, unclear guidance hides the target, and blocked guidance becomes an error instead of a confident pointer. Debug can also show the safety action and reason.

**Files changed**
~ modified: apps/desktop/src/App.tsx
~ modified: apps/desktop/src/puckMotion.ts
~ modified: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-11-safety-guardrails.md

---

## Step 11.4 - Policy Tests
*Completed: 2026-07-02*

**What was built**
- `packages/ai/src/index.test.ts` - adds tests for every safety policy outcome: allow, confirm, clarify, and block.
- `docs/phase-11-safety-guardrails.md` - records the Step 11.4 result.
- `docs/roadmap.md` - records the test coverage in the Phase 11 roadmap.
- `learnings/toki/phase-11-safety-guardrails.md` - records why the safety behavior is now locked by tests.

**In plain English**
The safety gate now has a test suite. It proves safe guidance can pass, risky guidance requires confirmation, weak guidance asks for clarification, and broken or unavailable guidance gets blocked. This gives us confidence before connecting the policy engine to the live app.

**Files changed**
~ modified: packages/ai/src/index.test.ts
~ modified: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-11-safety-guardrails.md

---

## Step 11.3 - Policy Engine
*Completed: 2026-07-02*

**What was built**
- `packages/ai/src/index.ts` - adds `evaluateSafetyPolicy()`, a pure function that turns provider guidance into `allow`, `confirm`, `clarify`, or `block`.
- `docs/phase-11-safety-guardrails.md` - records the Step 11.3 result.
- `docs/roadmap.md` - records the policy engine step in the Phase 11 roadmap.
- `learnings/toki/phase-11-safety-guardrails.md` - records how the first policy gate works.

**In plain English**
Toki now has the first real safety gate. It can look at a provider result and decide whether the app should show it, ask for confirmation, ask for a clearer instruction, or block it. This is still not wired into the user interface yet; it is the decision-making layer that the next steps will test and connect.

**Files changed**
~ modified: packages/ai/src/index.ts
~ modified: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-11-safety-guardrails.md

---

## Step 11.2 - Shared Policy Decision Types
*Completed: 2026-07-02*

**What was built**
- `packages/shared/src/index.ts` - adds shared safety policy types for `allow`, `confirm`, `clarify`, and `block` decisions.
- `docs/phase-11-safety-guardrails.md` - records the Step 11.2 result in the Phase 11 plan.
- `docs/roadmap.md` - records the shared policy type step in the roadmap.
- `learnings/toki/phase-11-safety-guardrails.md` - records why the policy vocabulary is shared and small.

**In plain English**
Toki now has shared words for safety decisions. Later code will not need to invent separate safety states in different places. Everything can agree on four outcomes: allow safe guidance, ask for confirmation, ask for clarification, or block unsafe guidance.

**Files changed**
~ modified: packages/shared/src/index.ts
~ modified: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-11-safety-guardrails.md

---

## Step 11.1 - Safety Contract
*Completed: 2026-07-02*

**What was built**
- `docs/phase-11-safety-guardrails.md` - defines the Phase 11 safety goal, risk classes, confirmation gate, step plan, acceptance criteria, and non-goals.
- `docs/roadmap.md` - corrects the roadmap so Safety is Phase 11 and later phases move after it.
- `docs/safety.md` - links to the active Phase 11 plan and clarifies that confirmation does not mean automatic clicking.
- `learnings/toki/phase-11-safety-guardrails.md` - records the Phase 11 safety learning in the separate learnings repo.

**In plain English**
Phase 11 now has a clear rulebook. Toki can guide users, but risky guidance must slow down and ask for confirmation before it looks like normal guidance. The user stays in control, and Toki still does not click, delete, send, pay, or change settings automatically.

**Files changed**
+ created: docs/phase-11-safety-guardrails.md
~ modified: docs/roadmap.md
~ modified: docs/safety.md
+ created: learnings/toki/phase-11-safety-guardrails.md

---

## Step 10.8.10 - Browser Bridge QA Command
*Completed: 2026-07-02*

**What was built**
- `scripts/browser-candidate-bridge-qa.mjs` - checks the latest live browser candidate payload from Toki's local bridge.
- `package.json` - adds `npm run qa:browser:candidates`.
- `apps/browser-extension/README.md` - adds the bridge QA command to the real browser extension test flow.
- `docs/roadmap.md` - records Step 10.8.10.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the bridge QA gate in the learning repo.

**In plain English**
Toki now has a quick command to answer whether the browser extension actually sent useful page targets. It checks that the latest bridge payload came from the extension, came from a normal web page, and contains usable DOM boxes. It also refuses to count the controlled fixture as a real page unless you explicitly pass `-- --allow-fixture`.

**Files changed**
+ added: scripts/browser-candidate-bridge-qa.mjs
~ modified: package.json
~ modified: apps/browser-extension/README.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 10.8.9 - Real Browser Extension QA Path
*Completed: 2026-07-02*

**What was built**
- `apps/browser-extension/scripts/serve-fixture.mjs` - serves the controlled candidate fixture over localhost so the extension runs on a normal HTTP page.
- `apps/browser-extension/package.json` - adds `fixture:serve` and validates the fixture server during the extension check.
- `apps/browser-extension/README.md` - documents the real Chrome/Edge manual QA loop for collecting and sending candidates to Toki.
- `docs/roadmap.md` - records the Step 10.8.9 result in the Phase 10.8 plan.
- `learnings/toki/phase-10-voice-architecture-reset.md` - records the browser-extension QA lesson in the learning repo.

**In plain English**
The browser extension now has a realistic manual test path. Instead of opening the fixture as a local file, you serve it at `http://127.0.0.1:8788`, which matches the same kind of pages the extension will run on in real browser dashboards. The docs now explain the full loop: collect candidates in the popup, send them to Toki, then run known-screen guidance from the live bridge.

**Files changed**
~ modified: apps/browser-extension/package.json
+ added: apps/browser-extension/scripts/serve-fixture.mjs
~ modified: apps/browser-extension/README.md
~ modified: docs/roadmap.md
~ modified: learnings/toki/phase-10-voice-architecture-reset.md

---

## Step 13.4 - Runtime Workflow State
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src/App.tsx` - adds `WorkflowRuntimeState` to the overlay runtime, publishes it to Debug snapshots, and adds debug-only commands to start or clear a deterministic mock workflow.
- `docs/phase-13-multi-step-workflows.md` - records the Step 13.4 result.
- `docs/roadmap.md` - records Phase 13 Step 4 progress.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the workflow runtime-state lesson.

**In plain English**
Toki can now remember that a multi-step workflow exists. Debug can start a mock workflow and see the active plan, current step, instruction, verification state, and blocked reason. The normal overlay is unchanged for now; user-facing next/back/stop controls come in the next step.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- `091377d feat: wire workflow runtime state`
- `72bafd9 docs: record workflow runtime state`
- learnings repo: `5d45b1f docs: record workflow runtime state`

---

## Step 13.5 - Overlay Step Controls
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src/App.tsx` - adds workflow Back/Next/Stop state commands, uses workflow step targets for the ring and puck vector, and renders a compact current-step cue near the cursor.
- `apps/desktop/src/App.css` - styles the workflow cue as a small glassy overlay instead of a dashboard panel.
- `docs/phase-13-multi-step-workflows.md` - records the Step 13.5 result.
- `docs/roadmap.md` - records Phase 13 Step 5 progress.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the workflow overlay-control lesson.

**In plain English**
Toki can now show the current workflow step on the overlay. It can point to a workflow target, show a tiny step card, and move through the workflow with Back, Next, and Stop. It still does not verify whether the user actually completed the step yet; that comes later.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- `47c6c40 feat: add workflow step controls`
- `a19af4e style: workflow cue overlay`
- `d0f07a2 docs: record workflow overlay controls`
- learnings repo: `3418813 docs: record workflow overlay controls`

---

## Step 13.6 - Debug Workflow View
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src/App.tsx` - adds a dedicated Debug Workflow tab with mock workflow starters, current-step controls, plan summary, blocked reason, verification status, and full step list.
- `apps/desktop/src/App.css` - styles the workflow step list and active-step state inside Debug.
- `docs/phase-13-multi-step-workflows.md` - records the Step 13.6 result.
- `docs/roadmap.md` - records Phase 13 Step 6 progress.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the workflow debug-view lesson.

**In plain English**
Debug now has a clear workflow view. Instead of guessing what workflow Toki thinks is active, you can see the whole plan, the current step, whether it is blocked, and what verification currently says. This is still inspection and control only; real screen-based verification comes next.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- `de03f46 feat: add workflow debug tab`
- `0f132b3 style: workflow debug list`
- `fd41c4e docs: record workflow debug view`
- learnings repo: `61cf0ae docs: record workflow debug view`

---

## Step 13.7 - Step Verification Stub
*Completed: 2026-07-03*

**What was built**
- `apps/desktop/src/App.tsx` - adds candidate-based workflow verification and makes Next capture the screen, check expected labels/roles, and block when verification fails.
- `docs/phase-13-multi-step-workflows.md` - records the Step 13.7 result.
- `docs/roadmap.md` - records Phase 13 Step 7 progress.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the workflow verification lesson.

**In plain English**
Toki no longer blindly moves to the next workflow step. When you press Next, it checks the current screen for the expected label or UI element first. If it cannot prove the step is ready or done, it marks the workflow blocked instead of pretending everything worked.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.

**Commits**
- `fc8739d feat: verify workflow steps`
- `d113ae5 docs: record workflow verification`
- learnings repo: `4b843b8 docs: record workflow verification`

---

## Step 13.8 - Manual Workflow QA
*Completed: 2026-07-03*

**What was built**
- `apps/browser-extension/fixtures/bridge-payload.json` - fixes the stale environment selector role so the fixture matches the browser extension extractor.
- `scripts/workflow-known-screen-qa.mjs` - adds controlled workflow QA for next, back, blocked, and completed behavior.
- `package.json` - adds `npm run qa:workflow:known-screen`.
- `docs/phase-13-workflow-qa.md` - records the controlled QA commands, passes, fixture fix, and remaining live manual QA.
- `docs/phase-13-multi-step-workflows.md` and `docs/roadmap.md` - record Step 13.8 progress.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the workflow QA lesson.

**In plain English**
Toki now has a repeatable workflow check. It proves a controlled workflow can move next, go back, block when a needed result is missing, and complete when the expected result appears. It also caught a real fixture mismatch before that mismatch could make workflow verification look broken.

**Verification**
- `npm run qa:workflow:known-screen` passed.
- `npm run qa:browser:known-screen` passed.
- `npm run qa:fallback:known-screen` passed.
- `npm --workspace @toki/browser-extension run check` passed.

**Commits**
- `f687cc3 fix browser fixture select role`
- `7a417e5 test: add workflow known-screen qa`
- `69ed181 docs: record workflow qa`
- learnings repo: `e905046 docs: record workflow qa`

---

## Step 13.9 - Safety Integration
*Completed: 2026-07-03*

**What was built**
- `packages/ai/src/index.ts` - makes risky workflow steps confirmation-required by default and adds a controlled delete-project workflow.
- `packages/ai/src/index.test.ts` - verifies risky workflow steps require confirmation.
- `apps/desktop/src/App.tsx` - blocks normal Next on confirmation-required workflow steps.
- `apps/desktop/src/App.css` - adds a compact confirmation marker to the workflow cue.
- `scripts/workflow-known-screen-qa.mjs` - adds QA coverage for risky workflow gating.
- `docs/phase-13-multi-step-workflows.md` and `docs/roadmap.md` - record Step 13.9 progress.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the workflow safety lesson.

**In plain English**
Workflow steps now respect the same safety idea as normal guidance. If a workflow step is risky, Toki does not let it look like a normal safe Next action. It marks the step as confirmation-required and blocks normal advancement until a real confirmation flow exists.

**Verification**
- `npm --workspace @toki/ai run test` passed.
- `npm --workspace @toki/ai run typecheck` passed.
- `npm --workspace @toki/desktop run typecheck` passed.
- `npm run qa:workflow:known-screen` passed.

**Commits**
- `4ea7d8f feat: gate risky workflows`
- `d80f9e9 fix: block unsafe workflow next`
- `d7117b3 test: cover risky workflow gate`
- `89c5fcf docs: record workflow safety`
- learnings repo: `f9988cd docs: record workflow safety`

---

## Step 13.10 - Phase Closure
*Completed: 2026-07-03*

**What was built**
- `docs/phase-13-multi-step-workflows.md` - closes Phase 13 as the controlled multi-step workflow foundation and records the live-accuracy limitation.
- `docs/roadmap.md` - records the Phase 13 closure result.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the final Phase 13 learning update.

**In plain English**
Phase 13 is now closed for controlled multi-step workflows. Toki can hold a workflow plan, show the active step, move next/back/stop, verify expected screen candidates, block failed verification, and safety-gate risky workflow steps. This does not mean arbitrary live dashboard workflows are solved yet; that still needs real browser/provider QA.

**Verification**
- `npm run qa:workflow:known-screen` passed.
- `npm run qa:browser:known-screen` passed.
- `npm run qa:fallback:known-screen` passed.
- `npm --workspace @toki/desktop run typecheck` passed.
- `npm --workspace @toki/ai run test` passed.
- `npm --workspace @toki/ai run typecheck` passed.

**Commits**
- `e142918 docs: close phase 13 workflows`
- learnings repo: `6195867 docs: close phase 13 workflows`

---

## Step 13.5.1 - Click-Aware Contract
*Completed: 2026-07-04*

**What was built**
- `docs/phase-13-5-click-aware-step-advancement.md` - defines automatic click-aware workflow advancement without autonomous clicking.
- `docs/roadmap.md` - inserts Phase 13.5 between manual multi-step workflows and later polish/eval work.

**In plain English**
Toki now has a clear plan for noticing when you click the highlighted target. The important rule is that Toki still does not click for you; it only observes your click near the current target, checks that the screen changed, and then moves to the next step. The phase also records the privacy, permission, false-trigger, and fallback rules before native code is added.

**Verification**
- Documentation-only step; no compile check needed.

**Commits**
- `20f7998 docs: add click-aware workflow phase`

---

## Phase 13.5 - Click-Aware Step Advancement
*Completed: 2026-07-04*

**What was built**
- `packages/shared/src/index.ts` - adds click-aware event and runtime state types.
- `apps/desktop/src-tauri/src/lib.rs` - adds a Mac-first native click monitor that emits left-click coordinates only while armed.
- `apps/desktop/src/App.tsx` - arms click-aware mode for active workflow click targets, hit-tests native clicks, auto-continues after verified hits, and shows Debug status.
- `docs/phase-13-5-click-aware-step-advancement.md` - records the contract, tradeoffs, implementation results, and manual QA requirement.
- `docs/roadmap.md` - records the Phase 13.5 implementation results.
- `learnings/toki/phase-13-multi-step-workflows.md` - records the learning update in the learnings repo.

**In plain English**
Toki can now watch for your own click on the highlighted workflow target. It does not click for you. If your click lands near the current target, Toki waits briefly, recaptures the screen, verifies progress, and advances only if verification passes. Debug can show whether click-aware mode is armed and whether the last click was a hit or miss.

**Verification**
- `npm --workspace @toki/shared run typecheck` passed.
- `npm --workspace @toki/desktop run typecheck` passed.
- `cargo check --workspace` passed.
- `npm --workspace @toki/desktop run build` passed.
- Manual runtime QA still required for real click timing and coordinate alignment.

**Commits**
- `01f2f30 add click-aware workflow types`
- `980eb8b add mac click monitor`
- `e344a66 wire click-aware workflow advance`
- `d0588f1 docs: update click-aware phase results`
- learnings repo: `8d1fc6a docs: record click-aware workflow implementation`

---

## Phase D - React Bits Blob Puck
*Completed: 2026-07-04*

**What was built**
- `apps/desktop/package.json` and `package-lock.json` - add `gsap` for blob animation.
- `apps/desktop/src/BlobPuck.tsx` - renders the blue-purple blob puck from native cursor-driven state.
- `apps/desktop/src/App.tsx` - wires the blob renderer into the existing assistant puck while keeping fallback markup.
- `apps/desktop/src/App.css` - adds the liquid blob styling and reduced-motion fallback behavior.
- `apps/desktop/src/overlayGeometry.ts` - updates edge clamping for the larger blob footprint.
- `docs/phase-14-visual-polish.md` and `docs/roadmap.md` - record the visual polish decision.
- `learnings/toki/phase-14-visual-polish.md` - records the learning update in the learnings repo.

**In plain English**
The puck now uses a blue-purple liquid blob renderer inspired by React Bits instead of only the tiny white CSS cursor-shadow. It still follows the native cursor position, so it works with the click-through overlay. The older CSS puck remains as the reduced-motion fallback.

**Verification**
- `npm --workspace @toki/desktop run typecheck` passed.
- `npm --workspace @toki/desktop run build` passed.
- Dev app launched and Vite hot-reloaded without errors.
- Visual acceptance still needs your final eye test on the running app.

**Commits**
- `9a19c25 add gsap for blob puck`
- `33aec88 add blob puck renderer`
- `2ea3dc4 style: use blue blob puck`
- `e1ec42a docs: record blob puck polish`
- learnings repo: `a80086c docs: record blob puck polish`

---

## Accuracy Stabilization Step 2 - Guidance Trace Baseline
*Completed: 2026-07-10*

**What was built**
- A shared `GuidanceTrace` contract with eight ordered lifecycle stages.
- One trace ID carried through transcript, command, guidance request, provider response, mapping, validation, and overlay render state.
- Guidance Debug visibility for trace source, stage status, duration, and failure/skip reasons.
- Sanitized synthetic success and refusal fixtures for future regression tooling.

**In plain English**
Every guidance request now has one tracking number. If accuracy fails, Debug can show whether the problem began in speech, active-window selection, screenshot capture, candidate collection, the provider, coordinate mapping, validation, or rendering. This step deliberately did not alter which target Toki chooses.

**Verification**
- `npm --workspace @toki/shared run typecheck` passed.
- `npm --workspace @toki/evals run typecheck` passed.
- `npm --workspace @toki/desktop run typecheck` passed.
- `npm --workspace @toki/desktop run build` passed.
- Toki dev app relaunched for live Guidance trace review.

---

## Accuracy Stabilization Step 3 - Atomic Active-Window Snapshot
*Completed: 2026-07-10*

**What was built**
- `packages/shared/src/index.ts` - defines one active-window snapshot contract with window, screenshot, metadata, identity, and timing fields.
- `apps/desktop/src-tauri/src/lib.rs` - captures the active-window observation and screen pixels through one native command, then derives metadata from that exact screenshot.
- `apps/desktop/src/App.tsx` - routes live guidance through the atomic snapshot while leaving mock and debug capture paths unchanged.
- `learnings/toki/phase-4-real-screen-capture.md` - explains snapshot provenance, timing limits, compatibility, and the next coordinate-transform work.

**In plain English**
Live guidance no longer asks three separate questions at three different moments and then assumes the answers belong together. Toki now receives one labeled package containing the selected window, the exact screenshot, matching metadata, and timing information. This does not choose a better target yet, but it gives every later accuracy decision a coherent screen observation.

**Verification**
- `npm --workspace @toki/shared run typecheck` passed.
- `cargo check -p toki-desktop` passed.
- `npm --workspace @toki/desktop run typecheck` passed.
- `npm --workspace @toki/desktop run build` passed.
- `cargo test -p toki-desktop --lib snapshot_metadata_uses_the_exact_screenshot_context` passed.
- The Tauri dev app rebuilt and relaunched with the command registered.

**Commits**
- `ed35752 add active window snapshot contract`
- `53a31fd feat: capture one active window snapshot`
- `f3c8136 wire live guidance to native snapshots`
- learnings repo: `1d01cd0 docs: record atomic capture snapshots`

---

## Accuracy Stabilization Step 4 - Coordinate Transform Contract
*Completed: 2026-07-10*

**What was built**
- `apps/desktop/src/coordinateTransforms.ts` - owns display, screenshot, crop, provider-image, and overlay coordinate conversions.
- `scripts/coordinate-transforms.test.mjs` - verifies Retina scaling, crop offsets, resize mapping, clipping, round trips, and invalid coordinates.
- `apps/desktop/src/retired-local-vision-runtimeVisionProvider.ts` - uses the shared contract for candidate input boxes and provider target output boxes.
- `apps/desktop/src/App.tsx` - uses the same contract when creating an active-window screenshot crop.
- `package.json` - adds the focused `test:coordinates` command.

**In plain English**
Toki now uses one ruler from screenshot capture through vision inference and back to the on-screen target. Retina scaling, active-window cropping, and provider image resizing are covered by deterministic checks, so a correctly chosen target should not drift because different parts of the app used different formulas. This step intentionally leaves target choice and visual tightening unchanged.

**Verification**
- `npm run test:coordinates` passed all 6 tests.
- `npm --workspace @toki/desktop run typecheck` passed.
- `npm --workspace @toki/desktop run build` passed.
- `git diff --check` passed.

**Commits**
- `2b8786b add coordinate transform contract`
- `6d00a01 test: cover coordinate transforms`
- `86f73e9 use shared target coordinate mapping`
- `79f748e use shared active window crop mapping`
- learnings repo: `8c87f7e docs: record coordinate transform contract`

---

## Accuracy Stabilization Step 5 - Provider Image Quality
*Completed: 2026-07-11*

**What was built**
- `packages/shared/src/index.ts` - preserves original screenshot geometry and provider-image preparation metadata in the guidance payload.
- `apps/desktop/src/providerImagePreparation.ts` - defines one bounded quality policy for passthrough, crop, resize, crop-and-resize, and re-encoding.
- `scripts/provider-image-preparation.test.mjs` - verifies image dimensions, source regions, scale factors, quality settings, and invalid crop rejection.
- `apps/desktop/src/App.tsx` - uses one high-quality renderer for provider images and exposes its result in Debug.
- `package.json` - adds the focused `test:provider-image` command.

**In plain English**
Toki now sends a clearer active-app image to the vision model without losing track of where that image came from. Small crops keep their detail, larger crops are bounded at 1536 pixels, JPEG quality rises to 90%, and Debug can show the exact resize and source region. Target selection, ranking, coordinate mapping, validation, and overlay rendering were left unchanged.

**Verification**
- `npm run test:provider-image` passed all 5 tests.
- `npm run test:coordinates` passed all 6 tests.
- `npm run test:guidance:smoke` passed all 46 tests.
- `npm --workspace @toki/shared run typecheck` passed.
- `npm --workspace @toki/desktop run typecheck` passed.
- `npm --workspace @toki/desktop run build` passed.
- `git diff --check` passed.

**Commits**
- `f09635f add provider image provenance fields`
- `52ebf30 add provider image preparation policy`
- `c93e185 test provider image preparation`
- `72f5e53 use higher quality provider images`
- learnings repo: `d4a2b05 docs: record provider image quality policy`

---

## Accuracy Stabilization Step 6 - Live Candidate Fusion
*Completed: 2026-07-11*

**What was built**
- `packages/shared/src/index.ts` - adds a fused candidate source and raw, valid, fused, returned, and per-source evidence counts.
- `apps/desktop/src-tauri/src/lib.rs` - preserves both macOS Accessibility and Vision OCR evidence instead of truncating their combined list before fusion.
- `apps/desktop/src/candidateFusion.ts` - converts live candidates through the shared fusion boundary while preserving preferred geometry and all source provenance.
- `scripts/candidate-fusion.test.mjs` - verifies cross-source deduplication, distinct targets, malformed evidence, and empty collectors.
- `apps/desktop/src/screenCandidates.ts` - fuses first, then applies the existing ranker and 20-candidate provider limit.
- `apps/desktop/src/App.tsx` - shows fusion counts and source composition in Debug and trace details.
- `package.json` - adds the focused `test:candidate-fusion` command.

**In plain English**
Toki no longer treats AX and OCR observations of the same control as unrelated targets. Matching nearby evidence becomes one candidate with a full receipt of every source that saw it. The screenshot remains available to vision, so unlabeled icons are not hidden just because no structured candidate described them.

**Verification**
- `npm run test:candidate-fusion` passed all 4 tests.
- `npm --workspace @toki/ai test` passed all 31 tests.
- `npm run test:guidance:smoke` passed all 46 tests.
- `npm --workspace @toki/shared run typecheck` passed.
- `npm --workspace @toki/desktop run typecheck` passed.
- `cargo check --workspace` passed.
- `npm --workspace @toki/desktop run build` passed.
- `git diff --check` passed.

**Commits**
- `1953f5d add candidate evidence contract`
- `b40b0f8 preserve mixed candidate evidence`
- `777b33b add live candidate fusion boundary`
- `9235daf test candidate evidence fusion`
- `098f8c0 add candidate fusion test command`
- `32d9eee wire fusion before candidate ranking`
- `e0d4f61 show candidate fusion evidence`
- learnings repo: `086a1ab docs: record live candidate fusion`

---

## Accuracy Stabilization Step 7 - Intent-Aware Candidate Ranking
*Completed: 2026-07-11*

**What was built**
- `apps/desktop/src/candidateIntent.ts` - maps generic user commands and candidate evidence into action and object families with explainable positive and conflicting scores.
- `apps/desktop/src/candidateRanking.ts` - applies intent compatibility inside the existing live ranker and uses whole-token matching instead of unsafe substrings.
- `scripts/candidate-intent-ranking.test.mjs` - verifies create, next/play, invite, download, metadata-only, and play-versus-playlist behavior.
- `package.json` - adds the focused `test:candidate-intent` command.

**In plain English**
Toki can now distinguish a control that merely looks clickable from one that actually matches the user's request. A plus control is rewarded for creating something but explicitly penalized for an unrelated next-song command, while accessibility descriptions can explain otherwise generic controls. The change is generic across apps and leaves capture, coordinates, provider vision, safety, thresholds, and rendering untouched.

**Verification**
- `npm run test:candidate-intent` passed all 6 tests.
- `npm run test:candidate-fusion` passed all 4 tests.
- `npm run test:guidance:smoke` passed all 46 tests.
- shared, AI, and desktop type checks passed.
- `npm --workspace @toki/desktop run build` passed.
- `git diff --check` passed.

**Commits**
- `130db81 add candidate intent model`
- `59957e9 wire intent into live candidate ranking`
- `396304e test intent-aware candidate ranking`
- `4607392 add candidate intent test command`
- learnings repo: `23c41e8 docs: record intent-aware ranking`

---

## Accuracy Stabilization Step 8 - Task Planning And Target Localization
*Completed: 2026-07-11*

**What was built**
- `packages/shared/src/index.ts` - adds shared task-plan and current-localization contracts to guidance sessions and requests.
- `apps/desktop/src/guidanceTaskPlanning.ts` - creates stable fallback plans and selects the active localization objective.
- `apps/desktop/src/App.tsx` - ranks candidates with the current objective and shows the original task and active step in Debug.
- `apps/desktop/src/retired-local-vision-runtimeVisionProvider.ts` - makes retired local vision runtime localize one current step instead of planning from the broad task.
- `scripts/guidance-task-planning.test.mjs` - verifies fallback, multi-step selection, prompt separation, and invalid-plan behavior.
- `package.json` - adds the focused `test:guidance-planning` command.

**In plain English**
Toki now keeps the user's complete task separate from the one control it needs to find on the current screen. Existing one-click guidance behaves the same through an honest one-step fallback, while the new boundary gives future multi-step guidance a clean place to provide the next objective. Debug shows both layers so planning mistakes and target-finding mistakes can be diagnosed separately.

**Verification**
- `npm run test:guidance-planning` passed all 6 tests.
- `npm run test:candidate-intent` passed all 6 tests.
- `npm run test:candidate-fusion` passed all 4 tests.
- `npm run test:guidance:smoke` passed all 46 tests.
- shared, AI, and desktop type checks passed.
- `npm --workspace @toki/desktop run build` passed.
- `git diff --check` passed.

**Commits**
- `15414d2 feat: add guidance planning contract`
- `93ea113 add guidance task planning boundary`
- `4baaa11 wire current objective into guidance`
- `a426b0b separate retired local vision runtime planning and localization`
- `5215564 test task and localization separation`
- `312bdb5 add guidance planning test command`
- learnings repo: `6fed98d docs: record task localization boundary`

---

## Accuracy Stabilization Step 9 - Source-Aware Target Verification
*Completed: 2026-07-11*

**What was built**
- `packages/shared/src/index.ts` - adds a shared verification receipt with evidence source, match type, click point, input target, verified target, and reasons.
- `apps/desktop/src/targetVerification.ts` - verifies exact candidate ids, conservatively matches nearby structured evidence, rejects stale or unusable targets, and derives a bounded click cue.
- `apps/desktop/src/App.tsx` - runs verification after provider selection and before the unchanged safety boundary, then exposes the receipt in Guidance Debug and runtime traces.
- `scripts/target-verification.test.mjs` - covers DOM, Accessibility, OCR, vision-only, stale-id, hidden, intent-conflict, off-display, and broad-container cases.
- `package.json` - adds the focused `test:target-verification` command.

**In plain English**
Toki now checks whether a chosen target is still supported by the current screen before drawing it. DOM, Accessibility, and manual evidence can provide the exact control center; OCR supports visible text without replacing the provider's visual center; and a vision-only target keeps its own center. Stale ids, hidden or disabled controls, intent conflicts, broad containers, and off-screen geometry are refused with a specific Debug receipt.

**Verification**
- `npm run test:target-verification` passed all 7 tests.
- `npm run test:guidance-planning` passed all 6 tests.
- `npm run test:candidate-intent` passed all 6 tests.
- `npm run test:candidate-fusion` passed all 4 tests.
- `npm run test:guidance:smoke` passed all 46 tests.
- shared, AI, and desktop type checks passed.
- `npm --workspace @toki/desktop run build` passed.
- `git diff --check` passed.

**Commits**
- `8abe1a2 feat: add target verification receipt`
- `cf29b73 add source-aware target verifier`
- `902b859 wire target verification before safety`
- `6fae5d1 test source-aware click points`
- `4592571 add target verification test command`
- learnings repo: `7686652 docs: record source-aware target verification`

---
