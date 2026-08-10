import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import {
  handleGuidanceSmokeRequest,
  resetBrowserCandidateBridge,
  normalizeProviderGuidanceResponse,
  developerAccountState,
  handleHostedVisionRequest,
  requestFreeLlmApiGuidance,
  resolveGuidanceProviderConfig,
  toGeminiSchema,
  validateProviderGuidanceResult,
  validateGuidanceProviderRequest,
} from "./guidance-smoke-server.mjs";

const validRequest = {
  goal: "Show me what to click next.",
  screen: {
    display: {
      id: "display-1",
      width: 1440,
      height: 900,
      scaleFactor: 2,
    },
    screenshot: {
      source: "full_screen",
      display: {
        id: "display-1",
        width: 1440,
        height: 900,
        scaleFactor: 2,
      },
      capturedAt: "2026-06-26T00:00:00.000Z",
      format: "png",
      byteLength: 1024,
      imageWidth: 2880,
      imageHeight: 1800,
    },
    screenshotPayload: {
      encoding: "base64",
      format: "png",
      byteLength: 1024,
      imageWidth: 2880,
      imageHeight: 1800,
      imageBase64: "iVBORw0KGgo=",
    },
    calibration: {
      status: "aligned",
      overlayWidth: 1440,
      overlayHeight: 900,
      displayWidth: 1440,
      displayHeight: 900,
      scaleFactor: 2,
      notes: "Test calibration.",
    },
  },
};

function withCandidates(request) {
  const copy = JSON.parse(JSON.stringify(request));
  copy.screen.candidates = [
    {
      id: "message-input",
      label: "Message input box",
      role: "textbox",
      x: 520,
      y: 790,
      width: 420,
      height: 44,
    },
  ];
  return copy;
}

