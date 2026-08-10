import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  arrivalAt,
  arrivalDurationMs,
  arrivalPlacement,
  arrivalPolicy,
  idleArrival,
} from "../apps/desktop/src/creatureArrival.ts";

/*
 * "Give me a home" is a request, and pressing it used to swap one card for
 * another. Nothing arrived, nothing moved, and the creature somebody had just
 * chosen a colour for was never seen to take up residence -- so the last line
 * of the introduction was a caption rather than something that happened.
 */

const viewport = { width: 1440, height: 900 };
const notch = { x: 720, y: 30 };

test("it is seen before it travels", () => {
  // Setting off immediately reads as something flying past rather than as
  // something arriving, and this is the first time the live creature is ever on
  // screen.
  assert.equal(arrivalAt(0).phase, "appearing");
  assert.equal(arrivalAt(arrivalPolicy.appearMs - 1).phase, "appearing");
  assert.equal(arrivalAt(arrivalPolicy.appearMs + 1).phase, "travelling");
});

test("it starts in the middle and ends at the notch", () => {
  const start = arrivalPlacement(arrivalAt(0), viewport, notch);
  assert.equal(start.x, 720);
  assert.equal(start.y, 450);

  const end = arrivalPlacement(
    arrivalAt(arrivalPolicy.appearMs + arrivalPolicy.travelMs),
    viewport,
    notch,
  );
  assert.equal(end.x, notch.x);
  assert.equal(end.y, notch.y);
});

test("it shrinks to its normal size as it goes", () => {
  // Beginning oversized is what makes it read as approaching rather than as
  // sliding across the screen.
  assert.ok(arrivalPolicy.startScale > 1.5);
  assert.equal(arrivalPlacement(arrivalAt(0), viewport, notch).scale, arrivalPolicy.startScale);

  const landed = arrivalPlacement(
    arrivalAt(arrivalPolicy.appearMs + arrivalPolicy.travelMs),
    viewport,
    notch,
  );
  assert.ok(Math.abs(landed.scale - 1) < 0.001, "it ends its own size");
});

test("it is slow at both ends", () => {
  // A linear journey starts and stops abruptly, which reads as a thing being
  // moved rather than a thing moving. The creature has weight everywhere else.
  const quarter = arrivalAt(arrivalPolicy.appearMs + arrivalPolicy.travelMs * 0.25).progress;
  const half = arrivalAt(arrivalPolicy.appearMs + arrivalPolicy.travelMs * 0.5).progress;
  const threeQuarters = arrivalAt(arrivalPolicy.appearMs + arrivalPolicy.travelMs * 0.75).progress;

  assert.ok(quarter < 0.25, `eased in, got ${quarter}`);
  assert.ok(Math.abs(half - 0.5) < 0.02, "symmetric through the middle");
  assert.ok(threeQuarters > 0.75, `eased out, got ${threeQuarters}`);
});

test("it rests at the notch before anything else is asked", () => {
  // Without the pause the next card appears on the same frame it lands, and the
  // arrival is over before it has been understood.
  const landed = arrivalPolicy.appearMs + arrivalPolicy.travelMs;

  assert.equal(arrivalAt(landed + 1).phase, "settled");
  assert.equal(arrivalAt(arrivalDurationMs() + 1).phase, "idle");
  assert.ok(arrivalPolicy.settleMs >= 300);
});

test("time it never started is nothing at all", () => {
  assert.deepEqual(arrivalAt(-1), idleArrival);
});

// --- Wiring ---------------------------------------------------------------

const app = readFileSync(new URL("../apps/desktop/src/App.tsx", import.meta.url), "utf8");
const puck = readFileSync(new URL("../apps/desktop/src/BlobPuck.tsx", import.meta.url), "utf8");

test("permissions wait until the creature has landed", () => {
  // Asking for a permission over the top of the arrival talks across the only
  // moment Toki has to introduce itself.
  const effect = app.slice(app.indexOf("The creature arriving, once"));
  const body = effect.slice(0, effect.indexOf("const tokiCreatureState"));

  assert.match(body, /next\.phase === "idle"/u);
  assert.ok(
    body.indexOf('next.phase === "idle"') <
      body.indexOf("open_top_utility_for_permissions"),
    "the permissions must be opened only once the arrival is over",
  );
});

test("the pointer does not drive the creature mid-arrival", () => {
  // It would chase the cursor across its own introduction.
  assert.match(puck, /const arriving = arrival\.phase !== "idle"/u);
  assert.match(puck, /!arriving && pointerShadow == null/u);
  assert.match(puck, /arrivalAt_\s*\?\s*arrivalAt_\.x/u);
});

test("the arrival is driven by elapsed time, not by a frame counter", () => {
  // A dropped frame would otherwise lengthen the journey, and the arrival would
  // take a different amount of time on a busy machine.
  const effect = app.slice(app.indexOf("The creature arriving, once"));
  assert.match(effect.slice(0, 1500), /arrivalAt\(Date\.now\(\) - arrivalStartedAt\)/u);
});
