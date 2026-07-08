#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Toki.app"
BUNDLE_ID="app.toki.desktop"
BUILT_APP="$ROOT_DIR/target/release/bundle/macos/$APP_NAME"
INSTALLED_APP="/Applications/$APP_NAME"

if [[ ! -d "$BUILT_APP" ]]; then
  echo "Built app not found: $BUILT_APP" >&2
  echo "Run npm run desktop:release:mac first." >&2
  exit 1
fi

sign_app() {
  local app_path="$1"
  codesign --force --deep --sign - --identifier "$BUNDLE_ID" "$app_path"
  codesign --verify --deep --strict --verbose=2 "$app_path"
}

sign_app "$BUILT_APP"

if [[ "${1:-}" == "--install" ]]; then
  killall toki-desktop 2>/dev/null || true
  rm -rf "$INSTALLED_APP"
  ditto "$BUILT_APP" "$INSTALLED_APP"
  sign_app "$INSTALLED_APP"
  open -na "$INSTALLED_APP"
fi
