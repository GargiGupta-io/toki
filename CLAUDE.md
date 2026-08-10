# Working agreements for this repository

## Where things live

**Everything belongs in this folder.** Plans, notes, and any document produced
while working on Toki go under `/Users/pumba/Documents/Projects/toki` — not in
a tool's own directory elsewhere on the machine.

This project moved from `Documents/ Codex Projects/clicky` (note the leading
space) on 2026-07-29, and was renamed from `Projects/clicky` to `Projects/toki`
on 2026-08-06. Any reference to either old path is stale.

A symlink at the old `Projects/clicky` path keeps a session that was already
running from breaking mid-task. It is temporary — delete it once nothing is
working from the old path.

Still to do: the inner `touchpilot/` folder becomes `app/`. Left until the
session working inside it finishes, because renaming it under a live session
invalidates its open files.

What must NOT be renamed:

- **Clicky**, where it means the menu-bar app by farzaa that Toki used as a
  macOS behaviour reference. `macos_overlay.rs` and its tests name it
  deliberately; rewriting them would claim compatibility with the wrong thing.
- **`@touchpilot/*`** inside `COMMAND_AND_TEST_LEDGER.md` and `learnings/`.
  Those record commands as they were actually run, under the names the
  packages had at the time. The live package names are already `@toki/*`.

Root-level documents use `SHOUTY_SNAKE_CASE.md` and each owns one concern:

| File | Concern |
|---|---|
| `CURRENT_PLAN.md` | Product roadmap, phase status |
| `LAUNCH_AND_CLOUD_PLAN.md` | Launch readiness, security, auth, payments, deployment |
| `DECISIONS_AND_CONSTRAINTS.md` | Standing constraints |
| `OPEN_ITEMS_AND_RISKS.md` | Known risks |
| `COMMAND_AND_TEST_LEDGER.md` | Commands and their verification |
| `FILE_CHANGE_MANIFEST.md` | File-level change record |
| `CODEX_HANDOFF.md` | Session handoff notes |

Add to the file that owns the concern rather than starting a new one.

### The one exception

**Secrets never live in this folder.** The repository is public, so key material
stays outside it:

- Updater signing key: `~/.toki/updater.key` (mode 600)
- Developer ID certificate: macOS Keychain
- The user's API key: macOS Keychain

`.gitignore` refuses key-shaped files and `scripts/app-updates.test.mjs` fails if
any is ever tracked. Both are deliberate; do not relax either.

## How to explain things

Lead with plain English. Do not open with identifiers, file paths, function
names, or flag names as though they were self-explanatory.

For each item, follow a fixed shape: what is wrong, what it means for the people
using the app, what to do about it, and how long it takes. Keep the technical
detail underneath, never as the opening move.

**Why:** these explanations drive product and business decisions — pricing,
launch order, architecture. A wall of symbol names hides the decision.

**Also:** keep the alarm level proportional. A latent bug caught by reading is
not an incident; an expected error message is not a failure. Describing routine
work alarmingly costs real time.

## Git

- No commits or pushes without an explicit request. This rule is standing.
- `main` is the untouched revert point. Work happens on branches.
- Never commit key material, screenshots, or raw diagnostic logs.

## Before finishing a task

Run `npm run verify` from `touchpilot/` — it runs typecheck plus every test file
in one gate.
