# Phase 12: Screen Intelligence Upgrade

> Phase 12 is about making Toki understand screen targets better before it asks a model where to guide the user.

---

## In Plain English

Toki can already listen to a command and show a target on the screen, but the hard part is knowing which thing on the screen is actually the right thing. A raw screenshot is like a photo of a room: you can see objects, but you do not automatically know which ones are buttons, links, fields, warnings, or decorations.

Phase 12 is where Toki starts building a proper map of the screen. Instead of asking a provider to guess coordinates from a screenshot, Toki should give it a list of possible targets: text boxes from OCR, controls from Accessibility, exact browser elements from the extension, and manual known-screen fixtures for testing.

The goal is not perfect accuracy immediately. The goal is to make target selection explainable and testable. If Toki points to the wrong place, Debug should tell us which candidates existed, which one was chosen, and why.

## What Phase 12 Builds Toward

The target pipeline should become:

```text
screen capture
   |
candidate sources
   |
unified screen element map
   |
ranking and filtering
   |
provider chooses a candidate id
   |
validation and safety
   |
overlay guidance
```

This matters because a provider inventing raw coordinates is weak. A provider choosing from real candidates is stronger, easier to validate, and easier to debug.

## Evidence Sources

### Browser DOM Candidates

Plain English: browser DOM candidates are the browser telling Toki what real page elements exist.

These are the strongest source for web apps because they can include button text, link labels, ARIA labels, roles, bounding boxes, URL context, and scroll position. This is why the browser extension work matters.

Tradeoff: this requires a browser extension or browser-specific bridge. It will not help in non-browser apps.

### OCR Candidates

Plain English: OCR reads visible text in a screenshot and gives Toki boxes around it.

OCR is useful when Accessibility is weak or when the browser does not expose useful child elements. It can find words like `Download`, `Invite`, `Manage`, or `Revoke`.

Tradeoff: OCR sees text, not meaning. It does not always know whether text is a button, tab, field, paragraph, or tooltip.

### Accessibility Candidates

Plain English: Accessibility candidates come from the operating system's UI tree.

This can be very useful for native controls and apps that expose roles, labels, and actions. It can also help with browser windows, but previous testing showed that browser Accessibility can be too coarse.

Tradeoff: permission and app support matter. Sometimes the tree exists but does not expose the useful page-level elements.

### Manual Candidates

Plain English: manual candidates are controlled test targets we write ourselves.

They are useful for known-screen QA because they tell us whether the pipeline can choose from candidates correctly.

Tradeoff: they do not prove real screen understanding by themselves.

## Step Plan

Phase 12 now has these steps:

1. Screen intelligence contract.
2. Candidate source inventory.
3. Unified element schema.
4. Candidate fusion layer.
5. Ranking improvements.
6. Browser known-screen QA.
7. OCR/AX fallback QA.
8. Provider prompt update.
9. Debug screen-intelligence view.
10. Accuracy notes.
11. Close or escalate.

## Acceptance Criteria

Phase 12 should not close until:

- Toki has one shared candidate/element shape,
- browser DOM, OCR, Accessibility, and manual candidates can be compared together,
- provider requests prefer candidate IDs instead of raw coordinate guessing,
- known-screen browser QA records useful and wrong targets clearly,
- Debug can explain what candidates existed and which one was selected,
- the docs say whether browser extension candidates are optional or required for reliable web-app guidance.

## Coordinate Transform Contract

Plain English: Toki now uses one ruler for every stage of guidance instead of letting capture, candidates, and the vision provider each measure the screen differently.

On a Retina Mac, the dimensions used by the desktop UI are logical points while screenshots contain more physical pixels. Active-window guidance adds another coordinate space because the screenshot is cropped, and the provider adds one more because that crop is resized before inference. A correct target must travel through the same ordered chain in both directions:

```text
display points
   -> screenshot pixels
   -> active-window crop pixels
   -> provider image pixels
   -> screenshot pixels
   -> display points
```

The pure `coordinateTransforms.ts` module now owns this chain. It provides three focused operations:

- `createScreenshotCropFromDisplayRect()` converts a logical active-window rectangle into screenshot pixels.
- `mapDisplayRectToProviderImage()` converts a known display candidate into the cropped and resized image sent to the provider.
- `mapProviderTargetToDisplay()` converts a provider target back into the logical display coordinates used by the overlay.

