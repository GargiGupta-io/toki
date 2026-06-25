# Clicky Reference Porting Notes

Toki uses Clicky as a Mac behavior reference, not as a file-by-file codebase replacement.

## Source

- Repository: https://github.com/farzaa/clicky
- License: MIT
- Local reference checkout: `~/tools/clicky-reference`
- Key reference files:
  - `leanring-buddy/MenuBarPanelManager.swift`
  - `leanring-buddy/OverlayWindow.swift`
  - `leanring-buddy/GlobalPushToTalkShortcutMonitor.swift`
  - `leanring-buddy/BuddyDictationManager.swift`
  - `leanring-buddy/CompanionPanelView.swift`
  - `leanring-buddy/DesignSystem.swift`

## What We Should Port

### 1. Menu Bar First Runtime

Clicky is a menu bar utility, not a normal Dock app.

Toki should match this behavior on Mac:

- no normal main window on startup
- menu bar icon is the stable control path
- settings opens from the menu bar icon
- settings can auto-open on first launch/dev launch for discoverability
- no permanent dashboard surface

Implementation direction for Toki:

- Keep Tauri tray/menu bar item.
- Improve icon visibility using a simple template cursor-style icon.
- Add a Mac dev/first-launch behavior that opens settings automatically.
- Keep app controls out of the Dock-style window flow where possible.

Current M4 status:

- The menu bar/tray item is the stable control path.
- The app now labels tray actions as Toki actions rather than generic settings/app actions.
- On macOS, Toki opens the compact settings panel on launch so the user can discover the menu-bar app instead of wondering where it went.
- The next native Mac shell improvement is to hide Dock presence more completely with an accessory/menu-bar activation policy once that path is verified in Tauri.

### 2. Custom Floating Panel

Clicky uses a custom borderless `NSPanel` below the menu bar icon.

Important behavior:

- borderless panel
- custom dark rounded UI
- positioned below the menu bar icon
- hides on outside click
- does not feel like a normal app window
- avoids standard popover/window chrome

Implementation direction for Toki:

- Keep the Tauri settings window compact and borderless.
- Position it near the menu bar/tray control where possible.
- Auto-hide on outside click/blur.
- Avoid big debug-like panel styling in settings.
- Keep debug as a separate utility window.

Current M4 status:

- Settings stays compact and separate from debug.
- Settings exposes the local push-to-talk path directly: hold Space or press the talk control, then release to route the voice command.
- Debug remains a separate internal window instead of being mixed into the user panel.

### 3. Transparent Cursor Overlay

Clicky uses transparent `NSPanel` overlay windows, one per screen.

Important behavior:

- transparent background
- click-through input
- non-focusable
- joins all Spaces
- no shadow/chrome
- overlay only renders cursor/response/target affordances

Implementation direction for Toki:

- Keep overlay transparent and click-through.
- On Mac, validate multi-monitor behavior rather than assuming one fullscreen window is enough.
- Avoid rendering app panels inside the overlay.
- Keep overlay visuals limited to puck, target, and small voice/guidance cue.

### 4. Push-To-Talk Shortcut

Clicky uses a listen-only `CGEvent` tap for global push-to-talk.

Important behavior:

- detects shortcuts while another app is active
- does not steal keyboard input
- handles press/release transitions
- supports modifier-only shortcuts like Control+Option
- requires Accessibility permission

Implementation direction for Toki:

- Current in-settings Space push-to-talk is only a local fallback.
- Mac production should add a native global shortcut path.
- Preferred shortcut should be Clicky-like: Control+Option hold, or a configurable alternative.
- Add explicit Accessibility permission UX before relying on global shortcut behavior.

### 5. Voice Pipeline Shape

Clicky separates capture, transcription provider, transcript finalization, and command routing.

Implementation direction for Toki:

- Keep native mic capture separate from transcription provider.
- Keep local Whisper as the current free provider.
- Keep OpenAI/cloud transcription as an explicit optional provider.
- Route final transcript into guidance only after transcript quality checks pass.

Current M4 status:

- Native mic capture, transcription provider selection, and command routing remain separate parts of the pipeline.
- Local Whisper is the current working free provider on Mac.
- OpenAI/cloud transcription is optional and should route through a backend before any public app distribution.

### 6. API Key Handling

Clicky uses a Cloudflare Worker proxy so API keys do not ship in the app binary.

Implementation direction for Toki:

- Do not ship user-facing app builds with embedded OpenAI or model provider keys.
- For local dev, environment variables are acceptable.
- For production, use a backend/proxy for paid cloud providers.
- Local Whisper remains the free/private default path.

Current M4 status:

- Local Whisper is the default direction for free testing.
- Paid cloud transcription must use a backend/proxy before release builds. The app should never bundle a shared paid API key.

## What We Should Not Port Directly

- Do not copy Swift `NSPanel` code into the Tauri app.
- Do not replace the Tauri/Rust shell with the Swift app wholesale.
- Do not adopt AssemblyAI/ElevenLabs unless the product plan calls for them.
- Do not depend on macOS-only behavior for the whole cross-platform architecture.
- Do not make global shortcuts mandatory before permission UX is ready.

## Toki Mac Backlog From Clicky Reference

1. Make Mac settings discoverable on launch.
2. Improve menu bar icon visibility.
3. Add first-launch/dev-launch auto-open settings.
4. Add Mac global push-to-talk using native event monitoring.
5. Add Accessibility permission explanation for global shortcut.
6. Validate multi-monitor overlay behavior.
7. Reduce settings UI toward Clicky-style compact panel.
8. Keep debug window separate and obviously internal.

## Current Decision

Use Clicky as the Mac behavior contract:

```text
menu bar utility
  -> compact control panel
  -> transparent click-through cursor overlay
  -> push-to-talk voice activation
  -> screenshot/guidance response
```

Toki should implement that contract with Tauri, React, and Rust instead of copying the Swift app structure directly.
