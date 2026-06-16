# Cross-Platform AI Screen Guide With Gesture Control

> A production plan for building a desktop assistant that understands the screen, guides users through any software, and can be controlled through text, voice, keyboard, mouse, and camera gestures.

---

## In Plain English

This project is like having a smart guide sitting on top of your computer screen. You open any app, ask what you want to do, and the assistant looks at the screen, understands what is visible, and points to the next thing you should click.

The important difference from normal tutorials is that this is not pre-recorded. It is generated live. If you open Figma, Shopify, Excel, Blender, a browser, or some random internal dashboard, the assistant should inspect the current screen and explain what to do next.

The gesture idea makes the product feel more advanced. Instead of only typing into a chatbot, the user can pinch fingers together to enable voice mode, show an open palm to pause, point at something to ask about it, or swipe to move between steps. The camera becomes a control surface, while the screen and AI provide the intelligence.

---

## Product Thesis

The product is:

> ChatGPT for using software, with visual guidance directly on top of the screen and natural gesture control.

It should answer questions like:

- "How do I export this file?"
- "Where do I change this setting?"
- "What does this error mean?"
- "Guide me through creating an invoice."
- "Is this safe to click?"
- "What do I do next?"

It should not be limited to:

- video editing
- one app
- predefined tutorials
- browser-only pages
- chatbot answers without screen context

The assistant should work against what is actually visible on the user’s machine.

---

## Reference: Clicky

Clicky is useful as inspiration, but it should not be the base code.

Why not use it directly:

- It is primarily Swift/macOS.
- It depends on macOS-specific APIs.
- Its overlay and capture logic are designed around Apple platforms.
- The target product here must work on Windows, macOS, and Linux.
- Rewriting a Swift/macOS foundation into a cross-platform architecture would waste time later.

What to borrow conceptually:

- menu/tray-style assistant presence
- screenshot-to-model guidance loop
- push-to-talk interaction
- overlay pointer behavior
- model gateway/API proxy pattern
- streaming assistant responses
- structured pointing protocol

What to avoid copying:

- Swift app shell
- AppKit/ScreenCaptureKit assumptions
- macOS-only permission flow
- hardcoded provider choices
- any UI structure that fights the gesture-first vision

Decision:

> Start from scratch in Tauri/React/Rust, use Clicky as a reference implementation.

---

## Core User Experience

The ideal product loop:

```text
User opens any app
User makes a gesture, speaks, or types a goal
App captures screen context
AI understands the visible UI
Assistant decides the next safe step
Overlay points to the target element
User follows the step
App verifies the new screen
Assistant continues until done
```

Example:

```text
User pinches two fingers
Voice mode opens
User says: "How do I export this?"
App captures the screen
AI sees the current app and visible controls
Assistant says: "Click File in the top-left menu"
Overlay draws a ring around File
User clicks File
Assistant re-checks the screen
Assistant points to Export
```

---

## Product Principles

1. The screen is the source of truth.
2. The assistant guides one step at a time.
3. The overlay must stay out of the way.
4. Risky actions require confirmation.
5. Camera processing should be local by default.
6. Every gesture needs a keyboard or mouse alternative.
7. Accuracy must be measured with evals, not guessed.
8. The app should feel like an OS-level guidance layer, not a chatbot window.

---

## High-Level Architecture

```text
touchpilot/
  apps/
    desktop/              Tauri v2 desktop app
    gateway/              model/API gateway

  crates/
    capture/              screenshots and display metadata
    accessibility/        UIA / AX / AT-SPI adapters
    input/                hotkeys, cursor, keyboard, mouse
    gestures/             webcam and hand gesture bridge
    overlay-native/       native overlay helpers
    safety/               risk policy engine
    storage/              SQLite and encrypted settings

  packages/
    ui/                   React component system
    ai/                   prompts, schemas, model clients
    evals/                screenshot target tests
    shared/               shared types
    design/               visual tokens and motion rules

  docs/
    architecture.md
    safety.md
    privacy.md
    evals.md
    clicky-reference.md
    roadmap.md
```

---

## Technology Choices

### Desktop App

Use:

- Tauri v2
- React
- TypeScript
- Rust

Why:

- Tauri works across Windows, macOS, and Linux.
- Rust is good for native system integration.
- React is better for complex overlay UI and motion-heavy controls.
- The app can stay lighter than Electron while still using web UI.

### AI

Use a provider abstraction, not one hardcoded model.

Supported provider shape:

- OpenAI-compatible multimodal model
- Anthropic-compatible multimodal model
- cheaper text-only model for classification/summaries
- local model hooks later if useful

The app should always request structured JSON for actions. Natural language alone is not enough for a screen overlay.

### Gesture Detection

Start with:

- MediaPipe Hands or similar local hand landmark detection

Later:

- ONNX Runtime gesture classifier
- custom gesture calibration
- user-specific sensitivity profiles

### Visual Libraries

Use these carefully:

- `react-three-fiber`: advanced pointer visuals, 3D rings, guide paths, gesture feedback
- `liquid-glass-js`: floating puck, radial menu, confirmation sheet glass effect
- `shadergradient`: onboarding, brand surfaces, idle assistant visuals
- `liquid-logo`: logo, splash screen, marketing site

Do not let decorative visuals interfere with the active screen.

---

## Main Subsystems

## 1. Desktop Shell

Plain English: This is the actual app wrapper the user installs and runs.

Responsibilities:

- launch app
- tray/menu behavior
- global shortcuts
- onboarding screens
- settings window
- permission state display
- update hooks
- crash/error reporting hooks

Done when:

- app opens on the development machine
- settings can be opened
- app can run in the background
- user can see whether screen/camera/mic permissions are granted

Key risk:

- Tauri features differ across operating systems, so system integration must be tested early.

---

## 2. Screen Capture

Plain English: The assistant needs to see what the user sees.

Responsibilities:

- capture full screen
- capture active display
- capture selected region
- return display metadata
- handle multi-monitor coordinates
- handle high-DPI scaling
- track cursor position
- track active window title/app if available

Output shape:

```json
{
  "image": "base64/png",
  "display": {
    "id": "display-1",
    "width": 1920,
    "height": 1080,
    "scale_factor": 1.25
  },
  "cursor": {
    "x": 740,
    "y": 515
  },
  "active_window": {
    "title": "Untitled - Figma",
    "app_name": "Figma"
  }
}
```

Hard cases:

- black screenshots on Linux Wayland
- multiple monitors
- Windows UAC/admin surfaces
- macOS permission prompts
- retina scaling mismatch
- overlay coordinates not matching screenshot pixels

Priority:

1. single display works
2. overlay coordinates match screenshot coordinates
3. multi-monitor support
4. selected-region support
5. active-window capture

---

## 3. Overlay System

Plain English: This is the layer that appears on top of other apps and shows the user where to look or click.

Responsibilities:

- transparent always-on-top window
- pointer ring
- target label
- step bubble
- floating assistant puck
- radial controls
- selected-region rectangle
- target magnifier
- pause/stop UI
- confirmation sheet

Overlay states:

```text
idle
listening
thinking
guiding
waiting_for_user
confirmation_required
paused
done
error
```

Design rules:

- keep text readable
- avoid covering target controls
- auto-reposition bubbles
- use large controls for touch/gesture mode
- avoid loud animation during active guidance
- make confirmation screens clear and calm

Important technical problem:

> The overlay coordinate system must match the screenshot coordinate system.

If the model says the target is at `x=500, y=300`, the overlay must draw exactly there, even on scaled displays.

---

## 4. AI Screen Understanding

Plain English: This is the brain that looks at the screenshot and decides what the user should do next.

Inputs:

- screenshot
- user goal
- active app/window
- cursor position
- OCR text
- accessibility nodes
- previous step
- safety context

Output:

```json
{
  "mode": "guide",
  "summary": "You want to export the current file.",
  "step": {
    "instruction": "Click File in the top-left menu bar.",
    "target": {
      "label": "File",
      "x": 24,
      "y": 14,
      "width": 42,
      "height": 24
    },
    "confidence": 0.88,
    "risk": "safe_navigation",
    "requires_confirmation": false
  }
}
```