The provider still applies its existing click-center tightening after the raw geometry conversion. That separation is intentional: coordinate transforms answer "where did this rectangle move when the image was cropped and resized?" while target tightening answers "where inside that rectangle is the best small click cue?" Mixing those responsibilities would make future accuracy bugs harder to isolate.

The deterministic coordinate suite covers Retina scaling, active-window crop offsets, provider resizing, full-display mapping, partial candidate clipping, round trips, and rejection of missing or off-image coordinates. These tests do not prove that the vision model chose the right icon. They prove that once a target is chosen, Toki does not move it because two parts of the app used different scale formulas.

Tradeoff: this contract deliberately preserves the current target-selection and target-tightening behavior. It removes coordinate drift without pretending to solve provider quality, candidate ranking, or semantic intent. Those remain separate accuracy steps and can now be debugged without geometry noise.

## Provider Image Quality Contract

Plain English: Toki now gives the vision model a clearer view of the active app while keeping a receipt that explains exactly how the original screenshot became the provider image.

The previous preparation path capped every provider image at 1024 pixels on its longest edge and recompressed every active-window crop as JPEG quality `0.76`. That kept requests small, but it could soften compact toolbar icons, thin outlines, and small text before the model ever saw them. Accuracy work after that point could not recover details that preprocessing had already discarded.

The provider-image policy now uses a 1536-pixel maximum edge and JPEG quality `0.90`, with high-quality canvas resampling. Small screenshots can pass through unchanged, compact active-window crops keep their native screenshot-pixel dimensions, large crops are resized proportionally, and oversized full-display payloads can be re-encoded without an unnecessary geometric resize.

Every prepared payload can now retain:

- original screenshot width, height, and format,
- the exact source region used for the provider image,
- the output provider-image width and height,
- the preparation strategy,
- horizontal and vertical scale factors,
- the maximum-edge policy,
- JPEG quality when recompression occurred.

Debug reports the real provider image dimensions and preparation strategy. This matters because a target miss can now be separated into two categories: the model chose the wrong thing, or the input image lost too much evidence before inference.

Tradeoff: increasing the longest edge from 1024 to 1536 gives the model roughly 2.25 times as many pixels in the square worst case, so local retired local vision runtime inference can take longer. The policy does not send the original Retina crop blindly; it preserves more useful detail while keeping a deterministic upper bound. Later fixture tests should measure whether the accuracy gain justifies this latency on the primary Mac.

The new deterministic suite covers passthrough, native-resolution crops, crop-and-resize behavior, oversized-payload re-encoding, source geometry, scale metadata, and invalid crop rejection. Coordinate and guidance regression suites still pass, proving the quality change did not alter the coordinate contract or provider refusal rules.

## Live Candidate Fusion Contract

Plain English: Toki now combines repeated observations of the same control before asking either the ranker or the provider to reason about them.

Before this accuracy step, the macOS collector already ran Accessibility and Vision OCR. The problem was that it simply appended the two arrays, labelled the combined result as Accessibility, truncated the list to 70 items, and then ranked the duplicates independently. A `Download` button seen by AX and the same `Download` text seen by OCR could therefore compete as if they were unrelated controls. If AX filled most of the old cap, useful OCR observations could disappear before the frontend received them.

The live path now uses the existing pure `fuseScreenCandidates()` boundary before intent ranking. Matching observations merge only when they have the same normalized label and are spatially close or strongly overlapping. Different controls with the same label remain separate when they occupy different parts of the screen. Each fused candidate keeps:

- the preferred source candidate id,
- the strongest source and confidence,
- every contributing source,
- every contributing source candidate id,
- the selected geometry,
- source-specific metadata.

The shared request contract now records four separate counts:

- `rawCount`: everything returned by the collectors,
- `validCount`: observations with usable labels and positive finite boxes,
- `fusedCount`: distinct elements after conservative deduplication,
- `returnedCount`: candidates remaining after ranking and active-window filtering.

It also records valid source counts for Accessibility, OCR, browser DOM, manual, and unknown evidence. Debug exposes these numbers so a target miss can be classified as collection loss, malformed evidence, duplicate inflation, ranking loss, or provider error instead of appearing as one vague accuracy problem.

The screenshot remains primary visual evidence for retired local vision runtime Vision. Candidate fusion does not force the model to choose one of the candidate boxes and does not hide icon-only controls that neither AX nor OCR described. Candidate summaries are supporting evidence; direct screenshot localization remains available. This is the key tradeoff: candidate evidence improves grounding and explainability, but making it a hard whitelist would reduce recall on visually obvious unlabeled icons.

