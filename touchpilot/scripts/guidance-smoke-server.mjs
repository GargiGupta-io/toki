import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { normalizeBrowserCandidatePayload } from "./browser-candidate-payload.mjs";

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_GUIDANCE_PROVIDER = "unavailable";
const DEFAULT_FREELLMAPI_ENDPOINT = "http://127.0.0.1:3001/v1/chat/completions";
const DEFAULT_FREELLMAPI_MODEL = "auto";
const MAX_PROVIDER_RAW_TEXT_CHARS = 2000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 90_000;
const MIN_TARGET_SIZE_CSS_PX = 4;
const MAX_SCREEN_CANDIDATES = 20;
/*
 * Chosen by measurement, not by tier name.
 *
 * The obvious default from memory, `gemini-2.0-flash`, is shut down: it answers
 * 404, which reads as a bad key rather than a retired model.
 *
 * Between the two live candidates, measured on a real screenshot with known
 * button positions: `gemini-3.6-flash` took 2.6s to 21s and exhausted the free
 * tier's per-minute quota after three questions. `gemini-3.5-flash-lite` took
 * 1.3s to 2.0s, located every control to within a pixel, and classified the
 * destructive action correctly every time.
 *
 * Lite is a little quicker to call something risky than it needs to be -- one
 * run in five asked for confirmation on a harmless export. That is the safe
 * direction to be wrong in, and the wrong direction never appeared.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const SUPPORTED_GUIDANCE_PROVIDERS = new Set([
  "unavailable",
  "freellmapi-dev",
  "gemini-dev",
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

  if (provider === "gemini-dev") {
    return {
      provider,
      providerName: "gemini-dev",
      apiKey: String(env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? "").trim(),
      model: String(env.TOKI_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim(),
    };
  }

  return {
    provider: "unavailable",
    providerName: "dev-smoke-server",
    error:
      "dev guidance smoke server is running, but no real provider is wired yet",
  };
}

function createProviderPrompt(request) {
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
    '  "providerName": "configured-provider",',
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
            text: createProviderPrompt(guidanceRequest),
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

/**
 * Guidance from the Claude CLI already installed on this machine.
 *
 * Vision costs money, and there is no budget for it here, so development had
 * nothing to look at screenshots with -- the service answered "no vision
 * credentials configured" and every real command stopped there. A Claude Code
 * subscription is already paid for and includes the CLI, so this spends nothing
 * further.
 *
 * It runs in this script and never in the app. macOS attributes permissions to
 * the responsible process, so a binary launched by Toki would inherit Toki's
 * camera, microphone, and screen recording grants -- which is why lib.rs is
 * forbidden from executing anything it had to go looking for. Here the CLI is
 * started by a developer, from their own terminal, in a script that holds none
 * of those grants. The desktop app's only involvement is an HTTP request to
 * localhost, exactly as with the other dev provider.
 *
 * The screenshot goes to a file because the CLI reads images from disk. It is
 * written with an unpredictable name inside the system temp directory and
 * removed in a finally, so a crashed request cannot leave a picture of
 * somebody's screen lying around under a name another process could guess.
 */
/*
 * The routes the desktop app actually calls.
 *
 * There are two protocols here. The older one is a single POST to
 * /api/guidance/smoke carrying the whole guidance request, and it is what the
 * smoke scripts drive. The app itself speaks the newer one, which is the shape
 * of the real service: it treats the configured endpoint as an origin and posts
 * to /account and /vision beneath it. Pointing the app at the smoke path just
 * produced "route not found", because the path was never used -- only the host.
 *
 * Serving the newer shape too is what makes this a stand-in for the service
 * rather than a separate thing that happens to answer: the same request the app
 * would send to production, answered locally.
 */
/**
 * Strip a JSON Schema down to what Gemini accepts.
 *
 * It takes an OpenAPI subset, not full JSON Schema: `$schema`, `additionalProperties`,
 * `minimum`, `maximum` and friends are rejected outright rather than ignored,
 * which turns a working schema into a 400 for a field nobody was relying on.
 */
