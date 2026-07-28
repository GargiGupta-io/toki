/**
 * Service configuration.
 *
 * There are no credentials yet, so the service is built to run without them
 * rather than to fail without them. With no provider key configured it serves
 * fixture responses and says so on every reply, which lets the desktop client
 * be integrated and exercised end to end before a single credit is bought.
 *
 * The one thing that must never happen is a service that silently looks live
 * while returning invented answers, so the mode is reported in the response
 * body, at startup, and on the health endpoint.
 */

export type ServiceMode = "fixture" | "live";

export type ServiceConfig = {
  mode: ServiceMode;
  port: number;
  /**
   * Credentials for the model provider. Absent until credits are bought; the
   * single placeholder the rest of the service reads from.
   */
  provider: {
    apiKey: string | null;
    guidanceModel: string;
    transcriptionModel: string;
    baseUrl: string;
  };
  limits: {
    /** Guidance requests carry a base64 screenshot, so bodies are large. */
    maxRequestBytes: number;
    requestsPerMinute: number;
  };
};

export const fixtureModeNotice =
  "This Toki API is running in fixture mode. Responses are placeholders, not model output.";

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadServiceConfig(
  env: Record<string, string | undefined> = process.env,
): ServiceConfig {
  const apiKey = env.TOKI_PROVIDER_API_KEY?.trim();
  const hasKey = apiKey != null && apiKey.length > 0;

  return {
    // Live mode is derived from whether a credential exists rather than from a
    // separate switch. A mode flag that can disagree with the credentials is a
    // way to ship something that claims to be live and cannot be.
    mode: hasKey ? "live" : "fixture",
    port: readNumber(env.PORT, 8787),
    provider: {
      apiKey: hasKey ? apiKey : null,
      guidanceModel: env.TOKI_GUIDANCE_MODEL ?? "gpt-4o",
      transcriptionModel: env.TOKI_TRANSCRIPTION_MODEL ?? "gpt-4o-transcribe",
      baseUrl: env.TOKI_PROVIDER_BASE_URL ?? "https://api.openai.com/v1",
    },
    limits: {
      // A 4K screenshot encodes to several megabytes. Serverless hosts often
      // cap request bodies well below this; whichever host is chosen has to
      // allow at least this much or guidance will fail on large displays.
      maxRequestBytes: readNumber(env.TOKI_MAX_REQUEST_BYTES, 12 * 1024 * 1024),
      requestsPerMinute: readNumber(env.TOKI_REQUESTS_PER_MINUTE, 20),
    },
  };
}

export function describeServiceMode(config: ServiceConfig): string {
  if (config.mode === "live") {
    return `live, using ${config.provider.guidanceModel} for guidance and ${config.provider.transcriptionModel} for speech`;
  }

  return "fixture mode: no provider credentials are configured, so responses are placeholders";
}