The native collector no longer truncates the concatenated AX+OCR list before fusion. The frontend performs conservative deduplication first and applies the existing 20-candidate ranking limit afterward. This preserves both sources without sending an unbounded candidate list to the provider.

Deterministic tests now prove that:

- matching AX, OCR, and DOM observations become one fused element,
- the strongest source supplies the provider-compatible candidate while all provenance survives,
- same-label controls in different locations stay separate,
- malformed boxes are rejected and counted honestly,
- an empty collector preserves its real unavailable source,
- existing AI, safety, guidance smoke, TypeScript, Rust, and production-build checks still pass.

Tradeoff: fusion is deliberately conservative and only deduplicates evidence; it does not decide user intent. Semantic ranking remains the next accuracy step so changes to intent scoring can be evaluated separately from evidence collection.

## Intent-Aware Candidate Ranking Contract

Plain English: Toki now separates two questions that used to be mixed together: "Does this look like a real control?" and "Does this control do what the user asked?"

Source trust, visibility, role, and size answer the first question. They can tell Toki that an Accessibility button is more credible than a large OCR region, but they cannot tell Toki that a plus button is wrong when the user asked to skip to the next song. The new intent layer answers the second question by comparing the action and object in the command with the action and object described by each candidate.

The generic action families are:

- create,
- open,
- play,
- pause,
- next,
- previous,
- search,
- download,
- invite,
- settings,
- delete,
- submit.

The generic object families are:

- collections such as playlists, lists, libraries, queues, and folders,
- media such as songs, tracks, albums, videos, and episodes,
- people such as collaborators, members, users, and friends,
- files such as reports, documents, attachments, and archives,
- settings, permissions, privacy, and security surfaces.

This vocabulary is deliberately product-neutral. There are no Spotify, browser-site, or one-screen exceptions. The same rule that rejects a create control for a "next song" request also rejects an unrelated create control in any other desktop or web app.

### Candidate Semantic Evidence

Plain English: a control's visible label is useful, but its hidden accessibility description can be even more informative.

The intent scorer builds a semantic description from the candidate label, role, and selected metadata fields:

- native role,
- native name,
- native description,
- native help,
- native value,
- ARIA label,
- title,
- placeholder,
- DOM tag name,
- test id.

This means a generic visible label such as `Toolbar item` can still rank correctly when macOS Accessibility says `Download current report`. Metadata is supporting semantic evidence; it does not change the candidate geometry or bypass the existing source, visibility, and safety checks.

### Positive And Negative Intent Evidence

Plain English: matching evidence earns points, but a clearly wrong action now loses points instead of merely failing to earn a bonus.

The scorer records explainable reasons in the candidate's existing rank trace:

```text
intent-action:next
intent-primary-action:next
intent-object:media
intent-action-object-pair
intent-action-conflict:create->play+next
```

An action match earns a semantic boost. The command's primary action receives an additional boost, which matters for phrases such as `play the next song`: both `play` and `next` are relevant, but the next/skip control is the more specific target. Matching the requested object earns another boost, and matching both action and object earns a pair bonus.

A candidate that clearly advertises an incompatible action receives a strong penalty. This is the guard that prevents a trusted, visible, button-sized plus control from winning every command merely because it has good structural evidence.

The scorer also understands a small number of compositional meanings. For example, `add` plus a person object is treated as invite/collaboration intent. This handles natural wording such as `add collaborators` without creating an application-specific exception.

### Exact Token Boundary Fix

The previous text matcher used substring checks. That meant the token `play` could match the label `playlist`, even though those words describe different actions and objects. The live ranker now compares whole normalized tokens and whole label phrases. `Play` no longer receives accidental evidence from `Playlist`, while exact labels such as `Download` still match their commands.

### Preserved Boundaries

This step intentionally did not change:

- local candidate acceptance thresholds,
- candidate collection or fusion,
- screenshot preparation,
- provider prompting or model output parsing,
- coordinate transforms,
- target tightening,
- risk and confirmation policy,
- overlay rendering.

That boundary matters because a semantic-ranking regression can now be isolated from geometry, capture, model quality, or visual rendering. The existing score reasons appear in Debug automatically, so rejected and selected candidates remain explainable.

### Deterministic Coverage

The live TypeScript ranker now has focused tests proving that:

- create-collection intent prefers a create control,
- next-media intent beats and explicitly penalizes an unrelated plus control,
- `add collaborators` resolves to an invite/person control,
- download-report intent beats search and settings controls,
- native metadata can supply meaning when the visible label is generic,
- `play` is not treated as a text match inside `playlist`.

Candidate fusion, all 46 existing guidance smoke tests, shared and AI type checks, desktop type checking, and the production web build still pass.

Tradeoff: the live desktop ranker is now more expressive than the older standalone JavaScript known-screen ranker. The live path is the source of truth for this step. Consolidating fixture harnesses around the live scorer belongs in the later fixture and shadow-comparison step so test infrastructure changes do not get mixed into semantic behavior.

## Task Planning And Target Localization Contract

Plain English: Toki now separates the user's whole job from the one control it must find on the current screen.

A broad request such as `Create a report and share it with the team` contains several actions. If the vision provider sees that entire sentence on every screen, it has to do two jobs at once: decide what the next step should be and locate that step's control. That ambiguity makes it easier to jump ahead, choose a control for a later action, or keep returning the same visually prominent target.

The guidance pipeline now carries two related but distinct values:

- `originalGoal`: the complete task the user asked Toki to help with,
- `objective`: the single current step that candidate ranking and visual localization should solve now.

The relationship is explicit in the shared contract:

```text
original user task
   |
GuidanceTaskPlan
   |
current step index
   |
GuidanceLocalizationContext
   |
candidate ranking + vision localization
```

`GuidanceTaskPlan` owns a stable plan id, the original goal, its source, ordered steps, and creation time. `GuidanceLocalizationContext` is the smaller request-time view containing the active step id, index, total step count, and objective. This makes the provider a localizer rather than an accidental planner.

### Compatibility Fallback

Plain English: current one-click guidance keeps working even though the planning boundary now exists.

Toki does not yet have a production task planner. `createSingleStepGuidanceTaskPlan()` therefore creates one immutable fallback step whose objective equals the normalized original goal. Existing requests behave as before, but the runtime no longer has to be redesigned when a real planner later supplies multiple steps.

The fallback is deliberately honest. Its source is `single_step_fallback`, not `planner`, and Debug shows that source. A future planner can replace the fallback with ordered objectives without changing screenshot capture, candidate collection, provider mapping, or overlay rendering.

### One Objective Through The Live Path

Plain English: every part that decides *which control matches the request* now receives the same current instruction.

The overlay derives one localization context from the active session before collecting candidates. It then uses that objective for:

- Accessibility and OCR candidate ranking,
- local-candidate summaries,
- retired local vision runtime action and object mismatch guards,
- click-center tightening decisions,
- system-menu rejection,
- the retired local vision runtime vision prompt.

The provider prompt now states both `Original task` and `Current step objective`, but explicitly tells retired local vision runtime to use the original task only as context, localize one control for the current step, and avoid jumping to future steps.

### Debug Visibility

Debug now shows:

- plan source,
- original task,
- current localization step and total steps,
- current objective,
- existing session id and status.

This makes planning mistakes distinguishable from localization mistakes. If the objective is wrong, the planner/session boundary is responsible. If the objective is right but the target is wrong, candidate evidence, ranking, provider vision, validation, or coordinates can be inspected next.

### Preserved Boundaries

This step intentionally did not change:

- screenshot capture or active-window cropping,
- provider image preparation,
- candidate fusion,
- semantic scoring weights or acceptance thresholds,
- coordinate transforms or click-point tightening formulas,
- safety and confirmation policy,
- target rendering or overlay motion.

That narrow boundary protects the working target-lock path. The structural split changes which text is used for the active decision; it does not alter how evidence is collected, where accepted coordinates are mapped, or how guidance appears.

### Deterministic Coverage And Tradeoff

The focused planning suite proves that:

- the fallback preserves and normalizes the original task,
- a multi-step plan exposes only its selected current objective,
- older requests without localization context still fall back to `goal`,
- the retired local vision runtime prompt keeps the full task separate from the current objective,
- empty plans are rejected,
- normalized plan ids produce stable normalized step ids.

All candidate-intent, candidate-fusion, and 46 guidance smoke tests still pass. Shared, AI, and desktop type checks pass, and the desktop production web build succeeds.

Tradeoff: this is a planning boundary, not a full planner. The current runtime still creates one fallback step, so it does not yet decompose complex tasks automatically. That restraint is intentional: multi-step planning can now be added and evaluated independently instead of being hidden inside a vision prompt.