Rules:

- never trust free-form text for actions
- validate model JSON against schema
- require confidence
- require risk classification
- ask for clarification when confidence is low
- prefer visible targets over guessed menu paths

Fallback behavior:

- if no target is found, explain the uncertainty
- suggest selecting a region
- ask the user what app or panel they are in
- provide textual guidance without drawing a fake coordinate

---

## 5. OCR And Accessibility

Plain English: Screenshots help, but text and UI metadata make the assistant more accurate.

Sources:

- screenshot vision
- OCR
- Windows UI Automation
- macOS Accessibility API
- Linux AT-SPI
- browser extension later for DOM access

Priority order:

1. screenshot vision works everywhere
2. OCR extracts visible labels
3. accessibility tree improves button/field matching
4. browser extension improves web app precision

Unified element shape:

```json
{
  "id": "element-123",
  "source": "ocr",
  "role": "button",
  "label": "Export",
  "x": 1220,
  "y": 84,
  "width": 86,
  "height": 34,
  "confidence": 0.91
}
```

The model should receive a compact version of the UI map, not thousands of raw nodes.

---

## 6. Gesture Layer

Plain English: The camera watches for intentional hand gestures and turns them into assistant commands.

Gesture commands:

| Gesture | Command |
|---|---|
| two-finger pinch | toggle voice mode |
| open palm | pause/stop assistant |
| index finger point | ask about pointed region |
| pinch and drag | select screen region |
| swipe right | next step |
| swipe left | previous step |
| thumb up | confirm |
| thumb down | cancel |
| two hands apart/together | expand/collapse overlay |
| hold one finger up | push-to-talk/listen |

Pipeline:

```text
camera frame
  -> hand landmark detector
  -> gesture classifier
  -> confidence smoothing
  -> command mapper
  -> assistant state machine
```

False-positive controls:

- require gesture hold duration
- use confidence thresholds
- add cooldowns
- allow calibration
- show visual feedback before triggering
- make camera mode optional

Privacy rules:

- process camera frames locally by default
- show clear camera-on indicator
- provide one-click camera disable
- never store camera frames unless explicitly debugging

---

## 7. Voice Layer

Plain English: The user can talk to the assistant instead of typing.

Responsibilities:

- push-to-talk
- gesture-triggered listening
- streaming transcription
- stop/interruption
- optional text-to-speech
- command routing

Useful voice commands:

- "What do I do next?"
- "Show me where."
- "Explain this screen."
- "Pause."
- "Continue."
- "Cancel."
- "Is this safe?"
- "Guide me until done."

First voice milestone:

```text
Pinch gesture
  -> listening UI opens
  -> user speaks task
  -> transcription becomes prompt
  -> screen is captured
  -> AI returns next target
  -> overlay points to target
```

---

## 8. Safety Engine

Plain English: The assistant should help, but it should not trick the user into dangerous clicks.

Risk classes:

```text
safe_navigation
form_entry
external_send
delete
payment
security_change
account_change
permission_change
unknown_risky
```

Rules:

- safe navigation can be guided immediately
- form entry must say what is being changed
- delete/send/pay/security/account actions require confirmation
- unknown risky actions should be treated cautiously
- the assistant should not silently execute risky actions
- if uncertain, ask before continuing

Confirmation sheet must show:

- what action is about to happen
- why it may be risky
- what the user should verify
- confirm button
- cancel button

Example:

```text
This looks like a payment submission.
Before continuing, check the recipient and amount.
[Confirm guidance] [Cancel]
```

---

## 9. Agent Workflow Engine

Plain English: For longer tasks, the assistant needs to guide the user through multiple steps, not just one click.

State machine:

```text
IDLE
LISTENING
THINKING
GUIDING
WAITING_FOR_USER
VERIFYING_SCREEN
CONFIRM_REQUIRED
PAUSED
DONE
ERROR
```

Responsibilities:

- turn user goal into a plan
- show one step at a time
- wait for user action
- capture the screen again
- verify progress
- adapt if the screen changed
- detect when task is complete

Important constraint:

> Guidance comes before automation.

Automation may come later, but the first product should help the user act, not take over the computer.

