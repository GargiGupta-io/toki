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
  GuidanceSuggestion,
  RiskClass,
  ScreenCandidate,
  TargetBox,
} from "@toki/shared";
import {
  mapDisplayRectToProviderImage,
  mapProviderTargetToDisplay,
} from "./coordinateTransforms";
import { getGuidanceLocalizationObjective } from "./guidanceTaskPlanning";
import { isTargetOnStaticText, snapTargetToEnclosingControl } from "./targetEnclosure";
import { classifyCandidateRole, isInteractiveRole } from "./uiRoleInteractivity";

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

/**
 * Something else on screen that might be what was meant.
 *
 * Only ever offered when the answer is "not here". Somebody arriving in an
 * application for the first time does not know its vocabulary -- they ask for
 * "dark mode" in an app that calls it Appearance, or for "sign out" where the
 * only thing on screen is the account menu that contains it. Toki knew both
 * facts at that moment (it had the screen, and it had just decided the asked-for
 * thing was not on it) and said only that it could not help.
 */
export type VisionAlternative = VisionTarget & {
  /** Why this might be the thing, in the model's words, shown to the person. */
  reason?: string;
};

export type VisionTargetResponse = {
  target?: VisionTarget | null;
  alternatives?: VisionAlternative[] | null;
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
  required: ["target", "alternatives", "confidence", "reason", "risk"],
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
    /**
     * Filled only when target is null, and empty otherwise.
     *
     * Required rather than optional, because a field a model may omit is a
     * field it will omit. An empty array is a real answer -- "nothing on this
     * screen is close" -- and is different from having not been asked.
     */
    alternatives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidateId",
          "centerX",
          "centerY",
          "width",
          "height",
          "label",
          "reason",
        ],
        properties: {
          candidateId: { type: "string" },
          centerX: { type: "number" },
          centerY: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          label: { type: "string" },
          reason: { type: "string" },
        },
      },
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
      /*
       * Said in words the model will act on, not only as a role name.
       *
       * `AXStaticText` and `AXRadioButton` were both being handed over as
       * opaque strings, and a model given "here is some evidence" reasonably
       * treats every line of it as a thing it may point at. Naming the one
       * distinction that decides whether a click does anything costs a few
       * characters per line.
       */
      const kind = classifyCandidateRole(candidate.role);
      const kindText =
        kind === "interactive"
          ? "CLICKABLE"
          : kind === "text"
            ? "TEXT ONLY - never a target"
            : kind === "container"
              ? "container"
              : "unknown";
      return `${index + 1}. id ${JSON.stringify(candidate.id)}: "${candidate.label}" [${kindText}] ${candidate.role}/${candidate.source ?? "unknown"} at ${imageBoxText} (${score})`;
    })
    .join("\n");
}

/**
 * The best controls Toki can see, when it has had to refuse.
 *
 * Built from the evidence already collected rather than from a second question
 * to the model, because this runs at the moment an answer has been thrown away
 * and asking again would double what somebody is waiting for.
 *
 * Only candidates that earned their rank by matching the request are offered.
 * Everything on screen scores about the same as a plausible control, so without
 * that filter this becomes a list of whatever happened to sort first -- which
 * is not a suggestion, it is noise with numbers in front of it.
 */
