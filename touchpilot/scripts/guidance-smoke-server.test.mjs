import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import {
  handleGuidanceSmokeRequest,
  resetBrowserCandidateBridge,
  normalizeProviderGuidanceResponse,
  requestFreeLlmApiGuidance,
  resolveGuidanceProviderConfig,
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
