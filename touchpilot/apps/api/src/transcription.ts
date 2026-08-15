// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * Where somebody's voice is turned into words.
 *
 * The same rules as the screenshot path, for the same reason: a few seconds of
 * audio from somebody's desk is as private as a picture of their screen.
 * Nothing is stored, nothing is logged -- not the audio, not the transcript --
 * and the error path carries out only that a call failed, never what was in it.
 *
 * This endpoint is why a fresh install can speak at all. The desktop app
 * prefers a local Whisper when somebody has set one up, because on-device
 * costs nothing and sends nothing anywhere -- but nobody who just downloaded
 * Toki has compiled Whisper, and asking them to paste their own API key is a
 * bill and a chore the product promised they would never have. The service
 * already holds a key for looking at screens; hearing is the same key.
 */

export type TranscriptionRequest = {
  audioBase64: string;
  /** "audio/wav" and friends; a bare "wav" is normalized. */
  format: string;
};

export type TranscriptionProvider = (
  request: TranscriptionRequest,
) => Promise<string>;

/**
 * The largest clip accepted, before base64 expansion.
 *
 * Push-to-talk audio is 16-bit mono: a full minute is about two megabytes.
 * Anything near this limit is not somebody asking where a button is.
 */
export const maxAudioBytes = 8 * 1024 * 1024;

/** Formats Gemini documents for inline audio, by their mime type. */
const audioMimeTypes = new Set([
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/aiff",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
]);

export function normalizeAudioMimeType(format: string | undefined): string {
  const trimmed = (format ?? "").trim().toLowerCase();

  if (audioMimeTypes.has(trimmed)) {
    return trimmed;
  }

  const prefixed = `audio/${trimmed.replace(/^audio\//u, "")}`;

  return audioMimeTypes.has(prefixed) ? prefixed : "audio/wav";
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

/**
 * Hearing, through the same key that sees.
 *
 * Gemini takes audio the way it takes an image -- one part among the parts --
 * so this is the vision request with a different attachment and a prompt that
 * asks for exactly one thing. Temperature zero for the same reason as
 * guidance: the same words spoken twice should come back as the same words.
 *
 * An empty transcript is returned as an empty string rather than an error.
 * Silence is an answer -- the desktop already knows how to say "I didn't
 * catch that", and it should not learn to say it from a 502.
 */
export function createGeminiTranscriptionProvider({
  apiKey,
  model,
  baseUrl,
  fetchImpl = fetch,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Injected by tests, so no test can reach the network or spend a credit. */
  fetchImpl?: typeof fetch;
}): TranscriptionProvider {
  return async ({ audioBase64, format }) => {
    const byteLength = Math.floor((audioBase64.length * 3) / 4);
    if (byteLength > maxAudioBytes) {
      throw new Error("The audio clip is larger than this service accepts.");
    }

    const response = await fetchImpl(`${baseUrl}/${model}:generateContent`, {
      method: "POST",
      headers: {
        // In a header, never the query string, for the reason the vision
        // request does the same: a key in a URL ends up in logs.
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  "Transcribe the speech in this audio exactly as spoken.",
                  "Reply with only the transcript text: no quotes, no labels, no commentary.",
                  "If there is no intelligible speech, reply with nothing at all.",
                ].join(" "),
              },
              {
                inline_data: {
                  mime_type: normalizeAudioMimeType(format),
                  data: audioBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          // Writing down what was said is recognition, not reasoning, and
          // somebody is holding a key down waiting for it.
          thinkingConfig: { thinkingLevel: "minimal" },
        },
      }),
    });

    if (!response.ok) {
      // The provider's message can quote the request. Only the status leaves.
      throw new Error(`The transcription provider returned ${response.status}.`);
    }

    const body = (await response.json()) as GeminiResponse;
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part?.text ?? "")
      .join("")
      .trim();

    return text;
  };
}

/**
 * The provider for whatever model is configured.
 *
 * The model name decides the request shape, exactly as it does for vision.
 * A name this code has no shape for returns undefined rather than a provider
 * that would fail on every call: the handler then answers with its honest
 * fixture notice instead of a 502 per press of the button.
 */
export function createTranscriptionProvider(options: {
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): TranscriptionProvider | undefined {
  return options.model.startsWith("gemini")
    ? createGeminiTranscriptionProvider(options)
    : undefined;
}