---

## 10. Evaluation System

Plain English: We need a test suite that proves the assistant points to the right thing.

Why this matters:

- AI can sound confident while being wrong.
- Coordinate pointing can fail silently.
- Prompt changes can make accuracy worse.
- Different models may behave differently.

Eval item:

```json
{
  "screenshot": "figma-export.png",
  "prompt": "How do I export this?",
  "expected_target": {
    "label": "File",
    "box": [0, 0, 55, 30]
  },
  "expected_risk": "safe_navigation"
}
```

Metrics:

- target hit accuracy
- bounding box overlap
- coordinate distance
- risk classification accuracy
- confidence calibration
- instruction clarity
- latency
- model cost

Done when:

- prompt/model changes can be compared objectively
- failures produce useful debugging data
- accuracy is measured over time

---

## Visual Design System

Plain English: The app should feel polished and futuristic, but not distract from the software being used.

Visual tone:

- transparent
- glassy where useful
- precise
- restrained
- readable
- motion-led but not noisy

Use:

- large tap targets
- floating puck
- radial menus
- subtle 3D guide rings
- clear confirmation sheets
- target magnifier
- soft motion for transitions

Avoid:

- giant chatbot panels
- loud gradients over active apps
- effects that hide text
- decorative animation while the user is trying to click
- visual clutter around the target

Library placement:

```text
react-three-fiber
  -> pointer rings
  -> guide paths
  -> spatial gesture feedback

liquid-glass-js
  -> assistant puck
  -> radial controls
  -> confirmation surfaces

shadergradient
  -> onboarding
  -> idle background
  -> website hero

liquid-logo
  -> logo animation
  -> splash/loading
  -> marketing identity
```

---

## Roadmap

## Phase 1: Repo And Foundation

Goal: Create the project foundation.

Tasks:

1. Create monorepo.
2. Add Tauri v2 desktop app.
3. Add React/TypeScript frontend.
4. Add Rust workspace.
5. Add shared TypeScript schemas.
6. Add linting and formatting.
7. Add basic CI.
8. Add docs skeleton.

Done when:

- app launches
- repo structure is clean
- desktop shell builds locally
- docs folder exists

---

## Phase 2: Overlay Prototype

Goal: Prove that we can draw guidance on top of the desktop.

Tasks:

1. Create transparent always-on-top overlay.
2. Add floating assistant puck.
3. Draw pointer ring at test coordinates.
4. Add step bubble.
5. Add pause/stop controls.
6. Add basic settings panel.

Done when:

- overlay appears above other apps
- test coordinates draw correctly
- user can hide/pause overlay
- overlay does not permanently block normal computer use

---

## Phase 3: Screen Capture

Goal: Prove that the app can see what the user sees.

Tasks:

1. Capture full screen.
2. Capture active display.
3. Return display scale.
4. Return cursor position.
5. Return active window title/app if possible.
6. Add screenshot debug panel.
7. Calibrate screenshot coordinates against overlay coordinates.

Done when:

- screenshot dimensions are correct
- overlay coordinates match screenshot coordinates
- single-monitor case works reliably
- multi-monitor behavior is documented

---

## Phase 4: Real Screen Capture

Goal: Replace placeholder screenshot data with a Windows-first real capture path.

Tasks:

1. Add capture dependencies.
2. Capture the primary display.
3. Encode the screenshot as PNG.
4. Return base64 screenshot payloads through Tauri.
5. Show screenshot dimensions, byte length, and preview in the debug panel.
6. Replace placeholder display metadata with real display dimensions.
7. Add capture error/status UI.

Done when:

- real screenshot pixels are returned to the frontend
- screenshot preview confirms image data exists
- display metadata is real where available
- capture failure does not crash the app

---

## Phase 5: AI Guidance Loop Foundation

Goal: Prove that structured guidance can drive the pointer ring and step bubble safely.

Tasks:

