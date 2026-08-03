import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Where the notch panel is allowed to put itself.
 *
 * The panel hangs from the top of the display, which on a MacBook means it
 * shares that edge with the camera housing. It was positioned at the monitor's
 * own origin, so on this machine -- where the safe area starts 32 points down --
 * the housing physically covered the panel's first row: the status icon, the
 * title, and the beginning of the message were behind the camera.
 *
 * Nothing here can prove what a screen looks like. What it can hold is the
 * decision: the offset is read from the system, and it is not a constant.
 */

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const libPath = path.join(
  scriptsDirectory,
  "..",
  "apps",
  "desktop",
  "src-tauri",
  "src",
  "lib.rs",
);

const source = readFileSync(libPath, "utf8");

function sliceRustFunction(name) {
  const start = source.indexOf(`fn ${name}`);
  assert.notEqual(start, -1, `${name} must exist in lib.rs`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `${name} must be a closed function`);
  return source.slice(start, end);
}

test("the panel meets the camera housing instead of dodging it", () => {
  const placement = sliceRustFunction("position_top_utility");

  // Flush with the top edge, so the panel's black and the housing's black are
  // one shape. Pushing the window down by the inset cleared the housing and
  // left a strip of desktop between them -- a separate slab floating below the
  // notch, which is the seam the design exists to avoid.
  assert.match(placement, /#\[cfg\(target_os = "macos"\)\]\s*\n\s*let top_gap = 0;/u);

  // Clearing it is the content's job, and the measurement still has to reach
  // the stylesheet for that to be possible.
  const source = readFileSync(libPath, "utf8");
  assert.match(source, /fn top_utility_notch_inset/u);
  assert.match(source, /top_utility_notch_inset,/u, "the command must be registered");

  const css = readFileSync(
    path.join(scriptsDirectory, "..", "apps", "desktop", "src", "TokiTopUtilitySurface.css"),
    "utf8",
  );
  assert.match(css, /var\(--notch-inset, 0px\)/u);
});

test("the inset is measured, never assumed", () => {
  const inset = sliceRustFunction("macos_top_inset");

  // Notch height differs across models and an external display has none, so a
  // literal would be wrong on most machines that are not the author's.
  assert.match(inset, /safeAreaInsets/u);
  // The window's own screen, so an external monitor is not given the laptop's
  // notch.
  assert.match(inset, /c"screen"/u);
  // safeAreaInsets arrived in macOS 12; older systems must return zero rather
  // than trap on an unrecognised selector.
  assert.match(inset, /respondsToSelector:/u);
  // A wild reading would shove the panel down the screen, which is worse than
  // the bug being fixed.
  assert.match(inset, /contains\(&insets\.top\)/u);
});

const appSource = readFileSync(
  path.join(scriptsDirectory, "..", "apps", "desktop", "src", "App.tsx"),
  "utf8",
);

/**
 * The panel closing itself.
 *
 * It hangs over whatever someone is working on, so leaving it open until it is
 * dismissed made every glance cost a dismissal. Collapsing is only safe while
 * nothing is mid-flight, and "nothing is happening" is not the same question as
 * "nobody has moved the mouse".
 */
test("an idle panel collapses, and a busy one does not", () => {
  const idle = appSource.slice(
    appSource.indexOf("const idleHoldRef = useRef(false);"),
    appSource.indexOf("  return (\n    <main", appSource.indexOf("const idleHoldRef")),
  );
  assert.notEqual(idle.length, 0, "the idle collapse must exist");

  // Each of these is a case where disappearing destroys something: a recording
  // in progress, a request already sent, and a warning that must be
  // acknowledged before Toki will reveal a target.
  for (const hold of ["voiceActive", "isRefreshingCapture", '"confirming"']) {
    assert.ok(idle.includes(hold), `${hold} must hold the panel open`);
  }

  // Reading is indistinguishable from inactivity.
  assert.ok(idle.includes("pointerOverPanel"));

  // Re-checked when the timer fires, not when it was armed: a recording started
  // after arming must still stop the collapse.
  assert.match(idle, /if \(idleHoldRef\.current\) \{\s*\n\s*arm\(\);/u);

  // The same passive state Escape produces, so it stays reachable without going
  // back to the menu bar.
  assert.match(idle, /collapseTopUtility\(\)/u);

  // Listeners are removed with the same reference they were added with,
  // otherwise every re-render leaks one.
  assert.match(idle, /window\.removeEventListener\(event, arm\)/u);
});

/**
 * The peek bar has to be visible, and clicking it has to be enough.
 *
 * Two failures met here. The window is a fixed height and the content is inset
 * to clear the camera housing, so the inset came out of the bottom -- 58 points
 * of window holding 58 points of content plus a 32 point inset left a sliver.
 * And the bar refused pointer events, so the panel could only be opened by
 * hovering, which never made its window key; macOS then spent the first click
 * on activating it, and every control appeared to need a double tap.
 */
test("the window grows by the inset instead of losing content to it", () => {
  const modes = source.slice(
    source.indexOf("fn apply_top_utility_mode"),
    source.indexOf("fn set_top_utility_height"),
  );
  assert.notEqual(modes.length, 0);

  assert.match(modes, /TOP_UTILITY_PEEK_HEIGHT \+ notch/u);
  assert.match(modes, /TOP_UTILITY_EXPANDED_HEIGHT \+ notch/u);
});

test("the peek bar can be clicked, and opening focuses the window", () => {
  const modes = source.slice(
    source.indexOf('        "peek" => {'),
    source.indexOf('        "expanded" => {'),
  );
  // Passing clicks through means the bar cannot be the thing you click.
  assert.match(modes, /set_ignore_cursor_events\(false\)/u);

  const css = readFileSync(
    path.join(scriptsDirectory, "..", "apps", "desktop", "src", "TokiTopUtilitySurface.css"),
    "utf8",
  );
  const peek = css.slice(css.indexOf('.toki-top-utility[data-mode="peek"]'));
  assert.doesNotMatch(peek.slice(0, 200), /pointer-events: none/u);

  // Key on open, or the next click is spent activating the window.
  assert.match(appSource, /onExpand=\{\(\) => \{[\s\S]{0,200}?focus: true/u);
});

/**
 * Leaving.
 *
 * Toki has no Dock icon, so before this the only way out was to find its menu
 * bar icon and open the menu. The panel is where everything else is done, and
 * an app holding camera, microphone, and screen recording permission should be
 * easy to stop rather than easy to lose track of.
 */
test("the panel can quit Toki, and quitting really exits", () => {
  const surface = readFileSync(
    path.join(scriptsDirectory, "..", "apps", "desktop", "src", "TokiTopUtilitySurface.tsx"),
    "utf8",
  );

  // Both the power button and the close control end it. The close control used
  // to collapse, which is still reachable by Escape, by clicking away, and by
  // the idle timer -- so nothing was lost by giving it the more useful job.
  // One quit control, in the corner, and it is the power glyph rather than a
  // close cross -- a cross reads as "dismiss this panel", which is what it used
  // to do and is now three other gestures.
  assert.match(surface, /onClick=\{onQuit\} aria-label="Quit Toki"[\s\S]{0,60}<PowerIcon/u);
  assert.equal(
    (surface.match(/onQuit\}/gu) ?? []).length,
    1,
    "two ways to quit from one panel is one too many",
  );

  const css = readFileSync(
    path.join(scriptsDirectory, "..", "apps", "desktop", "src", "TokiTopUtilitySurface.css"),
    "utf8",
  );
  const corner = css.slice(css.indexOf(".toki-top-utility__window-actions button"));
  // Bare at rest: no resting fill, so the most emphatic control in the panel
  // does not sit there wearing the same circle as the least.
  assert.match(corner.slice(0, 400), /background: transparent/u);
  // The one colour in a monochrome interface, spent on the one irreversible
  // action, and only while the pointer is on it.
  assert.match(corner, /:hover[\s\S]{0,200}#ff5f57/u);
  assert.match(corner, /box-shadow:[\s\S]{0,120}rgba\(255, 95, 87/u);
  assert.match(appSource, /invoke\("quit_toki"\)/u);

  // Exits rather than hides. Something with these permissions that keeps
  // running after being told to stop is the behaviour that makes an app like
  // this hard to trust.
  const command = source.slice(
    source.indexOf("fn quit_toki"),
    source.indexOf("\n}", source.indexOf("fn quit_toki")),
  );
  assert.match(command, /app\.exit\(0\)/u);
  assert.doesNotMatch(command, /hide\(\)/u);
  assert.match(source, /quit_toki,/u, "the command must be registered");
});

test("collapsing is still reachable without the close button", () => {
  // Escape, losing focus, and the idle timer. If these ever go, the panel can
  // only be dismissed by quitting the application.
  assert.ok(
    (appSource.match(/collapseTopUtility\(\)/gu) ?? []).length >= 3,
    "at least three ways to collapse must remain",
  );
});

test("every route into the expanded panel makes its window key", () => {
  // macOS gives the first click on a window that is not key to activating it,
  // not to the control under the pointer. A panel opened without focus makes
  // every button appear to need two presses -- including quit.
  //
  // The hover reveal is the route that actually fires in practice: its dwell is
  // short enough that the panel is open before any click arrives, so the
  // click-to-open handler never runs and cannot be relied on to focus.
  const requests = appSource.match(/requestTopUtilityMode\("expanded"[^)]*\)/gu) ?? [];
  assert.ok(requests.length >= 3, "expected several ways to open the panel");

  for (const request of requests) {
    assert.match(
      request,
      /focus: true/u,
      `opening the panel without focus costs the next click: ${request}`,
    );
  }
});
