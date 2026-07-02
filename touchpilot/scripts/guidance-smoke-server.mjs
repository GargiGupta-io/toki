import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { normalizeBrowserCandidatePayload } from "./browser-candidate-payload.mjs";

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_GUIDANCE_PROVIDER = "unavailable";
const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate";
const DEFAULT_OLLAMA_MODEL = "llava:latest";
const DEFAULT_FREELLMAPI_ENDPOINT = "http://127.0.0.1:3001/v1/chat/completions";
const DEFAULT_FREELLMAPI_MODEL = "auto";
const MAX_PROVIDER_RAW_TEXT_CHARS = 2000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 90_000;
const MIN_TARGET_SIZE_CSS_PX = 4;
const MAX_SCREEN_CANDIDATES = 20;
const SUPPORTED_GUIDANCE_PROVIDERS = new Set([
  "unavailable",
  "local-ollama",
  "freellmapi-dev",
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
let latestBrowserCandidatePayload = null;

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

export function getLatestBrowserCandidatePayload() {
  return latestBrowserCandidatePayload;
}

export function resetBrowserCandidateBridge() {
  latestBrowserCandidatePayload = null;
}

function storeBrowserCandidatePayload(payload) {
  const normalized = normalizeBrowserCandidatePayload(payload);

  latestBrowserCandidatePayload = {
    ...payload,
    candidates: normalized.candidates,
    receivedAt: new Date().toISOString(),
  };

  return latestBrowserCandidatePayload;
}

function resolveProviderTimeoutMs(env = process.env) {
  const timeoutMs = Number(env.TOKI_GUIDANCE_PROVIDER_TIMEOUT_MS);

  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_PROVIDER_TIMEOUT_MS;
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

  validateScreenCandidates(screen, issues);

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

  if (provider === "freellmapi-dev") {
    return {
      provider,
      providerName: "freellmapi-dev",
      endpoint: String(
        env.TOKI_FREELLMAPI_ENDPOINT ?? DEFAULT_FREELLMAPI_ENDPOINT,
      ).trim(),
      model: String(env.TOKI_FREELLMAPI_MODEL ?? DEFAULT_FREELLMAPI_MODEL).trim(),
      apiKey: String(env.TOKI_FREELLMAPI_API_KEY ?? "").trim(),
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
  const screenshot = request.screen.screenshotPayload;
  const calibration = request.screen.calibration;
  const candidates = getScreenCandidates(request);
  const candidateLines = candidates.map(
    (candidate) =>
      `- id=${candidate.id}; label=${candidate.label}; role=${candidate.role}; box=${candidate.x},${candidate.y},${candidate.width}x${candidate.height}`,
  );

  if (candidates.length > 0) {
    return [
      "You are Toki, a desktop screen guidance assistant.",
      "Choose the single best candidate for the user's goal.",
      "Candidate UI elements are provided, so you must choose from the candidate list.",
      "Return the candidate id, not raw coordinates.",
      "Do not invent a target, label, or box when a candidate matches the goal.",
      "Return only JSON. Do not include markdown, prose, comments, or code fences.",
      "",
      "Required JSON shape:",
      '{ "candidateId": "candidate id", "instruction": "short click instruction", "confidence": 0.5 }',
      "",
      "The adapter will copy the selected candidate's label and exact box after validation.",
      "",
      "Candidates:",
      ...candidateLines,
      "",
      `User goal: ${request.goal}`,
    ].join("\n");
  }

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
    '        "candidateId": "candidate id when candidates are provided",',
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
    `- Screenshot image width: ${screenshot.imageWidth}`,
    `- Screenshot image height: ${screenshot.imageHeight}`,
    "- Never return normalized 0..1 coordinates.",
    "- Bad: x=0.36, y=0.78, width=0.52, height=0.41.",
    "- Good: x=540, y=760, width=420, height=44.",
    `- If you locate a box in screenshot pixels, divide x, y, width, and height by the display scale factor before returning it.`,
    `- The target box must stay fully inside 0..${display.width} x 0..${display.height}.`,
    `- Use a small bounding box around the clickable element, not the whole card or window.`,
    `- Calibration status: ${calibration?.status ?? "unknown"}`,
    "",
    candidates.length > 0
      ? "Candidate UI elements are provided. Prefer choosing one of these candidates instead of guessing coordinates:"
      : "No candidate UI elements are provided.",
    ...candidateLines,
    ...(candidates.length > 0
      ? [
          "When using a candidate, copy its id into target.candidateId and copy its box exactly.",
          "Do not invent new coordinates when a candidate matches the goal.",
        ]
      : []),
    "",
    `User goal: ${request.goal}`,
  ].join("\n");
}

function truncateProviderRawText(text) {
  if (typeof text !== "string") {
    return "";
  }

  const trimmed = text.trim();

  if (trimmed.length <= MAX_PROVIDER_RAW_TEXT_CHARS) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_PROVIDER_RAW_TEXT_CHARS)}...[truncated]`;
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

function validateScreenCandidates(screen, issues) {
  if (screen.candidates == null) {
    return;
  }

  if (!Array.isArray(screen.candidates)) {
    issues.push("screen.candidates must be an array when provided");
    return;
  }

  if (screen.candidates.length > MAX_SCREEN_CANDIDATES) {
    issues.push(`screen.candidates must contain ${MAX_SCREEN_CANDIDATES} or fewer items`);
  }

  const display = screen.display;

  for (const [index, candidate] of screen.candidates.entries()) {
    const path = `screen.candidates[${index}]`;

    if (!isObject(candidate)) {
      issues.push(`${path} must be an object`);
      continue;
    }

    if (typeof candidate.label !== "string" || candidate.label.trim().length === 0) {
      issues.push(`${path}.label is required`);
    }

    for (const field of ["x", "y", "width", "height"]) {
      if (!Number.isFinite(candidate[field])) {
        issues.push(`${path}.${field} must be a finite number`);
      }
    }

    if (Number.isFinite(candidate.width) && candidate.width <= 0) {
      issues.push(`${path}.width must be positive`);
    }

    if (Number.isFinite(candidate.height) && candidate.height <= 0) {
      issues.push(`${path}.height must be positive`);
    }

    if (
      isObject(display) &&
      Number.isFinite(candidate.x) &&
      Number.isFinite(candidate.y) &&
      Number.isFinite(candidate.width) &&
      Number.isFinite(candidate.height) &&
      (candidate.x < 0 ||
        candidate.y < 0 ||
        candidate.x + candidate.width > display.width ||
        candidate.y + candidate.height > display.height)
    ) {
      issues.push(`${path} must fit within display bounds`);
    }
  }
}

function getScreenCandidates(guidanceRequest) {
  const candidates = guidanceRequest.screen?.candidates;

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .filter((candidate) => isObject(candidate))
    .slice(0, MAX_SCREEN_CANDIDATES)
    .map((candidate, index) => ({
      id:
        typeof candidate.id === "string" && candidate.id.trim().length > 0
          ? candidate.id.trim()
          : `candidate-${index + 1}`,
      label:
        typeof candidate.label === "string" && candidate.label.trim().length > 0
          ? candidate.label.trim()
          : `Candidate ${index + 1}`,
      role:
        typeof candidate.role === "string" && candidate.role.trim().length > 0
          ? candidate.role.trim()
          : "unknown",
      x: Number(candidate.x),
      y: Number(candidate.y),
      width: Number(candidate.width),
      height: Number(candidate.height),
    }));
}

function normalizeMatchKey(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function findMatchingCandidate(target, guidanceRequest) {
  if (!isObject(target)) {
    return null;
  }

  const candidates = getScreenCandidates(guidanceRequest);

  if (candidates.length === 0) {
    return null;
  }

  const targetCandidateId = normalizeMatchKey(target.candidateId);
  const targetLabel = normalizeMatchKey(target.label);

  return (
    candidates.find((candidate) => normalizeMatchKey(candidate.id) === targetCandidateId) ??
    candidates.find((candidate) => normalizeMatchKey(candidate.label) === targetLabel) ??
    null
  );
}

function applyCandidateAnchor(result, guidanceRequest) {
  if (!isObject(result?.step?.target)) {
    return result;
  }

  const candidate = findMatchingCandidate(result.step.target, guidanceRequest);

  if (candidate == null) {
    return result;
  }

  return {
    ...result,
    step: {
      ...result.step,
      target: {
        ...result.step.target,
        candidateId: candidate.id,
        label: candidate.label,
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
      },
    },
  };
}

function createGuidanceResultFromCandidateSelection(
  providerBody,
  guidanceRequest,
  providerName,
) {
  if (!isObject(providerBody)) {
    return null;
  }

  const candidateId =
    typeof providerBody.candidateId === "string"
      ? providerBody.candidateId
      : typeof providerBody.id === "string"
        ? providerBody.id
        : null;
  const targetLabel =
    typeof providerBody.label === "string"
      ? providerBody.label
      : typeof providerBody.target === "string"
        ? providerBody.target
        : null;

  const candidate = findMatchingCandidate(
    {
      candidateId,
      label: targetLabel,
    },
    guidanceRequest,
  );

  if (candidate == null) {
    return null;
  }

  const confidence = Number(providerBody.confidence);

  return {
    mode: "real",
    providerName,
    result: {
      mode: "guide",
      summary:
        typeof providerBody.summary === "string" && providerBody.summary.trim().length > 0
          ? providerBody.summary.trim()
          : `Selected ${candidate.label}.`,
      step: {
        instruction:
          typeof providerBody.instruction === "string" &&
          providerBody.instruction.trim().length > 0
            ? providerBody.instruction.trim()
            : `Click ${candidate.label}.`,
        target: {
          candidateId: candidate.id,
          label: candidate.label,
          x: candidate.x,
          y: candidate.y,
          width: candidate.width,
          height: candidate.height,
        },
        confidence: Number.isFinite(confidence)
          ? Math.min(1, Math.max(0, confidence))
          : 0.65,
        risk: "safe_navigation",
        requiresConfirmation: false,
      },
    },
  };
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
  } else if (Number.isFinite(target.width) && target.width < MIN_TARGET_SIZE_CSS_PX) {
    issues.push({
      path: "result.step.target.width",
      message: "Target width looks normalized; return CSS pixels.",
    });
  }

  if (Number.isFinite(target.height) && target.height <= 0) {
    issues.push({
      path: "result.step.target.height",
      message: "Target height must be positive.",
    });
  } else if (Number.isFinite(target.height) && target.height < MIN_TARGET_SIZE_CSS_PX) {
    issues.push({
      path: "result.step.target.height",
      message: "Target height looks normalized; return CSS pixels.",
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
  options = {},
) {
  const providerRawText = truncateProviderRawText(options.providerRawText);

  if (!isObject(providerBody)) {
    return {
      mode: "unavailable",
      error: "provider returned a non-object response",
      providerName,
      providerRawText,
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
      providerName,
    };
  }

  const candidateSelection = createGuidanceResultFromCandidateSelection(
    providerBody,
    guidanceRequest,
    providerName,
  );
  const result =
    candidateSelection?.result ??
    (providerBody.mode === "real" && isObject(providerBody.result)
      ? providerBody.result
      : providerBody);
  const anchoredResult = applyCandidateAnchor(result, guidanceRequest);
  const validation = validateProviderGuidanceResult(anchoredResult, guidanceRequest);

  if (!validation.valid) {
    return {
      mode: "unavailable",
      error: "provider returned an invalid GuidanceResult",
      providerName,
      providerRawText,
      validation,
    };
  }

  return {
    mode: "real",
    providerName,
    result: anchoredResult,
    validation,
    providerRawText,
  };
}

export async function requestLocalOllamaGuidance(
  guidanceRequest,
  providerConfig,
  options = {},
) {
  const fetcher = options.fetchImpl ?? fetch;
  const timeoutMs = Number(options.timeoutMs ?? resolveProviderTimeoutMs(options.env));
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);
  let responseText = "";

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
      signal: abortController.signal,
    });

    if (!response.ok) {
      return {
        mode: "unavailable",
        error: `local Ollama returned ${response.status} ${response.statusText}`,
        providerName: providerConfig.providerName,
      };
    }

    const body = await response.json();
    responseText =
      typeof body.response === "string" ? body.response : JSON.stringify(body);
    const providerBody = extractJsonObject(responseText);

    return normalizeProviderGuidanceResponse(
      providerBody,
      guidanceRequest,
      providerConfig.providerName,
      { providerRawText: responseText },
    );
  } catch (error) {
    return {
      mode: "unavailable",
      error:
        error instanceof Error && error.name === "AbortError"
          ? `local Ollama timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error),
      providerName: providerConfig.providerName,
      providerRawText: truncateProviderRawText(responseText),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createFreeLlmApiRequest(guidanceRequest, providerConfig) {
  const screenshot = guidanceRequest.screen.screenshotPayload;
  const imageFormat =
    typeof screenshot.format === "string" && screenshot.format.trim().length > 0
      ? screenshot.format.trim()
      : "png";

  return {
    model: providerConfig.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are Toki, a desktop screen guidance assistant. Return only strict JSON.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: createOllamaPrompt(guidanceRequest),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/${imageFormat};base64,${screenshot.imageBase64}`,
            },
          },
        ],
      },
    ],
  };
}

function extractOpenAiCompatibleMessageText(body) {
  const content = body?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (isObject(part) && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  if (typeof body?.output_text === "string") {
    return body.output_text;
  }

  return JSON.stringify(body);
}

function formatProviderError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : null;

  if (!isObject(cause)) {
    return message;
  }

  const causeCode = typeof cause.code === "string" ? cause.code : "";
  const causeMessage = typeof cause.message === "string" ? cause.message : "";
  const causeText = [causeCode, causeMessage].filter(Boolean).join(": ");

  return causeText.length > 0 ? `${message} (${causeText})` : message;
}

export async function requestFreeLlmApiGuidance(
  guidanceRequest,
  providerConfig,
  options = {},
) {
  const fetcher = options.fetchImpl ?? fetch;
  const timeoutMs = Number(options.timeoutMs ?? resolveProviderTimeoutMs(options.env));
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);
  let responseText = "";

  try {
    const response = await fetcher(providerConfig.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(providerConfig.apiKey.length > 0
          ? { authorization: `Bearer ${providerConfig.apiKey}` }
          : {}),
      },
      body: JSON.stringify(createFreeLlmApiRequest(guidanceRequest, providerConfig)),
      signal: abortController.signal,
    });

    if (!response.ok) {
      return {
        mode: "unavailable",
        error: `FreeLLMAPI returned ${response.status} ${response.statusText}`,
        providerName: providerConfig.providerName,
      };
    }

    const body = await response.json();
    responseText = extractOpenAiCompatibleMessageText(body);
    const providerBody = extractJsonObject(responseText);

    return normalizeProviderGuidanceResponse(
      providerBody,
      guidanceRequest,
      providerConfig.providerName,
      { providerRawText: responseText },
    );
  } catch (error) {
    return {
      mode: "unavailable",
      error:
        error instanceof Error && error.name === "AbortError"
          ? `FreeLLMAPI timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? formatProviderError(error)
            : String(error),
      providerName: providerConfig.providerName,
      providerRawText: truncateProviderRawText(responseText),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleGuidanceSmokeRequest(request, response, options = {}) {
  const providerConfig = resolveGuidanceProviderConfig(options.env);

  console.log(`[http] ${request.method} ${request.url}`);

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

  if (request.url === "/api/browser-candidates/latest") {
    if (request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        payload: latestBrowserCandidatePayload,
      });
      return;
    }

    if (request.method === "POST") {
      let payload;

      try {
        payload = JSON.parse(await readRequestBody(request));
        payload = storeBrowserCandidatePayload(payload);
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        candidateCount: payload.candidates.length,
        receivedAt: payload.receivedAt,
      });
      return;
    }
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

  const candidates = getScreenCandidates(body);
  console.log(
    `[request] goal="${body.goal}" candidates=${candidates.length} source=${body.screen?.candidateSource ?? "none"}`,
  );

  if (providerConfig.provider === "local-ollama") {
    const providerResponse = await requestLocalOllamaGuidance(body, providerConfig, {
      fetchImpl: options.fetchImpl,
      env: options.env,
    });

    console.log(
      `[response] mode=${providerResponse.mode} provider=${providerResponse.providerName ?? "unknown"} target=${providerResponse.result?.step?.target?.label ?? "none"} error=${providerResponse.error ?? "none"}`,
    );

    sendJson(response, 200, providerResponse);
    return;
  }

  if (providerConfig.provider === "freellmapi-dev") {
    const providerResponse = await requestFreeLlmApiGuidance(body, providerConfig, {
      fetchImpl: options.fetchImpl,
      env: options.env,
    });

    console.log(
      `[response] mode=${providerResponse.mode} provider=${providerResponse.providerName ?? "unknown"} target=${providerResponse.result?.step?.target?.label ?? "none"} error=${providerResponse.error ?? "none"}`,
    );

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