## Source-Aware Target Verification And Click Points

Plain English: Toki now checks the evidence behind a target one final time before drawing the guidance ring.

The provider and local ranker answer the semantic question: "Which control appears to match the current objective?" That answer is not yet a safe click point. A provider can return a stale candidate id, a large container, a hidden control, an OCR text rectangle, or a visually plausible box that is slightly different from the structured UI evidence. Previously, the accepted provider box could travel directly into safety and rendering without a receipt explaining which evidence ultimately determined the click point.

The new `targetVerification.ts` boundary sits after provider selection and before the existing safety policy:

```text
provider or local target
   |
source-aware target verification
   |
verified click point + compact cue
   |
existing safety policy
   |
session + overlay rendering
```

This ordering is deliberate. Verification does not choose a different task, call a provider, rerank the whole screen, lower confidence requirements, or bypass confirmation. It only checks whether the selected target is still supported by the current screen evidence and derives the most trustworthy click point available.

### Exact Candidate Id Match

Plain English: when the provider names a real candidate, Toki requires that exact candidate to still exist.

The strongest match is an exact `candidateId`. Toki looks up that id in the candidates attached to the same guidance request. If the id is missing, the target is rejected as stale instead of silently falling back to unrelated geometry. This prevents a delayed provider response from pointing at an element that belonged to an earlier screen state.

An exact match still has to pass the evidence checks. Toki refuses candidates that are:

- hidden or marked not visible,
- disabled,
- outside the active display,
- tagged by intent ranking as conflicting with the current objective,
- broad window, application, group, toolbar, menu-bar, or region containers rather than precise controls.

The important rule is that an id proves identity, not usability. A real id can still describe the wrong kind of object for a click cue.

### Conservative Spatial Match

Plain English: a visual box may be connected to nearby structured evidence, but only when the two observations are already almost touching.

retired local vision runtime Vision uses the sentinel id `retired-local-vision-runtime-vision-target` because it often localizes a visual control without choosing a structured candidate id. Toki therefore searches for valid candidates within a small 12-point distance of the provider target center. Candidates are ordered by source trust, existing rank score, and distance:

```text
DOM            strongest structural trust
Accessibility  strong native-control trust
manual         controlled QA evidence
OCR            supporting text evidence
vision         no structured candidate
```

This is intentionally conservative. It is not a nearest-element search across the whole screen. A distant candidate cannot steal a valid vision target merely because its label or source looks attractive.

### Source-Specific Click Point Rules

Plain English: different evidence sources know different things, so Toki does not treat every rectangle as equally authoritative.

The final click point follows these rules:

| Evidence source | Click point rule | Why |
|---|---|---|
| DOM | candidate center | Browser geometry usually describes the real interactive element |
| Accessibility | candidate center | Native UI geometry usually describes the actionable control |
| Manual | candidate center | A manual fixture is an explicit known control |
| OCR | provider target center | OCR usually describes visible text, not the complete button around it |
| Vision only | provider target center | No stronger structured geometry exists |

This avoids a common OCR mistake. If the word `Download` sits inside a larger button, replacing the provider's button center with the OCR text center may create a fragile click point near one edge. OCR can confirm that the target has supporting text while the provider keeps responsibility for the visual click center.

### Compact Guidance Cue

Plain English: Toki now draws a small cue around the verified click point instead of reusing a large evidence box.

The verifier converts the accepted click point into a square cue between 24 and 44 logical display points. It clamps the cue to the active display so the ring remains visible near screen edges. This cue is a presentation target, not a rewrite of the underlying evidence. Debug retains both:

- `inputTarget`: the target received from the provider or local selector,
- `verifiedTarget`: the compact box passed to safety and rendering,
- `clickPoint`: the exact center used to construct the cue.

Keeping both boxes prevents visual tightening from erasing the evidence trail.

### Revalidation Before Safety

Plain English: after Toki creates the click cue, it validates the complete guidance result again.

The verifier runs `validateGuidanceResult()` on the updated result. Invalid geometry or schema output becomes an unavailable response with a specific `step.target` issue. Existing risk classification, confidence requirements, confirmation policy, session behavior, and overlay rendering then run unchanged.

This is defense in depth rather than duplicated policy:

- target verification checks evidence freshness, source trust, geometry, and click-point derivation,
- safety decides whether the action may be shown, refused, or requires confirmation,
- rendering displays only the result that survives both boundaries.

