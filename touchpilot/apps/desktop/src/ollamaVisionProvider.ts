import { validateGuidanceResult } from "@toki/ai";
import type {
  GuidanceProviderResponse,
  GuidanceRequest,
  GuidanceResult,
  GuidanceStep,
  RiskClass,
  ScreenCandidate,
  TargetBox,
} from "@toki/shared";

type OllamaGenerateResponse = {
  response?: string;
  error?: string;
};

type OllamaTargetResponse = {
  target?: {
    x?: number;
    y?: number;
    centerX?: number;
    centerY?: number;
    width?: number;
    height?: number;
    label?: string;
  };
  confidence?: number;
  reason?: string;
  risk?: RiskClass;
};

type VisionDebugTrace = NonNullable<GuidanceProviderResponse["debug"]>["vision"];

export type OllamaVisionOptions = {
  endpoint?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434/api/generate";
const DEFAULT_OLLAMA_MODEL = "qwen2.5vl:3b";
const DEFAULT_TARGET_SIZE = 44;
const DEFAULT_TIMEOUT_MS = 20_000;
const CLICK_CENTER_TARGET_SIZE = 44;

const PLACEHOLDER_LABELS = new Set([
  "button label or visual description",
  "button label",
  "exact visible target",
  "visible control",
  "visible target control",
  "visual description",
  "target",
  "ui target",
  "vision target",
]);

const CLICK_CENTER_TERMS = [
  "add",
  "create",
  "new",
  "plus",
  "invite",
  "collaborator",
  "share",
  "play",
  "pause",
  "next",
  "previous",
  "skip",
  "search",
  "download",
  "upload",
  "open",
  "close",
  "button",
  "icon",
  "control",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function isPlaceholderTargetLabel(label: string | undefined) {
  const normalized = normalizeText(label);

  return (
    PLACEHOLDER_LABELS.has(normalized) ||
    normalized.includes("visual description") ||
    normalized.includes("button label")
  );
}

function isAddIntent(goal: string) {
  return includesAny(goal, [
    "add",
    "create",
    "make",
    "new",
    "plus",
    "invite",
    "collaborator",
    "collaborators",
    "member",
    "members",
    "share",
  ]);
}

function isMediaIntent(goal: string) {
  return includesAny(goal, [
    "play",
    "pause",
    "resume",
    "next",
    "previous",
    "skip",
    "song",
    "track",
    "music",
  ]);
}

function getIntentMismatch(target: TargetBox, request: GuidanceRequest, reason?: string) {
  const goal = normalizeText(request.goal);
  const targetText = normalizeText(`${target.label} ${reason ?? ""}`);
  const targetLooksAdditive = includesAny(targetText, [
    "plus",
    "add",
    "create",
    "new",
    "playlist",
    "invite",
    "collaborator",
    "member",
    "share",
  ]);
  const targetLooksMedia = includesAny(targetText, [
    "play",
    "pause",
    "next",
    "previous",
    "skip",
    "song",
    "track",
    "media",
  ]);

  if (targetLooksAdditive && !isAddIntent(goal)) {
    return `Ollama vision selected an add/create target (${target.label}) for a non-add command.`;
  }

  if (targetLooksMedia && !isMediaIntent(goal) && !isAddIntent(goal)) {
    return `Ollama vision selected a media-control target (${target.label}) for a non-media command.`;
  }

  return null;
}

function shouldTightenToClickCenter(target: TargetBox, request: GuidanceRequest) {
  const goal = normalizeText(request.goal);
  const label = normalizeText(target.label);
  const targetIsLarge = Math.max(target.width, target.height) > 56;
  const targetIsThin = Math.min(target.width, target.height) < 24;
  const intentIsClickControl = includesAny(`${goal} ${label}`, CLICK_CENTER_TERMS);

  return intentIsClickControl || targetIsLarge || targetIsThin;
}

function tightenTargetToClickCenter(target: TargetBox, request: GuidanceRequest): TargetBox {
  if (!shouldTightenToClickCenter(target, request)) {
    return target;
  }

  const size = Math.min(
    CLICK_CENTER_TARGET_SIZE,
    request.screen.display.width,
    request.screen.display.height,
  );
  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;

  return {
    ...target,
    x: Math.round(clamp(centerX - size / 2, 0, request.screen.display.width - size)),
    y: Math.round(clamp(centerY - size / 2, 0, request.screen.display.height - size)),
    width: size,
    height: size,
  };
}

function getCandidateImageBox(candidate: ScreenCandidate, request: GuidanceRequest) {
  const payload = request.screen.screenshotPayload;
  const screenshot = request.screen.screenshot;

  if (payload == null || screenshot == null) {
    return null;
  }

  const displayToScreenshotX = screenshot.imageWidth / request.screen.display.width;
  const displayToScreenshotY = screenshot.imageHeight / request.screen.display.height;
  const screenshotX = candidate.x * displayToScreenshotX;
  const screenshotY = candidate.y * displayToScreenshotY;
  const screenshotWidth = candidate.width * displayToScreenshotX;
  const screenshotHeight = candidate.height * displayToScreenshotY;

  if (payload.crop == null) {
    const imageScaleX = payload.imageWidth / screenshot.imageWidth;
    const imageScaleY = payload.imageHeight / screenshot.imageHeight;

    return {
      x: Math.round(screenshotX * imageScaleX),
      y: Math.round(screenshotY * imageScaleY),
      width: Math.round(screenshotWidth * imageScaleX),
      height: Math.round(screenshotHeight * imageScaleY),
    };
  }

  const crop = payload.crop;
  const candidateRight = screenshotX + screenshotWidth;
  const candidateBottom = screenshotY + screenshotHeight;
  const cropRight = crop.x + crop.width;
  const cropBottom = crop.y + crop.height;
  const intersects =
    candidateRight > crop.x &&
    screenshotX < cropRight &&
    candidateBottom > crop.y &&
    screenshotY < cropBottom;

  if (!intersects) {
    return null;
  }

  const imageScaleX = payload.imageWidth / crop.width;
  const imageScaleY = payload.imageHeight / crop.height;

  return {
    x: Math.round((screenshotX - crop.x) * imageScaleX),
    y: Math.round((screenshotY - crop.y) * imageScaleY),
    width: Math.round(screenshotWidth * imageScaleX),
    height: Math.round(screenshotHeight * imageScaleY),
  };
}

function getTopCandidateSummary(request: GuidanceRequest) {
  const topCandidates = request.screen.candidates?.slice(0, 12) ?? [];

  if (topCandidates.length === 0) {
    return "No OCR/accessibility candidates were available.";
  }

  return topCandidates
    .map((candidate, index) => {
      const score =
        candidate.rank == null ? "unranked" : `score ${candidate.rank.score}`;
      const imageBox = getCandidateImageBox(candidate, request);
      const imageBoxText =
        imageBox == null
          ? "outside provided image"
          : `image ${imageBox.x},${imageBox.y},${imageBox.width}x${imageBox.height}`;
      return `${index + 1}. "${candidate.label}" ${candidate.role}/${candidate.source ?? "unknown"} at ${imageBoxText} (${score})`;
    })
    .join("\n");
}

function parseJsonObject(text: string): OllamaTargetResponse {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("vision model did not return a JSON object");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as OllamaTargetResponse;
}

function mapTargetToDisplay(
  target: NonNullable<OllamaTargetResponse["target"]>,
  request: GuidanceRequest,
): { target: TargetBox; debug: VisionDebugTrace } {
  const payload = request.screen.screenshotPayload;

  if (payload == null) {
    throw new Error("screenshot payload is missing");
  }

  if (request.screen.screenshot == null) {
    throw new Error("screenshot metadata is missing");
  }

  const rawWidth = Number.isFinite(target.width) ? Number(target.width) : DEFAULT_TARGET_SIZE;
  const rawHeight = Number.isFinite(target.height) ? Number(target.height) : DEFAULT_TARGET_SIZE;
  const rawX = Number(target.x);
  const rawY = Number(target.y);
  const rawCenterX = Number(target.centerX);
  const rawCenterY = Number(target.centerY);
  const hasCenterCoordinates = Number.isFinite(rawCenterX) && Number.isFinite(rawCenterY);
  const hasTopLeftCoordinates = Number.isFinite(rawX) && Number.isFinite(rawY);

  if (!hasCenterCoordinates && !hasTopLeftCoordinates) {
    throw new Error("vision model target coordinates are missing");
  }

  const coordinateMode = hasCenterCoordinates ? "center" : "top_left";
  const targetCenterX = hasCenterCoordinates ? rawCenterX : rawX + rawWidth / 2;
  const targetCenterY = hasCenterCoordinates ? rawCenterY : rawY + rawHeight / 2;
  const targetLeft = targetCenterX - rawWidth / 2;
  const targetTop = targetCenterY - rawHeight / 2;

  if (
    targetLeft < 0 ||
    targetTop < 0 ||
    targetLeft + rawWidth > payload.imageWidth ||
    targetTop + rawHeight > payload.imageHeight
  ) {
    throw new Error(
      `vision model target is outside the provided image (${Math.round(targetLeft)}, ${Math.round(
        targetTop,
      )}, ${Math.round(rawWidth)} x ${Math.round(rawHeight)} for ${payload.imageWidth} x ${
        payload.imageHeight
      })`,
    );
  }

  const crop = payload.crop;
  const imageToScreenshotScaleX =
    crop == null
      ? request.screen.screenshot.imageWidth / payload.imageWidth
      : crop.width / payload.imageWidth;
  const imageToScreenshotScaleY =
    crop == null
      ? request.screen.screenshot.imageHeight / payload.imageHeight
      : crop.height / payload.imageHeight;
  const screenshotToDisplayScaleX =
    request.screen.display.width / request.screen.screenshot.imageWidth;
  const screenshotToDisplayScaleY =
    request.screen.display.height / request.screen.screenshot.imageHeight;
  const screenshotCenterX =
    crop == null
      ? targetCenterX * imageToScreenshotScaleX
      : crop.x + targetCenterX * imageToScreenshotScaleX;
  const screenshotCenterY =
    crop == null
      ? targetCenterY * imageToScreenshotScaleY
      : crop.y + targetCenterY * imageToScreenshotScaleY;
  const width = Math.round(
    clamp(
      rawWidth * imageToScreenshotScaleX * screenshotToDisplayScaleX,
      16,
      request.screen.display.width,
    ),
  );
  const height = Math.round(
    clamp(
      rawHeight * imageToScreenshotScaleY * screenshotToDisplayScaleY,
      16,
      request.screen.display.height,
    ),
  );
  const x = Math.round(
    clamp(
      screenshotCenterX * screenshotToDisplayScaleX - width / 2,
      0,
      request.screen.display.width - width,
    ),
  );
  const y = Math.round(
    clamp(
      screenshotCenterY * screenshotToDisplayScaleY - height / 2,
      0,
      request.screen.display.height - height,
    ),
  );

  const mappedBeforeTighten: TargetBox = {
    candidateId: "ollama-vision-target",
    label: target.label?.trim() || "Vision target",
    x,
    y,
    width,
    height,
  };
  const mappedFinal = tightenTargetToClickCenter(mappedBeforeTighten, request);

  return {
    target: mappedFinal,
    debug: {
      coordinateMode,
      rawTarget: {
        x: target.x,
        y: target.y,
        centerX: target.centerX,
        centerY: target.centerY,
        width: target.width,
        height: target.height,
        label: target.label,
      },
      payload: {
        imageWidth: payload.imageWidth,
        imageHeight: payload.imageHeight,
        crop:
          crop == null
            ? undefined
            : {
                x: crop.x,
                y: crop.y,
                width: crop.width,
                height: crop.height,
                appName: crop.appName,
                title: crop.title,
              },
      },
      screenshot: {
        imageWidth: request.screen.screenshot.imageWidth,
        imageHeight: request.screen.screenshot.imageHeight,
      },
      display: {
        width: request.screen.display.width,
        height: request.screen.display.height,
      },
      scale: {
        imageToScreenshotX: imageToScreenshotScaleX,
        imageToScreenshotY: imageToScreenshotScaleY,
        screenshotToDisplayX: screenshotToDisplayScaleX,
        screenshotToDisplayY: screenshotToDisplayScaleY,
      },
      mappedBeforeTighten,
      mappedFinal,
    },
  };
}

function isLikelySystemMenuTarget(target: TargetBox, request: GuidanceRequest) {
  if (request.screen.screenshotPayload?.crop != null) {
    return false;
  }

  const goal = request.goal.toLowerCase();
  const explicitlyMenuRelated =
    goal.includes("menu") ||
    goal.includes("menubar") ||
    goal.includes("menu bar") ||
    goal.includes("file") ||
    goal.includes("edit") ||
    goal.includes("view") ||
    goal.includes("window");

  return !explicitlyMenuRelated && target.y < 88;
}

function createPrompt(request: GuidanceRequest) {
  const payload = request.screen.screenshotPayload;
  const screenshotSize = payload
    ? `${payload.imageWidth}x${payload.imageHeight}`
    : "missing";
  const displaySize = `${request.screen.display.width}x${request.screen.display.height}`;
  const crop = payload?.crop;
  const regionInstruction =
    crop == null
      ? "The image is the full display. Ignore the macOS menu bar, dock, desktop icons, browser tabs/address bar, and app chrome unless the user explicitly asks for those controls. Prefer the largest active app content area."
      : `The image is cropped to the active app window${crop.appName ? ` (${crop.appName})` : ""}${crop.title ? ` titled "${crop.title}"` : ""}. Do not choose targets outside this app window.`;

  return [
    "You are the visual targeting brain for Toki, a cursor guidance assistant.",
    "Look at the screenshot and the user command. Pick the exact UI target the user should click next.",
    "Return only one JSON object. Do not include markdown, commentary, or extra text.",
    "",
    `User command: ${request.goal}`,
    `Screenshot image size: ${screenshotSize}`,
    `Toki display coordinate size: ${displaySize}`,
    regionInstruction,
    "",
    "Return target coordinates in the provided image pixels, not display pixels.",
    "Use centerX and centerY for the exact click point at the center of the intended control.",
    "Use width and height for a tight clickable box around that center point.",
    "Do not use top-left x/y unless centerX/centerY are impossible.",
    "For icon controls, return a small box around the icon center, not the surrounding row, label, artwork, or nearby text.",
    "If the target is an icon-only control, identify it visually from the screenshot.",
    "Prefer controls inside the active application content over system menu bars, desktop icons, docks, browser chrome, app title bars, or unrelated windows.",
    "If the full display is shown and a target is in the top system/menu region, return low confidence unless the command explicitly asks for that menu.",
    "For create/add/new commands, search for plus icons, create buttons, add buttons, and menu controls in the active app.",
    "For invite/collaborator/share commands, search for person-plus, invite, collaborator, share, or member controls in the active app.",
    "For play/pause/next/previous commands, search for media controls in the active app. Do not choose macOS traffic-light window buttons or the menu bar.",
    "Never copy placeholder labels from the schema. The label must name the actual visible control.",
    "If you cannot identify a useful target, return confidence below 0.45.",
    "",
    "Available supporting OCR/accessibility candidates:",
    getTopCandidateSummary(request),
    "",
    "Return exactly this JSON shape, replacing every placeholder value with the actual target:",
    JSON.stringify({
      target: {
        centerX: 0,
        centerY: 0,
        width: 0,
        height: 0,
        label: "",
      },
      confidence: 0,
      reason: "",
      risk: "safe_navigation",
    }),
  ].join("\n");
}

export async function requestOllamaVisionGuidance(
  request: GuidanceRequest,
  options: OllamaVisionOptions = {},
): Promise<GuidanceProviderResponse> {
  const payload = request.screen.screenshotPayload;

  if (payload == null) {
    return {
      mode: "unavailable",
      error: "Ollama vision needs a screenshot payload.",
      providerName: "ollama-vision",
    };
  }

  const endpoint = options.endpoint?.trim() || DEFAULT_OLLAMA_ENDPOINT;
  const model = options.model?.trim() || DEFAULT_OLLAMA_MODEL;
  const fetcher = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: createPrompt(request),
        images: [payload.imageBase64],
        stream: false,
        format: "json",
        options: {
          temperature: 0,
          num_predict: 512,
        },
      }),
    });
    window.clearTimeout(timeout);

    if (!response.ok) {
      return {
        mode: "unavailable",
        error: `Ollama returned ${response.status} ${response.statusText}. Install/start Ollama and pull ${model}.`,
        providerName: `ollama-vision:${model}`,
      };
    }

    const body = (await response.json()) as OllamaGenerateResponse;

    if (body.error) {
      return {
        mode: "unavailable",
        error: body.error,
        providerName: `ollama-vision:${model}`,
      };
    }

    const parsed = parseJsonObject(body.response ?? "");
    if (parsed.target != null && isPlaceholderTargetLabel(parsed.target.label)) {
      return {
        mode: "unavailable",
        error: `Ollama vision returned a placeholder target label (${parsed.target.label}); rejected instead of drawing a fake target.`,
        providerName: `ollama-vision:${model}`,
      };
    }
    const confidence = clamp(Number(parsed.confidence), 0, 1);
    const mapped = parsed.target == null ? undefined : mapTargetToDisplay(parsed.target, request);
    const target = mapped?.target;
    const debug = mapped == null ? undefined : { vision: mapped.debug };
    if (target != null && isLikelySystemMenuTarget(target, request)) {
      return {
        mode: "unavailable",
        error: `Ollama vision chose the macOS menu bar (${target.label}); rejected because the command targets the active app content.`,
        providerName: `ollama-vision:${model}`,
        debug,
      };
    }
    const intentMismatch =
      target == null ? null : getIntentMismatch(target, request, parsed.reason);
    if (intentMismatch != null) {
      return {
        mode: "unavailable",
        error: intentMismatch,
        providerName: `ollama-vision:${model}`,
        debug,
      };
    }
    const step: GuidanceStep | undefined =
      target == null
        ? undefined
        : {
            instruction: `Click ${target.label}.`,
            target,
            confidence,
            risk: parsed.risk ?? "safe_navigation",
            requiresConfirmation: false,
          };
    const result: GuidanceResult = {
      mode: step == null || confidence < 0.45 ? "clarify" : "guide",
      summary:
        parsed.reason?.trim() ||
        (step == null
          ? "The vision model could not identify a target."
          : `Vision model selected ${target?.label ?? "a target"}.`),
      step,
    };
    const validation = validateGuidanceResult(result);

    if (!validation.valid || result.mode !== "guide") {
      return {
        mode: "unavailable",
        error:
          confidence < 0.45
            ? `Ollama vision confidence was too low (${Math.round(confidence * 100)}%). ${result.summary}`
            : "Ollama vision returned an invalid target.",
        validation,
        providerName: `ollama-vision:${model}`,
        debug,
      };
    }

    return {
      mode: "ollama-vision",
      result,
      validation,
      providerName: `ollama-vision:${model}`,
      debug,
    };
  } catch (error) {
    window.clearTimeout(timeout);
    return {
      mode: "unavailable",
      error:
        error instanceof DOMException && error.name === "AbortError"
          ? `Ollama vision timed out after ${Math.round(
              (options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000,
            )}s. Use a smaller model, crop the active window, or restart Ollama.`
          : error instanceof Error
            ? error.message
            : String(error),
      providerName: `ollama-vision:${model}`,
    };
  }
}