function suggestInteractiveCandidates(
  request: GuidanceRequest,
  limit = 3,
): GuidanceSuggestion[] {
  const seen = new Set<string>();
  const offers: GuidanceSuggestion[] = [];

  for (const candidate of request.screen.candidates ?? []) {
    if ((candidate.rank?.relevance ?? 0) <= 0 || !isInteractiveRole(candidate.role)) {
      continue;
    }

    const key = candidate.label.trim().toLowerCase();

    if (key.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    offers.push({
      target: {
        candidateId: candidate.id,
        label: candidate.label,
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
      },
    });

    if (offers.length >= limit) {
      break;
    }
  }

  return offers;
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
      target: snapTargetToEnclosingControl(
        mappedBeforeTighten,
        request.screen.candidates,
        request.screen.display,
      ).target,
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
    target: snapTargetToEnclosingControl(
      mappedBeforeTighten,
      request.screen.candidates,
      request.screen.display,
    ).target,
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
    /*
     * The part of the answer that is useful when the answer is no.
     *
     * Somebody new to an application asks for it in their own words, and the
     * application has its own: "dark mode" where the control says Appearance,
     * "sign out" where the screen shows only the account menu that contains
     * it. At the moment the model decides the asked-for thing is absent it is
     * looking at the screen that would answer the question, and throwing that
     * away to return a bare refusal wastes the one call that was made.
     *
     * Capped at three. A list of everything on screen is not a suggestion, it
     * is the screen again, and choosing from it is more work than looking.
     *
     * Bounded to what is really there and really related, because a wrong
     * suggestion is worse than none: it sends somebody to click something they
     * did not ask for, in an application they do not yet know.
     */
    "When target is null, fill alternatives with up to 3 controls that ARE visible and are the closest in purpose to what was asked -- including a menu or section that would plausibly contain it.",
    "Each alternative needs a reason written to the user in one short sentence, saying what it does and why it might be what they meant.",
    "Offer nothing rather than something unrelated. Return alternatives as an empty array when nothing on screen is close.",
    "When target is not null, alternatives must be an empty array.",
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
    /*
     * The two rules that would have prevented the worst answer this has given.
     *
     * Asked to open Xcode's Issue Navigator -- a panel that was already open --
     * it returned a box around three lines of the build error inside that
     * panel. Both mistakes at once: it pointed at prose, and it pointed at the
     * contents of the thing rather than at the control that opens it.
     *
     * Written as prohibitions with examples because "locate the control" is
     * already implied by every other line here, and was not enough.
     */
    "NEVER target static text: error messages, log or console output, code, headings, paragraph text, status lines, or a label sitting beside a control. These do nothing when clicked. If what was asked for appears on screen only as text, return target as null.",
    "To open, show, switch to or go to a panel, view, navigator, inspector, sidebar, tab or section, target the control that switches to it -- the tab, toolbar icon or menu item -- and never the area it displays or anything inside that area.",
    "A candidate marked TEXT ONLY must never be chosen, and must never be the basis for coordinates. Candidates marked CLICKABLE are the ones worth pointing at.",
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

/**
 * Turn the model's "you might have meant these" into things Toki can point at.
 *
 * Each one goes through exactly the same mapping as a real target, so an
 * accepted suggestion needs no second call: the box is already in display
 * coordinates and already grown to whatever is clickable around it.
 *
 * One that will not map is dropped rather than repaired. These are optional
 * extras on a failure -- a suggestion nobody can be pointed at is worse than
 * one fewer suggestion, and this is not a path to raise a new error on.
 */
export function resolveVisionAlternatives(
  alternatives: VisionAlternative[] | null | undefined,
  request: GuidanceRequest,
  limit = 3,
): GuidanceSuggestion[] {
  if (!Array.isArray(alternatives) || alternatives.length === 0) {
    return [];
  }

  const resolved: GuidanceSuggestion[] = [];
  const seen = new Set<string>();

  for (const alternative of alternatives) {
    if (resolved.length >= limit) {
      break;
    }

    const label = alternative?.label?.trim();

    if (!label) {
      continue;
    }

    // The same control offered twice reads as Toki not knowing what it is
    // looking at, and models do repeat themselves when a thing has both an
    // accessibility name and visible text.
    const key = label.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    try {
      const { target } = resolveVisionTargetToDisplay(alternative, request);

      seen.add(key);
      resolved.push({
        target,
        reason: alternative.reason?.trim() || undefined,
      });
    } catch {
      continue;
    }
  }

  return resolved;
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
    const suggestions = resolveVisionAlternatives(parsed.alternatives, request);
    const debug = {
      providerOutput,
      vision: mapped?.debug,
    };

    /*
     * A box on words is not a place to click.
     *
     * The failure this exists for: "open the issue navigator", answered with a
     * box around three lines of a build error, while the button that opens it
     * sat four rows above -- published by the accessibility tree, collected as
     * evidence, and outranked by an error message that happened to contain the
     * same words.
     *
     * Refused rather than corrected, because there is nothing here to correct
     * to. What can be done is hand back the controls that did match, which is
     * usually where the right one was all along.
     */
    if (target != null && isTargetOnStaticText(target, request.screen.candidates)) {
      const heard = request.goal?.trim();
      const asked = heard ? `"${heard}"` : "that";
      const offers =
        suggestions.length > 0 ? suggestions : suggestInteractiveCandidates(request);

      return {
        mode: "unavailable",
        error:
          offers.length > 0
            ? `I could only find ${asked} as text, not as a control. Did you mean one of these?`
            : `I could only find ${asked} written on screen, not as something to click.`,
        providerName,
        suggestions: offers.length > 0 ? offers : undefined,
        debug,
      };
    }

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
          ? suggestions.length > 0
            ? // The dead end becomes a question. Nothing about the sentence
              // above is wrong, but "it may be inside a menu that isn't open"
              // is only useful to somebody who knows the application -- and the
              // person most likely to be asking is the one who does not.
              `I can't see ${asked} on this screen. Did you mean one of these?`
            : `I can't see ${asked} on screen. It may be inside a menu or section that isn't open.`
          : `I'm not sure enough about ${asked} to point at it.`;

      return {
        mode: "unavailable",
        error:
          confidence < 0.45
            ? [message, suggestions.length > 0 ? "" : result.summary]
                .filter((part) => part && part.trim().length > 0)
                .join(" ")
            : "Vision provider returned an invalid target.",
        validation,
        providerName,
        // Only where they help. A target that was found does not need
        // alternatives, and an invalid answer is a fault rather than a miss.
        suggestions:
          suggestions.length > 0 && step == null && confidence < 0.45
            ? suggestions
            : undefined,
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
