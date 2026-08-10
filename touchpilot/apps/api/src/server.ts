import { createServer } from "node:http";

import { createSupabaseJwks } from "./auth";
import { describeServiceMode, loadServiceConfig } from "./config";
import { handleApiRequest, type ApiRequest } from "./handler";
import { createStubLicenceStore } from "./licences";
import { createInMemoryRateLimiter } from "./rateLimit";
import { createSupabaseSubscriptionStore } from "./subscriptions";
import { createSupabaseUsageStore } from "./usage";
import { createSupabaseBillingWriter } from "./billing";
import { createVisionProvider } from "./vision";

/**
 * Node adapter for the handler.
 *
 * Deliberately thin. All the behaviour lives in handler.ts as a plain function,
 * so moving to a serverless function or an edge worker means writing a
 * different twenty lines here and changing nothing else.
 */

const config = loadServiceConfig();

// Real authentication whenever a project is configured. The development
// licence path stays reachable only while it is not, so a deployment cannot
// accidentally fall back to it: the secret is always present there.
const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim() || undefined;
const supabaseUrl = process.env.SUPABASE_URL?.trim();

// Projects created since Supabase moved to rotating signing keys issue ES256
// tokens and publish the public half at the project's JWKS endpoint. Without
// this every genuine sign-in is rejected as an unsupported algorithm, which
// looks to the person holding it like being signed out while signed in.
const jwks = supabaseUrl ? createSupabaseJwks({ supabaseUrl }) : undefined;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const dependencies = {
  config,
  jwtSecret,
  jwks,
  usage:
    supabaseUrl && serviceRoleKey
      ? createSupabaseUsageStore({ supabaseUrl, serviceRoleKey })
      : undefined,
  subscriptions:
    supabaseUrl && serviceRoleKey
      ? createSupabaseSubscriptionStore({ supabaseUrl, serviceRoleKey })
      : undefined,
  licences: jwtSecret == null ? createStubLicenceStore() : undefined,
  billing:
    supabaseUrl && serviceRoleKey && config.stripe
      ? createSupabaseBillingWriter({ supabaseUrl, serviceRoleKey })
      : undefined,
  vision:
    config.provider.apiKey == null
      ? undefined
      : createVisionProvider({
          apiKey: config.provider.apiKey,
          model: config.provider.guidanceModel,
          baseUrl: config.provider.baseUrl,
        }),
  rateLimiter: createInMemoryRateLimiter(config.limits.requestsPerMinute),
};

function readBody(
  request: import("node:http").IncomingMessage,
  limit: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Stop accumulating the moment the limit is passed, rather than buffering
      // an arbitrarily large body and rejecting it afterwards.
      if (size > limit) {
        resolve(null);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", () => resolve(null));
  });
}

const server = createServer(async (incoming, outgoing) => {
  const body = await readBody(incoming, config.limits.maxRequestBytes);

  if (body == null) {
    outgoing.writeHead(413, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: "Request body is too large." }));
    return;
  }

  const apiRequest: ApiRequest = {
    method: incoming.method ?? "GET",
    path: new URL(incoming.url ?? "/", "http://localhost").pathname,
    query: new URL(incoming.url ?? "/", "http://localhost").search.replace(/^\?/, ""),
    headers: incoming.headers as Record<string, string | undefined>,
    body,
  };

  const response = await handleApiRequest(apiRequest, dependencies);

  // Only the method, path, and status. Bodies carry screenshots and voice.
  console.log(`${apiRequest.method} ${apiRequest.path} -> ${response.status}`);

  outgoing.writeHead(response.status, response.headers);
  outgoing.end(response.body);
});

server.listen(config.port, () => {
  // Port only, not an address. Passing no host binds every interface, which is
  // what a container host requires; naming 127.0.0.1 here would read as a
  // loopback-only service and send anyone debugging a deploy in the wrong
  // direction.
  console.log(`Toki API listening on port ${config.port}`);
  console.log(describeServiceMode(config));
  console.log(
    jwtSecret == null
      ? "auth: development licence keys (no SUPABASE_JWT_SECRET set)"
      : "auth: verifying Supabase access tokens",
  );
  console.log(
    config.provider.apiKey == null
      ? "vision: not configured (needs TOKI_PROVIDER_API_KEY)"
      : `vision: ${config.provider.guidanceModel} via ${config.provider.baseUrl}`,
  );
  console.log(
    config.stripe == null
      ? "payments: not configured (needs STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET)"
      : "payments: Stripe checkout and signed webhooks enabled",
  );
});
