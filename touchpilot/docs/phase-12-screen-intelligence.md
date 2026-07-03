# Phase 12: Screen Intelligence Upgrade

Phase 12 improves how Toki understands what is on the screen before asking a provider where to guide the user.

## Goal

Toki should stop relying on raw screenshots alone. It should build a stronger map of visible UI elements from browser DOM candidates, OCR text boxes, accessibility nodes, manual fixtures, and screenshot geometry. The provider should choose from that evidence instead of guessing raw coordinates whenever possible.

## Why This Phase Exists

Phase 10 proved that real guidance can work, but target accuracy is still the weakest part of the product. Phase 11 added safety so weak or risky guidance does not render confidently. Phase 12 now improves the evidence before guidance is created.

The target pipeline should move toward this:

```text
screen capture
   |
candidate sources
   |-- browser DOM candidates
   |-- macOS accessibility candidates
   |-- OCR text boxes
   |-- manual known-screen candidates
   |
unified element map
   |
ranking and filtering
   |
provider chooses candidate id
   |
validation and safety
   |
overlay guidance
```

## Evidence Sources

### Browser DOM Candidates

Browser candidates are the strongest source for web apps because they can include visible text, labels, roles, links, buttons, bounding boxes, scroll position, and URL context.

Best use: dashboards, SaaS pages, settings pages, forms, buttons, tabs, and links.

Tradeoff: they need the browser extension or a browser-specific bridge. They are not available in every app.

### OCR Candidates

OCR reads visible text from the screenshot and returns boxes around words or lines.

Best use: visible labels like `Download`, `Manage`, `Invite`, `Search`, `Revoke`, and menu items.

Tradeoff: OCR sees text but not semantics. It may not know whether text is a button, paragraph, tab, or tooltip.

### Accessibility Candidates

Accessibility candidates come from the operating system accessibility tree.

Best use: native controls and apps that expose useful roles, labels, and actions.

Tradeoff: some browsers and web apps expose coarse or incomplete trees, even when permission is granted.

### Manual Candidates

Manual candidates are known-screen fixtures used for repeatable QA.

Best use: controlled tests where we know the correct target.

Tradeoff: they prove the pipeline shape, not real automatic screen understanding.

## Phase 12 Steps

### Step 12.1: Screen Intelligence Contract

Define the goals, evidence sources, acceptance criteria, tradeoffs, and non-goals.

### Step 12.2: Candidate Source Inventory

Record what current browser DOM, OCR, Accessibility, screenshot, and manual candidate paths already produce.

Result: the current candidate inventory is documented below. Toki already has a shared `ScreenCandidate` shape, browser-extension DOM candidates, manual known-screen candidates, script-based macOS Accessibility candidates, script-based macOS Vision OCR candidates, live desktop macOS Vision OCR candidates, and a first-pass ranking layer. The main gap is not "no candidates exist"; the gap is that the sources are not fused into one explainable element map yet.

### Step 12.3: Unified Element Schema

Create one shared element shape that can represent candidates from every source.

Result: `@toki/shared` now has a richer `UiElement` schema for Phase 12 fusion work. It keeps `ScreenCandidate` as the compatibility shape for existing provider requests, but adds a stronger element model with `primarySource`, multiple source provenance entries, role, label, alternate labels, bounds, confidence, visibility, interactability, risky hint, source candidate IDs, ranking metadata, and general metadata.

### Step 12.4: Candidate Fusion Layer

Merge candidates from multiple sources into one element map while preserving source metadata.

Result: `@toki/ai` now exports `fuseScreenCandidates()`. It converts existing `ScreenCandidate[]` into `UiElement[]`, filters invalid candidates, tags source provenance, marks interactable and risky-looking elements, and merges obvious duplicate observations such as a DOM button and OCR text box for the same visible label.

### Step 12.5: Ranking Improvements

Improve candidate ranking using goal text, role, geometry, visibility, source trust, and risky labels.

Result: candidate ranking now weighs source trust, exact label matches, clickable roles, weak region/window roles, button-sized geometry, large-region penalties, hidden/disabled metadata, duplicate labels, and risky words. The same signals are used by the known-screen script ranking and the desktop runtime ranking.

