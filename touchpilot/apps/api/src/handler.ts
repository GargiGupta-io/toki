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
import { handleStripeWebhook, type BillingWriter } from "./billing";
import { createCheckoutSession, createPortalSession } from "./stripe";
import type { VisionProvider } from "./vision";
import { htmlResponse, pricingPage, thanksPage } from "./pages";

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
  /** Writes subscription state from Stripe events. Absent without payments. */
  billing?: BillingWriter;
  /** Injected so payment tests never reach the network. */
  fetchImpl?: typeof fetch;
  /** Looks at a screenshot. Absent until a model credential exists. */
  vision?: VisionProvider;
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

  // Where Stripe sends a customer's browser after checkout. Reached by a
  // person, with a GET, carrying no credentials -- so they are answered before
  // the POST-only rule and before authentication.
  //
  // Serving them here is what lets payments work with no website and no domain.
  // Neither page grants anything: anyone can visit either by typing the
  // address, and entitlement comes from the signed webhook alone.
  if (request.path === "/thanks") {
    return htmlResponse(thanksPage);
  }

  if (request.path === "/pricing") {
    return htmlResponse(pricingPage);
  }

  if (request.method !== "POST") {
    return json(405, { error: "Only POST is supported." });
  }

  // The webhook is answered before anything else touches the request.
  //
  // It carries no access token -- the caller is Stripe, not a signed-in person
  // -- so it cannot go through `identifyCaller`, and its body must reach the
  // signature check as the exact bytes that were sent. Any parsing before this
  // point would be parsing something unproven.
  if (request.path === "/billing/webhook") {
    if (config.stripe == null || dependencies.billing == null) {
      return json(503, { error: "Payments are not configured." });
    }

    const outcome = await handleStripeWebhook({
      payload: request.body,
      signatureHeader:
        request.headers["stripe-signature"] ?? request.headers["Stripe-Signature"],
      config: config.stripe,
      writer: dependencies.billing,
    });

    return json(outcome.status, outcome.body);
  }

  const knownPaths = [
    "/guidance",
    "/transcription",
    "/vision",
    "/account",
    "/billing/checkout",
    "/billing/portal",
  ];
  if (!knownPaths.includes(request.path)) {
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

  /**
   * What this account is entitled to.
   *
   * Without this the app can only discover someone's plan by attempting a paid
   * request and being refused, which means a paying customer's own app cannot
   * tell them they are paying, and offers to sell them what they already have.
   *
   * Everything here is read from the database against the id in the verified
   * token. Nothing is taken from the request.
   */
  if (request.path === "/account") {
    return json(200, {
      userId: caller.user.id,
      email: caller.user.email,
      tier: caller.subscription.tier,
      status: caller.subscription.status,
      currentPeriodEnd: caller.subscription.currentPeriodEnd,
      // The single answer the client actually acts on. Whether a cancelled
      // subscription still counts is decided here, once, rather than in every
      // caller that has to re-derive it from a status and a date.
      entitled: isPaid(caller.subscription),
      hasBillingAccount: caller.subscription.stripeCustomerId != null,
    });
  }

  if (request.path === "/billing/checkout" || request.path === "/billing/portal") {
    return handleBilling(request.path, caller.user, caller.subscription, dependencies);
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

  if (request.path === "/vision") {
    return handleVision(payload, caller.subscription, dependencies);
  }

  return handleTranscription(payload, dependencies);
}

/**
 * Start a payment, or open the page for managing one.
 *
 * Nothing about the price, the plan, or the account comes from the request
 * body. The user is whoever the verified token says, and the price is whatever
 * the service is configured with -- a request cannot ask to be charged less.
 */
async function handleBilling(
  path: string,
  user: VerifiedUser,
  subscription: Subscription,
  { config, fetchImpl }: HandlerDependencies,
): Promise<ApiResponse> {
  if (config.stripe == null) {
    return json(503, { error: "Payments are not configured." });
  }

  try {
    if (path === "/billing/portal") {
      if (subscription.stripeCustomerId == null) {
        // Nobody to manage. Sending them to checkout instead of an error is
        // the honest answer to "manage my subscription" when there is none.
        return json(409, {
          error: "There is no subscription to manage yet.",
        });
      }

      return json(
        200,
        await createPortalSession(
          subscription.stripeCustomerId,
          config.stripe,
          fetchImpl,
        ),
      );
    }

    const session = await createCheckoutSession(
      { userId: user.id, email: user.email },
      config.stripe,
      fetchImpl,
    );

    // Only the URL. The desktop app opens it in the browser, because card
    // details must be entered on Stripe's own page and never inside Toki.
    return json(200, { url: session.url });
  } catch (error) {
    console.error("stripe request failed", { name: (error as Error)?.name });
    return json(502, { error: "Payments are temporarily unavailable." });
  }
}

/**
 * Look at a screenshot and name one control on it.
 *
 * The prompt and the response schema are the client's, not this service's. The
 * client knows the display geometry, the calibration, and which candidates its
 * own accessibility scan found; turning an answer back into a place on screen
 * happens there. All this endpoint does is put a picture in front of a model,
 * which is also the least it could know about the user.
 */
async function handleVision(
  payload: unknown,
  subscription: Subscription,
  { config, vision }: HandlerDependencies,
): Promise<ApiResponse> {
  const request = payload as {
    prompt?: string;
    imageBase64?: string;
    imageFormat?: string;
    outputSchema?: unknown;
  };

  if (
    typeof request?.prompt !== "string" ||
    request.prompt.trim().length === 0 ||
    typeof request.imageBase64 !== "string" ||
    request.imageBase64.length === 0
  ) {
    return json(400, { error: "A prompt and a screenshot are required." });
  }

  // The gate. Everything above this line is free; looking at a screenshot with
  // a model costs real money per call, so it is what the paid tier buys.
  if (requiresUpgrade(subscription)) {
    return json(402, {
      error: "Live guidance is part of Toki Pro.",
      upgrade: true,
    });
  }

  if (config.provider.apiKey == null || vision == null) {
    return unavailable(
      "This Toki service has no vision credentials configured, so it cannot look at screenshots yet.",
    );
  }

  try {
    return json(
      200,
      await vision({
        prompt: request.prompt,
        imageBase64: request.imageBase64,
        imageFormat: request.imageFormat === "png" ? "png" : "jpeg",
        // Passed straight through. It shapes the client's own reply and gives
        // the caller nothing they could not already ask for in the prompt.
        outputSchema:
          typeof request.outputSchema === "object" && request.outputSchema != null
            ? (request.outputSchema as Record<string, unknown>)
            : undefined,
      }),
    );
  } catch (error) {
    // The provider's message can quote the request, and the request is a
    // picture of someone's screen. Only the error's class is recorded.
    console.error("vision provider call failed", {
      name: (error as Error)?.name,
    });
    return unavailable("The guidance provider could not be reached.");
  }
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
