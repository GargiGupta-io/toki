/**
 * Per-licence rate limiting.
 *
 * Every guidance request costs money at the model provider, so one leaked or
 * shared licence key with no ceiling is an unbounded bill. The limit is per
 * licence rather than per IP because the licence is what maps to a payer; an IP
 * limit would punish an office behind one address and do nothing about a key
 * posted publicly.
 *
 * Deliberately in memory. That is correct for a single instance and wrong the
 * moment there are two: each would allow the full quota. When the host is
 * chosen and more than one instance runs, this needs backing by something
 * shared. `RateLimiter` is the seam for that.
 */

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the caller may retry, when not allowed. */
  retryAfterSeconds: number;
};

export type RateLimiter = {
  take(key: string, now?: number): RateLimitDecision;
};

const windowMs = 60_000;

export function createInMemoryRateLimiter(
  requestsPerMinute: number,
): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    take(key, now = Date.now()) {
      const cutoff = now - windowMs;
      // Filtering on read rather than on a timer keeps this dependency-free and
      // means an idle key costs nothing until it is used again.
      const recent = (hits.get(key) ?? []).filter(
        (timestamp) => timestamp > cutoff,
      );

      if (recent.length >= requestsPerMinute) {
        const oldest = recent[0] ?? now;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((oldest + windowMs - now) / 1_000),
          ),
        };
      }

      recent.push(now);
      hits.set(key, recent);

      return {
        allowed: true,
        remaining: Math.max(0, requestsPerMinute - recent.length),
        retryAfterSeconds: 0,
      };
    },
  };
}
