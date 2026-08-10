import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyCreatureColour,
  hueShiftFor,
  isLiteralColourState,
  rgbToHsl,
  rotateHue,
  rotateRgba,
  parseColour,
} from "../apps/desktop/src/creatureColour.ts";
import { firstRunColours } from "../apps/desktop/src/firstRun.ts";

/*
 * The first thing Toki ever asks for is which colour it should be. Until now
 * the answer painted a static mark on the card and nothing else, and the living
 * creature read a fixed table of blues -- so the question was decorative, which
 * is worse than not asking it.
 */

function hueOf(value) {
  return rgbToHsl(parseColour(value)).h;
}

test("blue changes nothing, because blue is what it was drawn in", () => {
  // Somebody who skips the question, or picks the first option, must get
  // exactly the creature that was designed.
  assert.equal(hueShiftFor("blue"), 0);
  assert.equal(rotateHue("#2A9BFF", 0), "#2A9BFF");
});

test("every state turns by the same angle, so the family survives", () => {
  // The creature is not one colour: resting, listening and thinking are
  // deliberately different tones, and that difference is what makes a glance at
  // it informative. Overwriting them all with one hex would flatten it into a
  // blob that never changes.
  const shift = hueShiftFor("green");
  const before = { idle: "#2A9BFF", listening: "#24BEFF", thinking: "#5A6EFF" };
  const after = Object.fromEntries(
    Object.entries(before).map(([k, v]) => [k, rotateHue(v, shift)]),
  );

  const gapBefore = hueOf(before.thinking) - hueOf(before.idle);
  const gapAfter = hueOf(after.thinking) - hueOf(after.idle);

  assert.ok(Math.abs(gapBefore - gapAfter) < 1.5, "the spread between states is kept");
  assert.ok(Math.abs(hueOf(after.idle) - hueOf("#30D158")) < 1.5, "resting becomes the chosen colour");
});

test("how vivid and how light each state is does not change", () => {
  // Turning saturation and lightness as well makes some choices muddy and
  // others fluorescent, because the four options do not sit at equal distances
  // from blue.
  for (const option of firstRunColours) {
    const shift = hueShiftFor(option.id);
    const from = rgbToHsl(parseColour("#24BEFF"));
    const to = rgbToHsl(parseColour(rotateHue("#24BEFF", shift)));

    assert.ok(Math.abs(from.s - to.s) < 0.02, `${option.id} saturation`);
    assert.ok(Math.abs(from.l - to.l) < 0.02, `${option.id} lightness`);
  }
});

test("failure still looks like failure, whatever was chosen", () => {
  // Red means something went wrong. Rotating it would leave a green Toki
  // reporting failure in a green that looks like everything else it does.
  assert.equal(isLiteralColourState("error"), true);

  const errorVisual = { fillColor: "#FF5470", shadowColor: "rgba(82, 10, 45, 0.52)" };
  const applied = applyCreatureColour(errorVisual, "error", hueShiftFor("green"));

  assert.equal(applied.fillColor, "#FF5470");
  assert.equal(applied.shadowColor, errorVisual.shadowColor);
});

test("the shadow is turned with the body", () => {
  // A blue creature casts a blue-black shadow. Leaving it behind puts a blue
  // halo under a green blob.
  const applied = applyCreatureColour(
    { fillColor: "#2A9BFF", shadowColor: "rgba(2, 13, 34, 0.5)" },
    "idle",
    hueShiftFor("rose"),
  );

  assert.notEqual(applied.shadowColor, "rgba(2, 13, 34, 0.5)");
  assert.match(applied.shadowColor, /^rgba\(\d+, \d+, \d+, 0\.5\)$/u, "the alpha survives");
});

test("a grey is left grey", () => {
  // The paused state is deliberately drained of colour. Rotating a grey would
  // invent a hue where the design had none.
  assert.equal(rotateHue("#808080", 90), "#808080");
  assert.equal(rotateRgba("rgba(0, 0, 0, 0.42)", 90), "rgba(0, 0, 0, 0.42)");
});

test("nonsense is passed through rather than turned into black", () => {
  assert.equal(rotateHue("not a colour", 90), "not a colour");
  assert.equal(rotateRgba("var(--something)", 90), "var(--something)");
});

// --- Wiring ---------------------------------------------------------------

const puck = readFileSync(new URL("../apps/desktop/src/BlobPuck.tsx", import.meta.url), "utf8");
const firstRunCard = readFileSync(
  new URL("../apps/desktop/src/TokiFirstRun.tsx", import.meta.url),
  "utf8",
);

test("the lock colours are applied after the rotation, not before", () => {
  // Amber means checking and teal means locked on. Rotating those would leave a
  // green Toki unable to say either.
  const applyAt = puck.indexOf("applyCreatureColour(blobPuckVisuals[mode]");
  const lockAt = puck.indexOf("...blobPuckLockVisuals[lockState]");

  assert.ok(applyAt > 0 && lockAt > applyAt, "lock colours must win");
});

test("choosing a colour changes the creature, not just the card", () => {
  // "Click one to bring me to life" is a promise about the thing in the notch.
  assert.match(firstRunCard, /toki:\/\/creature-colour/u);
  assert.match(firstRunCard, /emitTo\("overlay"/u);
});
