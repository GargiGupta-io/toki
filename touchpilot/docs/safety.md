# Safety Model

Toki guides users through real software. That means it can point users toward actions with real consequences. The safety layer exists to slow down risky steps, explain consequences, and require confirmation.

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

## Confirmation Requirements

Before risky guidance continues, the user should see:

1. what action is about to happen,
2. why it may be risky,
3. what they should verify,
4. a clear confirm action,
5. a clear cancel action.

## Non-Goals For Early Versions

- no silent clicking,
- no automatic payment or send actions,
- no hidden camera capture,
- no screenshot retention in private mode.
