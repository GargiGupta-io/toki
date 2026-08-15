import assert from "node:assert/strict";
import test from "node:test";

import {
  createGeminiTranscriptionProvider,
  createTranscriptionProvider,
  maxAudioBytes,
  normalizeAudioMimeType,
} from "../apps/api/src/transcription.ts";

/**
 * The endpoint that lets a fresh install speak.
 *
 * A downloader has no compiled Whisper and no API key of their own, and the
 * product's promise is that they never need either. The service already holds
 * a key for looking at screens; these tests pin that hearing rides the same
 * key, and that the privacy rules of the screenshot path -- nothing stored,
 * nothing quoted -- hold for audio too.
 */

function fakeFetch(reply, capture = {}) {
  return async (url, init) => {
    capture.url = String(url);
    capture.init = init;
    capture.body = JSON.parse(init.body);
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      json: async () => reply.json ?? {},
    };
  };
}

const options = {
  apiKey: "test-key",
  model: "gemini-3.5-flash-lite",
  baseUrl: "https://example.test/models",
};

test("audio goes to Gemini the way a screenshot does", async () => {
  const capture = {};
  const provider = createGeminiTranscriptionProvider({
    ...options,
    fetchImpl: fakeFetch(
      { json: { candidates: [{ content: { parts: [{ text: "open settings" }] } }] } },
      capture,
    ),
  });

  const text = await provider({ audioBase64: "QUJD", format: "audio/wav" });

  assert.equal(text, "open settings");
  assert.equal(capture.url, "https://example.test/models/gemini-3.5-flash-lite:generateContent");
  // The key rides in a header, never the query string, so it cannot land in a
  // server log that records where requests went.
  assert.equal(capture.init.headers["x-goog-api-key"], "test-key");
  assert.ok(!capture.url.includes("test-key"));

  const parts = capture.body.contents[0].parts;
  assert.equal(parts[1].inline_data.mime_type, "audio/wav");
  assert.equal(parts[1].inline_data.data, "QUJD");
  // The same words twice must come back as the same words.
  assert.equal(capture.body.generationConfig.temperature, 0);
});

test("silence is an answer, not an error", async () => {
  // The desktop already knows how to say "I didn't catch that". It should
  // hear that from an empty transcript, never from a 502.
  const provider = createGeminiTranscriptionProvider({
    ...options,
    fetchImpl: fakeFetch({
      json: { candidates: [{ content: { parts: [{ text: "  " }] } }] },
    }),
  });

  assert.equal(await provider({ audioBase64: "QUJD", format: "audio/wav" }), "");
});

test("a provider failure says the status and nothing else", async () => {
  // The provider's own message can quote the request, and the request is
  // somebody's voice.
  const provider = createGeminiTranscriptionProvider({
    ...options,
    fetchImpl: fakeFetch({ ok: false, status: 429 }),
  });

  await assert.rejects(
    provider({ audioBase64: "QUJD", format: "audio/wav" }),
    (error) => {
      assert.match(error.message, /429/u);
      assert.ok(!error.message.includes("QUJD"), "the audio never leaves");
      return true;
    },
  );
});

test("an oversized clip is refused before any network call", async () => {
  let called = false;
  const provider = createGeminiTranscriptionProvider({
    ...options,
    fetchImpl: async () => {
      called = true;
      throw new Error("must not be reached");
    },
  });

  const oversized = "A".repeat(Math.ceil((maxAudioBytes + 1024) * (4 / 3)));

  await assert.rejects(provider({ audioBase64: oversized, format: "audio/wav" }), /larger/u);
  assert.equal(called, false);
});

test("bare format names become the mime types Gemini documents", () => {
  assert.equal(normalizeAudioMimeType("wav"), "audio/wav");
  assert.equal(normalizeAudioMimeType("audio/mpeg"), "audio/mpeg");
  // Anything unrecognised falls back to what the capture pipeline records.
  assert.equal(normalizeAudioMimeType("something-strange"), "audio/wav");
  assert.equal(normalizeAudioMimeType(undefined), "audio/wav");
});

test("a model with no request shape yields no provider, not a broken one", () => {
  // The handler then answers with its honest fixture notice instead of a 502
  // per press of the button.
  assert.equal(
    createTranscriptionProvider({ ...options, model: "gpt-4o-transcribe" }),
    undefined,
  );
  assert.notEqual(createTranscriptionProvider(options), undefined);
});
