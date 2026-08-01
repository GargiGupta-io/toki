#!/usr/bin/env bash
set -euo pipefail

# Publish a release that the in-app updater can find.
#
# The updater fetches latest.json from the repository's latest release, reads
# the version and the signature, downloads the payload, and refuses to install
# it unless the signature matches the public key compiled into the running app.
# So this script's only real job is producing a manifest that is honest about
# what it is pointing at.
#
# Creates a DRAFT release by default. Publishing is irreversible in the sense
# that every installed copy of Toki will begin offering the update within one
# check, so making that a separate, deliberate action is worth the extra step.
# Pass --publish to publish immediately.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${TOKI_RELEASE_REPO:-GargiGupta-io/toki}"
BUNDLE_DIR="$ROOT_DIR/target/release/bundle/macos"
DMG_DIR="$ROOT_DIR/target/release/bundle/dmg"
PUBLISH=0

for argument in "$@"; do
  case "$argument" in
    --publish) PUBLISH=1 ;;
    *) echo "Unknown option: $argument" >&2; exit 1 ;;
  esac
done

version="$(node -p "require('$ROOT_DIR/apps/desktop/src-tauri/tauri.conf.json').version")"
if [[ -z "$version" ]]; then
  echo "Could not read the version from tauri.conf.json" >&2
  exit 1
fi

archive="$BUNDLE_DIR/Toki.app.tar.gz"
signature_file="$archive.sig"

if [[ ! -f "$archive" || ! -f "$signature_file" ]]; then
  echo "Updater artifacts not found next to the app bundle." >&2
  echo "Build with TAURI_SIGNING_PRIVATE_KEY set:" >&2
  echo "  export TAURI_SIGNING_PRIVATE_KEY=\"\$(cat ~/.toki/updater.key)\"" >&2
  echo "  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=\"\"" >&2
  echo "  npm run desktop:release:mac" >&2
  exit 1
fi

# The disk image is what a person downloads; the tarball above is only what the
# updater reads. Publishing without the image leaves the release page offering a
# .tar.gz to anyone who followed a Download link, which is not something most
# people can install, so a missing image is an error rather than a warning.
dmg="$DMG_DIR/Toki-$version.dmg"
if [[ ! -f "$dmg" ]]; then
  echo "Disk image not found: $dmg" >&2
  echo "Run npm run desktop:package:mac first." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

# Apple Silicon and Intel are separate update targets. Publishing only the
# architecture that happened to build would leave the other silently stuck on
# whatever it already has.
case "$(uname -m)" in
  arm64) platform="darwin-aarch64" ;;
  x86_64) platform="darwin-x86_64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

signature="$(cat "$signature_file")"
asset_name="Toki-$version-$platform.app.tar.gz"
download_url="https://github.com/$REPO/releases/download/v$version/$asset_name"

work_dir="$(mktemp -d)"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT

cp "$archive" "$work_dir/$asset_name"

SIGNATURE="$signature" URL="$download_url" PLATFORM="$platform" VERSION="$version" \
  node -e '
    const manifest = {
      version: process.env.VERSION,
      notes: `Toki ${process.env.VERSION}`,
      pub_date: new Date().toISOString(),
      platforms: {
        [process.env.PLATFORM]: {
          signature: process.env.SIGNATURE,
          url: process.env.URL,
        },
      },
    };
    process.stdout.write(JSON.stringify(manifest, null, 2));
  ' > "$work_dir/latest.json"

if gh release view "v$version" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release v$version already exists; uploading assets to it."
  gh release upload "v$version" \
    "$work_dir/$asset_name" "$work_dir/latest.json" "$dmg" \
    --repo "$REPO" --clobber
else
  draft_flag="--draft"
  if [[ "$PUBLISH" == "1" ]]; then
    draft_flag=""
  fi

  # shellcheck disable=SC2086
  gh release create "v$version" \
    "$work_dir/$asset_name" "$work_dir/latest.json" "$dmg" \
    --repo "$REPO" \
    --title "Toki $version" \
    --notes "Toki $version" \
    $draft_flag
fi

if [[ "$PUBLISH" == "1" ]]; then
  echo "Published v$version. Installed copies will offer it on their next check."
else
  echo "Created a DRAFT release for v$version."
  echo "The updater only reads published releases, so nothing is offered yet."
  echo "Publish it from GitHub, or re-run with --publish."
fi
