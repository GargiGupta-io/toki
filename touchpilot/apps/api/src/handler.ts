// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import type { GuidanceProviderResponse, GuidanceRequest } from "@toki/shared";

import {
  describeServiceMode,
  fixtureModeNotice,
  type ServiceConfig,
} from "./config";
import { createFixtureGuidance, createFixtureTranscript } from "./fixtures";
import {
  checkLicence,
  licenceRejectionMessages,
  readLicenceKey,
  type LicenceStore,
} from "./licences";
import {
  tokenRejectionMessages,
  verifyAccessToken,
  type VerifiedUser,
} from "./auth";
import {
  freeSubscription,
  isPaid,
  tierRequestsPerMinute,
  type Subscription,
  type SubscriptionStore,
} from "./subscriptions";
import type { RateLimiter } from "./rateLimit";

/**
 * The service, as a plain function from request to response.
 *
 * Nothing here touches Node's http module, so the same handler can be mounted
 * on a Node server, a serverless function, or an edge worker. The host has not
 * been chosen, and this is what keeps that decision cheap.
 *
 * One rule runs through all of it: request bodies contain pictures of the
 * user's screen and recordings of their voice. Nothing in this file logs a
 * body, echoes one back, or persists one.
 */

export type ApiRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string;
};

export type ApiResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type HandlerDependencies = {
  config: ServiceConfig;
  /**
   * Verifies the signature on the caller's access token. Absent only in the
   * local development mode where no Supabase project is configured.
   */
  jwtSecret?: string;
  subscriptions?: SubscriptionStore;
  /** Development-only fallback while there is no auth project configured. */
  licences?: LicenceStore;
  rateLimiter: RateLimiter;
  /**
   * Calls the model. Absent until credentials exist, which is what fixture mode
   * stands in for.
   */
  requestGuidance?: (request: GuidanceRequest) => Promise<GuidanceProviderResponse>;
  transcribe?: (audioBase64: string, format: string) => Promise<string>;
};

function json(status: number, value: unknown): ApiResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

function unavailable(error: string): ApiResponse {
  // The desktop client understands "unavailable" as a provider response and
  // shows the error, so failures arrive as something it can render rather than
  // as an unhandled transport error.
  return json(200, {
    mode: "unavailable",
    error,
    providerName: "toki-api",
  } satisfies GuidanceProviderResponse);
}

type CallerResult =
  | { ok: true; user: VerifiedUser; subscription: Subscription }
  | { ok: false; status: number; error: string };

/**
 * Establish who is calling, and what they are entitled to.
 *
 * A verified token is the only thing that names a user. Where no auth project
 * is configured — local development against fixtures — a development licence
 * key stands in, and that path is unreachable in a real deployment because
 * `jwtSecret` is always present there.
 */
async function identifyCaller(
  request: ApiRequest,
  { jwtSecret, subscriptions, licences }: HandlerDependencies,
): Promise<CallerResult> {
  const bearer = readLicenceKey(request.headers);

  if (jwtSecret == null) {
    if (licences == null) {
      return { ok: false, status: 503, error: "Authentication is not configured." };
    }

    const check = await checkLicence(bearer, licences);
    if (!check.valid) {
      // 401 for "who are you", 403 for "I know who you are and no".
      return {
        ok: false,
        status: check.reason === "missing" ? 401 : 403,
        error: licenceRejectionMessages[check.reason],
      };
    }

    return {
      ok: true,
      user: { id: check.licence.key, email: null },
      subscription: freeSubscription,
    };
  }

  const verification = verifyAccessToken(bearer, jwtSecret);

  if (!verification.valid) {
    // 401 for "who are you"; a token that is present but wrong is still an
    // identity failure rather than a permission one.
    return {
      ok: false,
      status: 401,
      error: tokenRejectionMessages[verification.reason],
    };
  }

  const subscription =
    subscriptions == null
      ? freeSubscription
      : await subscriptions.forUser(verification.user.id);

  return { ok: true, user: verification.user, subscription };
}

