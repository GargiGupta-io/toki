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

### Step 12.3: Unified Element Schema

Create one shared element shape that can represent candidates from every source.

### Step 12.4: Candidate Fusion Layer

Merge candidates from multiple sources into one element map while preserving source metadata.

### Step 12.5: Ranking Improvements

Improve candidate ranking using goal text, role, geometry, visibility, source trust, and risky labels.

### Step 12.6: Browser Known-Screen QA

Run known-screen tests on browser pages using browser DOM candidates.

### Step 12.7: OCR/AX Fallback QA

Run known-screen tests when browser DOM candidates are unavailable.

### Step 12.8: Provider Prompt Update

Make providers choose candidate IDs where possible instead of inventing raw coordinates.

### Step 12.9: Debug Screen Intelligence View

Show candidate sources, ranked candidates, selected target, and misses in Debug.

### Step 12.10: Accuracy Notes

Record accuracy results, misses, model limits, and source reliability.

### Step 12.11: Close Or Escalate

Close Phase 12 if target accuracy is usable on known screens, or escalate to browser-extension-first screen understanding.

## Acceptance Criteria

Phase 12 is done when:

- Toki has one shared element/candidate shape,
- browser DOM, OCR, Accessibility, and manual candidates can be compared together,
- provider requests prefer candidate IDs over raw coordinate guessing,
- known-screen browser QA records useful and wrong targets clearly,
- Debug can explain which candidates existed and which target was selected,
- the docs say whether browser extension candidates are optional or required for reliable web-app guidance.

## Non-Goals

- no autonomous clicking,
- no final production browser-extension packaging,
- no full eval harness,
- no perfect cross-app target accuracy,
- no replacement for Phase 11 safety.
