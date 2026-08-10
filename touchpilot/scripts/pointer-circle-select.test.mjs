import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { circleSelectPolicy } from "../apps/desktop/src/gestureCircleSelect.ts";
import {
  advancePointerCircle,
  selectCircleInput,
  armPointerCircle,
  disarmPointerCircle,
  idlePointerCircle,
  pointerCircleSelectPolicy,
  shouldDrawPointerStroke,
} from "../apps/desktop/src/pointerCircleSelect.ts";

/** Drive a loop of `degrees` around a centre, one step every 16ms. */
function circleFor(state, { degrees, radius = 60, startMs = 0, steps = 90 }) {
  let current = state;
  let now = startMs;

  for (let i = 0; i <= steps; i += 1) {
    const angle = ((degrees / steps) * i * Math.PI) / 180;
    now += 16;
    current = advancePointerCircle(
      current,
      { x: 400 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius },
      now,
    );
  }

  return current;
}

test("nothing happens while the talk key is up", () => {
  // Holding the key to talk and never touching the trackpad is the ordinary
  // case. It must cost nothing and must never select anything.
  const state = advancePointerCircle(idlePointerCircle, { x: 10, y: 10 }, 100);

  assert.equal(state, idlePointerCircle, "the same object, not a copy");
  assert.equal(state.region, null);
});

test("one deliberate loop selects, where the hand needs two", () => {
  // A trackpad is precise, already behind a held key, and has none of the
  // accidental-motion problem a hand circling while thinking has.
  const done = circleFor(armPointerCircle(0), { degrees: 420 });

  assert.equal(done.stroke.phase, "complete");
  assert.ok(done.region, "a completed loop yields a region");
  assert.ok(done.region.width > 0 && done.region.height > 0);
});

test("half a loop selects nothing", () => {
  const half = circleFor(armPointerCircle(0), { degrees: 180 });

  assert.notEqual(half.stroke.phase, "complete");
  assert.equal(half.region, null);
});

test("the region lands on what was circled", () => {
  const done = circleFor(armPointerCircle(0), { degrees: 420, radius: 60 });
  const centreX = done.region.x + done.region.width / 2;
  const centreY = done.region.y + done.region.height / 2;

  assert.ok(Math.abs(centreX - 400) < 12, `centre x drifted to ${centreX}`);
  assert.ok(Math.abs(centreY - 300) < 12, `centre y drifted to ${centreY}`);
});

test("letting go mid-loop selects nothing", () => {
  // Releasing is how somebody says "that is what I meant" about the words.
  // Reading it as agreement about a half-drawn shape would select whatever the
  // cursor happened to have gone round.
  const partial = circleFor(armPointerCircle(0), { degrees: 300 });
  assert.equal(partial.region, null);

  const released = disarmPointerCircle();
  assert.equal(released.armed, false);
  assert.equal(released.stroke, null);
  assert.equal(released.region, null);
});

test("a trackpad is judged by different numbers than a hand", () => {
  // Same detector, same geometry. Only the thresholds differ, because a finger
  // on glass and a hand in the air are not the same instrument.
  assert.ok(
    pointerCircleSelectPolicy.requiredDegrees < circleSelectPolicy.requiredDegrees,
  );
  assert.equal(
    pointerCircleSelectPolicy.settleMs,
    0,
    "pressing a key moves nothing, so there is no arming arc to discard",
  );
  assert.ok(
    pointerCircleSelectPolicy.minimumSegmentPx < circleSelectPolicy.minimumSegmentPx,
    "camera tremor thresholds are meaningless on a trackpad",
  );
});

test("a small loop around an icon still registers", () => {
  // The hand's 24px arming radius and 7px segment floor would swallow most of
  // a loop drawn around a toolbar button.
  const done = circleFor(armPointerCircle(0), { degrees: 420, radius: 22 });

  assert.equal(done.stroke.phase, "complete");
  assert.ok(done.region.width < 80, "the region stays as tight as the loop");
});

test("the same loop drawn by a hand would not complete this early", () => {
  // Proof the two policies are actually doing different work, rather than the
  // pointer one being a copy that happens to pass.
  const handRules = circleFor(armPointerCircle(0), { degrees: 420 });
  const asHand = advancePointerCircle(
    armPointerCircle(0),
    { x: 400, y: 300 },
    16,
    circleSelectPolicy,
  );

  assert.equal(handRules.stroke.phase, "complete");
  assert.notEqual(asHand.stroke.phase, "complete");
});

test("the trail is asked to draw only a live stroke", () => {
  assert.equal(shouldDrawPointerStroke(idlePointerCircle), false);
  assert.equal(shouldDrawPointerStroke(armPointerCircle(0)), false, "no points yet");

  const drawing = circleFor(armPointerCircle(0), { degrees: 120 });
  assert.equal(shouldDrawPointerStroke(drawing), true);
});

test("a region of no size is refused rather than pointed at", () => {
  // A zero-sized target would be sent on and drawn as a box around nothing.
  let state = armPointerCircle(0);
  let now = 0;
  for (let i = 0; i < 200; i += 1) {
    now += 16;
    state = advancePointerCircle(state, { x: 400, y: 300 }, now);
  }

  assert.equal(state.region, null);
});

