// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * The free tier's monthly allowance.
 *
 * Distinct from the rate limiter in front of it, which stops a burst and keeps
 * its counters in one process's memory. Those reset on every deploy and are
 * per-instance, which is fine for smoothing traffic and useless as the ceiling
 * someone pays to lift. This is counted in the database and decided there.
 *
 * Only the free tier is metered. A paid subscription is not asked about, so a
 * paying customer never waits on this lookup and never loses a request to a
 * database blip.
 */

export type UsageDecision = {
  allowed: boolean;
  /** How many of the allowance are now spent. */
  used: number;
  limit: number;
};

export type UsageStore = {
  claim(userId: string, limit: number, now?: Date): Promise<UsageDecision>;
  /** Hand a claim back when the work it paid for did not happen. */
  release(userId: string, now?: Date): Promise<void>;
};

/**
 * The month a moment belongs to, as the first of that month in UTC.
 *
 * UTC rather than the caller's zone: a person travelling must not get a second
 * allowance by crossing a date line, and the server has no reliable idea where
 * anyone is anyway.
 */
export function usagePeriodStart(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}-01`;
}

export function describeAllowance(used: number, limit: number): string {
  const remaining = Math.max(0, limit - used);
  if (remaining === 0) {
    return `You have used all ${limit} free guidance requests this month. Toki Pro removes the limit.`;
  }

  return remaining === 1
    ? "1 free guidance request left this month."
    : `${remaining} free guidance requests left this month.`;
}

export function createSupabaseUsageStore({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl = fetch,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}): UsageStore {
  async function rpc(name: string, body: Record<string, unknown>) {
    return fetchImpl(new URL(`/rest/v1/rpc/${name}`, supabaseUrl), {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  return {
    async claim(userId, limit, now = new Date()) {
      const response = await rpc("claim_guidance_request", {
        p_user_id: userId,
        p_period_start: usagePeriodStart(now),
        p_limit: limit,
      });

      // A counting failure must not become a paywall. Someone whose allowance
      // is intact would otherwise be told they had spent it because the
      // database was briefly unreachable, and the offered remedy -- paying --
      // would not have been the problem. The rate limiter still bounds the
      // damage a stuck counter can do.
      if (!response.ok) {
        return { allowed: true, used: 0, limit };
      }

      const used = Number(await response.json());
      if (!Number.isFinite(used) || used < 0) {
        return { allowed: false, used: limit, limit };
      }

      return { allowed: true, used, limit };
    },

    async release(userId, now = new Date()) {
      try {
        await rpc("release_guidance_request", {
          p_user_id: userId,
          p_period_start: usagePeriodStart(now),
        });
      } catch {
        // Losing a release costs the person one request against their next
        // month's allowance. Failing the whole call over it would cost them
        // the answer they were waiting for.
      }
    },
  };
}
