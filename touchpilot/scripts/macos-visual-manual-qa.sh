#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Toki macOS visual manual QA is intended for macOS." >&2
  exit 1
fi

cat <<'CHECKLIST'
Toki macOS visual manual QA

Start:
  npm run desktop:dev

Before accepting Phase 14 visuals, manually check:

1. Default runtime
   [ ] No Toki window, titlebar, or app panel is visible.
   [ ] Desktop/browser remains clickable through the overlay.
   [ ] Puck stays close to the real cursor.
   [ ] Puck does not get lost near menu bar, Dock, corners, or screen edges.

2. Settings/menu panel
   [ ] Open settings from the menu bar icon.
   [ ] Settings appears as a compact utility popup.
   [ ] Close works.
   [ ] Drag/move behavior works if the panel is visible.
   [ ] Push-to-talk copy is understandable.

3. Guidance target
   [ ] Trigger a known mock or real target from Debug.
   [ ] Target ring sits on the actual target box.
   [ ] Target ring is visible but does not cover the click.
   [ ] Step cue stays compact and cursor-adjacent.

4. Workflow
   [ ] Start a mock workflow from Debug.
   [ ] Current-step cue shows only the active step.
   [ ] Back/Next/Stop are usable and not visually heavy.
   [ ] Confirmation-required step looks distinct from safe guidance.

5. Debug
   [ ] Debug opens only intentionally.
   [ ] Tabs are easy to scan.
   [ ] Long sections scroll.
   [ ] Debug does not resemble the user-facing product.

6. Reduced motion
   [ ] Run npm run qa:visual:motion.
   [ ] If macOS Reduce Motion is enabled, decorative puck/target animation is quiet.

Pass rule:
  Toki should feel like a tiny cursor companion, not a dashboard or app window.

Fail rule:
  If the default runtime shows panels, app chrome, detached puck behavior, or mock-looking guidance, Phase 14 is not ready to close.
CHECKLIST