/** Whether a paid feature may run for this caller. */
export function requiresUpgrade(subscription: Subscription): boolean {
  return !isPaid(subscription);
}

export async function handleApiRequest(
  request: ApiRequest,
  dependencies: HandlerDependencies,
): Promise<ApiResponse> {
  const { config, licences, rateLimiter } = dependencies;

  if (request.path === "/health") {
    return json(200, {
      status: "ok",
      mode: config.mode,
      detail: describeServiceMode(config),
    });
  }

  if (request.method !== "POST") {
    return json(405, { error: "Only POST is supported." });
  }

  if (request.path !== "/guidance" && request.path !== "/transcription") {
    return json(404, { error: "Unknown endpoint." });
  }

  // Size is checked before parsing. Parsing a body specifically to discover it
  // is too large is the cheapest denial of service there is.
  const byteLength = Buffer.byteLength(request.body, "utf8");
  if (byteLength > config.limits.maxRequestBytes) {
    return json(413, {
      error: `Request body is ${byteLength} bytes; the limit is ${config.limits.maxRequestBytes}.`,
    });
  }

  const caller = await identifyCaller(request, dependencies);

  if (!caller.ok) {
    return json(caller.status, { error: caller.error });
  }

  // Rate limited per user, because the account is what maps to a payer. An
  // address-based limit would punish an office behind one address and do
  // nothing about credentials shared publicly.
  const decision = rateLimiter.take(
    caller.user.id,
    undefined,
    Math.min(
      config.limits.requestsPerMinute,
      tierRequestsPerMinute[caller.subscription.tier],
    ),
  );
  if (!decision.allowed) {
    return {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(decision.retryAfterSeconds),
      },
      body: JSON.stringify({
        error: `Too many requests. Try again in ${decision.retryAfterSeconds} seconds.`,
      }),
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(request.body);
  } catch {
    return json(400, { error: "Request body is not valid JSON." });
  }

  if (request.path === "/guidance") {
    return handleGuidance(payload, dependencies);
  }

  return handleTranscription(payload, dependencies);
}

async function handleGuidance(
  payload: unknown,
  { config, requestGuidance }: HandlerDependencies,
): Promise<ApiResponse> {
  const request = payload as GuidanceRequest;

  if (typeof request?.goal !== "string" || request.goal.trim().length === 0) {
    return json(400, { error: "A goal is required." });
  }

  if (config.mode === "fixture" || requestGuidance == null) {
    return json(200, {
      mode: "mock",
      result: createFixtureGuidance(request),
      providerName: "toki-api-fixture",
      notice: fixtureModeNotice,
    });
  }

  try {
    return json(200, await requestGuidance(request));
  } catch (error) {
    // The provider's own error text can quote the request. Report that the call
    // failed without relaying whatever it said back to the client.
    console.error("guidance provider call failed", {
      name: (error as Error)?.name,
    });
    return unavailable("The guidance provider could not be reached.");
  }
}

async function handleTranscription(
  payload: unknown,
  { config, transcribe }: HandlerDependencies,
): Promise<ApiResponse> {
  const request = payload as { audioBase64?: string; format?: string };

  if (
    typeof request?.audioBase64 !== "string" ||
    request.audioBase64.length === 0
  ) {
    return json(400, { error: "Audio is required." });
  }

  if (config.mode === "fixture" || transcribe == null) {
    return json(200, {
      text: createFixtureTranscript(),
      provider: "toki-api-fixture",
      notice: fixtureModeNotice,
    });
  }

  try {
    return json(200, {
      text: await transcribe(request.audioBase64, request.format ?? "audio/wav"),
      provider: "toki-api",
    });
  } catch (error) {
    console.error("transcription provider call failed", {
      name: (error as Error)?.name,
    });
    return json(502, { error: "Speech could not be transcribed." });
  }
}
