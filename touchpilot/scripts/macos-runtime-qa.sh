#!/usr/bin/env bash
set -euo pipefail

APP_PROCESS="${1:-toki-desktop}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS runtime QA can only run on macOS." >&2
  exit 1
fi

echo "Toki macOS runtime QA"
echo

FAILURES=0

if ! command -v pgrep >/dev/null 2>&1; then
  echo "[FAIL] process probe - pgrep is not available" >&2
  exit 1
fi

if ! PROCESS_LINES="$(pgrep -fl "$APP_PROCESS" 2>/dev/null)"; then
  echo "[FAIL] process exists - no running $APP_PROCESS process found"
  echo "Start Toki first, then rerun: npm run qa:mac:runtime"
  exit 1
fi

echo "[PASS] process exists"
echo "$PROCESS_LINES"
echo

if ! command -v osascript >/dev/null 2>&1; then
  echo "[WARN] window probe skipped - osascript is not available"
  exit 0
fi

set +e
WINDOW_REPORT="$(osascript <<APPLESCRIPT 2>&1
tell application "System Events"
  set output to ""
  set matchedProcesses to every process whose name contains "toki"
  repeat with appProcess in matchedProcesses
    set output to output & "process=" & name of appProcess & " visible=" & (visible of appProcess as text) & linefeed
    repeat with appWindow in windows of appProcess
      set windowName to name of appWindow
      set windowPosition to position of appWindow
      set windowSize to size of appWindow
      set output to output & "window=" & windowName & " position=" & item 1 of windowPosition & "," & item 2 of windowPosition & " size=" & item 1 of windowSize & "x" & item 2 of windowSize & linefeed
    end repeat
  end repeat
  return output
end tell
APPLESCRIPT
)"
OSA_STATUS=$?
set -e

if [[ "$OSA_STATUS" -ne 0 ]]; then
  echo "[WARN] window probe skipped - System Events access failed"
  echo "$WINDOW_REPORT"
  echo
  echo "Grant Accessibility permission to your terminal if you want window listing."
  exit 0
fi

if [[ -z "$WINDOW_REPORT" ]]; then
  echo "[WARN] window probe returned no Toki windows"
  exit 0
fi

echo "[INFO] window report"
echo "$WINDOW_REPORT"
echo

if grep -Eiq 'Toki Overlay|TouchPilot|Overlay' <<<"$WINDOW_REPORT"; then
  echo "[FAIL] no visible overlay title - window report contains overlay/app chrome text"
  FAILURES=$((FAILURES + 1))
else
  echo "[PASS] no visible overlay title"
fi

if grep -Eiq 'Debug' <<<"$WINDOW_REPORT"; then
  echo "[WARN] debug window is visible - close it before default-runtime visual acceptance"
else
  echo "[PASS] debug hidden by default"
fi

if grep -Eq 'window=.*size=[1-9][0-9]{3,}x[1-9][0-9]{3,}' <<<"$WINDOW_REPORT"; then
  echo "[WARN] large visible Toki window found - manually confirm this is the transparent overlay, not an app panel"
else
  echo "[PASS] no large visible app-like panel reported"
fi

echo "Manual accept checks:"
echo "- Overlay adds no visible titlebar or app-name strip."
echo "- Desktop apps remain clickable through the overlay."
echo "- Puck follows the cursor while the overlay is passive."
echo "- Settings opens from the menu bar/tray path and can be dragged."
echo "- Settings appears near the menu bar, not centered like a normal app window."

if [[ "$FAILURES" -gt 0 ]]; then
  echo
  echo "Runtime QA failed with $FAILURES failing check(s)." >&2
  exit 1
fi
