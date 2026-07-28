#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Toki.app"
BUNDLE_ID="app.toki.desktop"
SIGNING_IDENTITY="${TOKI_MACOS_SIGNING_IDENTITY:-Toki Local Development}"
SIGNING_KEYCHAIN="${TOKI_MACOS_SIGNING_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"
BUILT_APP="$ROOT_DIR/target/release/bundle/macos/$APP_NAME"
INSTALLED_APP="/Applications/$APP_NAME"
ENTITLEMENTS_PATH="$ROOT_DIR/apps/desktop/src-tauri/Toki.entitlements"
REQUIRED_PRIVACY_KEYS=(
  "NSCameraUsageDescription"
  "NSMicrophoneUsageDescription"
  "NSScreenCaptureUsageDescription"
)
REQUIRED_RELEASE_ENTITLEMENTS=(
  "com.apple.security.device.camera"
  "com.apple.security.device.audio-input"
)

# Only a Developer ID certificate can carry a hardened runtime and a trusted
# timestamp: timestamping asks Apple's timestamp server to countersign, and it
# refuses a chain it does not root. Applying those flags to the local
# self-signed identity would break every debug install, so the two paths must
# stay separate.
#
# The mode is derived from the identity name rather than a second opt-in flag
# because a forgotten flag fails silently -- it produces an app that signs and
# installs cleanly and is only rejected later, by notarization. Exporting
# TOKI_MACOS_SIGNING_IDENTITY is the whole switch.
is_release_identity() {
  [[ "$SIGNING_IDENTITY" == "Developer ID Application:"* ]]
}

if [[ ! -d "$BUILT_APP" ]]; then
  echo "Built app not found: $BUILT_APP" >&2
  echo "Run npm run desktop:release:mac first." >&2
  exit 1
fi

if [[ "$SIGNING_IDENTITY" == "-" ]]; then
  echo "Ad-hoc signing is not allowed for Toki local development builds." >&2
  exit 1
fi

available_identities="$(security find-identity -v -p codesigning "$SIGNING_KEYCHAIN" 2>/dev/null)"
if [[ "$available_identities" != *"\"$SIGNING_IDENTITY\""* ]]; then
  echo "Required macOS signing identity is unavailable: $SIGNING_IDENTITY" >&2
  echo "Run npm run desktop:bootstrap-signing:mac once, then retry." >&2
  exit 1
fi

verify_privacy_usage_descriptions() {
  local app_path="$1"
  local plist_path="$app_path/Contents/Info.plist"
  local key

  if [[ ! -f "$plist_path" ]]; then
    echo "App Info.plist not found: $plist_path" >&2
    exit 1
  fi

  for key in "${REQUIRED_PRIVACY_KEYS[@]}"; do
    if ! /usr/libexec/PlistBuddy -c "Print :$key" "$plist_path" >/dev/null 2>&1; then
      echo "Required privacy usage description is missing: $key ($plist_path)" >&2
      exit 1
    fi
  done
}

designated_requirement() {
  local app_path="$1"
  codesign -d -r- "$app_path" 2>&1 |
    awk '/^designated => / { print; exit }'
}

# A release build that is merely signed still fails notarization, and none of
# these three properties are visible to `codesign --verify` -- an app missing
# every one of them verifies perfectly. Checking them here turns a rejection
# that would otherwise arrive minutes later, from Apple, into a local failure.
verify_release_hardening() {
  local app_path="$1"
  local signing_metadata="$2"
  local entitlements
  local key

  if [[ "$signing_metadata" != *"(runtime)"* ]]; then
    echo "Release signing did not enable the hardened runtime: $app_path" >&2
    exit 1
  fi

  # A trusted timestamp appears as `Timestamp=`, countersigned by Apple's
  # timestamp server. Without one codesign reports `Signed Time=` instead --
  # the local clock, which carries no trust and expires with the certificate.
  if [[ "$signing_metadata" != *"Timestamp="* ]]; then
    echo "Release signing did not obtain a trusted timestamp: $app_path" >&2
    exit 1
  fi

  entitlements="$(codesign -d --entitlements - --xml "$app_path" 2>/dev/null || true)"
  for key in "${REQUIRED_RELEASE_ENTITLEMENTS[@]}"; do
    if [[ "$entitlements" != *"$key"* ]]; then
      echo "Release signing is missing a required entitlement: $key ($app_path)" >&2
      exit 1
    fi
  done
}

