// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import {
  parseStripeEvent,
  verifyWebhookSignature,
  signatureRejectionMessages,
  type StripeConfig,
  type StripeEvent,
} from "./stripe";

/**
 * Turning Stripe events into entitlement.
 *
 * One rule decides the shape of all of it: **the webhook is the only thing that
 * grants access.** The browser redirect after checkout is not evidence of
 * anything — it can be closed before it fires, replayed later, or typed by
 * hand. Treating "the user reached the success page" as proof of payment is the
 * standard way this gets built wrong, and it is free money for anyone who
 * notices.
 */

export type BillingWriter = {
  /**
   * Claim an event id. Returns false when it was already recorded, which is how
   * a duplicate delivery is detected. Stripe retries on any non-2xx and will
   * deliver the same event more than once even when nothing failed.
   */
  claimEvent(eventId: string, type: string): Promise<boolean>;
  /** Give the claim back so a failed event can be retried rather than lost. */
  releaseEvent(eventId: string): Promise<void>;
  /** Attach Stripe's identifiers to an account after checkout. */
  linkCustomer(input: {
    userId: string;
    customerId: string;
    subscriptionId: string | null;
    eventAt: Date;
  }): Promise<void>;
  /**
   * Write subscription state. Identified by user id when the event carries one
   * and by Stripe customer id otherwise. Must ignore an event older than the
   * one the row was last written from.
   */
  applySubscription(input: {
    userId: string | null;
    customerId: string;
    subscriptionId: string;
    status: string;
    tier: "free" | "pro";
    currentPeriodEnd: string | null;
    eventAt: Date;
  }): Promise<void>;
};

export type WebhookOutcome =
  | { status: 200; body: { received: true; handled: boolean } }
  | { status: 400 | 500; body: { error: string } };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Stripe sends an id when the related object is not expanded and a whole object
 * when it is. Both mean the same thing, and code that handles only one breaks
 * the first time the other arrives.
 */
function readReference(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    return asString((value as { id?: unknown }).id);
  }
  return null;
}

function readPeriodEnd(object: Record<string, unknown>): string | null {
  const seconds = object.current_period_end;
  if (typeof seconds === "number" && Number.isFinite(seconds)) {
    return new Date(seconds * 1000).toISOString();
  }

  // Newer Stripe versions moved the period onto each subscription item.
  const items = (object.items as { data?: Array<Record<string, unknown>> })?.data;
  const itemEnd = items?.[0]?.current_period_end;
  if (typeof itemEnd === "number" && Number.isFinite(itemEnd)) {
    return new Date(itemEnd * 1000).toISOString();
  }

  return null;
}

/**
 * Which tier a Stripe status corresponds to.
 *
 * Everything that is not plainly dead stays on the paid tier, and how much of
 * that is actually honoured is decided separately by `isPaid`, which also looks
 * at the paid-through date. Keeping the two apart is what lets a cancelled
 * subscription keep working until the period someone already paid for runs out.
 */
function tierForStatus(status: string): "free" | "pro" {
  return status === "incomplete_expired" ? "free" : "pro";
}

async function handleEvent(
  event: StripeEvent,
  writer: BillingWriter,
): Promise<boolean> {
  const object = event.data.object;
  const eventAt = new Date(event.created * 1000);

  if (event.type === "checkout.session.completed") {
    const userId = asString(object.client_reference_id);
    const customerId = readReference(object.customer);

    // Without an account to attach it to there is nothing to do. This is a
    // real case: payment links and dashboard-created subscriptions carry no
    // reference back to a Toki account.
    if (!userId || !customerId) {
      return false;
    }

    await writer.linkCustomer({
      userId,
      customerId,
      subscriptionId: readReference(object.subscription),
      eventAt,
    });
    return true;
  }

  if (event.type.startsWith("customer.subscription.")) {
    const customerId = readReference(object.customer);
    const subscriptionId = asString(object.id);
    const status = asString(object.status);

    if (!customerId || !subscriptionId || !status) {
      return false;
    }

    // The account id is carried in metadata because it is the only identifier
    // present on every subscription event, including a renewal months later
    // when the checkout that started it is long gone.
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;

    await writer.applySubscription({
      userId: asString(metadata.user_id),
      customerId,
      subscriptionId,
      // A deletion event can arrive with a status other than canceled; the
      // event type is the authority on what happened.
      status: event.type === "customer.subscription.deleted" ? "canceled" : status,
      tier: tierForStatus(status),
      currentPeriodEnd: readPeriodEnd(object),
      eventAt,
    });
    return true;
  }

  // Anything else is acknowledged and ignored. Returning an error for an event
  // type we do not handle would make Stripe retry it forever and eventually
  // disable the endpoint.
  return false;
}

