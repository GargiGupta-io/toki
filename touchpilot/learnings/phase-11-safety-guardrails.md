# Phase 11: Safety And Guardrails

> Phase 11 is where Toki stops treating every valid target as equally safe. It adds a policy layer between provider guidance and the overlay so sensitive guidance is warned or reveal-gated according to consequence.

---

## In Plain English

Toki can now listen to a command, look at the screen, collect browser candidates, and ask a provider where to guide the user. That is powerful, but it also creates risk. If Toki points at the wrong delete button, payment button, revoke button, or account setting, the user could make a bad click because the assistant looked confident.

Phase 11 exists to add a safety checkpoint. The app can still guide the user, but sensitive guidance should not appear without context. Account and permission targets show immediately with a warning; strong-risk targets remain hidden until the user explicitly asks to see them.

The important product rule is simple: Toki may guide, but the user stays in control. `Show target` means "reveal the guidance marker after warning me." It does not mean Toki clicks anything automatically.

## What Changed In Step 11.1

Step 11.1 created the safety contract before runtime code. That matters because safety code without a written policy becomes inconsistent quickly. The app needs a clear rulebook for what counts as safe, what requires confirmation, and what should be blocked or clarified.

Files updated in the Toki repo:

- `docs/phase-11-safety-guardrails.md`
- `docs/roadmap.md`
- `docs/safety.md`

## Why Safety Starts After Phase 10.8

Phase 10.8 made browser candidate extraction real enough to test. The extension can expose DOM targets, the local bridge can send them to Toki, and the known-screen provider path can choose from those candidates.

That means the app is no longer only showing mock targets. Once target guidance becomes real, safety has to sit between the provider and the overlay.

The pipeline now looks like this:

```text
voice command / goal
        |
screen evidence
        |
OCR / accessibility / browser DOM candidates
        |
provider result
        |
safety policy gate
        |
overlay guidance or confirmation state
```

Before Phase 11, the validation layer checked whether the result was well-formed and inside screen bounds. Phase 11 adds a different question: even if the target is valid, is it safe to guide immediately?

## Risk Classes

Toki already has shared risk classes:

```text
safe_navigation
form_entry
external_send
delete
payment
security_change
account_change
permission_change
unknown_risky
```

These are not just labels for debug. They decide how cautious the app should be.

- `safe_navigation`: normal links, tabs, pages, non-destructive navigation.
- `form_entry`: typing or editing information.
- `external_send`: sending a message, email, invite, webhook, or external request.
- `delete`: deleting, removing, revoking, clearing, wiping.
- `payment`: paying, billing, checkout, subscription, invoice actions.
- `security_change`: SSO, password, token, key, MFA, permissions, secrets.
- `account_change`: profile, organization, workspace, team, plan, membership changes.
- `permission_change`: granting, allowing, approving, sharing, enabling access.
- `unknown_risky`: the app is not sure, so it should be cautious.

## Warning And Target-Reveal Gate

Warning-only account and permission guidance stays visible so Toki can do its basic job without an unnecessary pause. Strong-risk guidance pauses before the target marker becomes visible.

It should tell the user:

1. what Toki is about to point at,
2. why it might be risky,
3. what the user should verify,
4. how to reveal the marker,
5. that Toki will not click or change anything.

This is different from the model validator. The validator checks shape and coordinates. The policy gate checks consequence and confidence.

## Tradeoffs

### Strict Policy vs Smooth UX

A strict policy means the app may interrupt more often. That can feel slower, but it prevents dangerous guidance from looking casual.

The better choice for now is strict policy. Toki is still early, and wrong guidance is worse than a small interruption.

### Confirmation Before Rendering vs Warning After Rendering

One option is to show the target immediately and put a warning beside it. The problem is that users may click the visible target before reading the warning.

The selected option is consequence-based: account/permission targets render with warnings, while external send, delete, payment, security, and unknown-risk targets require `Show target` before the marker renders.

### Local Heuristics vs Provider Risk Labels

The provider can label risk, but the desktop app should not blindly trust it. The local policy engine should also inspect labels, roles, confidence, candidate metadata, and known risky words.

Best approach: use provider risk as input, then local policy makes the final decision.

## Step Plan

Phase 11 now has these steps:

1. Safety contract.
2. Shared policy decision types.
3. Policy engine.
4. Policy tests.
5. Provider integration.
6. Confirmation UI.
7. Debug safety review.
8. Manual safety QA.
9. Docs and learning.
10. Close Phase 11 or escalate browser metadata.

## Acceptance Criteria

Phase 11 should not close until:

