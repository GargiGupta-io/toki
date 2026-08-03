#!/usr/bin/env bash
set -euo pipefail

# Submit the disk image to Apple, then staple the result.
#
# Notarization is an automated malware scan, not a review: it never launches the
# app, and it returns in minutes rather than days. It either accepts the upload
# or hands back a log naming exactly what failed. Nothing about the app's
# behaviour can cause a rejection -- only how it was signed and packaged.
#
# Stapling attaches the resulting ticket to the disk image. Without it the app
# still passes Gatekeeper, but only on a machine that can reach Apple to ask;
# a user opening it offline for the first time gets a warning.
#
# Credentials must be stored once, beforehand:
#   xcrun notarytool store-credentials "toki" \
#     --apple-id you@example.com --team-id TEAMID --password app-specific-pw

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYCHAIN_PROFILE="${TOKI_NOTARY_PROFILE:-toki}"
SIGNING_IDENTITY="${TOKI_MACOS_SIGNING_IDENTITY:-Toki Local Development}"
DMG_DIR="$ROOT_DIR/target/release/bundle/dmg"

if [[ "$SIGNING_IDENTITY" != "Developer ID Application:"* ]]; then
  echo "Notarization requires a Developer ID identity, not: $SIGNING_IDENTITY" >&2
  echo "Apple will not notarize a self-signed build." >&2
  exit 1
fi

dmg_path="${1:-}"
if [[ -z "$dmg_path" ]]; then
  dmg_path="$(find "$DMG_DIR" -name "Toki-*.dmg" -type f 2>/dev/null | sort | tail -1)"
fi

if [[ -z "$dmg_path" || ! -f "$dmg_path" ]]; then
  echo "No disk image found. Run npm run desktop:package:mac first." >&2
  exit 1
fi

if ! xcrun notarytool history --keychain-profile "$KEYCHAIN_PROFILE" >/dev/null 2>&1; then
  echo "No stored notarytool credentials for profile: $KEYCHAIN_PROFILE" >&2
  echo "Run: xcrun notarytool store-credentials \"$KEYCHAIN_PROFILE\" \\" >&2
  echo "       --apple-id <email> --team-id <TEAMID> --password <app-specific-password>" >&2
  exit 1
fi

# The app gets its own ticket, before the image is built around it.
#
# Notarizing only the disk image leaves the app unstapled once somebody drags it
# to Applications. Gatekeeper then has to ask Apple on first launch, and a
# person who installs on a train is refused -- stapling is precisely what makes
# the check work without a network. Apple issues a ticket per bundle, so this is
# a separate submission rather than a flag on the one below.
APP_PATH="$ROOT_DIR/target/release/bundle/macos/Toki.app"
if [[ -d "$APP_PATH" ]] && ! xcrun stapler validate "$APP_PATH" >/dev/null 2>&1; then
  echo "Notarizing the app bundle first"
  app_zip="$(mktemp -d)/Toki.zip"
  # ditto, not zip: a signed bundle's symlinks and extended attributes do not
  # survive a naive archive, and the signature goes with them.
  ditto -c -k --keepParent "$APP_PATH" "$app_zip"
  xcrun notarytool submit "$app_zip" --keychain-profile "$KEYCHAIN_PROFILE" --wait
  xcrun stapler staple "$APP_PATH"
  rm -rf "$(dirname "$app_zip")"

  # The image has to be rebuilt around the stapled app, or it still contains
  # the unstapled one.
  echo "Rebuilding the disk image around the stapled app"
  bash "$ROOT_DIR/scripts/macos-package-dmg.sh"
  dmg_path="$(find "$DMG_DIR" -name "Toki-*.dmg" -type f 2>/dev/null | sort | tail -1)"
fi

echo "Submitting $dmg_path"
# --wait blocks until Apple returns a verdict, so a non-zero exit here means
# rejected rather than merely queued.
xcrun notarytool submit "$dmg_path" \
  --keychain-profile "$KEYCHAIN_PROFILE" \
  --wait

xcrun stapler staple "$dmg_path"
xcrun stapler validate "$dmg_path"

# Both, because they are checked at different moments: the image when it is
# opened, the app every time it is launched.
xcrun stapler validate "$APP_PATH"

# The real question is not whether the ticket attached but whether Gatekeeper
# accepts the image the way a downloading user's Mac will.
spctl --assess --type open --context context:primary-signature -v "$dmg_path"

echo "Notarized and stapled: $dmg_path"
