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
const VALID_GUIDANCE_MODES = new Set(["guide", "answer", "clarify"]);
const VALID_RISK_CLASSES = new Set([
  "safe_navigation",
  "form_entry",
  "external_send",
  "delete",
  "payment",
  "security_change",
  "account_change",
  "permission_change",
  "unknown_risky",
]);
const CONFIRMATION_REQUIRED_RISKS = new Set([
  "external_send",
  "delete",
  "payment",
  "security_change",
  "account_change",
  "permission_change",
  "unknown_risky",
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

function createOllamaPrompt(request) {
  const display = request.screen.display;
  const calibration = request.screen.calibration;

  return [
    "You are Toki, a desktop screen guidance assistant.",
    "Look at the screenshot and choose the single best UI target for the user's goal.",
    "Return only JSON. Do not include markdown, prose, or code fences.",
    "",
    "Required JSON shape:",
    "{",
    '  "mode": "real",',
    '  "providerName": "local-ollama",',
    '  "result": {',
    '    "mode": "guide",',
    '    "summary": "short explanation",',
    '    "step": {',
    '      "instruction": "what the user should do next",',
    '      "target": {',
    '        "label": "visible target label",',
    '        "x": 0,',
    '        "y": 0,',
    '        "width": 1,',
    '        "height": 1',
    "      },",
    '      "confidence": 0.5,',
    '      "risk": "safe_navigation",',
    '      "requiresConfirmation": false',
    "    }",
    "  }",
    "}",
    "",
    "Coordinate rules:",
    `- Return target coordinates in overlay/display CSS pixels, not image pixels.`,
    `- Display width: ${display.width}`,
    `- Display height: ${display.height}`,
    `- Display scale factor: ${display.scaleFactor}`,
    `- Calibration status: ${calibration?.status ?? "unknown"}`,
    "",
    `User goal: ${request.goal}`,
  ].join("\n");
}

function extractJsonObject(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("provider response did not contain a JSON object");
  }

  return JSON.parse(trimmed.slice(start, end + 1));
}

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function validateProviderGuidanceResult(result, guidanceRequest) {
  const issues = [];

  if (!isObject(result)) {
    return {
      valid: false,
      issues: [{ path: "result", message: "Guidance result is missing." }],
    };
  }

  if (!VALID_GUIDANCE_MODES.has(result.mode)) {
    issues.push({ path: "result.mode", message: "Guidance mode is invalid." });
  }

  if (typeof result.summary !== "string" || result.summary.trim().length === 0) {
    issues.push({ path: "result.summary", message: "Guidance summary is required." });
  }

  if (result.mode === "guide" && !isObject(result.step)) {
    issues.push({ path: "result.step", message: "Guide mode requires a step." });
  }

  if (isObject(result.step)) {
    const step = result.step;

    if (
      typeof step.instruction !== "string" ||
      step.instruction.trim().length === 0
    ) {
      issues.push({
        path: "result.step.instruction",
        message: "Step instruction is required.",
      });
    }

    if (!Number.isFinite(step.confidence) || step.confidence < 0 || step.confidence > 1) {
      issues.push({
        path: "result.step.confidence",
        message: "Confidence must be a number from 0 to 1.",
      });
    }

    if (!VALID_RISK_CLASSES.has(step.risk)) {
      issues.push({
        path: "result.step.risk",
        message: "Risk class is invalid.",
      });
    }

    if (typeof step.requiresConfirmation !== "boolean") {
      issues.push({
        path: "result.step.requiresConfirmation",
        message: "requiresConfirmation must be boolean.",
      });
    } else if (
      CONFIRMATION_REQUIRED_RISKS.has(step.risk) &&
      !step.requiresConfirmation
    ) {
      issues.push({
        path: "result.step.requiresConfirmation",
        message: "Risky guidance must require confirmation.",
      });
    }

    validateTargetGeometry(step.target, guidanceRequest, issues);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validateTargetGeometry(target, guidanceRequest, issues) {
  if (!isObject(target)) {
    issues.push({
      path: "result.step.target",
      message: "Guide mode requires a target.",
    });
    return;
  }

  if (typeof target.label !== "string" || target.label.trim().length === 0) {
    issues.push({
      path: "result.step.target.label",
      message: "Target label is required.",
    });
  }

  for (const field of ["x", "y", "width", "height"]) {
    if (!Number.isFinite(target[field])) {
      issues.push({
        path: `result.step.target.${field}`,
        message: "Target coordinates and size must be finite numbers.",
      });
    }
  }

  if (Number.isFinite(target.width) && target.width <= 0) {
    issues.push({
      path: "result.step.target.width",
      message: "Target width must be positive.",
    });
  }

  if (Number.isFinite(target.height) && target.height <= 0) {
    issues.push({
      path: "result.step.target.height",
      message: "Target height must be positive.",
    });
  }

  const display = guidanceRequest.screen.display;

  if (
    Number.isFinite(target.x) &&
    Number.isFinite(target.y) &&
    Number.isFinite(target.width) &&
    Number.isFinite(target.height) &&
    (target.x < 0 ||
      target.y < 0 ||
      target.x + target.width > display.width ||
      target.y + target.height > display.height)
  ) {
    issues.push({
      path: "result.step.target",
      message: "Target box must fit within display bounds.",
    });
  }
}

export function normalizeProviderGuidanceResponse(
  providerBody,
  guidanceRequest,
  providerName,
) {
  if (!isObject(providerBody)) {
    return {
      mode: "unavailable",
      error: "provider returned a non-object response",
      providerName,
      validation: {
        valid: false,
        issues: [{ path: "response", message: "Provider response must be an object." }],
      },
    };
  }

  if (providerBody.mode === "unavailable") {
    return {
      mode: "unavailable",
      error: providerBody.error ?? "provider returned unavailable",
      providerName: providerBody.providerName ?? providerName,
    };
  }

  const result =
    providerBody.mode === "real" && isObject(providerBody.result)
      ? providerBody.result
      : providerBody;
  const validation = validateProviderGuidanceResult(result, guidanceRequest);

  if (!validation.valid) {
    return {
      mode: "unavailable",
      error: "provider returned an invalid GuidanceResult",
      providerName: providerBody.providerName ?? providerName,
      validation,
    };
  }

  return {
    mode: "real",
    providerName: providerBody.providerName ?? providerName,
    result,
    validation,
  };
}

export async function requestLocalOllamaGuidance(
  guidanceRequest,
  providerConfig,
  options = {},
) {
  const fetcher = options.fetchImpl ?? fetch;

  try {
    const ollamaRequest = {
      model: providerConfig.model,
      stream: false,
      format: "json",
      prompt: createOllamaPrompt(guidanceRequest),
      images: [guidanceRequest.screen.screenshotPayload.imageBase64],
    };

    const response = await fetcher(providerConfig.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      return {
        mode: "unavailable",
        error: `local Ollama returned ${response.status} ${response.statusText}`,
        providerName: providerConfig.providerName,
      };
    }

    const body = await response.json();
    const responseText =
      typeof body.response === "string" ? body.response : JSON.stringify(body);
    const providerBody = extractJsonObject(responseText);

    return normalizeProviderGuidanceResponse(
      providerBody,
      guidanceRequest,
      providerConfig.providerName,
    );
  } catch (error) {
    return {
      mode: "unavailable",
      error: error instanceof Error ? error.message : String(error),
      providerName: providerConfig.providerName,
    };
  }
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
    const providerResponse = await requestLocalOllamaGuidance(body, providerConfig, {
      fetchImpl: options.fetchImpl,
    });

    sendJson(response, 200, providerResponse);
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
