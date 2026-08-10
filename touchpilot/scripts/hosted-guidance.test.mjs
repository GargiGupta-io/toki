import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleApiRequest } from "../apps/api/src/handler.ts";
import { loadServiceConfig } from "../apps/api/src/config.ts";
import { createInMemoryRateLimiter } from "../apps/api/src/rateLimit.ts";
import { freeSubscription } from "../apps/api/src/subscriptions.ts";
import {
  createOpenAiVisionProvider,
  maxImageBytes,
} from "../apps/api/src/vision.ts";
import { readHostedVisionResponse } from "../apps/desktop/src/hostedVisionProvider.ts";
import { createTokiApiClient } from "../apps/desktop/src/tokiApiClient.ts";

const jwtSecret = "test-jwt-secret-at-least-32-characters-long";

function accessToken(sub = "user-1") {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({ sub, exp: Math.floor(Date.now() / 1000) + 3600 });
  const signature = createHmac("sha256", jwtSecret)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${signature}`;
}

/** A chat completion, as the provider would return it. */
function reply(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

const paidSubscription = {
  tier: "pro",
  status: "active",
  currentPeriodEnd: null,
  stripeCustomerId: "cus_1",
};

function visionRequest(body) {
  return {
    method: "POST",
    path: "/vision",
    headers: { authorization: `Bearer ${accessToken()}` },
    body: JSON.stringify(body),
  };
}

function deps(overrides = {}) {
  const config = loadServiceConfig({ TOKI_PROVIDER_API_KEY: "sk-test" });
  return {
    config,
    jwtSecret,
    rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    subscriptions: { async forUser() { return paidSubscription; } },
    vision: async () => ({ rawAnswer: '{"target":null}', providerName: "test" }),
    ...overrides,
  };
}

test("a free account cannot spend a model call", async () => {
  // Every call costs real money, so this gate is what the paid tier buys.
  let called = false;
  const response = await handleApiRequest(
    visionRequest({ prompt: "find save", imageBase64: "aaaa", imageFormat: "png" }),
    deps({
      subscriptions: { async forUser() { return freeSubscription; } },
      vision: async () => {
        called = true;
        return { rawAnswer: "{}", providerName: "test" };
      },
    }),
  );

  assert.equal(response.status, 402);
  assert.equal(JSON.parse(response.body).upgrade, true);
  assert.equal(called, false, "no model call for an unpaid account");
});

test("a paid account reaches the model", async () => {
  const response = await handleApiRequest(
    visionRequest({ prompt: "find save", imageBase64: "aaaa", imageFormat: "png" }),
    deps(),
  );

  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).rawAnswer, '{"target":null}');
});

test("vision requires a verified token, like everything else", async () => {
  const response = await handleApiRequest(
    { method: "POST", path: "/vision", headers: {}, body: "{}" },
    deps(),
  );
  assert.equal(response.status, 401);
});

test("a request without a screenshot is refused before the gate", async () => {
  const response = await handleApiRequest(
    visionRequest({ prompt: "find save" }),
    deps(),
  );
  assert.equal(response.status, 400);
});

test("the provider's own error text is never relayed to the client", async () => {
  // A provider message can quote the request, and the request is a picture of
  // someone's screen.
  const response = await handleApiRequest(
    visionRequest({ prompt: "p", imageBase64: "aaaa", imageFormat: "png" }),
    deps({
      vision: async () => {
        throw new Error("upstream said: user's bank balance is 4,281.55");
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, /bank balance/);
  assert.equal(JSON.parse(response.body).mode, "unavailable");
});

test("an oversized screenshot is refused without being sent", async () => {
  let sent = false;
  const provider = createOpenAiVisionProvider({
    apiKey: "sk-test",
    model: "gpt-4o",
    baseUrl: "https://api.openai.test/v1",
    fetchImpl: async () => {
      sent = true;
      return reply("{}");
    },
  });

  const tooBig = "a".repeat(Math.ceil((maxImageBytes + 1024) * 4) / 3);
  await assert.rejects(
    provider({ prompt: "p", imageBase64: tooBig, imageFormat: "png" }),
    /larger than/,
  );
  assert.equal(sent, false);
});

test("the token budget leaves room for reasoning as well as the answer", async () => {
  // Thinking is on by default on this model family and is counted inside
  // max_tokens. A budget sized for the small JSON object alone truncates the
  // response the moment the model thinks, and it reads as a parse bug.
  let seen = null;
  const provider = createOpenAiVisionProvider({
    apiKey: "sk-test",
    model: "gpt-4o",
    baseUrl: "https://api.openai.test/v1",
    fetchImpl: async (_url, init) => {
      seen = JSON.parse(init.body);
      return reply("{}");
    },
  });

  await provider({ prompt: "p", imageBase64: "aaaa", imageFormat: "png" });
  assert.ok(
    seen.max_tokens >= 1024,
    `max_tokens is ${seen.max_tokens}, too small for the target object`,
  );
  assert.equal(seen.temperature, 0, "guidance should be repeatable");
});

test("the answer is constrained to the shape the client can read", async () => {
  let seen = null;
  const provider = createOpenAiVisionProvider({
    apiKey: "sk-test",
    model: "gpt-4o",
    baseUrl: "https://api.openai.test/v1",
    fetchImpl: async (_url, init) => {
      seen = JSON.parse(init.body);
      return reply("{}");
    },
  });

  await provider({
    prompt: "locate the Save button",
    imageBase64: "aaaa",
    imageFormat: "png",
    outputSchema: { type: "object", properties: { target: { type: "null" } } },
  });

  assert.equal(seen.response_format.type, "json_object");
  // The schema is carried in the prompt rather than as a strict response
  // format, because strict mode refuses the client's nullable target.
  const text = seen.messages[0].content.find((part) => part.type === "text").text;
  assert.match(text, /locate the Save button/);
  assert.match(text, /"target"/, "the schema has to reach the model somehow");
});

test("the desktop sends the same schema it parses against", async () => {
  const { VISION_TARGET_OUTPUT_SCHEMA } = await import(
    "../apps/desktop/src/visionGuidanceContract.ts"
  );
  const { requestHostedVisionGuidance } = await import(
    "../apps/desktop/src/hostedVisionProvider.ts"
  );

  let sent = null;
  await requestHostedVisionGuidance(
    {
      goal: "open settings",
      screen: {
        display: { width: 100, height: 100 },
        screenshotPayload: {
          encoding: "base64",
          format: "png",
          byteLength: 4,
          imageWidth: 100,
          imageHeight: 100,
          imageBase64: "aaaa",
        },
      },
    },
    {
      send: async (body) => {
        sent = body;
        return { kind: "ok", rawAnswer: '{"target":null,"confidence":0}' };
      },
    },
  );

  assert.deepEqual(
    sent.outputSchema,
    VISION_TARGET_OUTPUT_SCHEMA,
    "a schema that differs from the parser is worse than none",
  );
});

test("the model is asked with the image and the client's own prompt", async () => {
  let seen = null;
  const provider = createOpenAiVisionProvider({
    apiKey: "sk-test",
    model: "gpt-4o",
    baseUrl: "https://api.openai.test/v1",
    fetchImpl: async (_url, init) => {
      seen = JSON.parse(init.body);
      return reply('{"target":null}');
    },
  });

  const result = await provider({
    prompt: "locate the Save button",
    imageBase64: "aGVsbG8=",
    imageFormat: "jpeg",
  });

  assert.equal(seen.model, "gpt-4o");
  const [text, image] = seen.messages[0].content;
  assert.equal(image.type, "image_url");
  assert.equal(image.image_url.url, "data:image/jpeg;base64,aGVsbG8=");
  assert.equal(image.image_url.detail, "high", "small controls need the detail");
  assert.equal(text.text, "locate the Save button");
  assert.equal(result.rawAnswer, '{"target":null}');
  assert.equal(result.providerName, "openai:gpt-4o");
});

// --- What the desktop makes of each reply -----------------------------------

test("each failure gets the offer that matches it", () => {
  // Collapsing these into one "it didn't work" is what makes a locked feature
  // look like a broken one.
  assert.equal(readHostedVisionResponse(401, {}).kind, "signed_out");
  assert.equal(readHostedVisionResponse(402, {}).kind, "upgrade_required");
  assert.equal(
    readHostedVisionResponse(200, { upgrade: true }).kind,
    "upgrade_required",
  );
  assert.equal(readHostedVisionResponse(429, {}).kind, "error");
  assert.equal(readHostedVisionResponse(500, {}).kind, "error");
  assert.equal(
    readHostedVisionResponse(200, { rawAnswer: '{"target":null}' }).kind,
    "ok",
  );
  assert.equal(
    readHostedVisionResponse(200, { mode: "unavailable", error: "no key" }).kind,
    "error",
    "a 200 carrying an unavailable response is still a failure",
  );
});

test("no request is sent while signed out", async () => {
  // Sending one anonymously would put a screenshot on the wire for a call that
  // is already known to fail.
  let sent = false;
  const client = createTokiApiClient({
    endpoint: "https://api.toki.test",
    session: { async accessToken() { return null; } },
    send: async () => {
      sent = true;
      return { status: 200, body: {} };
    },
  });

  const reply = await client.vision({
    prompt: "p",
    imageBase64: "aaaa",
    imageFormat: "png",
  });

  assert.equal(reply.kind, "signed_out");
  assert.equal(sent, false, "no screenshot leaves the machine");
});

test("the token is attached, and the body carries no identity of its own", async () => {
  let seen = null;
  const client = createTokiApiClient({
    endpoint: "https://api.toki.test",
    session: { async accessToken() { return "token-abc"; } },
    send: async (path, token, body) => {
      seen = { path, token, body };
      return { status: 200, body: { rawAnswer: "{}" } };
    },
  });

  await client.vision({ prompt: "p", imageBase64: "aaaa", imageFormat: "png" });

  assert.equal(seen.path, "/vision");
  assert.equal(seen.token, "token-abc");
  assert.equal(seen.body.userId, undefined, "the server decides who this is");
});

test("a build with no service configured says so instead of failing oddly", async () => {
  const client = createTokiApiClient({ endpoint: undefined, session: null });
  assert.equal(client.configured, false);
  assert.equal(
    (await client.vision({ prompt: "p", imageBase64: "a", imageFormat: "png" })).kind,
    "error",
  );
  assert.ok("error" in (await client.startCheckout()));
});

test("checkout returns a URL to open in the browser", async () => {
  const client = createTokiApiClient({
    endpoint: "https://api.toki.test",
    session: { async accessToken() { return "token"; } },
    send: async () => ({ status: 200, body: { url: "https://checkout.test/1" } }),
  });

  assert.deepEqual(await client.startCheckout(), { url: "https://checkout.test/1" });
});

test("a host that is still waking is retried once, and nothing else is", async () => {
  // The service sleeps when idle and its host answers 502 for the first
  // moments of a cold start. Treating that as a real failure reported the plan
  // as uncheckable whenever the app was opened after a quiet spell.
  const statuses = [];
  const client = createTokiApiClient({
    endpoint: "https://api.toki.test",
    session: { async accessToken() { return "token"; } },
    send: async () => {
      const status = statuses.length === 0 ? 502 : 200;
      statuses.push(status);
      return { status, body: { tier: "pro", entitled: true } };
    },
  });

  const account = await client.account();
  assert.deepEqual(statuses, [502, 200], "a waking host gets one more chance");
  assert.equal(account?.entitled, true);

  // A refusal is an answer. Repeating a request that spends money is not a fix.
  let calls = 0;
  const refused = createTokiApiClient({
    endpoint: "https://api.toki.test",
    session: { async accessToken() { return "token"; } },
    send: async () => {
      calls += 1;
      return { status: 402, body: { error: "Live guidance is part of Toki Pro." } };
    },
  });

  const reply = await refused.vision({
    prompt: "p",
    imageBase64: "aaaa",
    imageFormat: "png",
  });
  assert.equal(calls, 1, "a 402 must not be retried");
  assert.equal(reply.kind, "upgrade_required");
});

/*
 * Whose key pays for a screenshot.
 *
 * Nobody installing Toki should be asked for an API key. The credential lives
 * in the service, the service pays, and the free allowance and subscription
 * gate are what bound the bill -- which is why this service exists at all.
 *
 * The desktop briefly grew a "Gemini API key" field in its settings. That was a
 * development convenience that quietly became the user-facing answer, and it is
 * the wrong shape for the product: it asks every user to go and get a key
 * before Toki can see anything.
 */

test("the settings window never asks anybody for a model key", async () => {
  const { readFileSync } = await import("node:fs");
  const settings = readFileSync(
    new URL("../apps/desktop/src/TokiSettingsWindow.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(settings, /Gemini API key/u);
  assert.doesNotMatch(settings, /Seeing your screen/u);

  // The OpenAI key stays: that one is for local transcription, which runs on
  // the user's own machine and is theirs to pay for or not.
  assert.match(settings, /OpenAI API key/u);
});

test("the provider follows the model name, not a separate switch", async () => {
  // A flag can disagree with the model it points at, and a misconfiguration
  // that still starts is worse than one that does not -- the same reasoning
  // that makes live mode derive from whether a credential exists.
  const { createVisionProvider } = await import("../apps/api/src/vision.ts");
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "{}" }] } }],
        choices: [{ message: { content: "{}" } }],
      }),
    };
  };

  const gemini = createVisionProvider({
    apiKey: "k",
    model: "gemini-3.5-flash-lite",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    fetchImpl,
  });
  await gemini({ prompt: "find it", imageBase64: "aaaa", imageFormat: "png" });
  assert.match(seen[0], /generateContent$/u);

  const openai = createVisionProvider({
    apiKey: "k",
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    fetchImpl,
  });
  await openai({ prompt: "find it", imageBase64: "aaaa", imageFormat: "png" });
  assert.match(seen[1], /chat\/completions$/u);
});

test("the service defaults to the provider that is free today", async () => {
  // Gemini while Toki is being proved and given away; OpenAI when there are
  // credits. That move is a model name and a base URL, and nothing else.
  const { loadServiceConfig } = await import("../apps/api/src/config.ts");
  const config = loadServiceConfig({ TOKI_PROVIDER_API_KEY: "k" });

  assert.match(config.provider.guidanceModel, /^gemini/u);
  assert.match(config.provider.baseUrl, /generativelanguage/u);
  assert.equal(config.mode, "live");

  // And an operator can move it without touching code.
  const moved = loadServiceConfig({
    TOKI_PROVIDER_API_KEY: "k",
    TOKI_GUIDANCE_MODEL: "gpt-4o",
    TOKI_PROVIDER_BASE_URL: "https://api.openai.com/v1",
  });
  assert.equal(moved.provider.guidanceModel, "gpt-4o");
});

test("the key never travels to the desktop", async () => {
  const { readFileSync } = await import("node:fs");
  // The whole point. Anything shipped inside a distributed app can be read out
  // of it, so a key in the binary is a key every user has -- and the bill would
  // arrive here anyway.
  const handler = readFileSync(
    new URL("../apps/api/src/handler.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(handler, /apiKey.*json\(|json\(.*apiKey/u);
});
