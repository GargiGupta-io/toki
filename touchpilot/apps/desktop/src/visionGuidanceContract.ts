import {
  requiresTargetRevealAcknowledgment,
  validateGuidanceResult,
} from "@toki/ai";
import type {
  GuidanceProviderMode,
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

export type VisionTarget = {
  candidateId?: string;
  x?: number;
  y?: number;
  centerX?: number;
  centerY?: number;
  width?: number;
  height?: number;
  label?: string;
};

export type VisionTargetResponse = {
  target?: VisionTarget | null;
  confidence?: number;
  reason?: string;
  risk?: RiskClass;
};

type VisionDebugTrace = NonNullable<GuidanceProviderResponse["debug"]>["vision"];

const DEFAULT_TARGET_SIZE = 44;
const VISION_TARGET_ID = "vision-model-target";

export const VISION_TARGET_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["target", "confidence", "reason", "risk"],
  properties: {
    target: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "candidateId",
            "centerX",
            "centerY",
            "width",
            "height",
            "label",
          ],
          properties: {
            candidateId: { type: "string" },
            centerX: { type: "number" },
            centerY: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
            label: { type: "string" },
          },
        },
      ],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
    risk: {
      type: "string",
      enum: [
        "safe_navigation",
        "form_entry",
        "external_send",
        "delete",
        "payment",
        "security_change",
        "account_change",
        "permission_change",
        "unknown_risky",
      ],
    },
  },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

export function parseVisionTargetResponse(text: string): VisionTargetResponse {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("vision provider did not return a JSON object");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as VisionTargetResponse;
}

export function resolveVisionTargetToDisplay(
  target: VisionTarget,
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

  if (candidate != null) {
    const mappedBeforeTighten: TargetBox = {
      candidateId: candidate.id,
      label: candidate.label,
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
    };

    return {
      target: mappedBeforeTighten,
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
    candidateId: candidateId || VISION_TARGET_ID,
    label: target.label?.trim() || "Unlabeled target",
    ...mapping.displayRect,
  };

  return {
    target: mappedBeforeTighten,
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

export function createVisionLocalizationPrompt(request: GuidanceRequest) {
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
    "You are the visual targeting component for Toki, a cursor guidance assistant.",
    "Do not use tools or inspect the filesystem. Analyze the attached screenshot and respond immediately.",
    "You are a target localizer, not a task planner.",
    "Use the original task only as context. Locate one control for the current step objective and do not invent or jump to a later step.",
    "Return only the JSON object required by the output schema.",
    "Use the attached current screenshot as primary evidence. OCR/accessibility/browser candidates are optional supporting evidence, not a requirement.",
    "If the requested control is not visibly present or its location is ambiguous, return target as null and confidence below 0.45.",
    "Do not lower confidence merely because a visible control has no matching candidate id.",
    "",
    `Original task: ${originalGoal}`,
    `Current step objective: ${localizationObjective}`,
    `Screenshot image size: ${screenshotSize}`,
    `Toki display coordinate size: ${displaySize}`,
    regionInstruction,
    "",
    "Return target coordinates in attached-image pixels, not display pixels.",
    "Use centerX and centerY for the exact click point at the center of the intended control.",
    "Use width and height for a tight clickable box around that center point.",
    "For icon controls, return a small box around the icon center, not the surrounding row, label, artwork, or nearby text.",
    "Prefer controls inside the active application content over system UI or unrelated windows.",
    "The label must name the actual control and must never be blank or generic.",
    "",
    "Current supporting OCR/accessibility/browser candidates:",
    getTopCandidateSummary(request),
    "",
    "If one candidate is the exact control, copy its candidate id exactly.",
    "Do not invent candidate ids. If no exact candidate exists but the control is visually unambiguous in the current screenshot, use an empty candidate id and return its precise image coordinates.",
    "A visually grounded coordinate-only target must have a specific semantic label, a reason describing the visible evidence, and confidence at or above 0.72.",
  ].join("\n");
}

export function createVisionGuidanceResponse(
  rawAnswer: string,
  request: GuidanceRequest,
  providerName: string,
  mode: GuidanceProviderMode,
): GuidanceProviderResponse {
  try {
    const parsed = parseVisionTargetResponse(rawAnswer);
    const confidence = clamp(Number(parsed.confidence), 0, 1);
    const providerOutput = {
      rawAnswer,
      label: parsed.target?.label,
      reason: parsed.reason,
      confidence,
      risk: parsed.risk,
      target: parsed.target ?? undefined,
    };
    const mapped =
      parsed.target == null
        ? undefined
        : resolveVisionTargetToDisplay(parsed.target, request);
    const target = mapped?.target;
    const debug = {
      providerOutput,
      vision: mapped?.debug,
    };

    if (target != null && isLikelySystemMenuTarget(target, request)) {
      return {
        mode: "unavailable",
        error: `Vision provider chose the macOS menu bar (${target.label}); rejected because the command targets active-app content.`,
        providerName,
        debug,
      };
    }

    const risk = parsed.risk ?? "safe_navigation";
    const step: GuidanceStep | undefined =
      target == null
        ? undefined
        : {
            instruction: `Click ${target.label}.`,
            target,
            confidence,
            risk,
            requiresConfirmation: requiresTargetRevealAcknowledgment(risk),
          };
    const result: GuidanceResult = {
      mode: step == null || confidence < 0.45 ? "clarify" : "guide",
      summary:
        parsed.reason?.trim() ||
        (step == null
          ? "The vision provider could not identify a grounded target."
          : `Vision provider selected ${target?.label ?? "a target"}.`),
      step,
    };
    const validation = validateGuidanceResult(result);

    if (!validation.valid || result.mode !== "guide") {
      return {
        mode: "unavailable",
        error:
          confidence < 0.45
            ? `Vision confidence was too low (${Math.round(confidence * 100)}%). ${result.summary}`
            : "Vision provider returned an invalid target.",
        validation,
        providerName,
        debug,
      };
    }

    return {
      mode,
      result,
      validation,
      providerName,
      debug,
    };
  } catch (error) {
    return {
      mode: "unavailable",
      error: error instanceof Error ? error.message : String(error),
      providerName,
      debug: {
        providerOutput: {
          rawAnswer,
        },
      },
    };
  }
}
