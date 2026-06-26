import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_GUIDANCE_PROVIDER = "unavailable";
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate";
const DEFAULT_OLLAMA_MODEL = "llava:latest";
const SUPPORTED_GUIDANCE_PROVIDERS = new Set([
  "unavailable",
  "local-ollama",
]);

function jsonHeaders(extra = {}) {
  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json",
    ...extra,
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, jsonHeaders());
  response.end(JSON.stringify(body));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);

      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body is too large"));
        request.destroy();
        return;
      }

      body += chunk;
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

export function validateGuidanceProviderRequest(body) {
  const issues = [];

  if (body == null || typeof body !== "object") {
    return ["request body must be a JSON object"];
  }

  if (typeof body.goal !== "string" || body.goal.trim().length === 0) {
    issues.push("goal is required");
  }

  const screen = body.screen;

  if (screen == null || typeof screen !== "object") {
    issues.push("screen is required");
    return issues;
  }

  if (screen.display == null || typeof screen.display !== "object") {
    issues.push("screen.display is required");
  }

  if (screen.screenshot == null || typeof screen.screenshot !== "object") {
    issues.push("screen.screenshot is required");
  }

  if (
    screen.screenshotPayload == null ||
    typeof screen.screenshotPayload !== "object" ||
    typeof screen.screenshotPayload.imageBase64 !== "string" ||
    screen.screenshotPayload.imageBase64.length === 0
  ) {
    issues.push("screen.screenshotPayload.imageBase64 is required");
  }

  if (screen.calibration == null || typeof screen.calibration !== "object") {
    issues.push("screen.calibration is required");
  }

  return issues;
}

export function resolveGuidanceProviderConfig(env = process.env) {
  const rawProvider = String(
    env.TOKI_GUIDANCE_PROVIDER ?? DEFAULT_GUIDANCE_PROVIDER,
  )
    .trim()
    .toLowerCase();
  const provider = rawProvider.length > 0 ? rawProvider : DEFAULT_GUIDANCE_PROVIDER;

  if (!SUPPORTED_GUIDANCE_PROVIDERS.has(provider)) {
    return {
      provider: "unavailable",
      providerName: "dev-smoke-server",
      error: `unsupported TOKI_GUIDANCE_PROVIDER "${provider}"`,
    };
  }

  if (provider === "local-ollama") {
    return {
      provider,
      providerName: "local-ollama",
      endpoint: String(env.TOKI_OLLAMA_ENDPOINT ?? DEFAULT_OLLAMA_ENDPOINT).trim(),
      model: String(env.TOKI_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL).trim(),
    };
  }

  return {
    provider: "unavailable",
    providerName: "dev-smoke-server",
    error:
      "dev guidance smoke server is running, but no real provider is wired yet",
  };
}

export async function handleGuidanceSmokeRequest(request, response, options = {}) {
  const providerConfig = resolveGuidanceProviderConfig(options.env);

  if (request.method === "OPTIONS") {
    response.writeHead(204, jsonHeaders());
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "toki-guidance-smoke",
      provider: providerConfig.provider,
      providerName: providerConfig.providerName,
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/guidance/smoke") {
    sendJson(response, 404, {
      mode: "unavailable",
      error: "route not found",
      providerName: "dev-smoke-server",
    });
    return;
  }

  let body;

  try {
    body = JSON.parse(await readRequestBody(request));
  } catch (error) {
    sendJson(response, 400, {
      mode: "unavailable",
      error: error instanceof Error ? error.message : String(error),
      providerName: "dev-smoke-server",
    });
    return;
  }

  const issues = validateGuidanceProviderRequest(body);

  if (issues.length > 0) {
    sendJson(response, 400, {
      mode: "unavailable",
      error: `invalid guidance request: ${issues.join(", ")}`,
      providerName: "dev-smoke-server",
    });
    return;
  }

  if (providerConfig.provider === "local-ollama") {
    sendJson(response, 200, {
      mode: "unavailable",
      error:
        "TOKI_GUIDANCE_PROVIDER=local-ollama is configured, but the local Ollama adapter is not wired yet",
      providerName: providerConfig.providerName,
      providerConfig: {
        endpoint: providerConfig.endpoint,
        model: providerConfig.model,
      },
    });
    return;
  }

  sendJson(response, 200, {
    mode: "unavailable",
    error: providerConfig.error,
    providerName: providerConfig.providerName,
  });
}

export function createGuidanceSmokeServer() {
  return createServer(handleGuidanceSmokeRequest);
}

function getPort() {
  const value = Number(process.env.TOKI_GUIDANCE_PORT ?? DEFAULT_PORT);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PORT;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = getPort();
  const server = createGuidanceSmokeServer();

  server.listen(port, "127.0.0.1", () => {
    console.log(`Toki guidance smoke server listening on http://127.0.0.1:${port}`);
    console.log(`Endpoint: http://127.0.0.1:${port}/api/guidance/smoke`);
  });
}
