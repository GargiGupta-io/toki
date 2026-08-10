import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lib = readFileSync(
  new URL("../apps/desktop/src-tauri/src/lib.rs", import.meta.url),
  "utf8",
);
const app = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);
const firstRun = readFileSync(
  new URL("../apps/desktop/src/TokiFirstRun.tsx", import.meta.url),
  "utf8",
);

/*
 * The panel closing under somebody mid-way through using it.
 *
 * Both flows that live in it send you somewhere else half way through: a
 * browser to sign in, Apple's permission dialog, the Settings pane. The panel
 * closes when the cursor leaves the top of the screen -- which is exactly what
 * going to do any of those looks like.
 *
 * So sign-in worked, and there was nothing on screen afterwards. It read as
 * sign-in having failed, and signing in again looked like it failed too.
 */

test("the panel cannot be collapsed while it is being used", () => {
  const start = lib.indexOf("fn apply_top_utility_mode");
  const apply = lib.slice(start, lib.indexOf("\n}\n", lib.indexOf("match mode {", start)));

  assert.match(apply, /ONBOARDING_ACTIVE\.load/u);
  // Guarding every route into the function rather than the leave timer alone:
  // the timer is only one of several ways the panel gets closed, and the next
  // one added would not know about this.
  assert.ok(
    apply.indexOf("ONBOARDING_ACTIVE.load") < apply.indexOf("match mode {"),
    "the guard must come before anything acts on the mode",
  );
  assert.match(apply, /mode != "expanded"/u, "opening it is always allowed");
});

test("the flag lives with the window that does the closing", () => {
  // The overlay closes the panel; the panel hosts the flows. They are separate
  // windows with no view of each other's state, so a flag on either side alone
  // would be read by the wrong one.
  assert.match(app, /invoke\("set_onboarding_active", \{ active \}\)/u);
  assert.match(app, /firstRunPending \|\| permissionsPending/u);
});

test("the hold is released when the flows finish", () => {
  // Otherwise the panel never closes again for the rest of the session, which
  // is a worse bug than the one being fixed.
  const effect = app.slice(app.indexOf("Hold the panel open for as long"));
  assert.match(effect.slice(0, 1200), /active: false/u);
});

test("a sign-in that just landed moves on", () => {
  // Leaving somebody on the same screen with the button relabelled is the app
  // failing to acknowledge the thing it sent them away to do.
  assert.match(firstRun, /wasSignedInAtStart/u);
  assert.match(firstRun, /advanceFirstRun\(known\)/u);
});

test("a session that was already signed in does not skip the opening", () => {
  // The case that made this wait in the first place: a replay would otherwise
  // start the introduction in the middle, skipping the line that says what
  // Toki is.
  const effect = firstRun.slice(firstRun.indexOf("Signing in finishes in the browser"));
  assert.match(
    effect.slice(0, 1400),
    /wasSignedInAtStart\.current \|\|/u,
    "an account that already existed must not advance anything",
  );
});
