import { invoke } from "@tauri-apps/api/core";
import type {
  GuidanceProviderResponse,
  GuidanceRequest,
} from "@toki/shared";
import {
  createVisionGuidanceResponse,
  createVisionLocalizationPrompt,
  VISION_TARGET_OUTPUT_SCHEMA,
} from "./visionGuidanceContract";

/**
 * Looking at the screen, through Gemini.
 *
 * This replaced a developer CLI: a coding agent, started per question, that
 * read the screenshot off disk. It answered correctly and took six or seven
 * seconds doing it -- which is a person standing still, waiting to be told what
 * to click. It also had to be installed before Toki could see anything, and it
 * had to be lent Toki's screen-recording grant to do its job, which meant
 * something other than Toki was holding it.
 *
 * **Not the shipping path.** Toki's own service holds the credential and pays
 * for the calls; that is the entire reason the service exists, and nobody
 * installing this app should be asked for an API key. This is the developer
 * path -- what answers when there is no service to ask, so the app can be
 * worked on without one.
 *
 * The request goes through Rust rather than from here. The window is only
 * permitted to talk to its own process, so it cannot reach Google at all -- and
 * it should not hold the key, because everything this side knows can end up in
 * a log line, an error string, or a diagnostics export.
 *
 * The output schema goes with it and is enforced by the API rather than asked
 * for in prose. That is the substantive reason to prefer this over a CLI: every
 * guidance failure worth debugging in this app came from a model returning the
 * right answer in the wrong shape, and a shape that is checked cannot drift.
 */

type NativeGeminiVisionResponse = {
  rawAnswer: string;
  providerName: string;
  durationMs: number;
};

/**
 * Gemini answers in thousandths of the image, whatever it was asked for.
 *
 * Every coordinate comes back on a 0-1000 grid across both axes, which is
 * Google's documented convention for pointing at things and is not something a
 * prompt talks it out of. Toki's prompt asks for image pixels and it is right
 * to -- the hosted provider obeys it -- so the conversion belongs here, next to
 * the provider that has the quirk, rather than in the shared contract.
 *
 * This was caught by checking an answer against a screenshot whose button
 * positions were known. Every target came back correctly *identified* with
 * 0.95 confidence and every coordinate was wrong by the same ratio, and the
 * app's own validator then discarded the lot for being out of bounds. The
 * visible symptom would have been "vision found nothing", three layers away
 * from the cause.
 */
const GEMINI_COORDINATE_SCALE = 1000;

export function descaleGeminiAnswer(
  rawAnswer: string,
  image: { width: number; height: number },
): string {
  if (image.width <= 0 || image.height <= 0) {
    return rawAnswer;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawAnswer);
  } catch {
    // Not JSON at all. The shared parser reports that far better than a
    // conversion step can, so this hands it along untouched.
    return rawAnswer;
  }

  if (parsed == null || typeof parsed !== "object") {
    return rawAnswer;
  }

  const target = (parsed as { target?: unknown }).target;

  if (target == null || typeof target !== "object") {
    return rawAnswer;
  }

  const box = target as Record<string, unknown>;
  const horizontal = image.width / GEMINI_COORDINATE_SCALE;
  const vertical = image.height / GEMINI_COORDINATE_SCALE;

  for (const [key, factor] of [
    ["centerX", horizontal],
    ["x", horizontal],
    ["width", horizontal],
    ["centerY", vertical],
    ["y", vertical],
    ["height", vertical],
  ] as const) {
    const value = box[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      box[key] = Math.round(value * factor);
    }
  }

  return JSON.stringify(parsed);
}

type NativeInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export type GeminiVisionOptions = {
  invokeImpl?: NativeInvoke;
  model?: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 25_000;

export async function requestGeminiVisionGuidance(
  request: GuidanceRequest,
  options: GeminiVisionOptions = {},
): Promise<GuidanceProviderResponse> {
  const payload = request.screen.screenshotPayload;
  const providerName = options.model?.trim()
    ? `gemini:${options.model.trim()}`
    : "gemini";

  if (payload == null) {
    return {
      mode: "unavailable",
      error: "Gemini needs a screenshot to look at.",
      providerName,
    };
  }

  const invokeImpl = options.invokeImpl ?? (invoke as NativeInvoke);
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = (await invokeImpl("request_gemini_vision_guidance", {
      request: {
        imageBase64: payload.imageBase64,
        imageFormat: payload.format,
        prompt: createVisionLocalizationPrompt(request),
        outputSchema: JSON.stringify(VISION_TARGET_OUTPUT_SCHEMA),
        model: options.model?.trim() || null,
        timeoutMs,
      },
    })) as NativeGeminiVisionResponse;

    return createVisionGuidanceResponse(
      descaleGeminiAnswer(response.rawAnswer, {
        width: payload.imageWidth,
        height: payload.imageHeight,
      }),
      request,
      response.providerName || providerName,
      "gemini",
    );
  } catch (error) {
    return {
      mode: "unavailable",
      error: error instanceof Error ? error.message : String(error),
      providerName,
    };
  }
}
