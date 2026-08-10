import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceFirstRun,
  chooseColour,
  defaultColourId,
  findColour,
  firstRunColours,
  initialFirstRun,
  isFirstRunVisible,
  nextFirstRunStep,
  readFirstRun,
  resetFirstRun,
  writeFirstRun,
} from "../apps/desktop/src/firstRun.ts";

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
  };
}

test("nothing moves past the welcome until there is an account", () => {
  // Everything after this is pointless without one, and a colour chosen by
  // somebody who then cannot sign in is a decision thrown away.
  assert.equal(nextFirstRunStep(initialFirstRun), "welcome");
  assert.equal(nextFirstRunStep({ ...initialFirstRun, signedIn: true }), "colour");
});

test("the introduction always opens on its own first line", () => {
  // It used to advance itself the moment an account existed, so a replay -- or
  // anybody coming back -- opened on the second screen, skipping the sentence
  // that says what Toki is.
  const signedIn = { ...initialFirstRun, signedIn: true };

  assert.equal(signedIn.step, "welcome", "still the welcome, account or not");
  assert.equal(advanceFirstRun(signedIn).step, "colour", "and only a press moves it");
});

test("the colour is chosen before the creature is introduced", () => {
  // The greeting is the first time it appears. It should already be yours.
  const order = [];
  let state = { ...initialFirstRun, signedIn: true };

  for (let i = 0; i < 4; i += 1) {
    order.push(state.step);
    state = advanceFirstRun(state);
  }

  assert.deepEqual(order, ["welcome", "colour", "greeting", "handoff"]);
});

test("permissions are last, and are not a screen in this window", () => {
  // They belong in the notch, where Toki lives and where macOS puts its own
  // dialog beside them.
  let state = { ...initialFirstRun, signedIn: true, step: "greeting" };
  state = advanceFirstRun(state);

  assert.equal(state.step, "handoff");
  assert.equal(isFirstRunVisible(state), false, "the window closes");
});



test("choosing a colour does not advance", () => {
  // The creature changes under the dots so the choice can be seen, and changed,
  // before it is taken.
  const state = chooseColour({ ...initialFirstRun, step: "colour" }, "amber");

  assert.equal(state.colour, "amber");
  assert.equal(state.step, "colour");
});

test("blue is the default, so skipping changes nothing", () => {
  // Anybody who does not care ends up with the creature exactly as it already
  // looks.
  assert.equal(defaultColourId, "blue");
  assert.equal(firstRunColours[0].id, "blue");
  assert.equal(findColour(defaultColourId).hex, "#2A9BFF");
});

test("four colours, not a picker", () => {
  // A wheel makes somebody stop and design something.
  assert.equal(firstRunColours.length, 4);
  for (const colour of firstRunColours) {
    assert.match(colour.hex, /^#[0-9A-F]{6}$/u, colour.id);
  }
});

test("decisions are remembered, the position is not", () => {
  // A first run interrupted half way should start again rather than resume into
  // the middle of a sentence -- and the steps it replays are three clicks.
  const storage = fakeStorage();
  writeFirstRun(
    { step: "colour", signedIn: true, colour: "green" },
    storage,
  );

  const restored = readFirstRun(storage);
  assert.equal(restored.colour, "green");
  assert.equal(restored.step, "welcome", "position is not resumed");
});

test("a finished first run does not come back", () => {
  const storage = fakeStorage();
  writeFirstRun(
    { step: "handoff", signedIn: true, colour: "rose" },
    storage,
  );

  const restored = readFirstRun(storage);
  assert.equal(restored.step, "done");
  assert.equal(isFirstRunVisible(restored), false);
});

test("corrupt or absent storage starts a normal first run", () => {
  assert.deepEqual(readFirstRun(fakeStorage()), initialFirstRun);
  assert.deepEqual(
    readFirstRun(fakeStorage({ "toki.firstRun": "{not json" })),
    initialFirstRun,
  );
  assert.deepEqual(readFirstRun(null), initialFirstRun);
});

test("a colour that no longer exists falls back rather than breaking", () => {
  const restored = readFirstRun(
    fakeStorage({ "toki.firstRun": JSON.stringify({ colour: "chartreuse" }) }),
  );

  assert.equal(restored.colour, defaultColourId);
});


test("the introduction can be replayed", () => {
  // A first run that can only happen once cannot be checked without wiping the
  // install, which means the flow most likely to be broken is the one nobody
  // ever looks at again.
  const storage = {
    store: { "toki.firstRun": JSON.stringify({ completed: true, colour: "rose" }) },
    getItem(key) { return this.store[key] ?? null; },
    removeItem(key) { delete this.store[key]; },
  };

  assert.equal(readFirstRun(storage).step, "done");
  resetFirstRun(storage);
  assert.equal(readFirstRun(storage).step, "welcome");
});

import { readFileSync } from "node:fs";

test("the introduction happens in the notch, not in a window", () => {
  // Toki lives in the panel under the notch. An introduction that opens a
  // window somewhere else is introducing something that then moves -- and a
  // card inside a window put a box inside a box.
  const app = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );
  const conf = readFileSync(
    new URL("../apps/desktop/src-tauri/tauri.conf.json", import.meta.url),
    "utf8",
  );

  assert.match(app, /<TokiFirstRun/u);
  assert.doesNotMatch(conf, /"firstrun"/u, "no window of its own");
  assert.doesNotMatch(app, /open_first_run_window/u);
});

