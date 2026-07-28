# TouchPilot Operating Rules

These rules are mandatory for the remaining TouchPilot work.

## Command Failures

- If a command fails once, do not repeat the same command pattern.
- Either switch to the next best method immediately or stop and report the exact error.
- Do not loop on fragile PowerShell quoting, broad file reads, or repeated build commands.
- If verification is interrupted, say it was interrupted and do not treat it as pass or fail.

## Step Execution

- Stay inside the current step scope.
- Do not explore unrelated files.
- Prefer exact `rg` selectors and small file reads.
- Patch only the files required for the step.
- Run one appropriate verification command.
- If verification fails, stop and report the failure.
- If verification passes, commit and push the scoped files.

## Time Discipline

- For narrow UI/CSS/runtime steps, use the fast path first.
- Avoid broad repo scans unless the step explicitly requires them.
- If a step starts expanding, stop and summarize what changed, what is blocked, and the smallest next move.

## Git Discipline

- Commit only the files touched for the current step.
- Keep commits granular.
- Do not stage unrelated dirty docs or user changes.