- account/permission guidance carries a clear warning without a blocking gate,
- strong-risk guidance requires target-reveal acknowledgment,
- low-confidence guidance clarifies or blocks,
- invalid/offscreen targets stay rejected,
- debug shows the policy decision,
- safe/risky/invalid manual QA paths are tested,
- Toki still does not click anything automatically.

## Updates

- 2026-07-02 - Step 11.1 created the Phase 11 safety contract, corrected roadmap numbering so Safety is Phase 11, and clarified that confirmation means permission to show risky guidance, not permission for Toki to click.
- 2026-07-02 - Step 11.2 added the shared safety policy type contract in `@toki/shared`. The important design choice is to keep the policy vocabulary small and explicit: `allow`, `confirm`, `clarify`, and `block`. Later runtime code should consume `SafetyPolicyDecision` instead of inventing separate safety states in the desktop app, provider adapter, or debug UI.
- 2026-07-02 - Step 11.3 added the first pure policy engine in `@toki/ai`. `evaluateSafetyPolicy()` now turns a provider response into a shared `SafetyPolicyDecision`: unavailable or validation-failed results block, missing targets or low confidence clarify, risky/unknown actions confirm, and safe navigation/form entry can pass. Runtime behavior is still not wired yet; this step creates the decision function that later UI and provider integration will consume.
- 2026-07-02 - Step 11.4 added focused policy tests for every safety outcome. The test suite now proves safe navigation and form entry can pass, destructive/security/payment/unknown actions require confirmation, weak or missing targets clarify, and unavailable or invalid provider results block. This locks the policy behavior before it is wired into the desktop runtime.
- 2026-07-02 - Step 11.5 wired real-provider results through the safety policy in the desktop overlay. The important runtime rule is now: provider validity is not enough. Real guidance must also pass policy before the overlay accepts it. `allow` renders guidance, `confirm` moves the overlay to `confirmation_required`, `clarify` hides the target and returns idle, and `block` hides the target and enters error. Debug now receives the policy action and reason so manual QA can see why a target did or did not render.
- 2026-07-02 - Step 11.6 added the first user-facing confirmation cue. When policy returns `confirm`, the overlay now shows a compact "Confirm first" bubble instead of the normal step cue. The target marker can remain visible so the user can review the risky target, but puck motion stays conservative and does not send normal guidance droplets. This is still a visual confirmation state only; explicit confirm/cancel controls come in a later step if needed.
- 2026-07-02 - Step 11.7 expanded Debug with a dedicated Safety Review section. Manual QA can now inspect the policy action, reason, risk, confirmation requirement, message, and details without reading console output. This matters because safety bugs are often not visual bugs: the overlay may look quiet because policy clarified or blocked, and Debug needs to explain that decision.
- 2026-07-02 - Step 11.8 made manual safety QA repeatable. Mock fixture guidance now runs through the same safety policy gate as real provider guidance, and a new low-confidence fixture covers the clarify path. Debug can now test all four policy outcomes without needing a live provider: safe allows, risky confirms, invalid blocks, and low-confidence clarifies. The manual checklist is stored in `docs/phase-11-safety-qa.md`.
- 2026-07-02 - Step 11.9 consolidated the Phase 11 docs around the actual runtime behavior. The important learning is that safety is now a single gate, not separate UI logic: real provider responses and mock fixtures both produce the same `allow`, `confirm`, `clarify`, or `block` decision before the overlay decides what to show.
- 2026-07-02 - Step 11.10 closed Phase 11 as a safety-foundation phase. The phase now protects the overlay from confident unsafe guidance: risky guidance confirms, low-confidence guidance clarifies, invalid or unavailable guidance blocks, and Debug explains the decision. Browser target accuracy is still not "solved," but that is now correctly classified as Phase 12 screen-intelligence work rather than a blocker for the safety gate.
- 2026-07-15 - A correct 96% `Invite collaborators` target exposed contract drift: provider normalization emitted `requiresConfirmation: false`, while validation rejected every permission change unless the flag was true. The durable fix is one shared normalization helper and a two-tier policy. `account_change` and `permission_change` now remain valid with warnings. `external_send`, `delete`, `payment`, `security_change`, and `unknown_risky` require target-reveal acknowledgment. The focused top utility provides `Show target`; the accepted strong-risk target stays available to Debug but absent from the overlay and ring until acknowledgment. Clicking the control only changes reveal state and never invokes an application action. Focused policy/provider tests pass 41/41, render/verification tests pass 23/23, all workspace typechecks and visual QA pass, and the installed signed app was launched for user-owned acceptance. No commit or push was made.
