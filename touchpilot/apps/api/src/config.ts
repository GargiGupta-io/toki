// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

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

import type { StripeConfig } from "./stripe";
import type { VisionEffort } from "./vision";

const visionEfforts = ["low", "medium", "high", "xhigh", "max"] as const;

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
  /** Vision guidance. Separate credential and model from the two above. */
  vision: {
    apiKey: string | null;
    model: string;
    /** Unset takes the model's default. Worth measuring before pinning. */
    effort?: VisionEffort;
  };
  /**
   * Payments. Absent while there is no Stripe account wired up, which leaves
   * the billing endpoints reporting that plainly rather than half-working.
   */
  stripe: StripeConfig | null;
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
    vision: {
      apiKey: env.ANTHROPIC_API_KEY?.trim() || null,
      model: env.TOKI_VISION_MODEL?.trim() || "claude-opus-5",
      effort: (visionEfforts as readonly string[]).includes(
        env.TOKI_VISION_EFFORT?.trim() ?? "",
      )
        ? (env.TOKI_VISION_EFFORT?.trim() as VisionEffort)
        : undefined,
    },
    stripe: readStripeConfig(env),
    limits: {
      // A 4K screenshot encodes to several megabytes. Serverless hosts often
      // cap request bodies well below this; whichever host is chosen has to
      // allow at least this much or guidance will fail on large displays.
      maxRequestBytes: readNumber(env.TOKI_MAX_REQUEST_BYTES, 12 * 1024 * 1024),
      requestsPerMinute: readNumber(env.TOKI_REQUESTS_PER_MINUTE, 20),
    },
  };
}

/**
 * Payments are configured only when all three parts are present.
 *
 * A secret key without a webhook secret is the dangerous half-configuration:
 * checkout works, money moves, and nothing ever grants the access it paid for
 * -- so it is treated as not configured at all rather than partly working.
 */
function readStripeConfig(
  env: Record<string, string | undefined>,
): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const priceId = env.STRIPE_PRICE_ID?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secretKey || !priceId || !webhookSecret) {
    return null;
  }

  // Where Stripe sends the customer's browser afterwards.
  //
  // This service serves those two pages itself, so the default is its own
  // address and checkout needs no website to exist. On Fly that address is
  // derivable from the app name, which means a working deploy configures this
  // with nothing set at all.
  //
  // Pointing it at a marketing site is a later choice, not a prerequisite. The
  // previous default named a domain nobody owned, which would have left a
  // paying customer on a dead page -- the payment succeeds either way, because
  // access comes from the webhook, but the person has no way to know that.
  const flyHost = env.FLY_APP_NAME?.trim()
    ? `https://${env.FLY_APP_NAME.trim()}.fly.dev`
    : null;
  const site = env.TOKI_SITE_URL?.trim() || flyHost;

  return {
    secretKey,
    priceId,
    webhookSecret,
    successUrl:
      env.STRIPE_SUCCESS_URL?.trim() ||
      (site ? `${site}/thanks` : "http://127.0.0.1:8787/thanks"),
    cancelUrl:
      env.STRIPE_CANCEL_URL?.trim() ||
      (site ? `${site}/pricing` : "http://127.0.0.1:8787/pricing"),
    baseUrl: env.STRIPE_BASE_URL?.trim() ?? "https://api.stripe.com",
  };
}

export function describeServiceMode(config: ServiceConfig): string {
  if (config.mode === "live") {
    return `live, using ${config.provider.guidanceModel} for guidance and ${config.provider.transcriptionModel} for speech`;
  }

  return "fixture mode: no provider credentials are configured, so responses are placeholders";
}
