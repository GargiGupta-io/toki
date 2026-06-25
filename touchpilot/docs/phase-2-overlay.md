# Phase 2 Overlay Prototype

Phase 2 proves that Toki can behave like a desktop guidance layer instead of a normal app window.

## Goal

Build the first overlay prototype:

1. replace the starter app UI with a Toki shell,
2. create a floating assistant puck,
3. show a pointer ring at test coordinates,
4. attach a step bubble to the target,
5. add pause and stop controls,
6. keep the implementation ready for transparent always-on-top behavior.

## Prototype Constraints

This phase should stay focused on overlay behavior. It should not add AI, screen capture, voice, or camera gestures yet.

The first useful result is a reliable visual surface that can later receive coordinates from the AI guidance loop.

## Window Behavior

The initial desktop window should be configured toward overlay behavior:

- always on top,
- transparent-capable,
- undecorated or minimally framed once the overlay UI is ready,
- resizable during debugging,
- visible in development with enough background contrast to inspect layout.

For the first implementation, it is acceptable to use a semi-transparent debug background. Fully transparent click-through behavior can be refined after pointer and control placement are working.

## Click Handling

There are two click modes to support eventually:

1. **Interactive mode**
   - User can click the assistant puck, pause/stop controls, and debug panel.
   - Overlay receives pointer events.

2. **Pass-through mode**
   - Overlay visuals stay visible.
   - Clicks pass through to the app underneath except for active controls.

Phase 2 should start with interactive mode because it is easier to debug. Pass-through mode should be treated as a follow-up once the overlay is visually stable.

## Overlay Components

### Assistant Puck

The assistant puck is the main floating control. It should show that Toki is alive and provide an obvious place for future voice, gesture, and prompt interactions.

Initial behavior:

- fixed near the lower-right area,
- visible idle/listening/thinking/guiding states,
- large enough to be easy to click,
- compact enough not to dominate the screen.

### Pointer Ring

The pointer ring marks the target area the assistant wants the user to look at or click.

Initial behavior:

- fixed test position,
- clear ring shape,
- subtle pulse or glow,
- stable dimensions,
- no layout shift.

### Step Bubble

The step bubble explains the current guidance step.

Initial behavior:

- attached near the pointer target,
- short instruction text,
- confidence/risk/debug details optional,
- auto-positioning later if it would cover the target.

### Pause And Stop Controls

The user should always have a clear way to pause or stop the overlay.

Initial behavior:

- visible controls in the overlay shell,
- pause changes the assistant state,
- stop returns to idle or hides active guidance.

## Overlay State

The UI should use a small state model:

```text
idle
listening
thinking
guiding
paused
error
```

The first prototype can set these states manually through debug controls. Later phases will connect them to gestures, voice, and AI responses.

## Debug Panel

The prototype should include a compact debug panel during Phase 2.

Useful controls:

- set state to idle,
- set state to guiding,
- set state to paused,
- toggle pointer visibility,
- adjust target x/y values later,
- show current target coordinates.

The debug panel should be easy to remove or hide before production polish.

## Design Rules

- Do not use giant chatbot panels.
- Do not cover the target area with decorative UI.
- Keep text small but readable.
- Use stable dimensions for pointer, puck, and controls.
- Avoid loud background effects during active guidance.
- Prefer restrained glass and depth over heavy gradients.

## Phase 2 Done When

Phase 2 is complete when:

- the starter Tauri UI is replaced,
- the app shows a Toki overlay shell,
- an assistant puck is visible,
- a pointer ring renders at a fixed target,
- a step bubble explains the target,
- pause and stop controls change overlay state,
- the app passes `npm run check`,
- the desktop frontend builds successfully,
- Phase 2 behavior is documented.

## Known Risks

### Transparent Window Differences

Windows, macOS, and Linux handle transparent and always-on-top windows differently.

Mitigation:

- keep native window configuration isolated,
- validate on Windows first,
- document platform differences as they appear.

### Click-Through Complexity

Click-through overlays can make controls hard to interact with if handled too early.

Mitigation:

- start interactive,
- add pass-through as a controlled mode later.

### Coordinate Alignment

The pointer ring must eventually align with screenshot/model coordinates.

Mitigation:

- use explicit target coordinates from the beginning,
- avoid layout-driven target placement,
- keep coordinate display visible in debug mode.