function createRequest(method, url, body = "") {
  const request = Readable.from(body ? [body] : []);
  request.method = method;
  request.url = url;
  return request;
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

test("validateGuidanceProviderRequest accepts the smoke contract", () => {
  assert.deepEqual(validateGuidanceProviderRequest(validRequest), []);
});

test("validateGuidanceProviderRequest accepts candidate evidence", () => {
  assert.deepEqual(validateGuidanceProviderRequest(withCandidates(validRequest)), []);
});

test("validateGuidanceProviderRequest requires screen evidence", () => {
  assert.deepEqual(validateGuidanceProviderRequest({ goal: "" }), [
    "goal is required",
    "screen is required",
  ]);
});

test("validateGuidanceProviderRequest rejects bad candidate boxes", () => {
  const request = withCandidates(validRequest);
  request.screen.candidates[0].x = 1400;

  assert.deepEqual(validateGuidanceProviderRequest(request), [
    "screen.candidates[0] must fit within display bounds",
  ]);
});

test("resolveGuidanceProviderConfig defaults to unavailable", () => {
  assert.deepEqual(resolveGuidanceProviderConfig({}), {
    provider: "unavailable",
    providerName: "dev-smoke-server",
    error:
      "dev guidance smoke server is running, but no real provider is wired yet",
  });
});

test("resolveGuidanceProviderConfig supports FreeLLMAPI dev mode", () => {
  assert.deepEqual(
    resolveGuidanceProviderConfig({
      TOKI_GUIDANCE_PROVIDER: "freellmapi-dev",
      TOKI_FREELLMAPI_ENDPOINT: "http://localhost:3001/v1/chat/completions",
      TOKI_FREELLMAPI_MODEL: "dev-vision-model",
      TOKI_FREELLMAPI_API_KEY: "test-key",
    }),
    {
      provider: "freellmapi-dev",
      providerName: "freellmapi-dev",
      endpoint: "http://localhost:3001/v1/chat/completions",
      model: "dev-vision-model",
      apiKey: "test-key",
    },
  );
});

test("resolveGuidanceProviderConfig rejects unsupported providers safely", () => {
  assert.deepEqual(
    resolveGuidanceProviderConfig({ TOKI_GUIDANCE_PROVIDER: "cloud-dev" }),
    {
      provider: "unavailable",
      providerName: "dev-smoke-server",
      error: 'unsupported TOKI_GUIDANCE_PROVIDER "cloud-dev"',
    },
  );
});

test("guidance smoke server exposes health check", async () => {
  const response = createResponse();

  await handleGuidanceSmokeRequest(createRequest("GET", "/health"), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.equal(response.json().service, "toki-guidance-smoke");
  assert.equal(response.json().provider, "unavailable");
});

test("guidance smoke server stores browser candidate bridge payloads", async () => {
  resetBrowserCandidateBridge();

  const response = createResponse();

  await handleGuidanceSmokeRequest(
    createRequest(
      "POST",
      "/api/browser-candidates/latest",
      JSON.stringify({
        schemaVersion: 1,
        source: "browser-extension",
        capturedAt: "2026-07-02T00:00:00.000Z",
        page: {
          url: "https://example.com",
          title: "Example",
        },
        viewport: {
          width: 1280,
          height: 720,
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 2,
        },
        candidates: [
          {
            id: "dom-create-project-1",
            label: "Create project",
            role: "dom_button",
            source: "dom",
            x: 100,
            y: 100,
            width: 120,
            height: 40,
          },
        ],
      }),
    ),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.equal(response.json().candidateCount, 1);

  const getResponse = createResponse();

  await handleGuidanceSmokeRequest(
    createRequest("GET", "/api/browser-candidates/latest"),
    getResponse,
  );

  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.json().payload.candidates[0].label, "Create project");
});

test("guidance smoke server returns unavailable until provider is wired", async () => {
  const response = createResponse();

  await handleGuidanceSmokeRequest(
    createRequest("POST", "/api/guidance/smoke", JSON.stringify(validRequest)),
    response,
  );

  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.mode, "unavailable");
  assert.equal(body.providerName, "dev-smoke-server");
  assert.match(body.error, /no real provider is wired yet/);
});

test("validateProviderGuidanceResult rejects offscreen targets", () => {
  const validation = validateProviderGuidanceResult(
    {
      mode: "guide",
      summary: "Click the search field.",
      step: {
        instruction: "Click Search.",
        target: {
          label: "Search",
          x: 1430,
          y: 120,
          width: 240,
          height: 44,
        },
        confidence: 0.66,
        risk: "safe_navigation",
        requiresConfirmation: false,
      },
    },
    validRequest,
  );

  assert.equal(validation.valid, false);
  assert.ok(
    validation.issues.some((issue) => issue.path === "result.step.target"),
  );
});

test("validateProviderGuidanceResult rejects normalized target sizes", () => {
  const validation = validateProviderGuidanceResult(
    {
      mode: "guide",
      summary: "Click the message box.",
      step: {
        instruction: "Click the message input.",
        target: {
          label: "Message input",
          x: 0.36,
          y: 0.78,
          width: 0.52,
          height: 0.41,
        },
        confidence: 0.9,
        risk: "safe_navigation",
        requiresConfirmation: false,
      },
    },
    validRequest,
  );

  assert.equal(validation.valid, false);
  assert.ok(
    validation.issues.some(
      (issue) => issue.message === "Target width looks normalized; return CSS pixels.",
    ),
  );
  assert.ok(
    validation.issues.some(
      (issue) => issue.message === "Target height looks normalized; return CSS pixels.",
    ),
  );
});

test("normalizeProviderGuidanceResponse rejects invalid provider output", () => {
  const response = normalizeProviderGuidanceResponse(
    {
      mode: "real",
      providerName: "test-provider",
      result: {
        mode: "guide",
        summary: "Click the search field.",
        step: {
          instruction: "Click Search.",
          target: {
            label: "Search",
            x: 400,
            y: 120,
            width: 240,
            height: 44,
          },
          confidence: 1.5,
          risk: "safe_navigation",
          requiresConfirmation: false,
        },
      },
    },
    validRequest,
    "test-provider",
    { providerRawText: '{"mode":"real","result":{"step":{"confidence":1.5}}}' },
  );

  assert.equal(response.mode, "unavailable");
  assert.equal(response.providerName, "test-provider");
  assert.match(response.error, /invalid GuidanceResult/);
  assert.equal(response.validation.valid, false);
  assert.match(response.providerRawText, /confidence/);
  assert.ok(
    response.validation.issues.some(
      (issue) => issue.path === "result.step.confidence",
    ),
  );
});

test("normalizeProviderGuidanceResponse accepts direct GuidanceResult output", () => {
  const response = normalizeProviderGuidanceResponse(
    {
      mode: "guide",
      summary: "Click the search field.",
      step: {
        instruction: "Click Search.",
        target: {
          label: "Search",
          x: 400,
          y: 120,
          width: 240,
          height: 44,
        },
        confidence: 0.66,
        risk: "safe_navigation",
        requiresConfirmation: false,
      },
    },
    validRequest,
    "test-provider",
  );

  assert.equal(response.mode, "real");
  assert.equal(response.providerName, "test-provider");
  assert.equal(response.validation.valid, true);
  assert.equal(response.result.step.target.label, "Search");
});

test("normalizeProviderGuidanceResponse keeps adapter-owned provider name", () => {
  const response = normalizeProviderGuidanceResponse(
    {
      mode: "real",
      providerName: "spoofed-provider",
      result: {
        mode: "guide",
        summary: "Click the search field.",
        step: {
          instruction: "Click Search.",
          target: {
            label: "Search",
            x: 400,
            y: 120,
            width: 240,
            height: 44,
          },
          confidence: 0.66,
          risk: "safe_navigation",
          requiresConfirmation: false,
        },
      },
    },
    validRequest,
    "freellmapi-dev",
  );

  assert.equal(response.mode, "real");
  assert.equal(response.providerName, "freellmapi-dev");
});

test("normalizeProviderGuidanceResponse anchors matching candidate targets", () => {
  const response = normalizeProviderGuidanceResponse(
    {
      mode: "real",
      providerName: "test-provider",
      result: {
        mode: "guide",
        summary: "Click the message input.",
        step: {
          instruction: "Click the message input.",
          target: {
            candidateId: "message-input",
            label: "Message input box",
            x: 0.389,
            y: 0.781,
            width: 0.52,
            height: 0.412,
          },
          confidence: 0.8,
          risk: "safe_navigation",
          requiresConfirmation: false,
        },
      },
    },
    withCandidates(validRequest),
    "test-provider",
  );

  assert.equal(response.mode, "real");
  assert.equal(response.validation.valid, true);
  assert.deepEqual(response.result.step.target, {
    candidateId: "message-input",
    label: "Message input box",
    x: 520,
    y: 790,
    width: 420,
    height: 44,
  });
});

test("requestFreeLlmApiGuidance sends OpenAI-compatible vision request", async () => {
  const calls = [];
  const response = await requestFreeLlmApiGuidance(
    withCandidates(validRequest),
    {
      provider: "freellmapi-dev",
      providerName: "freellmapi-dev",
      endpoint: "http://localhost:3001/v1/chat/completions",
      model: "dev-vision-model",
      apiKey: "test-key",
    },
    {
      fetchImpl: async (url, init) => {
        calls.push({ url, init });

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    candidateId: "message-input",
                    instruction: "Click the message input.",
                    confidence: 0.77,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:3001/v1/chat/completions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer test-key");

  const body = JSON.parse(calls[0].init.body);

  assert.equal(body.model, "dev-vision-model");
  assert.equal(body.temperature, 0);
  assert.equal(body.response_format.type, "json_object");
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].role, "user");
  assert.match(body.messages[1].content[0].text, /Show me what to click next/);
  assert.match(body.messages[1].content[0].text, /must choose from the candidate list/);
  assert.match(
    body.messages[1].content[0].text,
    /Return the candidate id, not raw coordinates/,
  );
  assert.match(body.messages[1].content[0].text, /id=message-input/);
  assert.match(
    body.messages[1].content[1].image_url.url,
    /^data:image\/png;base64,iVBORw0KGgo=/,
  );
  assert.equal(response.mode, "real");
  assert.equal(response.providerName, "freellmapi-dev");
  assert.equal(response.validation.valid, true);
  assert.equal(response.result.step.target.candidateId, "message-input");
});

test("requestFreeLlmApiGuidance reports provider errors as unavailable", async () => {
  const response = await requestFreeLlmApiGuidance(
    validRequest,
    {
      provider: "freellmapi-dev",
      providerName: "freellmapi-dev",
      endpoint: "http://localhost:3001/v1/chat/completions",
      model: "dev-vision-model",
      apiKey: "",
    },
    {
      fetchImpl: async () => new Response("rate limited", { status: 429 }),
    },
  );

  assert.equal(response.mode, "unavailable");
  assert.equal(response.providerName, "freellmapi-dev");
  assert.match(response.error, /429/);
});

test("guidance smoke server calls configured FreeLLMAPI dev adapter", async () => {
  const response = createResponse();

  await handleGuidanceSmokeRequest(
    createRequest("POST", "/api/guidance/smoke", JSON.stringify(withCandidates(validRequest))),
    response,
    {
      env: {
        TOKI_GUIDANCE_PROVIDER: "freellmapi-dev",
        TOKI_FREELLMAPI_ENDPOINT: "http://localhost:3001/v1/chat/completions",
        TOKI_FREELLMAPI_MODEL: "dev-vision-model",
        TOKI_FREELLMAPI_API_KEY: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    candidateId: "message-input",
                    instruction: "Click the message input.",
                    confidence: 0.77,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    },
  );

  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.mode, "real");
  assert.equal(body.providerName, "freellmapi-dev");
  assert.equal(body.validation.valid, true);
  assert.equal(body.result.step.target.label, "Message input box");
});

/*
 * A stand-in for the Claude CLI.
 *
 * The real one is a network call on somebody's subscription, so the tests never
 * reach it: they assert on how its output is read and how its failures are
 * reported, which is where the mistakes live.
 */
test("the app's /account route reports an entitled developer", async () => {
  const response = createResponse();

  await handleGuidanceSmokeRequest(createRequest("POST", "/account"), response, {
    env: { TOKI_GUIDANCE_PROVIDER: "gemini-dev", GEMINI_API_KEY: "k" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().entitled, true);
  assert.equal(developerAccountState().tier, "pro");
});

/*
 * Gemini, in place of the local CLI.
 *
 * The CLI answers correctly and slowly: it starts a whole agent, reads the
 * screenshot off disk, and costs six or seven seconds a step -- which is a
 * person standing still waiting to be told what to click. It also has to be
 * installed, and it has to be lent Toki's screen-recording grant to do its job.
 *
 * Gemini is one request, on a free tier, and takes the output schema as a
 * response schema rather than as a paragraph of please. That last part is the
 * reason to prefer it: the shape is enforced instead of requested.
 */

function fakeGemini(response) {
  const calls = [];

  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init, body: JSON.parse(init.body) });
      return response;
    },
  };
}