### Step 12.6: Browser Known-Screen QA

Run known-screen tests on browser pages using browser DOM candidates.

Result: added `npm run qa:browser:known-screen`, a deterministic browser known-screen QA script that reads a browser-extension payload, ranks DOM candidates, and verifies that known commands choose the expected browser target. The controlled fixture now carries six realistic DOM candidates from an HTTP page: `Create project`, `Delete project`, `Open settings`, `Project name`, `Environment selector`, and `Add notes`. This proves the browser candidate and ranking path without depending on FreeLLMAPI, Ollama, screenshots, or a live browser session.

### Step 12.7: OCR/AX Fallback QA

Run known-screen tests when browser DOM candidates are unavailable.

Result: added `npm run qa:fallback:known-screen`, a deterministic fallback QA script that uses only Accessibility and OCR candidates. It verifies that `Download the report` chooses the Accessibility `Download` button, `Invite a team member` can fall back to OCR text, and `Search for a project` chooses the Accessibility search field. This proves the no-browser fallback ranking path while keeping live macOS permission/app-specific checks separate.

### Step 12.8: Provider Prompt Update

Make providers choose candidate IDs where possible instead of inventing raw coordinates.

Result: provider prompts now make candidate selection the primary path when candidates exist. When Toki sends ranked candidates, the model is told to return a `candidateId` instead of raw coordinates, and the adapter copies the chosen candidate's exact label and box after validation. `TargetBox` now includes optional `candidateId`, so this link can travel with guidance results.

### Step 12.9: Debug Screen Intelligence View

Show candidate sources, ranked candidates, selected target, and misses in Debug.

Result: the Debug Guidance tab now shows the selected target with its `candidateId` when available and lists the top ranked candidates from the latest guidance request. Each row includes label, id, role, box, score, and ranking reasons. `ScreenCandidate` now carries optional `rank` metadata so Debug can explain why one candidate appeared above another.

### Step 12.10: Accuracy Notes

Record accuracy results, misses, model limits, and source reliability.

Result: accuracy notes are recorded below. The current Phase 12 work proves that candidate extraction, ranking, candidate-id provider prompting, and Debug explanation are structurally healthier than raw screenshot guessing. It does not prove final real-world target accuracy yet. Browser DOM candidates are the most reliable web-app source, OCR/Accessibility are fallback sources, and live provider accuracy still depends on real browser QA with the extension bridge plus a reachable provider.

### Step 12.11: Close Or Escalate

Close Phase 12 if target accuracy is usable on known screens, or escalate to browser-extension-first screen understanding.

Result: Phase 12 is closed as the screen-intelligence foundation. The completed work gives Toki a shared element schema, candidate fusion, improved ranking, deterministic browser QA, deterministic OCR/AX fallback QA, candidate-id provider prompting, and Debug visibility into ranked candidates. Product-grade target accuracy is not claimed yet; it is escalated as future browser-extension-first live dashboard QA and provider evaluation.

## Current Candidate Source Inventory

This is the state at the start of Phase 12.

| Source | Current path | Shape | Strength | Current limit |
| --- | --- | --- | --- | --- |
| Browser DOM | `apps/browser-extension` plus `POST /api/browser-candidates/latest` | `BrowserCandidatePayload` with `ScreenCandidate[]` | Best source for browser apps because it sees labels, roles, boxes, URL, and viewport | Development extension only; not production packaged; requires user/browser setup |
| Manual known-screen candidates | `TOKI_KNOWN_SCREEN_CANDIDATES` | `ScreenCandidate[]` | Stable QA path for controlled screens | Not automatic; does not prove real screen understanding |
| Live bridge browser candidates | `npm run qa:browser:candidates` and `guidance:known-screen` bridge lookup | `ScreenCandidate[]` from latest bridge payload | Lets a real browser page hand candidates to the provider runner | Depends on smoke server and extension popup send flow |
| macOS Accessibility probe | `npm run qa:mac:candidates` | normalized `ScreenCandidate[]` | Can expose roles, labels, and boxes from apps that support Accessibility | Browser trees can be coarse; permission and app targeting matter |
| macOS Vision OCR probe | `npm run qa:mac:ocr:candidates` | normalized `ScreenCandidate[]` with `role: "ocr_text"` | Finds visible text when Accessibility is weak | Text only; can fail on some captures; no semantic role |
| Desktop live OCR | `collect_screen_candidates` Tauri command | `ScreenCandidateResult` with `candidateSource: "macos-vision-ocr"` | Available during live desktop guidance on macOS | OCR-only today; unsupported on non-macOS in this command |
| Candidate ranking | `scripts/candidate-ranking.mjs` and `apps/desktop/src/candidateRanking.ts` | ranked candidates with score/reasons | Reduces noisy candidate lists before provider calls | Ranking is still heuristic and not a true fused UI map |

