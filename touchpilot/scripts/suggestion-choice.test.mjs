import assert from "node:assert/strict";
import test from "node:test";

import { matchSpokenChoice } from "../apps/desktop/src/suggestionChoice.ts";

const offers = [
  { target: { label: "Appearance", x: 10, y: 10, width: 100, height: 30 } },
  { target: { label: "Notifications", x: 10, y: 50, width: 100, height: 30 } },
  { target: { label: "Account settings", x: 10, y: 90, width: 100, height: 30 } },
];

test("an ordinal on its own picks that offer", () => {
  assert.deepEqual(matchSpokenChoice("the second one", offers), {
    kind: "chose",
    index: 1,
  });
  assert.deepEqual(matchSpokenChoice("first", offers), {
    kind: "chose",
    index: 0,
  });
  assert.deepEqual(matchSpokenChoice("3", offers), { kind: "chose", index: 2 });
});

test("an ordinal beyond the list is not a choice", () => {
  assert.deepEqual(matchSpokenChoice("the third one", offers.slice(0, 2)), {
    kind: "unrelated",
  });
});

test("a name picks the offer that carries it", () => {
  assert.deepEqual(matchSpokenChoice("appearance", offers), {
    kind: "chose",
    index: 0,
  });
  assert.deepEqual(matchSpokenChoice("open notifications please", offers), {
    kind: "chose",
    index: 1,
  });
});

test("the better name match wins over the first that clears the bar", () => {
  const overlapping = [
    { target: { label: "Account settings", x: 0, y: 0, width: 10, height: 10 } },
    {
      target: {
        label: "Account settings privacy",
        x: 0,
        y: 20,
        width: 10,
        height: 10,
      },
    },
  ];

  assert.deepEqual(
    matchSpokenChoice("account settings privacy", overlapping),
    { kind: "chose", index: 1 },
  );
});

test("declining is understood as declining, not matched against the labels", () => {
  for (const said of ["none of those", "no thanks", "never mind", "cancel"]) {
    assert.deepEqual(
      matchSpokenChoice(said, offers),
      { kind: "declined" },
      said,
    );
  }
});

test("a fresh request is not read as a choice", () => {
  // The whole risk of this feature: somebody asks for something else entirely
  // while the offers are on screen, and gets pointed at an offer instead.
  assert.deepEqual(
    matchSpokenChoice("open the terminal and run the tests", offers),
    { kind: "unrelated" },
  );
  assert.deepEqual(matchSpokenChoice("what is on my screen", offers), {
    kind: "unrelated",
  });
});

test("an ordinal inside a longer request is not a choice", () => {
  assert.deepEqual(
    matchSpokenChoice("open the second tab in the settings window", offers),
    { kind: "unrelated" },
  );
});

test("one common word is not enough to choose", () => {
  const settingsHeavy = [
    { target: { label: "Display settings", x: 0, y: 0, width: 10, height: 10 } },
    { target: { label: "Sound settings", x: 0, y: 20, width: 10, height: 10 } },
  ];

  assert.deepEqual(matchSpokenChoice("settings", settingsHeavy), {
    kind: "unrelated",
  });
});

test("nothing on offer means nothing is ever chosen", () => {
  assert.deepEqual(matchSpokenChoice("the first one", []), {
    kind: "unrelated",
  });
  assert.deepEqual(matchSpokenChoice("", offers), { kind: "unrelated" });
});
