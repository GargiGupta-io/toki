import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleApiRequest } from "../apps/api/src/handler.ts";
import { loadServiceConfig } from "../apps/api/src/config.ts";
import { createInMemoryRateLimiter } from "../apps/api/src/rateLimit.ts";
import { freeSubscription } from "../apps/api/src/subscriptions.ts";
import {
  createSupabaseUsageStore,
  describeAllowance,
  usagePeriodStart,
} from "../apps/api/src/usage.ts";

/**
 * The free tier's monthly allowance.
 *
 * Two properties matter more than the number. A request that never produced an
 * answer must not be charged against it, and a paying subscriber must never be
 * counted at all -- not merely allowed through, but never made to wait on the
 * lookup or exposed to its failures.
 */

const secret = "test-jwt-secret-at-least-32-characters-long";

function sign(payload) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(payload);
  return `${head}.${body}.${createHmac("sha256", secret)
    .update(`${head}.${body}`)
    .digest("base64url")}`;
}

const token = sign({
  sub: "user-1",
  exp: Math.floor(Date.now() / 1000) + 3600,
});

function build({ tier = "free", usage, vision } = {}) {
  const config = loadServiceConfig({
    TOKI_PROVIDER_API_KEY: "sk-test",
    TOKI_FREE_MONTHLY_GUIDANCE: "3",
  });

  return {
    config,
    jwtSecret: secret,
    usage,
    vision: vision ?? (async () => ({ rawAnswer: "{}", providerName: "test" })),
    subscriptions: {
      async forUser() {
        return tier === "pro"
          ? {
              ...freeSubscription,
              tier: "pro",
              status: "active",
            }
          : freeSubscription;
      },
    },
    rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
  };
}

const ask = (dependencies) =>
  handleApiRequest(
    {
      method: "POST",
      path: "/vision",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: "what is this", imageBase64: "abc" }),
    },
    dependencies,
  );

function countingUsage({ limit = 3, failEvery = null } = {}) {
  let used = 0;
  const calls = { claims: 0, releases: 0 };
  return {
    calls,
    usedNow: () => used,
    store: {
      async claim() {
        calls.claims += 1;
        if (failEvery != null && calls.claims % failEvery === 0) {
          throw new Error("database unreachable");
        }
        if (used >= limit) {
          return { allowed: false, used, limit };
        }
        used += 1;
        return { allowed: true, used, limit };
      },
      async release() {
        calls.releases += 1;
        used = Math.max(0, used - 1);
      },
    },
  };
}

test("a free account gets its allowance and then a clear refusal", async () => {
  const { store, calls } = countingUsage({ limit: 3 });
  const dependencies = build({ usage: store });

  for (let i = 1; i <= 3; i += 1) {
    const response = await ask(dependencies);
    assert.equal(response.status, 200, `request ${i} should be allowed`);
    // What is left, so the app can warn before the last one rather than after.
    assert.equal(JSON.parse(response.body).used, i);
  }

  const refused = await ask(dependencies);
  assert.equal(refused.status, 402);
  const body = JSON.parse(refused.body);
  assert.equal(body.upgrade, true);
  assert.match(body.error, /used all 3/u);
  assert.equal(calls.releases, 0, "nothing failed, so nothing is given back");
});

test("a request that produced no answer is not charged for", async () => {
  const { store, usedNow } = countingUsage({ limit: 3 });
  const dependencies = build({
    usage: store,
    vision: async () => {
      throw new Error("provider exploded");
    },
  });

  const response = await ask(dependencies);
  // The client renders an "unavailable" provider response, so a provider
  // failure arrives as something it can show rather than a transport error.
  assert.equal(JSON.parse(response.body).mode, "unavailable");
  assert.equal(
    usedNow(),
    0,
    "a failed call must be returned to the allowance, not kept",
  );
});

test("a paid subscriber is never counted", async () => {
  const { store, calls } = countingUsage({ limit: 3 });
  const dependencies = build({ tier: "pro", usage: store });

  for (let i = 0; i < 5; i += 1) {
    assert.equal((await ask(dependencies)).status, 200);
  }

  assert.equal(
    calls.claims,
    0,
    "paying must not depend on the counter being reachable",
  );
  // Nothing to count, so nothing is reported.
  const body = JSON.parse((await ask(dependencies)).body);
  assert.equal(body.limit, undefined);
});

test("a counting failure does not become a paywall", async () => {
  // Someone with an intact allowance being told to pay because the database
  // blinked is the worst possible failure here: the remedy offered is money,
  // and money was never the problem.
  const store = {
    async claim() {
      return { allowed: true, used: 0, limit: 3 };
    },
    async release() {},
  };

  assert.equal((await ask(build({ usage: store }))).status, 200);
});

test("the period is the calendar month in UTC", () => {
  // Not a rolling window: recomputing one needs a log of every request, and
  // keeping that means recording when each person asked Toki for help.
  assert.equal(usagePeriodStart(new Date("2026-08-01T00:00:00Z")), "2026-08-01");
  assert.equal(usagePeriodStart(new Date("2026-08-31T23:59:59Z")), "2026-08-01");
  assert.equal(usagePeriodStart(new Date("2026-12-15T12:00:00Z")), "2026-12-01");

  // UTC, so crossing a date line does not hand out a second allowance.
  assert.equal(usagePeriodStart(new Date("2026-09-01T00:30:00+13:00")), "2026-08-01");
});

test("the counter is claimed in one statement, not read then written", async () => {
  // Read-then-write lets two requests arriving together both find room. The
  // store must call the database function rather than select and update.
  const seen = [];
  const store = createSupabaseUsageStore({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role",
    fetchImpl: async (url) => {
      seen.push(String(url));
      return { ok: true, json: async () => 1 };
    },
  });

  await store.claim("user-1", 15);
  assert.match(seen[0], /\/rest\/v1\/rpc\/claim_guidance_request$/u);
});

test("the refusal says what to do about it", () => {
  assert.match(describeAllowance(15, 15), /Toki Pro removes the limit/u);
  assert.equal(describeAllowance(14, 15), "1 free guidance request left this month.");
  assert.match(describeAllowance(0, 15), /15 free guidance requests left/u);
});