1. Add guidance request and response schemas.
2. Add a deterministic mock guidance client.
3. Wire the desktop UI to request mock guidance.
4. Include screenshot and capture metadata in the guidance request.
5. Feed returned target coordinates into the pointer ring.
6. Feed returned instruction text into the step bubble.
7. Add schema validation before rendering guidance.
8. Validate response shape, finite coordinates, positive target size, confidence range, known risk class, and confirmation requirements for risky actions.
9. Add invalid-guidance fallback state.
10. Display risk, confidence, and confirmation requirement in the debug panel.

Done when:

- mock guidance output drives the overlay
- hardcoded target data is replaced by guidance result data
- invalid guidance is rejected safely
- risky guidance cannot bypass confirmation requirements

---

## Phase 6: Runtime QA And Hardening Pass

Goal: Manually and internally verify the overlay, capture, and mock guidance loop before adding real model providers or complex animation.

Tasks:

1. Launch the Tauri app locally.
2. Verify overlay window behavior.
3. Verify pause, resume, stop, and debug state controls.
4. Verify screen capture refresh.
5. Verify screenshot preview is real and nonblank.
6. Compare overlay dimensions, display dimensions, and screenshot dimensions.
7. Verify mock guidance target moves from screen context.
8. Document runtime findings and known platform issues.

Done when:

- the app works in a real runtime session
- screenshot and overlay diagnostics make sense
- any coordinate mismatch is documented
- Phase 7 visual work has stable states to animate

---

## Phase 7: Fluid Water Puck Motion System

Goal: Replace the static assistant puck with a fluid, cursor-aware assistant presence.

Tasks:

1. Write a fluid puck motion spec.
2. Add the animation rendering layer, likely `react-three-fiber` with a CSS fallback.
3. Add idle shadow behavior behind or near the real pointer.
4. Animate activation as droplets separating, orbiting, merging, and forming the puck.
5. Animate guidance as droplets moving from the puck to the glowing target ring.
6. Add reduced-motion and low-performance modes.
7. Keep the existing static puck as fallback.

Done when:

- idle state feels like a shadow behind the pointer
- activation forms the assistant puck through droplet motion
- guidance can send droplets toward the target ring
- performance remains acceptable
- reduced-motion mode remains usable

---

## Phase 8: Cursor-First Runtime Reset

Goal: Rebuild the runtime so the product is the cursor behavior and target cues, while settings and debug tooling are separated from the default user-facing experience.

Tasks:

1. Add a Clicky-style visual acceptance spec.
2. Split runtime surfaces into overlay, settings, and debug windows.
3. Remove TouchPilot-created titlebars, app-name strips, taskbar presence, and blocking behavior.
4. Make settings a compact tray-style popup that opens intentionally and closes on blur/Escape.
5. Move capture preview, metadata, schema state, and QA controls into a separate debug window.
6. Remove permanent panels/cards from the default overlay runtime.
7. Refine the CSS puck baseline so it is smaller, white, cursor-shadow-like, and follows the cursor.
8. Extract cursor/puck coordinate geometry for focused QA.
9. Add Windows runtime QA for overlay existence, monitor bounds, click-through, no titlebar, no taskbar presence, settings chrome, and hit-testing.
10. Add Windows visual QA for screenshots, forbidden TouchPilot title text, and default panel leakage.
11. Add faster build scripts for desktop typecheck, web build, low-memory Windows build, and no-bundle release executable checks.
12. Replace Tauri fullscreen overlay mode with a monitor-sized borderless Windows popup using native styles:
    - `WS_POPUP`
    - layered transparency
    - transparent input
    - toolwindow/no taskbar
    - no activate
    - exact monitor bounds

Done when:

- the default runtime is cursor-first, not panel-first
- no debug UI is shown in the normal user-facing view
- the settings surface behaves like a popup, not a permanent app shell
- the puck and target cues carry the main guidance experience
- the overlay feels like a desktop assistant layer instead of a prototype dashboard
- Windows runtime QA passes
- Windows visual QA passes
- the monitor-sized popup overlay avoids the fullscreen blue-bar/app-window artifact

---

## Phase 9: Gesture MVP

Goal: Control the assistant with camera gestures.

Tasks:

1. Add camera permission flow.
2. Add local hand landmark detection.
3. Detect two-finger pinch.
4. Detect open palm.
5. Map pinch to assistant activation.
6. Map open palm to pause.
7. Add gesture confidence smoothing.
8. Add camera off switch.

