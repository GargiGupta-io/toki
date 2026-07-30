// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * Where a picture of someone's screen is looked at.
 *
 * This is the most sensitive thing the service does. A screenshot can hold a
 * bank balance, a medical record, a private message -- anything that was on
 * screen when the user asked for help. Three rules follow, and they are why the
 * file is shaped this way:
 *
 *   1. **Nothing is stored.** The image is a function argument and is gone when
 *      the call returns. No disk, no cache, no queue.
 *   2. **Nothing is logged.** Not the image, not the prompt, not the answer. The
 *      error path reports that a call failed and nothing about what was in it,
 *      which is why it does not pass the provider's own message through.
 *   3. **The smallest image that answers the question.** The client crops to the
 *      active window before sending and refuses to run without a crop. The limit
 *      here is the backstop for when that fails.
 *
 * The credential lives here rather than in the desktop app, and that is the
 * whole reason this service exists. Anything shipped inside a distributed app
 * can be read out of it, so a key in the binary is a key every user has -- and
 * the bill would arrive here.
 *
 * No SDK, matching the Stripe client: this is one POST with a JSON body, and a
 * dependency in the request path of a service that spends money per call is
 * worth more scrutiny than it saves.
 */

export type VisionRequest = {
  prompt: string;
  imageBase64: string;
  imageFormat: "png" | "jpeg";
  /**
   * The shape the answer must take, supplied by the client because the client
   * is what has to read it back.
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
 * above it is a full multi-display capture, which is slower, costs more, and is
 * more than the question needs.
 */
export const maxImageBytes = 5 * 1024 * 1024;

export type VisionProvider = (request: VisionRequest) => Promise<VisionResult>;

type ChatCompletion = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export function createOpenAiVisionProvider({
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
}): VisionProvider {
  return async ({ prompt, imageBase64, imageFormat, outputSchema }) => {
    const byteLength = Math.floor((imageBase64.length * 3) / 4);
    if (byteLength > maxImageBytes) {
      throw new Error("The screenshot is larger than this service accepts.");
    }

    // The schema goes into the prompt rather than into a strict response format.
    // Strict mode constrains what a schema may contain, and the client's schema
    // uses a nullable target -- a shape it refuses. Asking for a JSON object and
    // describing the shape works on every model, and the client validates the
    // answer anyway before anything is drawn on screen.
    const instructions = outputSchema
      ? `${prompt}\n\nReturn only a JSON object matching this schema:\n${JSON.stringify(outputSchema)}`
      : prompt;

    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        // Enough for the target object with room to spare. Sized generously
        // rather than tightly: a truncated reply arrives as unparseable JSON
        // and reads as a bug in the parser rather than as a budget that was
        // set too low.
        max_tokens: 2048,
        // Guidance should be repeatable. The same screen and the same question
        // ought to point at the same control.
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instructions },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/${imageFormat};base64,${imageBase64}`,
                  // Small controls are the whole point; the cheaper setting
                  // downsamples enough to lose them.
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });

    const body = (await response.json()) as ChatCompletion;

    if (!response.ok) {
      // The provider's message can quote the request, and the request is a
      // picture of someone's screen. Only the status is carried out of here.
      throw new Error(`The guidance provider returned ${response.status}.`);
    }

    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("The model returned no answer.");
    }

    return { rawAnswer: text, providerName: `openai:${model}` };
  };
}
