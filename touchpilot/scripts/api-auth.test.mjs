import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyAccessToken } from "../apps/api/src/auth.ts";
import { handleApiRequest } from "../apps/api/src/handler.ts";
import { loadServiceConfig } from "../apps/api/src/config.ts";
import { createInMemoryRateLimiter } from "../apps/api/src/rateLimit.ts";
import { freeSubscription, isPaid } from "../apps/api/src/subscriptions.ts";

const secret = "test-jwt-secret-at-least-32-characters-long";

function sign(payload, { alg = "HS256", key = secret } = {}) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({ alg, typ: "JWT" });
  const body = encode(payload);
  const signature = createHmac("sha256", key)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${signature}`;
}

const future = () => Math.floor(Date.now() / 1000) + 3600;

test("a token signed by the project is accepted", () => {
  const result = verifyAccessToken(
    sign({ sub: "user-1", email: "a@b.com", exp: future() }),
    secret,
  );
  assert.equal(result.valid, true);
  assert.equal(result.user.id, "user-1");
});

test("a token signed by anyone else is refused", () => {
  // Without this check the `sub` claim is just a string the caller chose, and
  // anybody could name themselves any user.
  const forged = sign({ sub: "user-1", exp: future() }, { key: "wrong-secret" });
  const result = verifyAccessToken(forged, secret);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "bad_signature");
});

test("the algorithm is pinned, so alg:none cannot walk in", () => {
  // The classic JWT vulnerability: trusting the header's own claim about how
  // it was signed. A token declaring "none" carries no signature at all.
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: "user-1",
    exp: future(),
  })}.`;

  const result = verifyAccessToken(unsigned, secret);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "wrong_algorithm");
});

test("an expired token is refused even though it is genuine", () => {
  const result = verifyAccessToken(
    sign({ sub: "user-1", exp: Math.floor(Date.now() / 1000) - 1 }),
    secret,
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, "expired");
});

test("claims are read only after the signature holds", () => {
  // A forged token with a valid-looking payload must never reach the point
  // where its expiry or subject is considered.
  const forged = sign(
    { sub: "admin", exp: future() },
    { key: "not-the-secret" },
  );
  const result = verifyAccessToken(forged, secret);
  assert.equal(result.reason, "bad_signature", "signature is checked first");
});

test("a request without a valid token cannot reach the model", async () => {
  const config = loadServiceConfig({});
  const dependencies = {
    config,
    jwtSecret: secret,
    rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
  };
  const send = (authorization) =>
    handleApiRequest(
      {
        method: "POST",
        path: "/guidance",
        headers: authorization ? { authorization } : {},
        body: JSON.stringify({ goal: "Open settings", screen: {} }),
      },
      dependencies,
    );

  assert.equal((await send(undefined)).status, 401);
  assert.equal((await send("Bearer not-a-token")).status, 401);
  assert.equal(
    (await send(`Bearer ${sign({ sub: "u", exp: future() }, { key: "x" })}`))
      .status,
    401,
  );
  assert.equal(
    (await send(`Bearer ${sign({ sub: "u", exp: future() })}`)).status,
    200,
  );
});

test("a paid period already bought survives cancellation", () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(
    isPaid({ tier: "pro", status: "canceled", currentPeriodEnd: tomorrow }),
    true,
    "cancelling must not revoke time already paid for",
  );

  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(
    isPaid({ tier: "pro", status: "canceled", currentPeriodEnd: yesterday }),
    false,
  );
  assert.equal(isPaid(freeSubscription), false);
});

test("a tier the client asks for is never honoured", async () => {
  // The tier comes from the database, read with the service role. A request
  // naming its own tier must change nothing.
  const config = loadServiceConfig({});
  let askedFor = null;
  const dependencies = {
    config,
    jwtSecret: secret,
    subscriptions: {
      async forUser(userId) {
        askedFor = userId;
        return freeSubscription;
      },
    },
    rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
  };

  const response = await handleApiRequest(
    {
      method: "POST",
      path: "/guidance",
      headers: { authorization: `Bearer ${sign({ sub: "user-9", exp: future() })}` },
      body: JSON.stringify({ goal: "x", screen: {}, tier: "pro" }),
    },
    dependencies,
  );

  assert.equal(response.status, 200);
  assert.equal(askedFor, "user-9", "the tier is looked up by verified user id");
});
