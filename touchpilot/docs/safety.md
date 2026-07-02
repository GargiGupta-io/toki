# Safety Model

Toki guides users through real software. That means it can point users toward actions with real consequences. The safety layer exists to slow down risky steps, explain consequences, and require confirmation.

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
- Delete, send, pay, security, account, and permission actions require confirmation.
- Unknown risky actions should be treated cautiously.
- Low-confidence guidance should ask for clarification.
- The assistant should guide before it automates.
- Camera frames should be processed locally by default.
- Private mode should avoid screenshot and session storage.

## Current Phase 11 Behavior

Toki now has four policy outcomes:

- `allow`: show normal guidance for safe, confident targets.
- `confirm`: show a confirmation cue before risky guidance becomes normal guidance.
- `clarify`: hide the target and ask for a better command or stronger evidence.
- `block`: reject invalid, unavailable, or unsafe guidance.

Both real provider results and Debug mock fixtures go through this policy gate. This means the app can test safe, risky, invalid, and low-confidence guidance without pretending every target is equally safe.

## Confirmation Requirements

Before risky guidance continues, the user should see:

1. what action is about to happen,
2. why it may be risky,
3. what they should verify,
4. a clear confirm action,
5. a clear cancel action.

In Phase 11, confirmation means the user permits Toki to show the risky target as guidance. It does not mean Toki clicks, submits, deletes, sends, pays, or changes settings automatically.

## Non-Goals For Early Versions

- no silent clicking,
- no automatic payment or send actions,
- no hidden camera capture,
- no screenshot retention in private mode.