test("the chord that started it decides which instrument draws", () => {
  // This used to be decided by whether a camera was running, and that rule was
  // wrong in the one way that mattered: on any machine whose camera worked, the
  // trackpad loop never armed. Holding the keys and drawing a careful circle
  // produced nothing at all, which read as the feature being broken rather than
  // as the wrong instrument having been picked.
  assert.equal(selectCircleInput("keyboard"), "pointer");
  assert.equal(selectCircleInput("gesture"), "hand");
});

test("only one instrument is ever chosen", () => {
  // Both at once would put two loops on screen and deliver two regions for one
  // intent, with no sensible way to pick between them afterwards.
  for (const startedBy of ["keyboard", "gesture"]) {
    const source = selectCircleInput(startedBy);
    assert.ok(source === "hand" || source === "pointer");
  }
});

const app = readFileSync(
  new URL("../apps/desktop/src/App.tsx", import.meta.url),
  "utf8",
);

test("circling has its own chord, and does not ride on the talk key", () => {
  // Arming the loop from the talk key made one movement mean two things at
  // once, and which one it meant depended on whether a camera was running. On
  // a machine whose camera worked, the trackpad loop never armed at all.
  const start = app.slice(app.indexOf('event.payload.type === "start-circle-select"'));
  assert.match(start.slice(0, 600), /armPointerCircle\(Date\.now\(\)\)/u);

  const voiceAt = app.indexOf('event.payload.type === "start-voice-listening"');
  const voice = app.slice(voiceAt, app.indexOf("return;", voiceAt));
  assert.doesNotMatch(
    voice,
    // The word boundary matters: `disarmPointerCircle` contains this name.
    /\barmPointerCircle/u,
    "speaking must not arm a circle",
  );
});

test("letting go of the chord drops a half-drawn loop", () => {
  const end = app.slice(app.indexOf('event.payload.type === "end-circle-select"'));
  assert.match(end.slice(0, 400), /disarmPointerCircle\(\)/u);
});

test("one full circle completes, and a little less does not", () => {
  // The threshold was two laps, compensating for a gesture that could start by
  // accident. It cannot now -- it is behind two held keys -- and asking anybody
  // to go round twice for no reason is asking them to do a thing twice.
  assert.ok(
    pointerCircleSelectPolicy.requiredDegrees <= 360,
    `one lap must be enough, got ${pointerCircleSelectPolicy.requiredDegrees}`,
  );

  // Not a literal 360. Turning is measured between headings, so the first
  // segment contributes nothing and a loop drawn exactly once round measures a
  // few degrees short. Demanding 360 refuses at the moment somebody has done
  // what they were told.
  assert.ok(pointerCircleSelectPolicy.requiredDegrees >= 320);

  const oneLap = circleFor(armPointerCircle(0), { degrees: 360 });
  assert.equal(oneLap.stroke.phase, "complete", "a full circle selects");

  const mostOfALap = circleFor(armPointerCircle(0), { degrees: 270 });
  assert.notEqual(mostOfALap.stroke.phase, "complete", "three quarters does not");
});



test("the trackpad region is not dressed up as a hand", () => {
  // The hand's request carries a hand track id and a wrist roll. Inventing
  // those would put a hand that never existed into the diagnostics, which are
  // the record used to work out why a target was refused.
  const effect = app.slice(app.indexOf("A finished trackpad loop becomes"));
  const body = effect.slice(0, effect.indexOf("}, [pointerCircle.region]);"));

  assert.doesNotMatch(body, /handTrackId/u);
  assert.doesNotMatch(body, /roll:/u);
  assert.match(body, /setGesturePointerRegion/u);
});

test("one completed loop is acted on once", () => {
  // The effect re-runs on every render while the region is set; without a
  // guard the same circle would be locked repeatedly.
  assert.match(app, /handledPointerRegionRef\.current === region/u);
});

test("a slip too small to be meant is refused, as it is for the hand", () => {
  assert.match(
    app.slice(app.indexOf("A finished trackpad loop becomes")),
    /MINIMUM_CIRCLED_REGION_PX/u,
  );
});

test("closing the circle starts Toki listening", () => {
  // Circling something is half a sentence. "What is this?" means nothing
  // without the region, and the region means nothing without the question --
  // and the keys are still held when the loop closes, so the whole thing is
  // one gesture: hold, circle, ask, let go.
  //
  // Without this, somebody completes a careful circle and then has to reach
  // for a second shortcut to say what they wanted about it.
  const lock = app.slice(app.indexOf("A finished trackpad loop becomes"));
  const body = lock.slice(0, lock.indexOf("}, [pointerCircle.region]);"));

  assert.match(body, /startVoiceListening\("gesture"\)/u);
  assert.match(body, /circleVoiceRef\.current = started/u);
});

test("letting go after circling submits, rather than discarding the words", () => {
  // Releasing the chord ends the circle. If listening began because of that
  // circle then the release is also the end of the sentence -- otherwise the
  // recording is taken and thrown away.
  const end = app.slice(app.indexOf('event.payload.type === "end-circle-select"'));

  assert.match(end.slice(0, 700), /circleVoiceRef\.current/u);
  assert.match(end.slice(0, 700), /submitVoiceListening\(\)/u);
});

test("a release with no circle-started recording submits nothing", () => {
  // Speaking is on its own chord. Ending a circle that never started listening
  // must not submit whatever else happened to be recorded.
  const end = app.slice(app.indexOf('event.payload.type === "end-circle-select"'));

  assert.match(
    end.slice(0, 700),
    /if \(circleVoiceRef\.current\)/u,
    "the submit is conditional on this recording being the circle's",
  );
});