function geminiOk(text) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  };
}

const geminiConfig = {
  provider: "gemini-dev",
  providerName: "gemini-dev",
  apiKey: "test-key",
  model: "gemini-3.6-flash",
};

test("choosing Gemini asks Gemini, and never starts the CLI", async () => {
  // The handler used to name the CLI directly, so the provider setting picked
  // a label and the request went the same place either way. Choosing Gemini
  // did nothing at all, which is indistinguishable from Gemini being slow.
  const { fetchImpl, calls } = fakeGemini(geminiOk('{"target":null}'));

  const reply = await handleHostedVisionRequest(
    { prompt: "Find it.", imageBase64: "iVBORw0KGgo=", imageFormat: "png" },
    geminiConfig,
    { fetchImpl, spawnImpl: () => assert.fail("the CLI must not be started") },
  );

  assert.equal(reply.status, 200);
  assert.equal(reply.body.rawAnswer, '{"target":null}');
  assert.equal(reply.body.providerName, "gemini-dev");
  assert.equal(calls.length, 1);
});

test("the schema is enforced by the API, not asked for in prose", async () => {
  const { fetchImpl, calls } = fakeGemini(geminiOk("{}"));

  await handleHostedVisionRequest(
    {
      prompt: "Find the create playlist control.",
      imageBase64: "iVBORw0KGgo=",
      imageFormat: "png",
      outputSchema: {
        type: "object",
        required: ["target", "confidence"],
        properties: { risk: { type: "string", enum: ["safe_navigation", "delete"] } },
      },
    },
    geminiConfig,
    { fetchImpl },
  );

  const { body } = calls[0];
  const schema = body.generationConfig.responseSchema;

  assert.deepEqual(schema.required, ["target", "confidence"]);
  assert.deepEqual(schema.properties.risk.enum, ["safe_navigation", "delete"]);
  assert.equal(body.generationConfig.responseMimeType, "application/json");

  // The ask is still the ask. Appending the schema in words as well would be
  // spending tokens to repeat something already binding.
  const prompt = body.contents[0].parts[0].text;
  assert.match(prompt, /Find the create playlist control\./u);
  assert.doesNotMatch(prompt, /Return only a JSON object matching this schema/u);
});

