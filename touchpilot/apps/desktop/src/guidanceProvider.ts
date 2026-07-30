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
import {
  requestHostedVisionGuidance,
  type HostedVisionOptions,
} from "./hostedVisionProvider";

export type GuidanceProviderAdapter = {
  mode: GuidanceProviderMode;
  request(request: GuidanceRequest): Promise<GuidanceProviderResponse>;
};

type ProviderFactoryOptions = {
  endpoint?: string;
  codex?: CodexVisionOptions;
  /**
   * Toki's own service. When present it replaces the developer CLI on the
   * shipping path -- no tool installed on the user's machine, and nothing
   * running with Toki's screen-recording permission except Toki.
   */
  hostedVision?: HostedVisionOptions;
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
        // The local pass costs nothing and needs no network, so it runs first.
        // Only what it cannot answer is worth sending a screenshot for.
        const localResult = options.localCandidateProvider(request);

        if (localResult.mode !== "unavailable") {
          return localResult;
        }

        if (options.hostedVision) {
          return requestHostedVisionGuidance(request, options.hostedVision);
        }

        if (!options.endpoint) {
          return localResult;
        }

        // The older shape, kept for the local smoke server which answers with
        // a whole guidance response rather than a model's raw output.
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