verify_signed_app() {
  local app_path="$1"
  local requirement
  local signing_metadata

  verify_privacy_usage_descriptions "$app_path"
  codesign --verify --deep --strict --verbose=2 "$app_path"

  signing_metadata="$(codesign -d --verbose=4 "$app_path" 2>&1)"
  if [[ "$signing_metadata" != *"Authority=$SIGNING_IDENTITY"* ]]; then
    echo "App is not signed by the required identity: $SIGNING_IDENTITY ($app_path)" >&2
    exit 1
  fi

  requirement="$(designated_requirement "$app_path")"
  if [[ -z "$requirement" || "$requirement" == *"cdhash"* ]]; then
    echo "App has an unstable or missing designated requirement: $requirement" >&2
    exit 1
  fi

  if [[ "$requirement" != *"identifier \"$BUNDLE_ID\""* ]]; then
    echo "App designated requirement does not contain $BUNDLE_ID: $requirement" >&2
    exit 1
  fi

  if is_release_identity; then
    verify_release_hardening "$app_path" "$signing_metadata"
  fi
}

sign_app() {
  local app_path="$1"
  local -a codesign_flags

  verify_privacy_usage_descriptions "$app_path"

  # --deep is deliberately absent. The bundle contains exactly one Mach-O image
  # and no nested frameworks, dylibs, or helper apps, so it signs nothing extra;
  # Apple deprecates it precisely because it would also stamp the release
  # entitlements onto any nested code it did find.
  codesign_flags=(
    --force
    --sign "$SIGNING_IDENTITY"
    --identifier "$BUNDLE_ID"
  )

  if is_release_identity; then
    if [[ ! -f "$ENTITLEMENTS_PATH" ]]; then
      echo "Release signing requires an entitlements file: $ENTITLEMENTS_PATH" >&2
      exit 1
    fi
    codesign_flags+=(
      --options runtime
      --timestamp
      --entitlements "$ENTITLEMENTS_PATH"
    )
  else
    codesign_flags+=(--timestamp=none)
  fi

  codesign "${codesign_flags[@]}" "$app_path"
  verify_signed_app "$app_path"
}

sign_app "$BUILT_APP"

if [[ "${1:-}" == "--install" ]]; then
  killall toki-desktop 2>/dev/null || true
  rm -rf "$INSTALLED_APP"
  ditto "$BUILT_APP" "$INSTALLED_APP"
  verify_signed_app "$INSTALLED_APP"

  built_requirement="$(designated_requirement "$BUILT_APP")"
  installed_requirement="$(designated_requirement "$INSTALLED_APP")"
  if [[ "$built_requirement" != "$installed_requirement" ]]; then
    echo "Installed app designated requirement changed during copying." >&2
    exit 1
  fi

  built_executable_hash="$(shasum -a 256 "$BUILT_APP/Contents/MacOS/toki-desktop" | awk '{ print $1 }')"
  installed_executable_hash="$(shasum -a 256 "$INSTALLED_APP/Contents/MacOS/toki-desktop" | awk '{ print $1 }')"
  if [[ "$built_executable_hash" != "$installed_executable_hash" ]]; then
    echo "Installed app executable changed during copying." >&2
    exit 1
  fi

  if [[ "${TOKI_MACOS_SKIP_LAUNCH:-0}" != "1" ]]; then
    open -na "$INSTALLED_APP"
  fi
fi
