# Phase 16 App Identity And Bundle Metadata

Step 16.3 locks the current release identity for Toki before signing, notarization, updater, and installer work.

## Current Product Identity

| Surface | Value |
| --- | --- |
| Product name | `Toki` |
| Tauri identifier | `app.toki.desktop` |
| Rust crate | `toki-desktop` |
| Rust library | `toki_desktop_lib` |
| npm root package | `toki` |
| desktop workspace | `@toki/desktop` |
| publisher | `GargiGupta-io` |
| category | `Productivity` |

## Runtime Window Identity

| Window | Product rule |
| --- | --- |
| overlay | blank title, transparent, click-through, not a normal app window |
| settings | blank title, compact menu-style panel |
| debug | `Toki Debug`, visible only when explicitly opened |

The overlay and settings windows intentionally keep blank native titles. That is part of the Clicky-style visual contract: the user should not see an app titlebar in normal runtime.

## Bundle Metadata

`apps/desktop/src-tauri/tauri.conf.json` now sets:

- `productName: Toki`
- `identifier: app.toki.desktop`
- `bundle.publisher: GargiGupta-io`
- `bundle.category: Productivity`
- `bundle.shortDescription`
- `bundle.longDescription`
- `bundle.copyright`

This gives signing, notarization, installers, and package metadata one consistent identity source.

## Rust Package Metadata

`apps/desktop/src-tauri/Cargo.toml` now uses:

- `name = "toki-desktop"`
- `description = "Toki desktop screen guidance shell"`
- `authors = ["GargiGupta-io"]`

The placeholder `authors = ["you"]` is removed so generated package metadata does not inherit a development placeholder.

## Known Artifact Warning

Old local Windows artifacts may still exist under `target/release/bundle` with the old `TouchPilot` name.

Those files are stale build outputs. They should not be renamed manually or treated as valid release artifacts.

Correct process:

1. keep source identity as Toki,
2. clean or ignore stale target outputs,
3. rebuild release artifacts after identity metadata is locked,
4. accept only newly generated Toki-named artifacts.

## Step 16.3 Result

Step 16.3 is complete when product metadata is Toki-first, placeholder author metadata is removed, product docs point to this identity audit, and focused TypeScript/Rust checks pass.
