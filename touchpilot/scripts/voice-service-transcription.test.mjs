import assert from "node:assert/strict";
import test from "node:test";

import { transcribeNativeVoiceCapture } from "../apps/desktop/src/voiceTranscription.ts";

/**
 * Who gets to turn the audio into words.
 *
 * The order is a policy: an explicit local Whisper or a saved key always wins,
 * the signed-in service is the fresh install's default, and a configured
 * backend that fails is never quietly replaced by the cloud -- that
 * substitution is exactly what choosing on-device rules out.
 */

const capture = {
  sessionId: "voice-test",
  audioBase64: "QUJDREVGRw==",
  byteLength: 2_048,
  durationMs: 900,
  format: "audio/wav",
  sampleRate: 16_000,
  channels: 1,
};

function availability(provider) {
  return async () => ({
    provider,
    localWhisperReady: provider === "local-whisper",
    openaiReady: provider === "openai",
  });
}

test("an explicit local setup is used, and the service never sees the audio", async () => {
  let hostedCalled = false;
  const result = await transcribeNativeVoiceCapture(capture, {
    availabilityImpl: availability("local-whisper"),
    invokeImpl: async () => ({ text: "open settings", provider: "local-whisper" }),
    hosted: {
      send: async () => {
        hostedCalled = true;
        return { kind: "ready", text: "must not be used" };
      },
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.transcript.text, "open settings");
  assert.equal(hostedCalled, false, "audio never leaves a Mac that chose local");
});

test("a fresh install speaks through the service", async () => {
  let nativeCalled = false;
  const sent = {};
  const result = await transcribeNativeVoiceCapture(capture, {
    availabilityImpl: availability(null),
    invokeImpl: async () => {
      nativeCalled = true;
      throw new Error("must not be reached");
    },
    hosted: {
      send: async (body) => {
        Object.assign(sent, body);
        return { kind: "ready", text: "play the next song" };
      },
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.transcript.text, "play the next song");
  assert.equal(sent.audioBase64, capture.audioBase64);
  assert.equal(nativeCalled, false);
});

test("a configured backend that fails is not replaced by the cloud", async () => {
  // "Nothing is configured" and "the configured thing failed" are different
  // conditions. Only the first falls through to the service.
  let hostedCalled = false;
  const result = await transcribeNativeVoiceCapture(capture, {
    availabilityImpl: availability("local-whisper"),
    invokeImpl: async () => {
      throw new Error("whisper-cli exited with a signal");
    },
    hosted: {
      send: async () => {
        hostedCalled = true;
        return { kind: "ready", text: "must not be used" };
      },
    },
  });

  assert.equal(result.status, "not_configured");
  assert.match(result.error, /whisper/u);
  assert.equal(hostedCalled, false);
});

test("service silence becomes the retry path, not a fault", async () => {
  const result = await transcribeNativeVoiceCapture(capture, {
    availabilityImpl: availability(null),
    hosted: { send: async () => ({ kind: "ready", text: "   " }) },
  });

  assert.equal(result.status, "not_configured");
  // The exact wording matters: this is what the retry detector reads.
  assert.match(result.error, /no speech/iu);
});

test("signed out with a service says sign in, not compile Whisper", async () => {
  const viaReply = await transcribeNativeVoiceCapture(capture, {
    availabilityImpl: availability(null),
    hosted: { send: async () => ({ kind: "signed_out", error: "Sign in to use voice." }) },
  });

  assert.equal(viaReply.status, "not_configured");
  assert.match(viaReply.error, /sign in/iu);

  // And when there is no session at all, the caller's wording is used.
  const viaHint = await transcribeNativeVoiceCapture(capture, {
    availabilityImpl: availability(null),
    whenSignedOut: "Sign in from the gear panel to use voice.",
    invokeImpl: async () => {
      throw new Error("must not be reached");
    },
  });

  assert.equal(viaHint.status, "not_configured");
  assert.match(viaHint.error, /gear panel/u);
});

test("no service and nothing local still explains itself the old way", async () => {
  const result = await transcribeNativeVoiceCapture(capture, {
    availabilityImpl: availability(null),
    invokeImpl: async () => {
      throw new Error(
        "Voice has no way to transcribe yet. Open the gear on the Toki panel, choose Speech, and either set the local Whisper paths or save an OpenAI API key.",
      );
    },
  });

  assert.equal(result.status, "not_configured");
  assert.match(result.error, /gear on the Toki panel/u);
});

test("useless audio is refused before anything is asked anything", async () => {
  const result = await transcribeNativeVoiceCapture(
    { ...capture, byteLength: 20, audioBase64: "QQ==" },
    {
      availabilityImpl: async () => {
        throw new Error("must not be reached");
      },
    },
  );

  assert.equal(result.status, "not_configured");
  assert.match(result.error, /no usable audio/u);
});