export function toGeminiSchema(schema) {
  if (schema == null || typeof schema !== "object") {
    return undefined;
  }

  /*
   * "This or null", written as a choice rather than as a list of types.
   *
   * Gemini has no union. It spells optional-object as a flag on the object, so
   * an `anyOf` has to be collapsed into the one real branch plus `nullable`.
   *
   * Missing this did not fail loudly -- it silently returned an empty schema
   * for whichever field used `anyOf`, which in Toki's contract is `target`:
   * the only field that matters. Every other field stayed enforced, so risk
   * and confidence were always well formed while the coordinates arrived as
   * `centerX` one call, `box` the next, and absent the call after that. It
   * read as the model being unreliable rather than as never having been told.
   */
  const branches = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : null;

  if (branches) {
    const real = branches.filter((branch) => branch?.type !== "null");
    const nullable = real.length < branches.length;

    // More than one real branch cannot be expressed. Dropping the constraint
    // is safer than picking a branch and forbidding a valid answer.
    if (real.length !== 1) {
      return undefined;
    }

    const collapsed = toGeminiSchema(real[0]);

    return collapsed && nullable ? { ...collapsed, nullable: true } : collapsed;
  }

  const allowed = ["type", "description", "enum", "nullable", "format"];
  const out = {};

  for (const key of allowed) {
    if (schema[key] !== undefined) {
      out[key] = schema[key];
    }
  }

  // Gemini spells the union of "object or null" as a flag, not as a type array.
  if (Array.isArray(schema.type)) {
    out.type = schema.type.find((entry) => entry !== "null") ?? "string";
    if (schema.type.includes("null")) {
      out.nullable = true;
    }
  }

  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, value]) => [
        name,
        toGeminiSchema(value),
      ]),
    );
  }

  if (schema.items) {
    out.items = toGeminiSchema(schema.items);
  }

  if (Array.isArray(schema.required)) {
    out.required = schema.required;
  }

  return out;
}

/**
 * Guidance from Gemini, on the free tier.
 *
 * Fast where the local CLI cannot be: this is one request rather than starting
 * a whole agent, so a step costs a second or two instead of six or seven, and
 * that difference is a person standing still waiting to be told what to click.
 *
 * It also takes a response schema, which is the more interesting part. The CLI
 * had to be *asked* for a shape and repeatedly returned a different one --
 * `reason` inside `target`, `confidence` missing, `risk` answered as "low" --
 * and each misplacement was a correct answer thrown away by a different gate.
 * Here the shape is enforced by the API rather than requested in prose.
 */
