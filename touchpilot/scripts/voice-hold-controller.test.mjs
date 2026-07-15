import assert from "node:assert/strict";
import test from "node:test";
import {
  createIdleVoiceHoldState,
  transitionVoiceHold,
} from "../apps/desktop/src/voiceHoldController.ts";

test("Right Option press starts capture and release submits once", () => {
  const pressed = transitionVoiceHold(createIdleVoiceHoldState(), "press");
  assert.equal(pressed.effect, "start_capture");
  assert.equal(pressed.state.phase, "starting");
  assert.equal(pressed.state.held, true);

  const started = transitionVoiceHold(pressed.state, "capture_started");
  assert.equal(started.effect, "none");
  assert.equal(started.state.phase, "capturing");

  const released = transitionVoiceHold(started.state, "release");
  assert.equal(released.effect, "submit_capture");
  assert.equal(released.state.phase, "submitting");

  const duplicateRelease = transitionVoiceHold(released.state, "release");
  assert.equal(duplicateRelease.effect, "none");
});

test("release during microphone startup is remembered", () => {
  const pressed = transitionVoiceHold(createIdleVoiceHoldState(), "press");
  const released = transitionVoiceHold(pressed.state, "release");

  assert.equal(released.effect, "none");
  assert.equal(released.state.phase, "starting");
  assert.equal(released.state.held, false);
  assert.equal(released.state.releasePending, true);

  const captureStarted = transitionVoiceHold(released.state, "capture_started");
  assert.equal(captureStarted.effect, "submit_capture");
  assert.equal(captureStarted.state.phase, "submitting");
});

test("aborted startup and completed submission reset hold state", () => {
  const pressed = transitionVoiceHold(createIdleVoiceHoldState(), "press");
  const aborted = transitionVoiceHold(pressed.state, "capture_aborted");
  assert.deepEqual(aborted.state, createIdleVoiceHoldState());

  const restarted = transitionVoiceHold(aborted.state, "press");
  const capturing = transitionVoiceHold(restarted.state, "capture_started");
  const submitting = transitionVoiceHold(capturing.state, "release");
  const finished = transitionVoiceHold(submitting.state, "submission_finished");
  assert.deepEqual(finished.state, createIdleVoiceHoldState());
});
