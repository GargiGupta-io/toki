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

  const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;

  return normalizeVisionTargetShape(parsed);
}

/**
 * Put every field where this app expects it, wherever the model put it.
 *
 * The schema says `target` holds the box, its label and its candidate id, and
 * that `confidence`, `reason` and `risk` sit beside it. Models treat that as a
 * suggestion. One provider returned four different arrangements in one evening:
 * reason inside the target, then confidence inside it too, then the label and
 * candidate id lifted out of it.
 *
 * Every one of those was a correct, confident answer, and every one was thrown
 * away -- each by a different gate further down, which made one problem look
 * like four unrelated ones. A nested reason left an icon-only control with no
 * evidence and read as "the screen does not match". A nested confidence parsed
 * to NaN, which is not below the low-confidence threshold, and so came out as
 * "invalid target". A lifted label left the target anonymous.
 *
 * Fixing the fields one at a time was the mistake. This reads each from either
 * level, so the arrangement stops mattering. What is deliberately not done is
 * inventing anything: a field absent from both levels stays absent, and a value
 * the model put where the schema asked for it always wins.
 */
export function normalizeVisionTargetShape(
  parsed: Record<string, unknown>,
): VisionTargetResponse {
  const target = (
    parsed.target != null && typeof parsed.target === "object"
      ? { ...(parsed.target as Record<string, unknown>) }
      : null
  ) as (Record<string, unknown> & Partial<VisionTarget>) | null;

  const firstString = (...values: unknown[]) =>
    values.find(
      (value) => typeof value === "string" && value.trim().length > 0,
    ) as string | undefined;
  const firstNumber = (...values: unknown[]) =>
    values.find((value) => Number.isFinite(Number(value))) as number | undefined;

  if (target != null) {
    // Down into the target: what names and identifies the control belongs with
    // the control.
    // Falling back to what was already there, so an explicitly empty candidate
    // id -- which is how a coordinate-only target says it matched no candidate
    // -- stays an empty string rather than quietly becoming absent.
    target.candidateId =
      firstString(target.candidateId, parsed.candidateId) ?? target.candidateId;
    target.label = firstString(target.label, parsed.label) ?? target.label;

    for (const key of ["centerX", "centerY", "width", "height", "x", "y"]) {
      const value = firstNumber(target[key], parsed[key]);
      if (value !== undefined) {
        target[key] = value;
      }
    }
  }

  // Up out of the target: these describe the answer, not the control.
  const reason = firstString(parsed.reason, target?.reason);
  const risk = firstString(parsed.risk, target?.risk);
  const confidence = firstNumber(parsed.confidence, target?.confidence);

  return {
    ...(parsed as VisionTargetResponse),
    target: target as VisionTarget | null,
    ...(reason === undefined ? {} : { reason }),
    ...(risk === undefined ? {} : { risk: risk as VisionTargetResponse["risk"] }),
    ...(confidence === undefined ? {} : { confidence }),
  };
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
    "",
    // Said explicitly because it is the single thing most often got wrong.
    // The parser now accepts either arrangement, but an answer in the shape
    // that was asked for needs no repair and cannot be repaired incorrectly.
    "Put candidateId and label INSIDE target. Put confidence, reason and risk OUTSIDE target, at the top level. Do not nest them in target.",
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
      /*
       * Say what happened, in the order it is useful.
       *
       * This led with "Vision confidence was too low (20%)" and put the model's
       * own sentence after it. The panel truncates, so the number survived and
       * the explanation did not -- and the number is the one part that helps
       * nobody. A person reading "confidence was too low" learns that something
       * inside Toki is unsure; the model had actually said the control was not
       * visible or expanded, which says exactly what to do about it.
       *
       * What Toki heard comes first, because when it is wrong that is the whole
       * answer and nothing after it matters. A request for the "quote reply"
       * option was transcribed as "code reply", and the model then correctly
       * reported that no such thing was on screen -- which reads as vision
       * failing when nothing about vision failed.
       */
      const heard = request.goal?.trim();
      const asked = heard ? `"${heard}"` : "that";

      /*
       * "Not there" and "not sure" are different answers.
       *
       * Both used to come out as "Vision confidence was too low (20%)", which
       * is Toki reporting its own internal number for two unrelated situations
       * -- and it invites the fix of lowering the number, which makes it point
       * at something random instead.
       *
       * A model that returns no target at all is not uncertain. It is telling
       * you the control is not currently rendered: inside a closed menu, a
       * collapsed section, below the fold, or behind a hover. That is the
       * commonest way a request fails and it is not a fault in anything -- Toki
       * can only see what is on the screen at the moment it looks.
       *
       * A model that returns a target it does not believe in is the other case,
       * and there the number is the point.
       */
      const message =
        step == null
          ? `I can't see ${asked} on screen. It may be inside a menu or section that isn't open.`
          : `I'm not sure enough about ${asked} to point at it.`;

      return {
        mode: "unavailable",
        error:
          confidence < 0.45
            ? [message, result.summary]
                .filter((part) => part && part.trim().length > 0)
                .join(" ")
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
