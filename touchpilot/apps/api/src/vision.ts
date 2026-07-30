// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import Anthropic from "@anthropic-ai/sdk";

/**
 * Where a picture of someone's screen is looked at.
 *
 * This is the most sensitive thing the service does. A screenshot can contain a
 * bank balance, a medical record, a private message — anything that was on
 * screen when the user asked for help. Three rules follow from that, and they
 * are the reason this file is shaped the way it is:
 *
 * 1. **Nothing is stored.** The image exists as a function argument and is gone
 *    when the call returns. No disk, no cache, no queue.
 * 2. **Nothing is logged.** Not the image, not the prompt, not the answer. The
 *    error paths below report that a call failed and nothing about what was in
 *    it, which is why they do not pass the provider's own message through.
 * 3. **The smallest image that answers the question.** The client crops to the
 *    active window before sending, so the rest of the desktop is never
 *    transmitted at all. The limit here is the backstop for when it does not.
 */

export type VisionRequest = {
  prompt: string;
  imageBase64: string;
  imageFormat: "png" | "jpeg";
  /**
   * The shape the answer must take, supplied by the client because the client
   * is what has to read it back. Constraining the format is what turns "parse
   * whatever prose came back" into a guarantee.
   */
  outputSchema?: Record<string, unknown>;
};

export type VisionResult = {
  rawAnswer: string;
  providerName: string;
};

/**
 * The largest image accepted, before base64 expansion.
 *
 * A cropped window on a retina display lands well under this. Anything far
 * above it is a full multi-display capture, which is both slower and more than
 * the question needs.
 */
export const maxImageBytes = 5 * 1024 * 1024;

export type VisionProvider = (request: VisionRequest) => Promise<VisionResult>;

/** Just enough of the client to call and to fake in a test. */
type MessagesClient = {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Message>;
  };
};

export type VisionEffort = "low" | "medium" | "high" | "xhigh" | "max";

export function createAnthropicVisionProvider({
  apiKey,
  model,
  effort,
  client,
}: {
  apiKey: string;
  model: string;
  /**
   * The latency dial. Someone is waiting to be shown where to click, so this
   * is worth measuring on real screenshots rather than guessing; left unset it
   * takes the model's own default.
   */
  effort?: VisionEffort;
  /** Injected by tests so no test can reach the network or spend a credit. */
  client?: MessagesClient;
}): VisionProvider {
  const messages: MessagesClient = client ?? new Anthropic({ apiKey });

  return async ({ prompt, imageBase64, imageFormat, outputSchema }) => {
    const byteLength = Math.floor((imageBase64.length * 3) / 4);
    if (byteLength > maxImageBytes) {
      throw new Error("The screenshot is larger than this service accepts.");
    }

    const response = await messages.messages.create({
      model,
      // Sized for reasoning *plus* the answer, not the answer alone.
      //
      // Thinking is on by default on this model family and is billed and
      // counted inside this ceiling. A limit sized only for the small JSON
      // object -- the obvious-looking choice -- truncates the response
      // mid-object once the model thinks at all, and the failure looks like a
      // parse bug rather than a budget one.
      max_tokens: 8192,
      ...(outputSchema
        ? {
            output_config: {
              format: { type: "json_schema" as const, schema: outputSchema },
              ...(effort ? { effort } : {}),
            },
          }
        : effort
          ? { output_config: { effort } }
          : {}),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageFormat === "png" ? "image/png" : "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      throw new Error("The model returned no answer.");
    }

    return { rawAnswer: text, providerName: `anthropic:${model}` };
  };
}
