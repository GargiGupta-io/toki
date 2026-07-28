#!/usr/bin/env bash
set -euo pipefail

# Wrap the signed app in a disk image.
#
# notarytool refuses a bare .app -- it only accepts a disk image, a zip, or an
# installer package. A disk image is also what users expect to download, so it
# is both the submission format and the distribution format.
#
# This script deliberately does not build or sign the app. Run
# `npm run desktop:release:mac` first, which builds and then calls
# macos-sign-app.sh. Here we only verify that happened and package the result,
# so there is exactly one place that knows how signing works.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Toki.app"
VOLUME_NAME="Toki"
BUNDLE_ID="app.toki.desktop"
SIGNING_IDENTITY="${TOKI_MACOS_SIGNING_IDENTITY:-Toki Local Development}"
BUILT_APP="$ROOT_DIR/target/release/bundle/macos/$APP_NAME"
DMG_DIR="$ROOT_DIR/target/release/bundle/dmg"

is_release_identity() {
  [[ "$SIGNING_IDENTITY" == "Developer ID Application:"* ]]
}

if [[ ! -d "$BUILT_APP" ]]; then
  echo "Built app not found: $BUILT_APP" >&2
  echo "Run npm run desktop:release:mac first." >&2
  exit 1
fi

app_version="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" \
  "$BUILT_APP/Contents/Info.plist" 2>/dev/null || true)"
if [[ -z "$app_version" ]]; then
  echo "App has no CFBundleShortVersionString: $BUILT_APP" >&2
  exit 1
fi

# Packaging an unsigned or wrongly signed app produces a disk image that looks
# fine and fails notarization minutes later, so refuse early.
if ! codesign --verify --deep --strict "$BUILT_APP" 2>/dev/null; then
  echo "App is not validly signed: $BUILT_APP" >&2
  echo "Run npm run desktop:sign:mac first." >&2
  exit 1
fi

signing_metadata="$(codesign -d --verbose=4 "$BUILT_APP" 2>&1)"
if [[ "$signing_metadata" != *"Authority=$SIGNING_IDENTITY"* ]]; then
  echo "App is not signed by the expected identity: $SIGNING_IDENTITY" >&2
  exit 1
fi

if is_release_identity && [[ "$signing_metadata" != *"(runtime)"* ]]; then
  echo "Release app is missing the hardened runtime; notarization would reject it." >&2
  exit 1
fi

DMG_PATH="$DMG_DIR/Toki-$app_version.dmg"
mkdir -p "$DMG_DIR"
rm -f "$DMG_PATH"

stage_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT

# ditto rather than cp: it preserves the extended attributes and symlinks that
# make up a signed bundle, and a signature does not survive a naive copy.
ditto "$BUILT_APP" "$stage_dir/$APP_NAME"
ln -s /Applications "$stage_dir/Applications"

hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$stage_dir" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

# The disk image carries its own signature, separate from the app inside it.
# Gatekeeper checks the image the user downloaded, so an unsigned image warns
# even when the app within is perfectly signed.
dmg_flags=(--force --sign "$SIGNING_IDENTITY" --identifier "$BUNDLE_ID.dmg")
if is_release_identity; then
  dmg_flags+=(--timestamp)
else
  dmg_flags+=(--timestamp=none)
fi
codesign "${dmg_flags[@]}" "$DMG_PATH"
codesign --verify --strict "$DMG_PATH"

echo "Built disk image: $DMG_PATH"
if ! is_release_identity; then
  echo "Signed with the local development identity; not notarizable." >&2
  echo "Export TOKI_MACOS_SIGNING_IDENTITY to a Developer ID for release." >&2
fi