### Debug Receipt

Plain English: Debug can now answer not only where Toki pointed, but why that exact point survived.

`GuidanceProviderResponse.debug.targetVerification` records:

- accepted or rejected status,
- evidence source,
- exact-id, spatial, or vision-only match,
- verified candidate id and role when present,
- final click point,
- original provider target,
- verified compact target,
- machine-readable reasons.

The Guidance tab exposes the source, match type, candidate id, click point, and reasons. The runtime guidance trace also records verification status, evidence source, and click point. A target miss can now be separated into provider localization, stale evidence, source mismatch, click-point derivation, safety refusal, or rendering.

### Preserved Boundaries

This step intentionally did not change:

- screen capture or active-window cropping,
- provider-image preparation,
- task planning or current objective selection,
- candidate collection, fusion, or intent ranking,
- retired local vision runtime prompting or provider model choice,
- coordinate transforms,
- confidence and safety thresholds,
- confirmation policy,
- overlay motion or visual design.

That scope protects the working target-lock path. The same provider target is accepted or rejected using current evidence; this step does not add an application-specific fallback or force every vision answer onto a candidate.

### Deterministic Coverage And Tradeoff

The focused verifier suite proves that:

- exact DOM targets use the candidate center,
- nearby visual targets can snap to Accessibility evidence,
- OCR supports a target without replacing the provider click point,
- vision-only targets preserve the provider center,
- stale candidate ids are rejected,
- hidden, disabled, and intent-conflicting candidates are rejected,
- off-display targets and broad containers are rejected.

Planning, intent ranking, fusion, and all 46 guidance smoke tests still pass. Shared, AI, and desktop type checks pass, and the production desktop web build succeeds.

Tradeoff: spatial matching uses a small fixed tolerance and source-specific heuristics. That is safer than broad nearest-neighbor snapping, but it can leave a valid vision target as vision-only when structured evidence is more than 12 points away. Later fixture and shadow-comparison work should measure that boundary rather than loosening it based on one application.

## Updates