/**
 * The webhook endpoint.
 *
 * `payload` is the raw request body, exactly as received. Nothing in it is
 * parsed until the signature over those precise bytes has been verified.
 */
export async function handleStripeWebhook({
  payload,
  signatureHeader,
  config,
  writer,
  now = new Date(),
}: {
  payload: string;
  signatureHeader: string | undefined;
  config: StripeConfig;
  writer: BillingWriter;
  now?: Date;
}): Promise<WebhookOutcome> {
  const signature = verifyWebhookSignature(
    payload,
    signatureHeader,
    config.webhookSecret,
    now,
  );

  if (!signature.valid) {
    return {
      status: 400,
      body: { error: signatureRejectionMessages[signature.reason] },
    };
  }

  const event = parseStripeEvent(payload);
  if (event == null) {
    return { status: 400, body: { error: "This event could not be read." } };
  }

  // Claimed before the work, not after, so two deliveries racing each other
  // cannot both get through. The claim is given back below if the work fails.
  const claimed = await writer.claimEvent(event.id, event.type);
  if (!claimed) {
    return { status: 200, body: { received: true, handled: false } };
  }

  try {
    return {
      status: 200,
      body: { received: true, handled: await handleEvent(event, writer) },
    };
  } catch (error) {
    await writer.releaseEvent(event.id).catch(() => undefined);
    // Log the type only. The body describes a customer's payment.
    console.error("stripe webhook handling failed", {
      type: event.type,
      name: (error as Error)?.name,
    });
    // A 500 is what asks Stripe to try again. Answering 200 here would drop the
    // event permanently and leave someone paying for access they never got.
    return { status: 500, body: { error: "This event could not be processed." } };
  }
}

/**
 * A billing writer backed by Supabase's REST interface, using the service role.
 *
 * The service role bypasses row-level security, which is exactly right here and
 * exactly wrong anywhere near the client: these writes have no user to act as,
 * because the caller is Stripe.
 */
export function createSupabaseBillingWriter({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl = fetch,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}): BillingWriter {
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };

  async function patch(
    filters: Record<string, string>,
    values: Record<string, unknown>,
  ): Promise<void> {
    const url = new URL("/rest/v1/subscriptions", supabaseUrl);
    for (const [key, value] of Object.entries(filters)) {
      url.searchParams.set(key, value);
    }

    const response = await fetchImpl(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      throw new Error(`Subscription update failed with ${response.status}`);
    }
  }

  return {
    async claimEvent(eventId, type) {
      const url = new URL("/rest/v1/webhook_events", supabaseUrl);
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ id: eventId, type }),
      });

      // The primary key is what makes this atomic: a duplicate is refused by
      // the database rather than by a check that another request could race.
      if (response.status === 409) {
        return false;
      }

      if (!response.ok) {
        throw new Error(`Event claim failed with ${response.status}`);
      }

      return true;
    },

    async releaseEvent(eventId) {
      const url = new URL("/rest/v1/webhook_events", supabaseUrl);
      url.searchParams.set("id", `eq.${eventId}`);
      await fetchImpl(url, { method: "DELETE", headers });
    },

    async linkCustomer({ userId, customerId, subscriptionId, eventAt }) {
      await patch(
        { user_id: `eq.${userId}`, last_event_at: `lte.${eventAt.toISOString()}` },
        {
          stripe_customer_id: customerId,
          ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
          last_event_at: eventAt.toISOString(),
          updated_at: new Date().toISOString(),
        },
      );
    },

    async applySubscription({
      userId,
      customerId,
      subscriptionId,
      status,
      tier,
      currentPeriodEnd,
      eventAt,
    }) {
      // The filter is the ordering guard. An event older than the one the row
      // was last written from matches no row and changes nothing, so a delayed
      // retry cannot undo a newer state.
      const filters: Record<string, string> = {
        last_event_at: `lte.${eventAt.toISOString()}`,
      };

      if (userId) {
        filters.user_id = `eq.${userId}`;
      } else {
        filters.stripe_customer_id = `eq.${customerId}`;
      }

      await patch(filters, {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status,
        tier,
        current_period_end: currentPeriodEnd,
        last_event_at: eventAt.toISOString(),
        updated_at: new Date().toISOString(),
      });
    },
  };
}
