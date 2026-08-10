/**
 * The site's own /api, standing in front of the Toki service.
 *
 * Why this exists at all.
 *
 * A browser will not let a page at one address call a different address unless
 * that address grants permission, and the Toki service grants none — it sends
 * no access-control headers anywhere. The desktop app is unaffected because it
 * calls from Rust, where the rule does not apply; a web page is not so lucky.
 *
 * So the browser never talks to the service. It talks to this, on the site's
 * own origin, and this talks to the service from a server, where the rule does
 * not exist. Nothing about the service changes.
 *
 * What this deliberately does NOT do:
 *
 *   - It does not mint, inspect or store tokens. The visitor's access token is
 *     forwarded exactly as received and is never written down here.
 *   - It does not hold any Stripe key. Checkout sessions are still created by
 *     the service, which is the only thing that knows the secret key.
 *   - It does not decide entitlement. That is still granted solely by Stripe's
 *     signed webhook, which this is not on the path of.
 *
 * In other words it moves requests and nothing else. Everything that could be
 * got wrong about payments stays in the one place that already gets it right.
 */

const SERVICE = "https://toki-api.onrender.com";

/** Endpoints a browser is allowed to reach through here.
 *
 * All three are POST-only on the service — including `account`, which answers
 * a GET with 405. The method is forwarded as given, so the caller has to send
 * POST even where GET would read more naturally. */
const ALLOWED = new Set(["account", "billing/checkout", "billing/portal"]);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequest(context) {
  const { request, params, env } = context;
  const path = Array.isArray(params.path) ? params.path.join("/") : params.path ?? "";

  /* The site's public configuration.
   *
   * Read from Cloudflare's environment rather than committed, even though both
   * values are public by design — the anon key identifies the project and
   * grants nothing, and row-level security is what actually protects data.
   * Keeping them here means the repository carries no configuration at all. */
  if (path === "config") {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json(503, { error: "Sign-in is not configured for this deployment." });
    }
    return new Response(
      JSON.stringify({
        supabaseUrl: env.SUPABASE_URL,
        supabaseAnonKey: env.SUPABASE_ANON_KEY,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          // Public and slow-changing, but not immutable: a short cache keeps a
          // rotated key from being served for hours.
          "cache-control": "public, max-age=300",
        },
      },
    );
  }

  /* An allow-list, not a pass-through.
   *
   * An open proxy would let anyone use this origin to reach every endpoint of
   * the service, including /vision — which costs real money per call. Only the
   * three routes the site actually needs are forwarded. */
  if (!ALLOWED.has(path)) {
    return json(404, { error: "No such endpoint." });
  }

  const upstream = new Request(`${SERVICE}/${path}`, {
    method: request.method,
    headers: {
      // Forwarded verbatim. The service verifies it; this does not read it.
      authorization: request.headers.get("authorization") ?? "",
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
  });

  try {
    const response = await fetch(upstream);
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        // Never cache an answer that depends on who is asking.
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    // The service sleeps on its free host and can take a moment to wake. Say
    // so plainly rather than surfacing a raw network failure.
    return json(503, {
      error: "The Toki service did not respond. It may be waking up — try again.",
    });
  }
}