export async function requestGeminiGuidance(body, providerConfig, options = {}) {
  const fetcher = options.fetchImpl ?? fetch;

  if (providerConfig.apiKey.length === 0) {
    return {
      ok: false,
      error:
        "No Gemini key. Create one free at aistudio.google.com/apikey, then start the server with GEMINI_API_KEY set.",
    };
  }

  const schema = toGeminiSchema(body.outputSchema);
  const request = {
    contents: [
      {
        parts: [
          { text: body.prompt },
          {
            inline_data: {
              mime_type: body.imageFormat === "jpeg" ? "image/jpeg" : "image/png",
              data: body.imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      /*
       * As little deliberation as the model allows.
       *
       * Measured on a real screenshot at the default setting: 4.5s, 6.5s and
       * 13.2s for three questions -- a person stood in front of their own
       * screen for all of it, and the slowest case worse than the CLI this
       * replaced. The task is recognition, not reasoning: point at the control
       * that matches this sentence. Thinking cannot be turned off on these
       * models; minimal is the floor.
       */
      thinkingConfig: { thinkingLevel: "minimal" },
      ...(schema ? { responseSchema: schema } : {}),
    },
  };

  try {
    const response = await fetcher(
      `${GEMINI_ENDPOINT}/${providerConfig.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // In the header, not the query string: a key in a URL ends up in
          // logs, in proxies, and in anything that records where a request went.
          "x-goog-api-key": providerConfig.apiKey,
        },
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      // The free tier allows only a few questions a minute, and running into
      // that is a wait rather than a fault. Reporting it as "guidance
      // unavailable" sends somebody to check their key, which is fine.
      if (response.status === 429) {
        return {
          ok: false,
          error:
            "That was too many questions at once for the free tier. Give it a minute and ask again.",
        };
      }

      return {
        ok: false,
        error: `Gemini returned ${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      };
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text ?? "")
      .join("")
      .trim();

    if (!text) {
      // A blocked or empty candidate. Saying so beats handing "" to a parser
      // and reporting whatever it makes of it.
      const reason =
        payload?.candidates?.[0]?.finishReason ??
        payload?.promptFeedback?.blockReason ??
        "no content";
      return { ok: false, error: `Gemini returned nothing (${reason})` };
    }

    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: formatProviderError(error) };
  }
}

export async function handleHostedVisionRequest(body, providerConfig, options = {}) {
  if (typeof body?.prompt !== "string" || body.prompt.trim().length === 0) {
    return { status: 400, body: { error: "prompt is required" } };
  }

  if (typeof body?.imageBase64 !== "string" || body.imageBase64.length === 0) {
    return { status: 400, body: { error: "imageBase64 is required" } };
  }

  const answer = await requestGeminiGuidance(body, providerConfig, {
    fetchImpl: options.fetchImpl,
  });

  if (!answer.ok) {
    // 200 with an error, not 500. The desktop reads a non-200 as the service
    // being unreachable; this one answered, and what it has to say is why it
    // could not help.
    return {
      status: 200,
      body: { error: answer.error, providerName: providerConfig.providerName },
    };
  }

  return {
    status: 200,
    body: { rawAnswer: answer.text, providerName: providerConfig.providerName },
  };
}

/*
 * A developer's account, always entitled.
 *
 * The real service reads this from Stripe. Locally there is no subscription to
 * read and no payment to take, and a dev build that refused to run because it
 * could not confirm a plan would be checking something nobody is charging for.
 * Not reachable from a production build: it only answers on localhost, and only
 * while somebody has deliberately started this script.
 */
export function developerAccountState() {
  return {
    email: "developer@localhost",
    tier: "pro",
    status: "active",
    currentPeriodEnd: null,
    entitled: true,
    hasBillingAccount: false,
  };
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

  if (request.method === "POST" && request.url === "/account") {
    sendJson(response, 200, developerAccountState());
    return;
  }

  if (request.method === "POST" && request.url === "/vision") {
    let visionBody;

    try {
      visionBody = JSON.parse(await readRequestBody(request));
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (providerConfig.provider !== "gemini-dev") {
      sendJson(response, 200, {
        error:
          providerConfig.error ??
          `provider "${providerConfig.provider}" does not serve /vision; start with npm run guidance:smoke:gemini`,
        providerName: providerConfig.providerName,
      });
      return;
    }

    const reply = await handleHostedVisionRequest(visionBody, providerConfig, {
      fetchImpl: options.fetchImpl,
      env: options.env,
    });

    // The answer itself, not just its length. When the model declines to look
    // at the screenshot it says so in here, and a character count does not.
    console.log(
      `[vision] image=${Math.round((visionBody.imageBase64?.length ?? 0) / 1365)}KB ${
        reply.body.rawAnswer
          ? `answer=${truncateProviderRawText(reply.body.rawAnswer)}`
          : `error=${reply.body.error}`
      }`,
    );

    sendJson(response, reply.status, reply.body);
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

  const candidates = getScreenCandidates(body);
  console.log(
    `[request] goal="${body.goal}" candidates=${candidates.length} source=${body.screen?.candidateSource ?? "none"}`,
  );

  if (providerConfig.provider === "freellmapi-dev") {
    const providerResponse = await requestFreeLlmApiGuidance(
      body,
      providerConfig,
      {
        fetchImpl: options.fetchImpl,
        env: options.env,
      },
    );

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
