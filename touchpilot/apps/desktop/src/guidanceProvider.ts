import { requestRealGuidance } from "@toki/ai";
import type {
  GuidanceProviderMode,
  GuidanceProviderResponse,
  GuidanceRequest,
} from "@toki/shared";
import {
  requestCodexVisionGuidance,
  type CodexVisionOptions,
} from "./codexVisionProvider";

export type GuidanceProviderAdapter = {
  mode: GuidanceProviderMode;
  request(request: GuidanceRequest): Promise<GuidanceProviderResponse>;
};

type ProviderFactoryOptions = {
  endpoint?: string;
  codex?: CodexVisionOptions;
  localCandidateProvider(request: GuidanceRequest): GuidanceProviderResponse;
};

export function createGuidanceProviderAdapter(
  mode: GuidanceProviderMode,
  options: ProviderFactoryOptions,
): GuidanceProviderAdapter {
  if (mode === "codex-subscription") {
    return {
      mode,
      request: (request) => requestCodexVisionGuidance(request, options.codex),
    };
  }

  if (mode === "real") {
    return {
      mode,
      async request(request) {
        const localResult = options.localCandidateProvider(request);

        if (localResult.mode !== "unavailable" || !options.endpoint) {
          return localResult;
        }

        return requestRealGuidance(request, {
          endpoint: options.endpoint,
        });
      },
    };
  }

  return {
    mode: "unavailable",
    async request() {
      return {
        mode: "unavailable",
        error: `Guidance provider mode ${mode} is not available for live guidance.`,
        providerName: "provider-router",
      };
    },
  };
}
