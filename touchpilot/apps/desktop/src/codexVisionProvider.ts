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

type NativeCodexVisionResponse = {
  rawAnswer: string;
  providerName: string;
  durationMs: number;
};

type NativeInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export type CodexVisionOptions = {
  invokeImpl?: NativeInvoke;
  model?: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 25_000;

export async function requestCodexVisionGuidance(
  request: GuidanceRequest,
  options: CodexVisionOptions = {},
): Promise<GuidanceProviderResponse> {
  const payload = request.screen.screenshotPayload;
  const providerName = options.model?.trim()
    ? `codex-subscription:${options.model.trim()}`
    : "codex-subscription";

  if (payload == null) {
    return {
      mode: "unavailable",
      error: "Codex vision needs a screenshot payload.",
      providerName,
    };
  }

  const invokeImpl = options.invokeImpl ?? (invoke as NativeInvoke);
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = (await invokeImpl("request_codex_vision_guidance", {
      request: {
        imageBase64: payload.imageBase64,
        imageFormat: payload.format,
        prompt: createVisionLocalizationPrompt(request),
        outputSchema: JSON.stringify(VISION_TARGET_OUTPUT_SCHEMA),
        model: options.model?.trim() || null,
        timeoutMs,
      },
    })) as NativeCodexVisionResponse;

    return createVisionGuidanceResponse(
      response.rawAnswer,
      request,
      response.providerName || providerName,
      "codex-subscription",
    );
  } catch (error) {
    return {
      mode: "unavailable",
      error: error instanceof Error ? error.message : String(error),
      providerName,
    };
  }
}
