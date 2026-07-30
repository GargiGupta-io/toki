// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * What a signed-in user is entitled to.
 *
 * Read with the service role, which bypasses row-level security — the database
 * rules stop a *client* reading someone else's subscription, and this runs on
 * the server where the user has already been established by a verified token.
 *
 * The tier is never taken from the request. A client that could name its own
 * tier would make the whole payment system decorative, which is also why the
 * schema grants no insert or update policy on this table.
 */

export type SubscriptionTier = "free" | "pro";

export type Subscription = {
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: string | null;
  /** Present once someone has been through checkout. Needed to open the
   * billing page where they change a card or cancel. */
  stripeCustomerId: string | null;
};

export type SubscriptionStore = {
  forUser(userId: string): Promise<Subscription>;
};

/** Requests a minute, per user. The free tier exists to be usable, not generous. */
export const tierRequestsPerMinute: Record<SubscriptionTier, number> = {
  free: 5,
  pro: 60,
};

export const freeSubscription: Subscription = Object.freeze({
  tier: "free",
  status: "inactive",
  currentPeriodEnd: null,
  stripeCustomerId: null,
});

/**
 * A subscription counts as paid while Stripe says it is active or trialing,
 * and until the end of a period already paid for. Cancelling mid-month does
 * not take away what someone has already bought.
 */
export function isPaid(
  subscription: Subscription,
  now: Date = new Date(),
): boolean {
  if (subscription.tier !== "pro") {
    return false;
  }

  if (subscription.status === "active" || subscription.status === "trialing") {
    return true;
  }

  // A cancelled subscription keeps working until its period ends.
  return (
    subscription.status === "canceled" &&
    subscription.currentPeriodEnd != null &&
    new Date(subscription.currentPeriodEnd) > now
  );
}

export function createSupabaseSubscriptionStore({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl = fetch,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}): SubscriptionStore {
  return {
    async forUser(userId) {
      const url = new URL("/rest/v1/subscriptions", supabaseUrl);
      url.searchParams.set(
        "select",
        "tier,status,current_period_end,stripe_customer_id",
      );
      url.searchParams.set("user_id", `eq.${userId}`);
      url.searchParams.set("limit", "1");

      const response = await fetchImpl(url, {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      // A lookup failure must not silently promote anyone. Falling back to the
      // free tier keeps the service usable while a database blip resolves,
      // without ever handing out paid access it could not confirm.
      if (!response.ok) {
        return freeSubscription;
      }

      const rows = (await response.json()) as Array<{
        tier?: string;
        status?: string;
        current_period_end?: string | null;
        stripe_customer_id?: string | null;
      }>;
      const row = rows[0];

      if (row == null) {
        return freeSubscription;
      }

      return {
        tier: row.tier === "pro" ? "pro" : "free",
        status: row.status ?? "inactive",
        currentPeriodEnd: row.current_period_end ?? null,
        stripeCustomerId: row.stripe_customer_id ?? null,
      };
    },
  };
}
