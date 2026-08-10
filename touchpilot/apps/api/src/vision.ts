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

/**
 * Strip a JSON Schema down to what Gemini accepts.
 *
 * It takes an OpenAPI subset, not full JSON Schema: `$schema` and
 * `additionalProperties` are refused outright rather than ignored, and there is
 * no union type -- "an object or null" is a flag on the object.
 *
 * The `anyOf` branch is the one that matters. The client writes its target as
 * "an object or null", and a converter without a branch for that returns an
 * empty schema for exactly the field that carries the coordinates, while
 * enforcing every other field perfectly. The answers then arrive well formed
 * apart from the part anybody cares about.
 */
export function toGeminiSchema(
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (schema == null || typeof schema !== "object") {
    return undefined;
  }

  const branches = Array.isArray(schema.anyOf)
    ? (schema.anyOf as Record<string, unknown>[])
    : Array.isArray(schema.oneOf)
      ? (schema.oneOf as Record<string, unknown>[])
      : null;

  if (branches) {
    const real = branches.filter((branch) => branch?.type !== "null");

    // More than one real branch cannot be expressed. Dropping the constraint is
    // safer than picking a branch and forbidding a valid answer.
    if (real.length !== 1) {
      return undefined;
    }

    const collapsed = toGeminiSchema(real[0]);

    return collapsed && real.length < branches.length
      ? { ...collapsed, nullable: true }
      : collapsed;
  }

  const out: Record<string, unknown> = {};

  for (const key of ["type", "description", "enum", "nullable", "format"]) {
    if (schema[key] !== undefined) {
      out[key] = schema[key];
    }
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type as string[];
    out.type = types.find((entry) => entry !== "null") ?? "string";
    if (types.includes("null")) {
      out.nullable = true;
    }
  }

  if (schema.properties && typeof schema.properties === "object") {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, Record<string, unknown>>)
        .map(([name, value]) => [name, toGeminiSchema(value)] as const)
        .filter(([, value]) => value !== undefined),
    );
  }

  if (schema.items && typeof schema.items === "object") {
    const items = toGeminiSchema(schema.items as Record<string, unknown>);
    if (items) {
      out.items = items;
    }
  }

  if (Array.isArray(schema.required)) {
    out.required = schema.required;
  }

  return out;
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

/**
 * The same job, through Google.
 *
 * Chosen for the same reason the service exists at all: the bill arrives here,
 * so the cheapest model that answers correctly is the right one. Gemini's free
 * tier means Toki can be given away while it is being proved, and moving to a
 * paid provider later is a change to one environment variable rather than to
 * any of this.
 *
 * Two differences from the chat-completions shape above are load-bearing. The
 * schema is enforced structurally rather than asked for in prose, which removes
 * the entire class of "right answer, wrong shape" failures. And coordinates
 * come back on a 0-1000 grid whatever the prompt says -- that is Google's
 * documented convention, and descaling it is the client's job because only the
 * client knows the image it sent.
 */
export function createGeminiVisionProvider({
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

    const schema = toGeminiSchema(outputSchema);

    const response = await fetchImpl(`${baseUrl}/${model}:generateContent`, {
      method: "POST",
      headers: {
        // In a header, never the query string. A key in a URL ends up in logs,
        // in proxies, and in anything that records where a request went.
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: imageFormat === "png" ? "image/png" : "image/jpeg",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          // Guidance should be repeatable: the same screen and the same
          // question ought to point at the same control.
          temperature: 0,
          responseMimeType: "application/json",
          // As little deliberation as the model allows. This sits between
          // somebody asking a question and being shown where to click, and the
          // task is recognition rather than reasoning. Nested, because sent
          // flat the API rejects the whole request.
          thinkingConfig: { thinkingLevel: "minimal" },
          ...(schema ? { responseSchema: schema } : {}),
        },
      }),
    });

    if (!response.ok) {
      // The provider's message can quote the request, and the request is a
      // picture of someone's screen. Only the status is carried out of here.
      throw new Error(`The guidance provider returned ${response.status}.`);
    }

    const body = (await response.json()) as GeminiResponse;
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part?.text ?? "")
      .join("")
      .trim();

    if (!text) {
      // A blocked or empty candidate. The reason is the model's own word for
      // it and says nothing about what was on screen.
      const reason =
        body.candidates?.[0]?.finishReason ??
        body.promptFeedback?.blockReason ??
        "no content";
      throw new Error(`The model returned no answer (${reason}).`);
    }

    return { rawAnswer: text, providerName: `gemini:${model}` };
  };
}

/**
 * Which provider to use, decided by the model rather than by a switch.
 *
 * A separate flag can disagree with the model it is pointing at, and a
 * misconfiguration that still starts is worse than one that does not -- the
 * same reasoning that makes live mode derive from whether a credential exists.
 * The model name is what actually determines the request shape, so it decides.
 *
 * Moving from Gemini to OpenAI later is therefore setting a model name.
 */
export function createVisionProvider({
  apiKey,
  model,
  baseUrl,
  fetchImpl,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): VisionProvider {
  return model.startsWith("gemini")
    ? createGeminiVisionProvider({ apiKey, model, baseUrl, fetchImpl })
    : createOpenAiVisionProvider({ apiKey, model, baseUrl, fetchImpl });
}
