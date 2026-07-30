// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * The sign-in exchange, and why it uses PKCE.
 *
 * A desktop app is distributed to everyone, so it cannot hold a client secret:
 * anything shipped inside it can be read out of the binary. Without a secret,
 * the authorization code coming back through `toki://` is the only thing
 * standing between an attacker and a session — and any program on the machine
 * can register a URL scheme and race for that callback.
 *
 * PKCE closes it. Toki invents a random verifier, sends only its SHA-256 hash
 * when starting sign-in, and presents the original when redeeming the code. A
 * stolen code is then worthless without the verifier, which never leaves this
 * process. Skipping this is *the* classic desktop OAuth mistake.
 */

export const authRedirectUri = "toki://auth/callback";

export type PkcePair = {
  /** Kept in memory only, and only until the code is redeemed. */
  verifier: string;
  /** Sent when starting sign-in. Safe to be seen. */
  challenge: string;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createPkcePair(
  randomBytes: (length: number) => Uint8Array = (length) =>
    crypto.getRandomValues(new Uint8Array(length)),
): Promise<PkcePair> {
  // 32 bytes of CSPRNG output. The verifier is the only secret in this flow,
  // so it must not be derived from anything guessable such as a timestamp.
  const verifier = base64Url(randomBytes(32));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl({
  supabaseUrl,
  provider,
  challenge,
}: {
  supabaseUrl: string;
  provider: "google" | "apple";
  challenge: string;
}): string {
  const url = new URL("/auth/v1/authorize", supabaseUrl);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", authRedirectUri);
  url.searchParams.set("code_challenge", challenge);
  // S256, never "plain". Sending the verifier itself as the challenge would
  // defeat the entire mechanism.
  url.searchParams.set("code_challenge_method", "s256");
  return url.toString();
}

export type CallbackResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/**
 * Read the authorization code out of the callback URL.
 *
 * Anything can send this app a toki:// link, so nothing here is trusted beyond
 * its shape: the path must be the one we asked for, and a code must be present.
 * The code is still worthless without the verifier held in memory.
 */
export function readAuthCallback(rawUrl: string): CallbackResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "That sign-in link could not be read." };
  }

  if (url.protocol !== "toki:" || `//${url.host}${url.pathname}` !== "//auth/callback") {
    return { ok: false, error: "That link is not a sign-in callback." };
  }

  const providerError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    return { ok: false, error: providerError };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return { ok: false, error: "That sign-in link carried no code." };
  }

  return { ok: true, code };
}

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds. */
  expiresAt: number;
  email: string | null;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { email?: string };
  error_description?: string;
  error?: string;
};

/**
 * How a token request actually gets sent.
 *
 * Not `fetch`. The webview's content security policy permits no remote origin
 * at all, so a request made from JavaScript would never leave the process. The
 * real transport hands the call to Rust, which keeps that policy intact and
 * keeps the exchange out of a context where any injected script could observe
 * it. Tests pass a fake.
 */
export type TokenTransport = (
  grantType: "pkce" | "refresh_token",
  payload: Record<string, string>,
) => Promise<unknown>;

function readTokens(raw: unknown): SessionTokens {
  const body = (raw ?? {}) as TokenResponse;

  if (!body.access_token || !body.refresh_token) {
    throw new Error(
      body.error_description ?? body.error ?? "Sign-in could not be completed.",
    );
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
    email: body.user?.email ?? null,
  };
}

export async function exchangeCodeForSession({
  code,
  verifier,
  transport,
}: {
  code: string;
  verifier: string;
  transport: TokenTransport;
}): Promise<SessionTokens> {
  return readTokens(
    await transport("pkce", { auth_code: code, code_verifier: verifier }),
  );
}

export async function refreshSession({
  refreshToken,
  transport,
}: {
  refreshToken: string;
  transport: TokenTransport;
}): Promise<SessionTokens> {
  return readTokens(
    await transport("refresh_token", { refresh_token: refreshToken }),
  );
}

/**
 * Refresh a minute before expiry rather than on failure.
 *
 * Waiting for a 401 means one request fails first, and in the middle of a
 * guidance call that reads as the feature being broken.
 */
export function needsRefresh(
  tokens: SessionTokens,
  now: Date = new Date(),
): boolean {
  return tokens.expiresAt * 1000 - now.getTime() < 60_000;
}