test("the key travels in a header, never in the URL", async () => {
  // A key in a query string ends up in server logs, in proxies, and in
  // anything that records where a request went.
  const { fetchImpl, calls } = fakeGemini(geminiOk("{}"));

  await handleHostedVisionRequest(
    { prompt: "Find it.", imageBase64: "iVBORw0KGgo=", imageFormat: "png" },
    geminiConfig,
    { fetchImpl },
  );

  assert.doesNotMatch(calls[0].url, /test-key/u);
  assert.equal(calls[0].init.headers["x-goog-api-key"], "test-key");
  assert.match(calls[0].url, /gemini-3\.6-flash/u, "the configured model is used");
});

test("the screenshot goes as an image, with the format it actually is", async () => {
  const { fetchImpl, calls } = fakeGemini(geminiOk("{}"));

  await handleHostedVisionRequest(
    { prompt: "Find it.", imageBase64: "/9j/4AAQ", imageFormat: "jpeg" },
    geminiConfig,
    { fetchImpl },
  );

  const image = calls[0].body.contents[0].parts[1].inline_data;
  assert.equal(image.mime_type, "image/jpeg");
  assert.equal(image.data, "/9j/4AAQ");
});

test("no key says where to get one, free", async () => {
  // "No vision credentials" is true and useless. The whole reason for choosing
  // this provider is that a key costs nothing, so the message says so.
  const reply = await handleHostedVisionRequest(
    { prompt: "Find it.", imageBase64: "iVBORw0KGgo=", imageFormat: "png" },
    { ...geminiConfig, apiKey: "" },
    { fetchImpl: () => assert.fail("must not call Google without a key") },
  );

  assert.equal(reply.status, 200);
  assert.match(reply.body.error, /free/iu);
  assert.match(reply.body.error, /aistudio\.google\.com/u);
});

