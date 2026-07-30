import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleStripeWebhook } from "../apps/api/src/billing.ts";
import { verifyWebhookSignature } from "../apps/api/src/stripe.ts";
import { handleApiRequest } from "../apps/api/src/handler.ts";
import { loadServiceConfig } from "../apps/api/src/config.ts";
import { createInMemoryRateLimiter } from "../apps/api/src/rateLimit.ts";
import { freeSubscription, isPaid } from "../apps/api/src/subscriptions.ts";

const webhookSecret = "whsec_test_secret";
const jwtSecret = "test-jwt-secret-at-least-32-characters-long";

const stripeConfig = {
  secretKey: "sk_test_key",
  priceId: "price_123",
  webhookSecret,
  successUrl: "https://toki.app/thanks",
  cancelUrl: "https://toki.app/pricing",
  baseUrl: "https://api.stripe.test",
};

function sign(payload, { secret = webhookSecret, timestamp } = {}) {
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${signature}`;
}

function event(overrides = {}) {
  return JSON.stringify({
    id: "evt_1",
    type: "customer.subscription.updated",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        current_period_end: 1893456000,
        metadata: { user_id: "user-1" },
      },
    },
    ...overrides,
  });
}

function makeWriter(overrides = {}) {
  const claimed = new Set();
  const applied = [];
  const linked = [];
  return {
    claimed,
    applied,
    linked,
    writer: {
      async claimEvent(id) {
        if (claimed.has(id)) {
          return false;
        }
        claimed.add(id);
        return true;
      },
      async releaseEvent(id) {
        claimed.delete(id);
      },
      async linkCustomer(input) {
        linked.push(input);
      },
      async applySubscription(input) {
        applied.push(input);
      },
      ...overrides,
    },
  };
}

function post(payload, header, writer, now) {
  return handleStripeWebhook({
    payload,
    signatureHeader: header,
    config: stripeConfig,
    writer,
    now,
  });
}

test("an unsigned event grants nothing", async () => {
  // Without this check the endpoint is a public URL that hands out paid
  // subscriptions to anyone who finds it.
  const { writer, applied } = makeWriter();
  const result = await post(event(), undefined, writer);

  assert.equal(result.status, 400);
  assert.equal(applied.length, 0);
});

test("an event signed with the wrong secret grants nothing", async () => {
  const { writer, applied } = makeWriter();
  const payload = event();
  const result = await post(payload, sign(payload, { secret: "wrong" }), writer);

  assert.equal(result.status, 400);
  assert.equal(applied.length, 0);
});

test("a genuine signature over different bytes is refused", async () => {
  // The attack this stops: take a real signed event, change the account it
  // names, and send it on. The signature covers the body, so it no longer fits.
  const original = event();
  const header = sign(original);
  const tampered = original.replace("user-1", "attacker");

  const { writer, applied } = makeWriter();
  const result = await post(tampered, header, writer);

  assert.equal(result.status, 400);
  assert.equal(applied.length, 0);
});

test("a captured event cannot be replayed later", () => {
  const payload = event();
  const timestamp = Math.floor(Date.now() / 1000) - 3600;
  const header = sign(payload, { timestamp });

  const result = verifyWebhookSignature(payload, header, webhookSecret);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "stale_timestamp");
});

test("a signature valid under either of two secrets is accepted", () => {
  // Both are sent while a secret is being rotated; rejecting the pair would
  // mean an outage every time a secret is changed.
  const payload = event();
  const t = Math.floor(Date.now() / 1000);
  const good = createHmac("sha256", webhookSecret).update(`${t}.${payload}`).digest("hex");
  const header = `t=${t},v1=deadbeef,v1=${good}`;

  assert.equal(verifyWebhookSignature(payload, header, webhookSecret).valid, true);
});

test("a malformed signature header is refused, not crashed on", () => {
  const payload = event();
  for (const header of ["", "garbage", "t=abc,v1=x", "v1=onlysig", "t=123"]) {
    const result = verifyWebhookSignature(payload, header, webhookSecret);
    assert.equal(result.valid, false, `accepted ${JSON.stringify(header)}`);
  }
});

test("a properly signed event is applied", async () => {
  const { writer, applied } = makeWriter();
  const payload = event();
  const result = await post(payload, sign(payload), writer);

  assert.equal(result.status, 200);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].userId, "user-1");
  assert.equal(applied[0].tier, "pro");
  assert.equal(applied[0].status, "active");
  assert.equal(applied[0].currentPeriodEnd, new Date(1893456000000).toISOString());
});

test("the same event delivered twice is applied once", async () => {
  // Stripe retries on any non-2xx and re-sends events even when nothing failed.
  const { writer, applied } = makeWriter();
  const payload = event();
  const header = sign(payload);

  assert.equal((await post(payload, header, writer)).status, 200);
  assert.equal((await post(payload, header, writer)).status, 200);
  assert.equal(applied.length, 1, "a duplicate must not be processed again");
});

test("a failed event is released so Stripe retries it", async () => {
  // Keeping the claim after a failure would drop the event permanently and
  // leave someone paying for access they never received.
  const { writer, claimed } = makeWriter({
    async applySubscription() {
      throw new Error("database unavailable");
    },
  });

  const payload = event();
  const result = await post(payload, sign(payload), writer);

  assert.equal(result.status, 500, "a 500 is what asks Stripe to try again");
  assert.equal(claimed.has("evt_1"), false, "the claim is given back");
});

test("checkout completion links Stripe's identifiers to the account", async () => {
  const payload = event({
    id: "evt_2",
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "user-7",
        customer: "cus_7",
        subscription: "sub_7",
      },
    },
  });

  const { writer, linked } = makeWriter();
  assert.equal((await post(payload, sign(payload), writer)).status, 200);
  assert.deepEqual(
    { ...linked[0], eventAt: undefined },
    {
      userId: "user-7",
      customerId: "cus_7",
      subscriptionId: "sub_7",
      eventAt: undefined,
    },
  );
});

test("an expanded object is read the same as a bare id", async () => {
  // Stripe sends an id when the relation is not expanded and a whole object
  // when it is; handling only one shape breaks on the other.
  const payload = event({
    id: "evt_3",
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "user-8",
        customer: { id: "cus_8", object: "customer" },
        subscription: { id: "sub_8" },
      },
    },
  });

  const { writer, linked } = makeWriter();
  await post(payload, sign(payload), writer);
  assert.equal(linked[0].customerId, "cus_8");
  assert.equal(linked[0].subscriptionId, "sub_8");
});

test("the period is read from the item when it is not on the subscription", async () => {
  const payload = event({
    id: "evt_4",
    data: {
      object: {
        id: "sub_9",
        customer: "cus_9",
        status: "active",
        metadata: { user_id: "user-9" },
        items: { data: [{ current_period_end: 1893456000 }] },
      },
    },
  });

  const { writer, applied } = makeWriter();
  await post(payload, sign(payload), writer);
  assert.equal(applied[0].currentPeriodEnd, new Date(1893456000000).toISOString());
});

test("cancellation keeps the tier and lets the paid period run out", async () => {
  const periodEnd = Math.floor(Date.now() / 1000) + 86_400;
  const payload = event({
    id: "evt_5",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_5",
        customer: "cus_5",
        status: "active",
        current_period_end: periodEnd,
        metadata: { user_id: "user-5" },
      },
    },
  });

  const { writer, applied } = makeWriter();
  await post(payload, sign(payload), writer);

  assert.equal(applied[0].status, "canceled", "the event type is the authority");
  assert.equal(applied[0].tier, "pro");
  assert.equal(
    isPaid({ ...applied[0] }),
    true,
    "time already paid for is not taken away",
  );
});

test("an unhandled event type is acknowledged, not retried forever", async () => {
  const payload = event({ id: "evt_6", type: "invoice.created" });
  const { writer, applied } = makeWriter();
  const result = await post(payload, sign(payload), writer);

  assert.equal(result.status, 200);
  assert.equal(result.body.handled, false);
  assert.equal(applied.length, 0);
});

// --- The endpoints, through the full handler --------------------------------

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function accessToken(sub = "user-1") {
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({ sub, email: "a@b.com", exp: Math.floor(Date.now() / 1000) + 3600 });
  const signature = createHmac("sha256", jwtSecret)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${signature}`;
}

