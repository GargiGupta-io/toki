import type {
  GuidanceProviderMode,
  GuidanceProviderResponse,
  GuidanceRequest,
} from "@toki/shared";
import {
  requestGeminiVisionGuidance,
  type GeminiVisionOptions,
} from "./geminiVisionProvider";
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
  gemini?: GeminiVisionOptions;
  /**
   * Toki's own service. When present it replaces the developer CLI on the
   * shipping path -- no tool installed on the user's machine, and nothing
   * running with Toki's screen-recording permission except Toki.
   */
  hostedVision?: HostedVisionOptions;
  localCandidateProvider(request: GuidanceRequest): GuidanceProviderResponse;
  /**
   * The same check the caller applies to a finished answer.
   *
   * Given here so the local pass can be held to it before it is allowed to
   * stand in for the model. Without that, a local answer that fails
   * verification ends the whole request: the caller rejects it, and the model
   * -- which would have answered correctly -- was never asked.
   *
   * That is not hypothetical. The first step fell through to vision and was
   * right; after the control was clicked the screen's candidates changed, the
   * local pass produced something, verification refused it, and guidance
   * blocked in about a second having sent no screenshot anywhere.
   */
  verify?(
    response: GuidanceProviderResponse,
    request: GuidanceRequest,
  ): GuidanceProviderResponse;
};

export function createGuidanceProviderAdapter(
  mode: GuidanceProviderMode,
  options: ProviderFactoryOptions,
): GuidanceProviderAdapter {
  if (mode === "gemini") {
    return {
      mode,
      request: (request) => requestGeminiVisionGuidance(request, options.gemini),
    };
  }

  if (mode === "real") {
    return {
      mode,
      async request(request) {
        // The local pass costs nothing and needs no network, so it runs first.
        // Only what it cannot answer is worth sending a screenshot for.
        const localResult = options.localCandidateProvider(request);

        // Held to the same standard as anything else. An answer that will be
        // rejected is not an answer, and taking it here means never asking the
        // one thing that can actually see the screen.
        const localVerified =
          localResult.mode === "unavailable"
            ? localResult
            : (options.verify?.(localResult, request) ?? localResult);

        if (localVerified.mode !== "unavailable") {
          return localVerified;
        }

        if (options.hostedVision) {
          const hosted = await requestHostedVisionGuidance(
            request,
            options.hostedVision,
          );

          /*
           * The service first, and only around it when it cannot answer.
           *
           * This used to stop here whatever happened, on the reasoning that a
           * shipping build must never bypass its own service. That is right
           * about *refusals* and wrong about *failures*: a service with no
           * vision credentials configured reported "Toki cannot see your
           * screen" while a perfectly good key sat in the Keychain, unused.
           *
           * Being signed out or unsubscribed is the service saying no, and
           * that is still final. This is the case where it says it cannot.
           */
          if (hosted.mode !== "unavailable" || hosted.canFallBack !== true) {
            return hosted;
          }
        }

        /*
         * The service could not answer, so ask the model directly.
         *
         * There used to be a third route between these two: an older shape
         * kept for the local smoke server, which sent the request with `fetch`
         * **from the window**. The window is forbidden to reach any remote
         * origin -- that ban is the reason every other call goes through Rust
         * -- so it failed with WebKit's "Load failed" and stopped there,
         * leaving this line unreachable whenever an endpoint was configured.
         *
         * The symptom was "Guidance unavailable: Load failed" with a working
         * Gemini key sitting unused, which says nothing about either cause. The
         * smoke server serves the same shape as the real service now, so that
         * route was carrying nothing except the failure.
         */
        return requestGeminiVisionGuidance(request, options.gemini);
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