test("a refusal from Google is reported as a refusal", async () => {
  // Not as an empty answer. A retired model returns 404 here, and reading that
  // as "the model had nothing to say" sends somebody looking at their key.
  const { fetchImpl } = fakeGemini({
    ok: false,
    status: 404,
    statusText: "Not Found",
    text: async () => "models/gemini-2.0-flash is not found",
  });

  const reply = await handleHostedVisionRequest(
    { prompt: "Find it.", imageBase64: "iVBORw0KGgo=", imageFormat: "png" },
    geminiConfig,
    { fetchImpl },
  );

  assert.equal(reply.status, 200);
  assert.match(reply.body.error, /404/u);
  assert.match(reply.body.error, /is not found/u);
});

test("a blocked screenshot says it was blocked", async () => {
  // Somebody's screen can contain anything. An empty string handed to a parser
  // becomes whatever the parser makes of it, which is never the real reason.
  const { fetchImpl } = fakeGemini({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ candidates: [{ finishReason: "SAFETY", content: {} }] }),
  });

  const reply = await handleHostedVisionRequest(
    { prompt: "Find it.", imageBase64: "iVBORw0KGgo=", imageFormat: "png" },
    geminiConfig,
    { fetchImpl },
  );

  assert.match(reply.body.error, /SAFETY/u);
});