Done when:

- pinch opens assistant input
- open palm pauses assistant
- camera processing is local
- false positives are low enough for demo use

---

## Phase 10: Voice-First Command MVP

Goal: Let the user speak their task, turn that speech into a command, capture the screen, and drive visual puck guidance from the spoken intent.

Decision:

> Voice is the primary user input. The production path should use native Rust microphone capture plus cloud transcription, not Web Speech as the default. Text command input and Web Speech remain debug-only fallbacks.

Tasks:

1. Define the voice-first UX spec:
   - no user-facing command prompt
   - no permanent command panel
   - minimal listening state near the puck/settings
   - debug-only text fallback
2. Add voice state:
   - idle
   - requesting microphone
   - listening
   - transcribing
   - command ready
   - error
3. Probe WebView2 microphone and speech support on the Surface device, but keep Web Speech as debug-only after QA showed it can expose unwanted browser/platform chrome.
4. Replace the normal settings voice toggle with a push-to-talk control:
   - press and hold to talk
   - release to stop and submit
   - escape/stop/pause cancels
5. Move camera toggles out of normal settings:
   - voice command can request camera/gesture activation
   - debug remains the place for low-level camera controls
6. Build native Rust microphone capture:
   - request microphone permission
   - capture audio while push-to-talk is held
   - stop cleanly on release/cancel
   - emit audio chunks or a completed audio payload to the frontend/runtime
7. Add a cloud transcription adapter:
   - send native-captured audio to the transcription provider
   - return transcript text and confidence/error state
   - keep provider keys out of the frontend
8. Route the transcript into the screen capture and guidance loop.
9. Add a debug-only Web Speech fallback:
   - probe support
   - start/stop manually
   - report unsupported behavior clearly
10. Add a debug-only text command fallback for QA.
11. Simplify debug into tabs:
   - Runtime
   - Voice
   - Gesture
   - Capture
   - Guidance
12. Add a debug `Test guidance` action so the mock target can be tested without voice.
13. Connect pinch to start/listen and open palm to stop/pause after the native voice loop works.
14. Handle microphone denied, no microphone, empty transcript, failed transcription, blue-bar/platform UI regression, and cancel.
15. Run manual end-to-end QA:
     - speak command
     - capture screen
     - target appears
     - puck guides
16. Document remaining mocked pieces and platform limits.

Done when:

- the normal user flow is voice-first, not text-prompt-first
- user can push-to-talk, speak a task, and trigger the guidance loop
- default runtime does not show Web Speech/browser microphone chrome
- normal settings do not expose confusing camera internals
- debug can still test the guidance loop with text or Web Speech fallback when native/cloud voice fails
- user can stop listening with release, gesture, settings, or keyboard
- the overlay stays cursor-first and does not become a chatbot window

---

## Phase 11: Safety And Guardrails

Goal: Prevent dangerous or misleading guidance.

Tasks:

1. Add risk classifier.
2. Add policy engine.
3. Add confirmation sheet.
4. Add private mode.
5. Add local debug logs.
6. Add low-confidence handling.

Done when:

- delete/send/pay/security-like actions require confirmation
- private mode avoids screenshot/session storage
- uncertain actions ask for clarification

---

## Phase 12: Screen Intelligence Upgrade

Goal: Improve target accuracy beyond raw screenshots.

Tasks:

1. Add OCR.
2. Add accessibility adapters.
3. Build unified UI element map.
4. Add element matching.
5. Add confidence scoring.
6. Add region selection flow.

Done when:

- assistant uses visible text and UI nodes
- user can select a region and ask about it
- low-confidence targets degrade gracefully

---

## Phase 13: Multi-Step Workflows

Goal: Guide full tasks from start to finish.

Tasks:

1. Add task planner.
2. Store current plan and step index.
3. Verify screen after each step.
4. Add next/back controls.
5. Detect screen changes.
6. Detect completion.

Done when:

- user can ask for a full workflow
- assistant guides one step at a time
- assistant adapts after screen changes

---

## Phase 14: Evaluation Metrics Harness

