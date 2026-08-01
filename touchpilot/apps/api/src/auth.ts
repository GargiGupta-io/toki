// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";

/**
 * Verifying the access token the desktop app sends.
 *
 * Doing it here rather than trusting the token's contents is the whole point: a
 * token is three base64 segments any client can write, and the `sub` claim
 * naming a user is worth nothing until the signature says the server issued it.
 *
 * Two signing schemes, because Supabase has both.
 *
 * The original one signs with HS256 against a shared project secret. Newer
 * projects sign with **ES256** against a rotating key pair and publish the
 * public half at the project's JWKS endpoint. A server that only knows HS256
 * rejects every genuine token from such a project as using an unsupported
 * algorithm -- which reads, to the person holding it, as being signed out while
 * demonstrably signed in, and no amount of signing in again can fix it.
 *
 * Implemented against node:crypto rather than a JWT library. The algorithms are
 * fixed, the claims are three fields, and a dependency in the request path of a
 * service that handles payment state is worth avoiding for that.
 */

export type VerifiedUser = {
  id: string;
  email: string | null;
};

export type TokenRejection =
  | "missing"
  | "malformed"
  | "bad_signature"
  | "expired"
  | "wrong_algorithm";

export type TokenVerification =
  | { valid: true; user: VerifiedUser }
  | { valid: false; reason: TokenRejection };

export const tokenRejectionMessages: Record<TokenRejection, string> = {
  missing: "Sign in to use Toki.",
  malformed: "That sign-in token is not readable.",
  bad_signature: "That sign-in token was not issued by Toki.",
  expired: "Your session expired. Sign in again.",
  wrong_algorithm: "That sign-in token uses an unsupported algorithm.",
};

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

export function verifyAccessToken(
  token: string | null | undefined,
  jwtSecret: string,
  now: Date = new Date(),
): TokenVerification {
  const trimmed = token?.trim();

  if (trimmed == null || trimmed.length === 0) {
    return { valid: false, reason: "missing" };
  }

  const segments = trimmed.split(".");
  if (segments.length !== 3) {
    return { valid: false, reason: "malformed" };
  }

  const [encodedHeader, encodedPayload, providedSignature] = segments;

  let header: { alg?: string };
  let payload: { sub?: string; email?: string; exp?: number };
  try {
    header = decodeSegment(encodedHeader) as typeof header;
    payload = decodeSegment(encodedPayload) as typeof payload;
  } catch {
    return { valid: false, reason: "malformed" };
  }

  // Pin the algorithm. Accepting whatever the header names is the classic JWT
  // vulnerability: a token declaring "none", or naming an asymmetric algorithm
  // so the public key gets used as an HMAC secret, would otherwise verify.
  if (header.alg !== "HS256") {
    return { valid: false, reason: "wrong_algorithm" };
  }

  const expected = createHmac("sha256", jwtSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const provided = Buffer.from(providedSignature, "base64url");

  // Length must match before comparing, because timingSafeEqual throws on a
  // mismatch rather than returning false.
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return { valid: false, reason: "bad_signature" };
  }

  // Only after the signature holds is anything in the payload trustworthy.
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= now.getTime()) {
    return { valid: false, reason: "expired" };
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return { valid: false, reason: "malformed" };
  }

  return {
    valid: true,
    user: {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    },
  };
}

/**
 * The project's published signing keys.
 *
 * The URL is built from the configured project, never from the token. Taking it
 * from the token's `iss` would let anyone present a token naming their own key
 * server and have it verified against keys they control -- the signature would
 * hold and the identity would be whatever they typed.
 *
 * Keys rotate, so an unrecognised `kid` refetches. That refetch is rate limited:
 * without it, a stream of tokens naming random key ids would turn every request
 * into an outbound fetch.
 */
export type SupabaseJwks = {
  keyFor(kid: string): Promise<JsonWebKey | null>;
};

type JwksFetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function createSupabaseJwks({
  supabaseUrl,
  fetchImpl = fetch as unknown as JwksFetch,
  minRefetchMs = 60_000,
  now = () => Date.now(),
}: {
  supabaseUrl: string;
  fetchImpl?: JwksFetch;
  minRefetchMs?: number;
  now?: () => number;
}): SupabaseJwks {
  const base = supabaseUrl.trim().replace(/\/+$/u, "");
  if (!base.startsWith("https://")) {
    throw new Error("The Supabase URL must use https.");
  }

  const url = `${base}/auth/v1/.well-known/jwks.json`;
  let keys = new Map<string, JsonWebKey>();
  let lastFetchedAt = -Infinity;
  let inFlight: Promise<void> | null = null;

  async function refresh(): Promise<void> {
    // Concurrent misses share one fetch rather than each opening a connection.
    inFlight ??= (async () => {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as { keys?: unknown };
        if (!Array.isArray(body.keys)) {
          return;
        }

        const next = new Map<string, JsonWebKey>();
        for (const key of body.keys as JsonWebKey[]) {
          // Only what this server can actually check. Storing keys for
          // algorithms it does not verify invites a later change to reach for
          // one without noticing which curve it is on.
          if (
            key != null &&
            typeof (key as { kid?: unknown }).kid === "string" &&
            key.kty === "EC" &&
            key.crv === "P-256"
          ) {
            next.set((key as { kid: string }).kid, key);
          }
        }
        keys = next;
      } catch {
        // Keep whatever was already known. A network blip must not sign
        // everybody out.
      } finally {
        lastFetchedAt = now();
      }
    })().finally(() => {
      inFlight = null;
    });

    await inFlight;
  }

  return {
    async keyFor(kid: string): Promise<JsonWebKey | null> {
      const known = keys.get(kid);
      if (known != null) {
        return known;
      }

      if (now() - lastFetchedAt < minRefetchMs) {
        return null;
      }

      await refresh();
      return keys.get(kid) ?? null;
    },
  };
}

/**
 * Verify a bearer token against whichever scheme the project uses.
 *
 * The algorithm is still pinned -- one of exactly two, each checked against a
 * key chosen by this server. What the token's header names only selects between
 * them; it never selects the key material, which is what the classic
 * algorithm-confusion attack needs.
 */
export async function verifyBearerToken(
  token: string | null | undefined,
  {
    jwtSecret,
    jwks,
  }: {
    jwtSecret?: string;
    jwks?: SupabaseJwks;
  },
  now: Date = new Date(),
): Promise<TokenVerification> {
  const trimmed = token?.trim();

  if (trimmed == null || trimmed.length === 0) {
    return { valid: false, reason: "missing" };
  }

  const segments = trimmed.split(".");
  if (segments.length !== 3) {
    return { valid: false, reason: "malformed" };
  }

  const [encodedHeader, encodedPayload, providedSignature] = segments;

  let header: { alg?: string; kid?: string };
  let payload: { sub?: string; email?: string; exp?: number };
  try {
    header = decodeSegment(encodedHeader) as typeof header;
    payload = decodeSegment(encodedPayload) as typeof payload;
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (header.alg === "HS256") {
    // Unchanged, and still the whole check for a project on the shared secret.
    return jwtSecret == null
      ? { valid: false, reason: "wrong_algorithm" }
      : verifyAccessToken(trimmed, jwtSecret, now);
  }

  if (header.alg !== "ES256" || jwks == null || typeof header.kid !== "string") {
    return { valid: false, reason: "wrong_algorithm" };
  }

  const jwk = await jwks.keyFor(header.kid);
  if (jwk == null) {
    // An unknown key id is not a signature failure. It is this server being
    // unable to check, which must never read as "the token is forged".
    return { valid: false, reason: "bad_signature" };
  }

  let signatureHolds = false;
  try {
    const key = createPublicKey({ key: jwk as never, format: "jwk" });
    signatureHolds = verifySignature(
      "sha256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      // A JWT carries the two halves of an ECDSA signature concatenated. Node
      // expects DER unless told otherwise, and would reject every valid
      // signature without this.
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(providedSignature, "base64url"),
    );
  } catch {
    signatureHolds = false;
  }

  if (!signatureHolds) {
    return { valid: false, reason: "bad_signature" };
  }

  // Only after the signature holds is anything in the payload trustworthy.
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= now.getTime()) {
    return { valid: false, reason: "expired" };
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return { valid: false, reason: "malformed" };
  }

  return {
    valid: true,
    user: {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    },
  };
}
