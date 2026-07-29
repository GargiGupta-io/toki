// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifying the access token the desktop app sends.
 *
 * Supabase signs these with HS256 using the project's JWT secret, so the check
 * is a hash comparison against a secret only the server holds. Doing it here
 * rather than trusting the token's contents is the whole point: a token is
 * three base64 segments any client can write, and the `sub` claim naming a user
 * is worth nothing until the signature says the server issued it.
 *
 * Implemented against node:crypto rather than a JWT library. The algorithm is
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