- 2026-07-03 - Step 12.1 created the Phase 12 screen-intelligence contract. The important decision is to treat raw screenshots as insufficient evidence and move toward a unified element map built from browser DOM candidates, OCR, Accessibility, manual fixtures, and screenshot geometry.
- 2026-07-03 - Step 12.2 inventoried the candidate sources that already exist. Toki already has browser DOM candidates, live bridge payloads, manual known-screen candidates, macOS Accessibility probes, macOS Vision OCR probes, desktop live OCR candidates, and heuristic ranking. The key learning is that Phase 12 should not invent a disconnected format; it should build a fusion layer around the existing `ScreenCandidate` contract.
- 2026-07-03 - Step 12.3 expanded the shared `UiElement` schema. `ScreenCandidate` remains the simple provider-compatible box shape, while `UiElement` becomes the richer fused-map shape with provenance, labels, bounds, confidence, visibility, interactability, risk hints, ranking, and source candidate IDs. This lets later fusion merge DOM, OCR, AX, and manual observations into one explainable screen element.
- 2026-07-03 - Step 12.4 added the first pure fusion helper, `fuseScreenCandidates()`, in `@toki/ai`. It converts current `ScreenCandidate[]` evidence into richer `UiElement[]`, rejects invalid boxes, preserves provenance, marks interactable/risky hints, and merges close same-label observations. The key tradeoff is that this is still conservative heuristic fusion, not a full layout engine.
- 2026-07-03 - Step 12.5 strengthened candidate ranking in both known-screen scripts and the desktop runtime. Ranking now gives more weight to trusted DOM/manual sources and exact label matches, while penalizing broad window/region candidates and hidden/disabled targets. This directly addresses the earlier browser problem where a huge browser/window candidate could look valid but was useless for precise guidance.
- 2026-07-03 - Step 12.6 added deterministic browser known-screen QA. The new `npm run qa:browser:known-screen` script reads the browser-extension fixture payload, ranks DOM candidates, and verifies that known commands choose the expected target. The important tradeoff is that this proves the browser candidate/ranking path without depending on FreeLLMAPI, retired local vision runtime, screenshots, or an active browser session; live provider accuracy still needs later manual QA.
- 2026-07-03 - Step 12.7 added deterministic OCR/AX fallback QA. The new `npm run qa:fallback:known-screen` script intentionally excludes browser DOM candidates and checks that Accessibility can win for controls like `Download` and `Search`, while OCR can still supply text targets like `Invite`. The key tradeoff is that this proves fallback ranking and parser behavior, but live macOS permission quality still depends on the target app and must be tested separately.
- 2026-07-03 - Step 12.8 updated the provider prompt contract. When ranked candidates exist, providers are now told to return a `candidateId` instead of raw coordinates, and the adapter anchors that id back to the candidate's exact label and box. This reduces coordinate guessing while still allowing raw coordinate fallback only when there are no candidates.
- 2026-07-03 - Step 12.9 made screen intelligence visible in Debug. The Guidance tab now shows the selected target's candidate id and the top ranked candidates with their score and reasons. This helps explain why Toki chose a target instead of only showing the final ring on screen.
- 2026-07-03 - Step 12.10 recorded the accuracy state. The foundation is stronger: browser DOM fixture ranking passes, OCR/AX fallback ranking passes, provider prompting now prefers candidate ids, and Debug explains candidate scores. The honest limitation is that this is not final product accuracy yet; live dashboard tests with real browser-extension payloads and a provider are still needed before calling target selection reliable.
- 2026-07-03 - Step 12.11 closed Phase 12 as a foundation, not as final product accuracy. The main learning is that Toki now has the right evidence/ranking/debug structure, but real target accuracy must be proven later with live browser-extension dashboard payloads, provider comparisons, and repeated known-page tests.
- 2026-07-05 - Live guidance debugging exposed a gap between the "brain pipeline" and the "perception brain." Voice, screenshots, validation, and rendering were connected, but Spotify-style icon-only actions such as "make a new playlist" could fail because OCR cannot read an unlabeled plus icon and the old Accessibility path was either gated off or too weak. The macOS candidate collector now uses a native Swift/AX probe instead of the old System Events/JXA approach, skips permission prompts when Accessibility is not trusted, and returns richer native roles/help/value metadata. Ranking now trusts native Accessibility more than OCR, treats `+` as `plus`, adds create/collection intent boosts, accepts strong native candidates at a lower threshold, and explains the top rejected candidate with source, role, score, and reasons. This does not make every app accurate yet, but it connects the live macOS UI-candidate path that was missing from real guidance.
- 2026-07-10 - Accuracy Stabilization Step 4 replaced duplicated crop and provider scale formulas with one pure coordinate-transform contract. The same tested path now maps display candidates into provider images and maps provider targets back to the overlay across Retina scaling, active-window crops, and provider resizing. Existing target selection and click-center tightening were intentionally left unchanged.
- 2026-07-11 - Accuracy Stabilization Step 5 raised active provider-image fidelity from a 1024px/0.76 JPEG policy to a bounded 1536px/0.90 policy, added high-quality resampling, and preserved source geometry plus preprocessing metadata in the guidance payload. Debug now exposes provider dimensions and preparation details, while prompt, ranking, validation, coordinate mapping, and rendering behavior remain unchanged.
- 2026-07-11 - Accuracy Stabilization Step 6 connected live macOS AX and OCR output to the existing candidate-fusion boundary before ranking. The runtime now preserves both sources, removes conservative same-target duplicates, keeps full provenance, records raw/valid/fused/returned counts, and leaves screenshot vision available for unlabeled controls.
- 2026-07-11 - Accuracy Stabilization Step 7 replaced narrow create-specific bonuses with a generic action/object intent contract. Live ranking now uses candidate labels plus selected AX/DOM metadata, rewards compatible actions and objects, penalizes conflicting actions, understands natural composites such as `add collaborators`, and fixes the `play`-inside-`playlist` substring bug without changing capture, coordinates, provider vision, safety, thresholds, or rendering.
- 2026-07-11 - Accuracy Stabilization Step 8 separated the user's complete task from the current screen-localization objective. Guidance sessions now own an explicit task plan, live candidate ranking and retired local vision runtime localize only the active objective, Debug shows both layers, and a one-step fallback preserves current behavior until a real multi-step planner is connected.
- 2026-07-11 - Accuracy Stabilization Step 9 added a source-aware verification boundary between provider selection and safety. Exact candidate ids must still exist, nearby structured evidence can conservatively support visual targets, source-specific rules determine the click point, broad or stale evidence is refused, and Debug retains both the provider target and verified cue without changing planning, capture, ranking, model selection, safety thresholds, or rendering.
