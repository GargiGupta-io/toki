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
import {
  mapDisplayRectToProviderImage,
  mapProviderTargetToDisplay,
} from "./coordinateTransforms";
import { getGuidanceLocalizationObjective } from "./guidanceTaskPlanning";

type OllamaGenerateResponse = {
  response?: string;
  error?: string;
};

type OllamaTargetResponse = {
  target?: {
    candidateId?: string;
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
  const goal = normalizeText(getGuidanceLocalizationObjective(request));
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
  const goal = normalizeText(getGuidanceLocalizationObjective(request));
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

  return mapDisplayRectToProviderImage(candidate, {
    display: request.screen.display,
    screenshot: {
      width: screenshot.imageWidth,
      height: screenshot.imageHeight,
    },
    providerImage: {
      width: payload.imageWidth,
      height: payload.imageHeight,
    },
    crop: payload.crop,
  });
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
      return `${index + 1}. id ${JSON.stringify(candidate.id)}: "${candidate.label}" ${candidate.role}/${candidate.source ?? "unknown"} at ${imageBoxText} (${score})`;
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

export function resolveOllamaTargetToDisplay(
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

  const crop = payload.crop;
  const candidateId = target.candidateId?.trim();
  const candidate = candidateId
    ? request.screen.candidates?.find((item) => item.id === candidateId)
    : undefined;

  if (candidateId && candidate == null) {
    throw new Error(
      `vision model selected candidate ${candidateId}, but that candidate is not present in the current screen evidence`,
    );
  }

  if (candidate != null) {
    const mappedBeforeTighten: TargetBox = {
      candidateId: candidate.id,
      label: candidate.label,
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
    };
    const mappedFinal = tightenTargetToClickCenter(mappedBeforeTighten, request);

    return {
      target: mappedFinal,
      debug: {
        coordinateMode: "candidate",
        rawTarget: {
          candidateId,
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
        mappedBeforeTighten,
        mappedFinal,
      },
    };
  }

  const mapping = mapProviderTargetToDisplay(
    target,
    {
      display: request.screen.display,
      screenshot: {
        width: request.screen.screenshot.imageWidth,
        height: request.screen.screenshot.imageHeight,
      },
      providerImage: {
        width: payload.imageWidth,
        height: payload.imageHeight,
      },
      crop,
    },
    {
      defaultTargetSize: DEFAULT_TARGET_SIZE,
      minimumDisplayTargetSize: 16,
    },
  );

  const mappedBeforeTighten: TargetBox = {
    candidateId: "ollama-vision-target",
    label: target.label?.trim() || "Vision target",
    ...mapping.displayRect,
  };
  const mappedFinal = tightenTargetToClickCenter(mappedBeforeTighten, request);

  return {
    target: mappedFinal,
    debug: {
      coordinateMode: mapping.coordinateMode,
      rawTarget: {
        candidateId: target.candidateId,
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
        imageToScreenshotX: mapping.scale.imageToScreenshotX,
        imageToScreenshotY: mapping.scale.imageToScreenshotY,
        screenshotToDisplayX: mapping.scale.screenshotToDisplayX,
        screenshotToDisplayY: mapping.scale.screenshotToDisplayY,
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

  const goal = getGuidanceLocalizationObjective(request).toLowerCase();
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

export function createOllamaLocalizationPrompt(request: GuidanceRequest) {
  const payload = request.screen.screenshotPayload;
  const screenshotSize = payload
    ? `${payload.imageWidth}x${payload.imageHeight}`
    : "missing";
  const displaySize = `${request.screen.display.width}x${request.screen.display.height}`;
  const crop = payload?.crop;
  const originalGoal = request.localization?.originalGoal ?? request.goal;
  const localizationObjective = getGuidanceLocalizationObjective(request);
  const regionInstruction =
    crop == null
      ? "The image is the full display. Ignore the macOS menu bar, dock, desktop icons, browser tabs/address bar, and app chrome unless the user explicitly asks for those controls. Prefer the largest active app content area."
      : `The image is cropped to the active app window${crop.appName ? ` (${crop.appName})` : ""}${crop.title ? ` titled "${crop.title}"` : ""}. Do not choose targets outside this app window.`;

  return [
    "You are the visual targeting brain for Toki, a cursor guidance assistant.",
    "You are a target localizer, not a task planner.",
    "Use the original task only as context. Locate one control for the current step objective and do not invent or jump to a later step.",
    "Look at the screenshot and pick the exact UI target the user should click for the current step.",
    "Return only one JSON object. Do not include markdown, commentary, or extra text.",
    "",
    `Original task: ${originalGoal}`,
    `Current step objective: ${localizationObjective}`,
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
    "If one candidate is the exact control, copy its candidate id into target.candidateId exactly. Toki will use that candidate's verified display geometry instead of guessed coordinates.",
    "Do not invent a candidate id. If no candidate is an exact match, leave candidateId empty and use screenshot-image coordinates for a visual-only target.",
    "Candidate-backed targets are preferred for labeled controls. Coordinate-only targets remain valid for icon-only controls that are missing from the candidate list.",
    "",
    "Return exactly this JSON shape, replacing every placeholder value with the actual target:",
    JSON.stringify({
      target: {
        candidateId: "",
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
        prompt: createOllamaLocalizationPrompt(request),
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
    const claimedCandidateId = parsed.target?.candidateId?.trim();
    if (
      parsed.target != null &&
      !claimedCandidateId &&
      isPlaceholderTargetLabel(parsed.target.label)
    ) {
      return {
        mode: "unavailable",
        error: `Ollama vision returned a placeholder target label (${parsed.target.label}); rejected instead of drawing a fake target.`,
        providerName: `ollama-vision:${model}`,
      };
    }
    const confidence = clamp(Number(parsed.confidence), 0, 1);
    const mapped =
      parsed.target == null
        ? undefined
        : resolveOllamaTargetToDisplay(parsed.target, request);
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