## Accuracy Notes

This is the current accuracy state after Step 12.10.

| Area | Current result | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Browser fixture candidates | `npm run qa:browser:known-screen` passes for `Create project`, `Open settings`, `Add notes`, and `Delete project` | Browser DOM candidates and ranking can pick the intended target on a controlled page | Real SaaS dashboards still need manual bridge tests |
| OCR/AX fallback | `npm run qa:fallback:known-screen` passes for `Download`, `Invite`, and `Search` | Ranking can use Accessibility controls and OCR text when browser DOM is absent | macOS permissions and app-specific trees can still fail live |
| Candidate-id provider prompts | Provider prompts now require `candidateId` when candidates exist | The provider should choose from real candidates instead of inventing boxes | A weak provider can still choose the wrong candidate id |
| Debug explanation | Guidance tab shows target id, ranked candidates, scores, and reasons | Wrong targets can be inspected instead of guessed about | Debug does not improve accuracy by itself |
| Raw screenshot-only guidance | Still allowed only when no candidates exist | Keeps a fallback path for unknown screens | This remains the weakest and least trusted path |

Source reliability, highest to lowest:

1. Browser DOM candidates from the extension for web apps.
2. Manual known-screen candidates for repeatable QA.
3. Accessibility candidates for native apps and some browser controls.
4. OCR candidates for visible text fallback.
5. Raw screenshot coordinate guessing only when no candidates exist.

Known misses and risks:

- Browser Accessibility can expose only coarse browser/window regions instead of page controls.
- OCR can read visible text but cannot always tell whether the text is a button, label, paragraph, or tooltip.
- Ranking is still heuristic; it does not yet merge nearby DOM/OCR/AX observations into one final fused element inside the desktop runtime.
- Provider selection is now safer because it chooses candidate ids, but model choice can still be wrong if the candidate list is noisy or missing the correct element.
- Real dashboard QA still needs live extension payloads from Chrome/Edge/Safari-like browser flows, not only deterministic fixtures.

Decision:

Phase 12 is closed as a foundation, not as final product accuracy. The next target-accuracy escalation should be browser-extension-first live dashboard testing with candidate fusion exposed directly in Debug.

## Closure

Phase 12 is complete because:

- Toki has a richer shared element shape through `UiElement`.
- Existing `ScreenCandidate` evidence can be fused into explainable elements.
- Browser DOM, OCR, Accessibility, and manual candidates can be compared.
- Ranking now prefers trusted, clickable, goal-matching targets over broad regions.
- Browser known-screen QA passes without provider dependency.
- OCR/AX fallback QA passes without browser DOM dependency.
- Provider prompts now prefer candidate IDs over invented coordinates.
- Debug can show selected target IDs, ranked candidates, scores, and reasons.

What remains after Phase 12:

- live dashboard target-accuracy testing with real extension payloads,
- provider comparison on real screens,
- richer runtime fusion inside the desktop app,
- browser-extension packaging and permissions,
- accuracy scoring over multiple known pages.

These are follow-up accuracy/productization tracks, not blockers for closing the Phase 12 foundation.

## Current Shared Shape

The current shared target candidate shape lives in `packages/shared/src/index.ts`:

```ts
ScreenCandidate = {
  id,
  label,
  role,
  source,
  x,
  y,
  width,
  height,
  metadata,
}
```