Goal: Measure whether the assistant points to the correct UI element and classifies risk correctly.

Tasks:

1. Build screenshot dataset format.
2. Add expected target annotations.
3. Add center-point hit test.
4. Add IoU scoring for predicted versus expected boxes.
5. Add center-distance scoring.
6. Add risk classification accuracy.
7. Add confidence calibration reports.
8. Add eval CLI and regression output.

Done when:

- model/prompt changes can be compared objectively
- target accuracy is measured with hit test, IoU, and center distance
- risk classification accuracy is tracked
- confidence scores can be calibrated against real correctness

---

## Phase 15: Visual Polish Integration

Goal: Make the app feel premium after the behavior and evaluation foundations are stable.

Tasks:

1. Refine design system.
2. Expand `react-three-fiber` guidance visuals.
3. Add restrained `liquid-glass-js` panels.
4. Add onboarding visuals.
5. Add logo/splash treatment.
6. Tune motion, readability, and performance.

Done when:

- overlay feels polished
- effects do not hide the target app
- guidance remains readable
- visual effects are covered by reduced-motion fallbacks

---

## Phase 16: Production Readiness

Goal: Prepare for real beta users.

Tasks:

1. Add auto-update.
2. Add signing/notarization path.
3. Add crash reporting.
4. Add secure key storage.
5. Add gateway rate limits.
6. Add privacy policy.
7. Add installers.
8. Add beta feedback channel.

Done when:

- beta user can install the app
- permissions are understandable
- failures are debuggable
- costs and privacy are controlled

---

## First Impressive Demo

The first demo should show the unique product clearly.

Demo script:

1. App is running as a floating overlay.
2. User pinches two fingers.
3. Voice mode opens.
4. User says: "How do I export this?"
5. App captures the screen.
6. AI identifies the next target.
7. Overlay draws a polished pointer/ring.
8. User shows open palm.
9. Assistant pauses.

Why this demo matters:

- It proves the camera gesture idea.
- It proves voice-to-guidance.
- It proves screen understanding.
- It proves visual overlay guidance.
- It feels different from a normal chatbot.

---

## Major Edge Cases

1. **Wrong target**
   - Plain English: The assistant points at the wrong button.
   - Technical cause: model vision mistake, OCR mismatch, coordinate scaling bug, or stale screenshot.
   - Mitigation: confidence scores, correction UI, eval logging, accessibility matching.

2. **Coordinate mismatch**
   - Plain English: The ring appears in a different place from the intended target.
   - Technical cause: display scale, monitor offset, or screenshot coordinate conversion.
   - Mitigation: coordinate calibration tests in Phase 3.

3. **Camera false positives**
   - Plain English: The assistant activates when the user did not mean to gesture.
   - Technical cause: low gesture threshold or noisy hand tracking.
   - Mitigation: hold duration, confidence smoothing, cooldown, calibration.

4. **Screenshot blocked**
   - Plain English: The app cannot see the screen.
   - Technical cause: OS permission, Wayland restrictions, protected surfaces.
   - Mitigation: permission onboarding and fallback messaging.

5. **Risky action**
   - Plain English: The assistant is about to guide the user toward something serious.
   - Technical cause: send/delete/pay/security flows have consequences.
   - Mitigation: mandatory confirmation and risk explanation.

6. **Overlay blocks target**
   - Plain English: The assistant UI covers the thing it wants the user to click.
   - Technical cause: poor bubble placement.
   - Mitigation: auto-position away from target bounding box.

7. **User changes screen mid-step**
   - Plain English: The assistant is guiding based on an old screen.
   - Technical cause: stale screenshot or window state changed.
   - Mitigation: re-capture before each step and verify progress.

---

## Big Risks

### Cross-Platform Overlay Complexity

The transparent overlay is likely to behave differently on Windows, macOS, and Linux.

Mitigation:

- build overlay prototype early
- isolate native helpers
- avoid hardcoding one OS model
- test on each OS before adding too much product logic

### Gesture Reliability

Hand gestures can be noisy because lighting, camera angle, background, and user behavior vary.

Mitigation:

