// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import type { GuidanceProviderResponse, GuidanceRequest } from "@toki/shared";

import {
  createVisionGuidanceResponse,
  createVisionLocalizationPrompt,
  VISION_TARGET_OUTPUT_SCHEMA,
} from "./visionGuidanceContract";

/**
 * Guidance from Toki's own service, replacing the developer CLI.
 *
 * The CLI path required a specific tool installed at a specific place on the
 * user's machine and inherited Toki's camera and screen-recording permissions
 * when it ran. Nobody installing a productivity app should have to have that,
 * and nothing should run with those permissions except Toki itself.
 *
 * The split of work is deliberate. The server sees a prompt and one image and
 * knows nothing about the user's screen layout; the mapping from the model's
 * answer to a place on the display happens here, where the calibration lives.
 * That keeps the server's copy of the data as close to useless as possible.
 */

export type HostedVisionOptions = {
  /** Sends the request. Rust does this so the window stays offline. */
  send: (body: {
    prompt: string;
    imageBase64: string;
    imageFormat: "png" | "jpeg";
    outputSchema: unknown;
  }) => Promise<HostedVisionReply>;
};

export type HostedVisionReply =
  | { kind: "ok"; rawAnswer: string; providerName?: string }
  | { kind: "upgrade_required"; error: string }
  | { kind: "signed_out"; error: string }
  | { kind: "error"; error: string };

const providerFallbackName = "toki-api";

export async function requestHostedVisionGuidance(
  request: GuidanceRequest,
  options: HostedVisionOptions,
): Promise<GuidanceProviderResponse> {
  const payload = request.screen.screenshotPayload;

  if (payload == null) {
    return {
      mode: "unavailable",
      error: "Live guidance needs a screenshot.",
      providerName: providerFallbackName,
    };
  }

  try {
    const reply = await options.send({
      prompt: createVisionLocalizationPrompt(request),
      // Whatever the capture stage produced — already cropped to the active
      // window when one was found. Nothing is re-expanded here; sending less
      // is the point.
      imageBase64: payload.imageBase64,
      imageFormat: payload.format,
      // The same contract the offline provider is held to, so both paths
      // produce an answer this app already knows how to read.
      outputSchema: VISION_TARGET_OUTPUT_SCHEMA,
    });

    if (reply.kind === "ok") {
      return createVisionGuidanceResponse(
        reply.rawAnswer,
        request,
        reply.providerName || providerFallbackName,
        "real",
      );
    }

    return {
      mode: "unavailable",
      error: reply.error,
      providerName: providerFallbackName,
    };
  } catch (error) {
    return {
      mode: "unavailable",
      error: error instanceof Error ? error.message : String(error),
      providerName: providerFallbackName,
    };
  }
}

/**
 * Turn the service's reply into something the interface can act on.
 *
 * The three failures mean different things to a person and need different
 * offers: sign in, upgrade, or try again. Collapsing them into one "it didn't
 * work" is what makes an app feel broken when it is actually just locked.
 */
export function readHostedVisionResponse(
  status: number,
  body: Record<string, unknown>,
): HostedVisionReply {
  if (status === 401) {
    return {
      kind: "signed_out",
      // The service distinguishes five reasons -- missing, unreadable, wrong
      // signature, expired, unsupported algorithm -- and only one of them is
      // cured by signing in again. Replacing all of them with "your sign-in
      // has expired" sent someone who was demonstrably signed in to sign in
      // once more, which produces another token signed by the same key and
      // fails identically. Keep what the service said; it knows.
      error:
        typeof body.error === "string" && body.error.trim().length > 0
          ? body.error
          : "Sign in to use live guidance.",
    };
  }

  if (status === 402 || body.upgrade === true) {
    return {
      kind: "upgrade_required",
      error:
        typeof body.error === "string"
          ? body.error
          : "Live guidance is part of Toki Pro.",
    };
  }

  if (status === 429) {
    return {
      kind: "error",
      error: "Toki is being asked for guidance too quickly. Wait a moment.",
    };
  }

  if (status !== 200) {
    return {
      kind: "error",
      error:
        typeof body.error === "string"
          ? body.error
          : `The guidance service replied with ${status}.`,
    };
  }

  if (typeof body.rawAnswer !== "string" || body.rawAnswer.length === 0) {
    // A 200 carrying an "unavailable" provider response lands here.
    return {
      kind: "error",
      error:
        typeof body.error === "string"
          ? body.error
          : "The guidance service returned nothing to act on.",
    };
  }

  return {
    kind: "ok",
    rawAnswer: body.rawAnswer,
    providerName:
      typeof body.providerName === "string" ? body.providerName : undefined,
  };
}