test("the introduction comes before the permissions, in the same panel", () => {
  // Meet Toki, then let it work. The other order asks for a microphone from
  // something that has not said what it is.
  const app = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );
  // Anchored inside the panel wrapper, not on it: the wrapper line reads
  // `firstRunPending || permissionsPending`, which contains both names.
  const wrapper = app.indexOf('className="toki-top-utility"');
  const firstRun = app.indexOf("{firstRunPending ? (", wrapper);
  const permissions = app.indexOf("<TokiPermissionNotch", wrapper);

  assert.ok(wrapper > 0, "both are drawn inside the panel's own chrome");
  assert.ok(firstRun > 0 && permissions > 0);
  assert.ok(firstRun < permissions, "introduction is checked first");
});

test("the panel supplies the surface; the introduction supplies contents", () => {
  // Its own background and shadow would stack a card inside a card, which is
  // what made the first attempt a black box with a smaller box floating in it.
  const css = readFileSync(
    new URL("../apps/desktop/src/TokiFirstRun.css", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(css, /__card/u);
  assert.doesNotMatch(css, /min-height: 100vh/u);
});

test("the button is a pill with some glass in it", () => {
  const css = readFileSync(
    new URL("../apps/desktop/src/TokiFirstRun.css", import.meta.url),
    "utf8",
  );
  const primary = css.slice(css.indexOf(".toki-first-run__primary {"));

  assert.match(primary.slice(0, 700), /border-radius: 999px/u);
  assert.match(primary.slice(0, 700), /backdrop-filter/u);
});

test("the panel keeps its own black and its curved corners", () => {
  // The background and the bottom radius live on TokiTopUtilitySurface, not on
  // the shell, which is transparent. Rendering anything *instead* of the
  // surface left the contents hanging on the desktop as floating text.
  const app = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );
  const surfaceCss = readFileSync(
    new URL("../apps/desktop/src/TokiTopUtilitySurface.css", import.meta.url),
    "utf8",
  );

  assert.match(app, /className="toki-top-utility"\s*\n?\s*data-mode="expanded"/u);
  assert.match(surfaceCss, /border-radius: 0 0 22px 22px/u);
  assert.match(surfaceCss, /background: #08090b/u);
});

test("the creature is not clipped by the physical notch", () => {
  // The panel is flush with the top of the display on purpose, so its first
  // line sits behind the housing unless the content is pushed below it. The
  // surface does this for its own header; anything rendered in its place has
  // to do the same.
  const app = readFileSync(
    new URL("../apps/desktop/src/App.tsx", import.meta.url),
    "utf8",
  );
  const intro = readFileSync(
    new URL("../apps/desktop/src/TokiFirstRun.css", import.meta.url),
    "utf8",
  );
  const notch = readFileSync(
    new URL("../apps/desktop/src/TokiPermissionNotch.css", import.meta.url),
    "utf8",
  );

  assert.match(app, /"--notch-inset": `\$\{notchInset\}px`/u);
  assert.match(intro, /var\(--notch-inset, 0px\)/u);
  assert.match(notch, /var\(--notch-inset, 0px\)/u);
});