test("the schema is stripped to what Gemini accepts", () => {
  // It takes an OpenAPI subset, not full JSON Schema. `$schema` and
  // `additionalProperties` are rejected outright rather than ignored, which
  // turns a working schema into a 400 over a field nobody was relying on.
  const converted = toGeminiSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["confidence"],
    properties: {
      confidence: { type: "number", minimum: 0, maximum: 1 },
      target: {
        type: ["object", "null"],
        properties: { label: { type: "string" } },
      },
      steps: { type: "array", items: { type: "string" } },
    },
  });

  assert.equal(converted.$schema, undefined);
  assert.equal(converted.additionalProperties, undefined);
  assert.equal(converted.properties.confidence.minimum, undefined);

  // "object or null" is a flag here, not a type array.
  assert.equal(converted.properties.target.type, "object");
  assert.equal(converted.properties.target.nullable, true);

  // What carries meaning survives.
  assert.deepEqual(converted.required, ["confidence"]);
  assert.equal(converted.properties.steps.items.type, "string");
});

test("gemini-dev is a provider the server will start as", () => {
  const config = resolveGuidanceProviderConfig({
    TOKI_GUIDANCE_PROVIDER: "gemini-dev",
    GEMINI_API_KEY: "from-env",
  });

  assert.equal(config.provider, "gemini-dev");
  assert.equal(config.apiKey, "from-env");
  // Chosen by measurement rather than remembered. The previous default is shut
  // down, and a retired default fails as if the key were wrong.
  assert.equal(config.model, "gemini-3.5-flash-lite");
});

test("an anyOf target keeps its required fields", () => {
  // The bug this exists for was silent and expensive. Toki's contract writes
  // "an object or null" as an anyOf, and the converter had no branch for it --
  // so it returned an empty schema for `target`, the one field that matters,
  // while enforcing every other field perfectly.
  //
  // The symptom was the model looking unreliable: coordinates arrived as
  // centerX one call, box the next, and absent the call after that. It had
  // never been told.
  const converted = toGeminiSchema({
    type: "object",
    required: ["target"],
    properties: {
      target: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            required: ["centerX", "centerY", "label"],
            properties: {
              centerX: { type: "number" },
              centerY: { type: "number" },
              label: { type: "string" },
            },
          },
        ],
      },
    },
  });

  const target = converted.properties.target;

  assert.deepEqual(target.required, ["centerX", "centerY", "label"]);
  assert.equal(target.type, "object");
  // "or null" survives as the flag Gemini actually understands.
  assert.equal(target.nullable, true);
  assert.equal(target.properties.centerX.type, "number");
});

test("a choice Gemini cannot express drops the constraint rather than guessing", () => {
  // Picking one branch would forbid an answer the contract permits, which is
  // worse than not constraining it.
  assert.equal(
    toGeminiSchema({ anyOf: [{ type: "string" }, { type: "number" }] }),
    undefined,
  );
});

test("hitting the free tier's limit is described as a wait, not a fault", async () => {
  // It sends somebody to check a key that is working perfectly well. The free
  // tier allows only a few questions a minute, which is easy to reach.
  const { fetchImpl } = fakeGemini({
    ok: false,
    status: 429,
    statusText: "Too Many Requests",
    text: async () => "quota exceeded",
  });

  const reply = await handleHostedVisionRequest(
    { prompt: "Find it.", imageBase64: "iVBORw0KGgo=", imageFormat: "png" },
    geminiConfig,
    { fetchImpl },
  );

  assert.match(reply.body.error, /minute/u);
  assert.doesNotMatch(reply.body.error, /429/u);
});

test("the model is asked to deliberate as little as it is allowed to", () => {
  // Measured at the default setting on a real screenshot: 2.6s to 21s per
  // question, with a person stood in front of their own screen for all of it.
  // The task is recognition, not reasoning.
  const { fetchImpl, calls } = fakeGemini(geminiOk("{}"));

  return handleHostedVisionRequest(
    { prompt: "Find it.", imageBase64: "iVBORw0KGgo=", imageFormat: "png" },
    geminiConfig,
    { fetchImpl },
  ).then(() => {
    // The nesting matters: sent flat, the API rejects the whole request with
    // "Unknown name thinkingLevel" and no guidance happens at all.
    assert.equal(
      calls[0].body.generationConfig.thinkingConfig.thinkingLevel,
      "minimal",
    );
  });
});
