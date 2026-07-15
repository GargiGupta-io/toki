# Safety Model

Toki guides users through real software. That means it can point users toward actions with real consequences. The safety layer explains sensitive targets and keeps strong-risk guidance hidden until the user explicitly asks to see it.

The active build plan lives in [Phase 11: Safety And Guardrails](./phase-11-safety-guardrails.md).

## Risk Classes

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

## Policy Rules

- Safe navigation can be guided immediately.
- Form entry should explain what will be changed.
- Account and permission actions show guidance with a warning.
- Delete, send, pay, security, and unknown risky actions require target-reveal acknowledgment.
- Unknown risky actions should be treated cautiously.
- Low-confidence guidance should ask for clarification.
- The assistant should guide before it automates.
- Camera frames should be processed locally by default.
- Private mode should avoid screenshot and session storage.

## Current Phase 11 Behavior

Toki now has four policy outcomes:

- `allow`: show normal guidance for safe targets and warning guidance for account/permission targets.
- `confirm`: keep a strong-risk target hidden until the user chooses `Show target`.
- `clarify`: hide the target and ask for a better command or stronger evidence.
- `block`: reject invalid, unavailable, or unsafe guidance.

Both real provider results and Debug mock fixtures go through this policy gate. This means the app can test safe, risky, invalid, and low-confidence guidance without pretending every target is equally safe.

## Warning And Target-Reveal Requirements

Account and permission guidance appears immediately with a notice describing possible account, access, or editing changes.

Before strong-risk guidance continues, the user should see:

1. what action is about to happen,
2. why it may be risky,
3. what they should verify,
4. a clear `Show target` action,
5. a statement that Toki will not click or change anything.

In Phase 11, `Show target` means the user permits Toki to reveal the guidance marker. It does not mean Toki clicks, submits, deletes, sends, pays, or changes settings automatically.

## Non-Goals For Early Versions

- no silent clicking,
- no automatic payment or send actions,
- no hidden camera capture,
- no screenshot retention in private mode.