This is good enough for Phase 12 to start because all candidate sources can already speak a similar language. The next schema step should decide whether this exact shape is enough or whether Phase 12 needs a richer `UiElement` shape with source confidence, merged labels, duplicate links, viewport state, and provenance.

Step 12.3 decision: keep `ScreenCandidate` for compatibility, and use `UiElement` as the richer fused-map shape.

```ts
UiElement = {
  id,
  primarySource,
  sources,
  role,
  label,
  alternateLabels,
  bounds,
  confidence,
  visible,
  interactable,
  risky,
  sourceCandidateIds,
  rank,
  metadata,
}
```

This lets Phase 12 merge multiple observations into one element. For example, browser DOM may identify a `Download` button, OCR may also read the word `Download`, and Accessibility may expose a generic clickable region. Those should become one fused element, not three unrelated candidates.

## Source Priority Today

Known-screen provider runs currently prefer candidate sources in this order:

1. explicit browser payload path,
2. latest live browser bridge payload,
3. manual candidates,
4. macOS Accessibility candidates,
5. macOS Vision OCR candidates,
6. no candidates.

Live desktop guidance currently calls `collect_screen_candidates`, which on macOS uses Vision OCR, then ranks candidates before sending them with the guidance request.

## Inventory Decision

Phase 12 should not create another isolated candidate format. It should build on the existing `ScreenCandidate` contract and add a fusion layer around it. Browser DOM should be treated as the highest-trust source for browser pages, OCR as the text fallback, Accessibility as the semantic fallback where available, and manual candidates as the QA baseline.

## First Fusion Layer

Step 12.4 added the first pure candidate fusion helper:

```ts
fuseScreenCandidates(candidates, options) -> UiElement[]
```

The helper does four things:

1. rejects invalid candidates with missing labels or impossible boxes,
2. converts every remaining `ScreenCandidate` into a richer `UiElement`,
3. preserves source provenance so Debug can later explain where the element came from,
4. merges same-label candidates that are very close or strongly overlapping.

This is not the final fusion algorithm. It is the first safe layer that turns disconnected candidate boxes into a screen element map without changing provider behavior yet.

## Ranking Signals

Step 12.5 strengthened the current candidate ranking layer before provider calls.

Current signals:

- source trust: browser DOM and manual candidates outrank OCR and broad Accessibility regions,
- exact label match: a candidate whose label appears directly in the command gets a strong boost,
- goal token match: labels matching command words score higher,
- clickable role: buttons, links, inputs, tabs, and similar roles score higher,
- OCR visibility: OCR text gets a small positive signal, but not enough to beat a trusted DOM button by itself,
- weak region role: browser windows, app windows, groups, toolbars, and broad regions score lower,
- button-sized geometry: plausible click targets score higher,
- large region penalty: huge rectangles are less likely to be precise targets,
- hidden/disabled penalty: metadata can push unavailable targets down,
- duplicate label penalty: repeated generic labels like `Info` are less trusted,
- risky word flag: labels like `delete`, `revoke`, `pay`, and `send` are marked down for caution.

This still does not make ranking perfect. It makes bad candidates less likely to reach the provider as the top options, especially broad browser/window regions that previously looked valid but were not useful click targets.

## Acceptance Criteria

Phase 12 is done when:

- Toki has one shared element/candidate shape,
- browser DOM, OCR, Accessibility, and manual candidates can be compared together,
- provider requests prefer candidate IDs over raw coordinate guessing,
- guidance targets can preserve the selected `candidateId`,
- known-screen browser QA records useful and wrong targets clearly,
- browser DOM known-screen QA passes independently of provider uptime,
- OCR/AX fallback QA passes without browser DOM candidates,
- Debug can explain which candidates existed and which target was selected,
- Debug can show candidate rank scores and reasons,
- the docs say whether browser extension candidates are optional or required for reliable web-app guidance.

## Non-Goals

- no autonomous clicking,
- no final production browser-extension packaging,
- no full eval harness,
- no perfect cross-app target accuracy,
- no replacement for Phase 11 safety.
