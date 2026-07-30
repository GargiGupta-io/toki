// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Talking to Stripe, and proving that Stripe is what is talking to us.
 *
 * The webhook endpoint is the only part of this service that grants paid
 * access, and it is a public URL with no login on it. The signature check below
 * is the entire security boundary: without it, anyone who knows the address can
 * post an "you have been paid" event and subscribe themselves for nothing.
 *
 * There is no Stripe SDK here on purpose. The dependency exists to be audited,
 * and the two things that matter — an HMAC comparison and a form-encoded POST —
 * are short enough to read in full.
 */

export type StripeConfig = {
  secretKey: string;
  priceId: string;
  webhookSecret: string;
  successUrl: string;
  cancelUrl: string;
  baseUrl: string;
};

export type SignatureRejection =
  | "missing_header"
  | "malformed_header"
  | "stale_timestamp"
  | "bad_signature";

export const signatureRejectionMessages: Record<SignatureRejection, string> = {
  missing_header: "This endpoint only accepts signed Stripe events.",
  malformed_header: "The Stripe signature header could not be read.",
  stale_timestamp: "This event is too old to be accepted.",
  bad_signature: "This event was not signed by Stripe.",
};

export type SignatureResult =
  | { valid: true }
  | { valid: false; reason: SignatureRejection };

/** How far out of date an event may be. Stripe's own default. */
const toleranceSeconds = 300;

/**
 * Check a webhook signature against the raw body.
 *
 * `payload` must be the exact bytes Stripe sent. Parsing the JSON and
 * re-serialising it before this point produces a different string — different
 * key order, different spacing — and every legitimate event then fails. That is
 * the usual way this check gets "fixed" by being turned off.
 */
export function verifyWebhookSignature(
  payload: string,
  header: string | undefined,
  secret: string,
  now: Date = new Date(),
): SignatureResult {
  if (!header) {
    return { valid: false, reason: "missing_header" };
  }

  // t=1614556800,v1=hex,v1=hex — more than one v1 appears while a secret is
  // being rotated, and any of them counts.
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) {
      continue;
    }
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") {
      timestamp = value;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp == null || signatures.length === 0) {
    return { valid: false, reason: "malformed_header" };
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return { valid: false, reason: "malformed_header" };
  }

  // The timestamp is inside the signed string, so this cannot be edited without
  // breaking the signature. Checking it stops a genuine event captured off the
  // wire from being replayed indefinitely.
  if (Math.abs(Math.floor(now.getTime() / 1000) - sentAt) > toleranceSeconds) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest();

  for (const candidate of signatures) {
    const provided = Buffer.from(candidate, "hex");
    // Length is compared first because timingSafeEqual throws on a mismatch,
    // and a thrown error here would read as a server fault rather than a
    // rejected event.
    if (
      provided.length === expected.length &&
      timingSafeEqual(provided, expected)
    ) {
      return { valid: true };
    }
  }

  return { valid: false, reason: "bad_signature" };
}

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

/** Read an event that has already been proven to come from Stripe. */
export function parseStripeEvent(payload: string): StripeEvent | null {
  try {
    const value = JSON.parse(payload) as Partial<StripeEvent>;
    if (
      typeof value.id !== "string" ||
      typeof value.type !== "string" ||
      typeof value.created !== "number" ||
      typeof value.data?.object !== "object"
    ) {
      return null;
    }
    return value as StripeEvent;
  } catch {
    return null;
  }
}

/**
 * Stripe's API takes form encoding, including for nested values, which is why
 * the keys below look like `line_items[0][price]` rather than nested JSON.
 */
async function stripePost(
  path: string,
  form: Record<string, string>,
  config: StripeConfig,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });

  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    // Stripe's message can quote the request. Log nothing here; the caller
    // reports a fixed sentence to the user.
    const error = (body.error ?? {}) as { message?: string };
    throw new Error(error.message ?? "Stripe rejected the request.");
  }

  return body;
}

export type CheckoutSession = { id: string; url: string };

export async function createCheckoutSession(
  {
    userId,
    email,
  }: {
    userId: string;
    email: string | null;
  },
  config: StripeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutSession> {
  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": config.priceId,
    "line_items[0][quantity]": "1",
    success_url: config.successUrl,
    cancel_url: config.cancelUrl,
    // Both of these carry the account id back on the events that follow.
    // `client_reference_id` arrives on the checkout event; the subscription
    // metadata arrives on every subscription event after it, including renewals
    // months later when nothing else connects the two.
    client_reference_id: userId,
    "subscription_data[metadata][user_id]": userId,
    "metadata[user_id]": userId,
  };

  if (email) {
    form.customer_email = email;
  }

  const session = await stripePost("/v1/checkout/sessions", form, config, fetchImpl);

  if (typeof session.url !== "string") {
    throw new Error("Stripe did not return a checkout page.");
  }

  return { id: String(session.id), url: session.url };
}

/** The page where someone changes a card or cancels. Stripe hosts all of it. */
export async function createPortalSession(
  customerId: string,
  config: StripeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string }> {
  const session = await stripePost(
    "/v1/billing_portal/sessions",
    { customer: customerId, return_url: config.successUrl },
    config,
    fetchImpl,
  );

  if (typeof session.url !== "string") {
    throw new Error("Stripe did not return a billing page.");
  }

  return { url: session.url };
}