function billingConfig() {
  return loadServiceConfig({
    STRIPE_SECRET_KEY: stripeConfig.secretKey,
    STRIPE_PRICE_ID: stripeConfig.priceId,
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    STRIPE_BASE_URL: stripeConfig.baseUrl,
  });
}

test("payments stay unconfigured unless all three settings are present", () => {
  // The dangerous half-configuration: checkout works, money moves, and the
  // webhook that grants access can never be verified.
  assert.equal(loadServiceConfig({}).stripe, null);
  assert.equal(
    loadServiceConfig({
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_PRICE_ID: "price_1",
    }).stripe,
    null,
    "a missing webhook secret must not look configured",
  );
  assert.notEqual(billingConfig().stripe, null);
});

test("checkout requires a verified token", async () => {
  const config = billingConfig();
  const response = await handleApiRequest(
    { method: "POST", path: "/billing/checkout", headers: {}, body: "{}" },
    {
      config,
      jwtSecret,
      rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    },
  );

  assert.equal(response.status, 401);
});

test("checkout charges the configured price for the verified user", async () => {
  const config = billingConfig();
  let sentForm = null;

  const response = await handleApiRequest(
    {
      method: "POST",
      path: "/billing/checkout",
      headers: { authorization: `Bearer ${accessToken("user-42")}` },
      // A body naming a different user and a cheaper price. Neither is read.
      body: JSON.stringify({ userId: "someone-else", price: "price_free" }),
    },
    {
      config,
      jwtSecret,
      rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
      fetchImpl: async (_url, init) => {
        sentForm = new URLSearchParams(init.body);
        return {
          ok: true,
          json: async () => ({ id: "cs_1", url: "https://checkout.stripe.test/c/1" }),
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).url, "https://checkout.stripe.test/c/1");
  assert.equal(sentForm.get("line_items[0][price]"), "price_123");
  assert.equal(sentForm.get("client_reference_id"), "user-42");
  assert.equal(
    sentForm.get("subscription_data[metadata][user_id]"),
    "user-42",
    "renewals months later carry the account id on metadata alone",
  );
});

test("the webhook endpoint needs no token, and still needs a signature", async () => {
  const config = billingConfig();
  const { writer, applied } = makeWriter();
  const payload = event({ id: "evt_10" });

  const send = (header) =>
    handleApiRequest(
      {
        method: "POST",
        path: "/billing/webhook",
        headers: header ? { "stripe-signature": header } : {},
        body: payload,
      },
      {
        config,
        jwtSecret,
        billing: writer,
        rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
      },
    );

  assert.equal((await send(undefined)).status, 400, "no signature, no access");
  assert.equal(applied.length, 0);

  // No Authorization header anywhere: the caller is Stripe, not a person.
  assert.equal((await send(sign(payload))).status, 200);
  assert.equal(applied.length, 1);
});

test("the billing page is refused when there is nothing to manage", async () => {
  const config = billingConfig();
  const response = await handleApiRequest(
    {
      method: "POST",
      path: "/billing/portal",
      headers: { authorization: `Bearer ${accessToken()}` },
      body: "{}",
    },
    {
      config,
      jwtSecret,
      subscriptions: { async forUser() { return freeSubscription; } },
      rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    },
  );

  assert.equal(response.status, 409);
});

// --- Does a paying customer's app know they are paying? ---------------------

test("the account endpoint reports entitlement, read from the database", async () => {
  const config = billingConfig();
  let askedFor = null;

  const response = await handleApiRequest(
    {
      method: "POST",
      path: "/account",
      headers: { authorization: `Bearer ${accessToken("user-77")}` },
      // A body claiming pro. The tier comes from the database or nowhere.
      body: JSON.stringify({ tier: "pro", entitled: true }),
    },
    {
      config,
      jwtSecret,
      subscriptions: {
        async forUser(userId) {
          askedFor = userId;
          return freeSubscription;
        },
      },
      rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    },
  );

  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(askedFor, "user-77", "looked up by the id in the verified token");
  assert.equal(body.tier, "free");
  assert.equal(body.entitled, false, "a request cannot declare itself entitled");
});

test("a paid account is reported as entitled, with when it renews", async () => {
  const config = billingConfig();
  const periodEnd = new Date(Date.now() + 86_400_000).toISOString();

  const response = await handleApiRequest(
    {
      method: "POST",
      path: "/account",
      headers: { authorization: `Bearer ${accessToken()}` },
      body: "{}",
    },
    {
      config,
      jwtSecret,
      subscriptions: {
        async forUser() {
          return {
            tier: "pro",
            status: "active",
            currentPeriodEnd: periodEnd,
            stripeCustomerId: "cus_5",
          };
        },
      },
      rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    },
  );

  const body = JSON.parse(response.body);
  assert.equal(body.entitled, true);
  assert.equal(body.currentPeriodEnd, periodEnd);
  assert.equal(body.hasBillingAccount, true, "so Manage plan can be offered");
});

test("a cancelled subscription still inside its paid period reports entitled", async () => {
  // This is what a customer who cancelled yesterday sees. Reporting them as
  // unentitled would take away time they have already paid for.
  const config = billingConfig();
  const response = await handleApiRequest(
    {
      method: "POST",
      path: "/account",
      headers: { authorization: `Bearer ${accessToken()}` },
      body: "{}",
    },
    {
      config,
      jwtSecret,
      subscriptions: {
        async forUser() {
          return {
            tier: "pro",
            status: "canceled",
            currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
            stripeCustomerId: "cus_6",
          };
        },
      },
      rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    },
  );

  assert.equal(JSON.parse(response.body).entitled, true);
});

test("the account endpoint needs a verified token", async () => {
  const config = billingConfig();
  const response = await handleApiRequest(
    { method: "POST", path: "/account", headers: {}, body: "{}" },
    {
      config,
      jwtSecret,
      rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    },
  );
  assert.equal(response.status, 401);
});

// --- Where the customer's browser lands, with no website in existence -------

test("checkout returns to a page this service actually serves", async () => {
  // Stripe only redirects to http or https, so the browser has to be sent
  // somewhere real. Naming a domain nobody owns leaves a paying customer on a
  // dead page: the payment still works, because access comes from the webhook,
  // but the person has no way to know that.
  const config = loadServiceConfig({
    STRIPE_SECRET_KEY: "sk_test_key",
    STRIPE_PRICE_ID: "price_123",
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    FLY_APP_NAME: "toki-api",
  });

  assert.equal(config.stripe.successUrl, "https://toki-api.fly.dev/thanks");
  assert.equal(config.stripe.cancelUrl, "https://toki-api.fly.dev/pricing");

  for (const path of ["/thanks", "/pricing"]) {
    const response = await handleApiRequest(
      { method: "GET", path, headers: {}, body: "" },
      {
        config,
        jwtSecret,
        rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
      },
    );

    assert.equal(response.status, 200, `${path} is not served`);
    assert.match(response.headers["content-type"], /text\/html/);
  }
});

test("the return pages need no sign-in and grant nothing", async () => {
  // They are reached by a browser that carries no token, so they cannot require
  // one. Equally, anyone can visit them by typing the address, so neither may
  // ever be treated as evidence of payment.
  const config = billingConfig();
  const response = await handleApiRequest(
    { method: "GET", path: "/thanks", headers: {}, body: "" },
    {
      config,
      jwtSecret,
      subscriptions: {
        async forUser() {
          throw new Error("a static page must not look anyone up");
        },
      },
      rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    },
  );

  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, /entitled|subscription granted/i);
});

test("the return pages fetch nothing and run nothing", async () => {
  // Someone has just typed a card number on the previous screen. A page that
  // loads no script and no remote asset cannot report who visited it.
  const config = billingConfig();
  const response = await handleApiRequest(
    { method: "GET", path: "/thanks", headers: {}, body: "" },
    {
      config,
      jwtSecret,
      rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    },
  );

  assert.doesNotMatch(response.body, /<script/i, "no script");
  assert.doesNotMatch(response.body, /https?:\/\//, "no remote asset");
  assert.match(response.headers["content-security-policy"], /default-src 'none'/);
  assert.equal(response.headers["x-frame-options"], "DENY");
});

test("an explicit site URL still wins once one exists", () => {
  const config = loadServiceConfig({
    STRIPE_SECRET_KEY: "sk_test_key",
    STRIPE_PRICE_ID: "price_123",
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    FLY_APP_NAME: "toki-api",
    TOKI_SITE_URL: "https://toki.example",
  });

  assert.equal(config.stripe.successUrl, "https://toki.example/thanks");
});
