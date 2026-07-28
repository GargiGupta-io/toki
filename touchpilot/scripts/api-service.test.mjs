import assert from "node:assert/strict";
import test from "node:test";

import { loadServiceConfig } from "../apps/api/src/config.ts";
import { handleApiRequest } from "../apps/api/src/handler.ts";
import {
  checkLicence,
  createStubLicenceStore,
  readLicenceKey,
} from "../apps/api/src/licences.ts";
import { createInMemoryRateLimiter } from "../apps/api/src/rateLimit.ts";

const validKey = "toki-test-licence";

function createDependencies(overrides = {}) {
  const config = loadServiceConfig({
    TOKI_REQUESTS_PER_MINUTE: "3",
    ...overrides.env,
  });
  return {
    config,
    licences: createStubLicenceStore({ TOKI_DEV_LICENCE_KEYS: validKey }),
    rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
    ...overrides.dependencies,
  };
}

function guidanceRequest(body = {}) {
  return {
    method: "POST",
    path: "/guidance",
    headers: { authorization: `Bearer ${validKey}` },
    body: JSON.stringify({ goal: "Open settings", screen: {}, ...body }),
  };
}

test("no credentials means fixture mode, not a broken service", () => {
  // The service has to be runnable before any credits are bought, or the client
  // integration cannot be exercised at all.
  assert.equal(loadServiceConfig({}).mode, "fixture");
  assert.equal(loadServiceConfig({ TOKI_PROVIDER_API_KEY: "sk-x" }).mode, "live");
  // Whitespace is not a credential.
  assert.equal(loadServiceConfig({ TOKI_PROVIDER_API_KEY: "   " }).mode, "fixture");
});

test("fixture responses announce themselves and point at nothing", async () => {
  const response = await handleApiRequest(guidanceRequest(), createDependencies());
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.match(body.notice, /fixture mode/iu);
  // A placeholder that carried a target would send users clicking arbitrary
  // coordinates on their own screen.
  assert.equal(body.result.step.target, undefined);
  assert.equal(body.result.step.confidence, 0);
});

test("an unknown licence is refused", async () => {
  const dependencies = createDependencies();

  const missing = await handleApiRequest(
    { ...guidanceRequest(), headers: {} },
    dependencies,
  );
  assert.equal(missing.status, 401);

  const unknown = await handleApiRequest(
    { ...guidanceRequest(), headers: { authorization: "Bearer nope" } },
    dependencies,
  );
  assert.equal(unknown.status, 403);
});

test("the stub store accepts nothing unless a key is configured", async () => {
  // If this defaulted to permissive, the first deployment carrying a real
  // credential without a store would serve the entire internet.
  const empty = createStubLicenceStore({});
  assert.deepEqual(await checkLicence("anything", empty), {
    valid: false,
    reason: "unknown",
  });
});

test("revoked is reported as revoked, not as expired", async () => {
  const store = {
    async find() {
      return { key: "k", expiresAt: "2000-01-01T00:00:00Z", revoked: true };
    },
  };
  const result = await checkLicence("k", store);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "revoked");
});

test("the licence travels in a header, never a query string", () => {
  // Query strings land in access logs, proxy logs, and browser history, and a
  // licence key is a credential.
  assert.equal(readLicenceKey({ authorization: "Bearer abc" }), "abc");
  assert.equal(readLicenceKey({ authorization: "bearer  abc  " }), "abc");
  assert.equal(readLicenceKey({}), null);
});

test("rate limiting is per licence and reports when to retry", async () => {
  const dependencies = createDependencies();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const allowed = await handleApiRequest(guidanceRequest(), dependencies);
    assert.equal(allowed.status, 200, `request ${attempt + 1} should be allowed`);
  }

  const blocked = await handleApiRequest(guidanceRequest(), dependencies);
  assert.equal(blocked.status, 429);
  assert.ok(
    Number(blocked.headers["retry-after"]) > 0,
    "a 429 without retry-after leaves the client guessing",
  );
});

test("oversized bodies are refused before being parsed", async () => {
  const dependencies = createDependencies({
    env: { TOKI_MAX_REQUEST_BYTES: "500" },
  });
  const response = await handleApiRequest(
    {
      ...guidanceRequest(),
      body: JSON.stringify({ goal: "x", screen: {}, padding: "a".repeat(1000) }),
    },
    dependencies,
  );

  assert.equal(response.status, 413);
});

test("a goal is required", async () => {
  const response = await handleApiRequest(
    { ...guidanceRequest(), body: JSON.stringify({ goal: "  ", screen: {} }) },
    createDependencies(),
  );
  assert.equal(response.status, 400);
});

test("health reports the mode so a fixture deployment is obvious", async () => {
  const response = await handleApiRequest(
    { method: "GET", path: "/health", headers: {}, body: "" },
    createDependencies(),
  );
  const body = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(body.mode, "fixture");
  assert.match(body.detail, /no provider credentials/iu);
});

test("a provider failure does not relay the provider's error text", async () => {
  const dependencies = createDependencies({
    env: { TOKI_PROVIDER_API_KEY: "sk-test" },
    dependencies: {
      requestGuidance: async () => {
        throw new Error("upstream said: goal was 'buy shares in ACME'");
      },
    },
  });

  const response = await handleApiRequest(guidanceRequest(), dependencies);
  const body = JSON.parse(response.body);

  // Provider errors can quote the request, which contains the user's goal and
  // details of their screen.
  assert.doesNotMatch(body.error, /ACME/u);
  assert.equal(body.mode, "unavailable");
});
