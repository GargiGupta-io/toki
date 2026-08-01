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

test("the panel starts below the camera housing, not at the top of the display", () => {
  const placement = sliceRustFunction("position_top_utility");

  assert.match(
    placement,
    /macos_top_inset\(window\)/u,
    "the macOS offset must come from the measured safe area",
  );
  // The previous value. A zero constant here is the bug: it reads as
  // "no gap needed" and is silently correct on every display without a notch,
  // which is every display a developer is likely to be looking at.
  assert.doesNotMatch(
    placement,
    /#\[cfg\(target_os = "macos"\)\]\s*\n\s*let top_gap = 0;/u,
    "macOS must not pin the panel to the monitor origin",
  );
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