- start with only pinch and open palm
- require stable detection
- show preview feedback
- allow users to disable camera mode

### AI Hallucination

The model may invent a button or assume a workflow that is not visible.

Mitigation:

- force structured outputs
- pass OCR/accessibility context
- require target confidence
- ask clarification when uncertain
- collect eval failures

### Privacy Trust

The product captures screenshots, microphone input, and camera input. Users will care.

Mitigation:

- camera processing local by default
- private mode
- clear permission screens
- local logs only unless opt-in
- transparent privacy policy

### Cost

Multimodal model calls can be expensive.

Mitigation:

- gateway rate limits
- model tiering
- image compression
- caching where appropriate
- eval-driven prompt optimization

---

## Build Order Recommendation

The correct order:

1. Repo foundation
2. Overlay coordinate system
3. Screen capture metadata
4. Real screen capture
5. AI guidance loop with schema validation
6. Runtime QA and hardening pass
7. Fluid water puck motion system
8. Cursor-first runtime reset with Windows monitor-sized popup overlay
9. Gesture pinch/open palm
10. Voice
11. Safety
12. OCR/accessibility
13. Multi-step workflows
14. Evaluation metrics harness
15. Visual polish integration
16. Production hardening

Do not start with the liquid visuals before the guidance loop is stable. The water puck depends on assistant states, target-ring behavior, and runtime capture diagnostics. Once Phase 5 proves the structured guidance loop and Phase 6 verifies it in a running app, the fluid puck can be built without constantly reworking its state transitions.

Do not treat confidence as an accuracy metric by itself. In Phase 5, confidence is only a schema-validated model field. In the later evaluation phase, confidence must be calibrated against measured correctness using center-point hit tests, IoU, center distance, and risk classification accuracy.

The most important early question is:

> Can the app accurately understand the screen and point to the correct place across operating systems?

Everything else builds on that.

---

## Quick Reference

### Key Terms

| Term | Plain English meaning | Technical meaning |
|---|---|---|
| Overlay | UI drawn on top of other apps | Transparent always-on-top window |
| Screen capture | Taking a picture of the current screen | OS-level screenshot capture with metadata |
| Gesture control | Using hand movement as input | Camera landmarks mapped to commands |
| OCR | Reading text from an image | Text extraction from screenshot pixels |
| Accessibility tree | Structured app UI metadata | OS-provided roles, labels, bounds, focus |
| Guardrail | Safety check before risky action | Policy engine over action/risk classes |
| Eval | Test for assistant accuracy | Dataset and scoring runner |
| Target box | Area the assistant points to | x/y/width/height bounding box |

### Minimal First Schema

```ts
type GuidanceResult = {
  mode: "guide" | "answer" | "clarify";
  summary: string;
  step?: {
    instruction: string;
    target?: {
      label: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
    confidence: number;
    risk:
      | "safe_navigation"
      | "form_entry"
      | "external_send"
      | "delete"
      | "payment"
      | "security_change"
      | "account_change"
      | "permission_change"
      | "unknown_risky";
    requires_confirmation: boolean;
  };
};
```

### Minimal First Gesture Events

```ts
type GestureCommand =
  | { type: "toggle_voice"; confidence: number }
  | { type: "pause"; confidence: number }
  | { type: "cancel"; confidence: number };
```

### Minimal First Assistant States

```ts
type AssistantState =
  | "idle"
  | "listening"
  | "thinking"
  | "guiding"
  | "confirmation_required"
  | "paused"
  | "error";
```

---

## Suggested Quiz Questions

1. Why should this project start from scratch instead of using Clicky as the base code?
2. What problem does the overlay coordinate system need to solve?
3. Why should camera gestures be treated as a control layer instead of the main intelligence layer?
4. What are the first two gestures to implement, and why?
5. Why are evals necessary for a screen-guidance AI assistant?
6. Which actions should require confirmation before guidance continues?
7. Where should `react-three-fiber`, `liquid-glass-js`, `shadergradient`, and `liquid-logo` fit in the product?

---

*Generated: 2026-05-31 | Project: clicky-inspired cross-platform AI screen guide | File: Documents/codex/clicky/learnings/plan.md*
