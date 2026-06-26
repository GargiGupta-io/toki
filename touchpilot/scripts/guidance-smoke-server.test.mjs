import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import {
  handleGuidanceSmokeRequest,
  normalizeProviderGuidanceResponse,
  requestLocalOllamaGuidance,
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

test("validateGuidanceProviderRequest requires screen evidence", () => {
  assert.deepEqual(validateGuidanceProviderRequest({ goal: "" }), [
    "goal is required",
    "screen is required",
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

test("resolveGuidanceProviderConfig supports local Ollama", () => {
  assert.deepEqual(
    resolveGuidanceProviderConfig({
      TOKI_GUIDANCE_PROVIDER: "local-ollama",
      TOKI_OLLAMA_ENDPOINT: "http://localhost:11434/api/generate",
      TOKI_OLLAMA_MODEL: "llava:13b",
    }),
    {
      provider: "local-ollama",
      providerName: "local-ollama",
      endpoint: "http://localhost:11434/api/generate",
      model: "llava:13b",
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

test("requestLocalOllamaGuidance sends screenshot and goal to Ollama", async () => {
  const calls = [];
  const response = await requestLocalOllamaGuidance(
    validRequest,
    {
      provider: "local-ollama",
      providerName: "local-ollama",
      endpoint: "http://localhost:11434/api/generate",
      model: "llava:13b",
    },
    {
      fetchImpl: async (url, init) => {
        calls.push({ url, init });

        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              mode: "real",
              providerName: "local-ollama",
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
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:11434/api/generate");
  assert.equal(calls[0].init.method, "POST");

  const body = JSON.parse(calls[0].init.body);

  assert.equal(body.model, "llava:13b");
  assert.equal(body.stream, false);
  assert.equal(body.format, "json");
  assert.deepEqual(body.images, ["iVBORw0KGgo="]);
  assert.match(body.prompt, /Show me what to click next/);
  assert.match(body.prompt, /Display width: 1440/);
  assert.equal(response.mode, "real");
  assert.equal(response.providerName, "local-ollama");
  assert.equal(response.validation.valid, true);
  assert.equal(response.result.step.target.label, "Search");
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
      providerName: "local-ollama",
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
    "local-ollama",
    { providerRawText: '{"mode":"real","result":{"step":{"confidence":1.5}}}' },
  );

  assert.equal(response.mode, "unavailable");
  assert.equal(response.providerName, "local-ollama");
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
    "local-ollama",
  );

  assert.equal(response.mode, "real");
  assert.equal(response.providerName, "local-ollama");
  assert.equal(response.validation.valid, true);
  assert.equal(response.result.step.target.label, "Search");
});

test("requestLocalOllamaGuidance reports malformed provider JSON", async () => {
  const response = await requestLocalOllamaGuidance(
    validRequest,
    {
      provider: "local-ollama",
      providerName: "local-ollama",
      endpoint: "http://localhost:11434/api/generate",
      model: "llava:13b",
    },
    {
      fetchImpl: async () =>
        new Response(JSON.stringify({ response: "not json" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    },
  );

  assert.equal(response.mode, "unavailable");
  assert.equal(response.providerName, "local-ollama");
  assert.match(response.error, /JSON object|Unexpected token/);
  assert.equal(response.providerRawText, "not json");
});

test("requestLocalOllamaGuidance reports provider errors as unavailable", async () => {
  const response = await requestLocalOllamaGuidance(
    validRequest,
    {
      provider: "local-ollama",
      providerName: "local-ollama",
      endpoint: "http://localhost:11434/api/generate",
      model: "llava:13b",
    },
    {
      fetchImpl: async () => new Response("missing model", { status: 404 }),
    },
  );

  assert.equal(response.mode, "unavailable");
  assert.equal(response.providerName, "local-ollama");
  assert.match(response.error, /404/);
});

test("guidance smoke server calls configured local Ollama adapter", async () => {
  const response = createResponse();

  await handleGuidanceSmokeRequest(
    createRequest("POST", "/api/guidance/smoke", JSON.stringify(validRequest)),
    response,
    {
      env: {
        TOKI_GUIDANCE_PROVIDER: "local-ollama",
        TOKI_OLLAMA_ENDPOINT: "http://localhost:11434/api/generate",
        TOKI_OLLAMA_MODEL: "llava:13b",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            response: JSON.stringify({
              mode: "real",
              providerName: "local-ollama",
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
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    },
  );

  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.mode, "real");
  assert.equal(body.providerName, "local-ollama");
  assert.equal(body.validation.valid, true);
  assert.equal(body.result.step.target.label, "Search");
});
