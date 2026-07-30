// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

import {
  buildAuthorizeUrl,
  createPkcePair,
  exchangeCodeForSession,
  needsRefresh,
  readAuthCallback,
  refreshSession,
  type SessionTokens,
  type TokenTransport,
} from "./authPkce";

/**
 * Who is signed in, kept across restarts.
 *
 * This module owns the whole life of a session: starting sign-in, finishing it
 * when the browser comes back, keeping the access token fresh, and signing out.
 * Everything it touches from outside itself arrives through `SessionDeps`, so
 * the flow can be tested without a browser, a Keychain, or a network.
 *
 * The verifier lives in a variable here and nowhere else. It is never written
 * to disk, because a verifier that outlives the sign-in it belongs to is just a
 * second copy of the secret waiting to be found.
 */

export type AuthConfig = {
  supabaseUrl: string;
  anonKey: string;
};

/** Nothing about sign-in works without a project to sign in to. */
export function readAuthConfig(
  env: Record<string, string | undefined>,
): AuthConfig | null {
  const supabaseUrl = env.VITE_TOKI_SUPABASE_URL?.trim();
  const anonKey = env.VITE_TOKI_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  return { supabaseUrl, anonKey };
}

export type SessionDeps = {
  config: AuthConfig;
  /** Reads the stored session, or null. Backed by the Keychain. */
  load: () => Promise<string | null>;
  save: (session: string) => Promise<void>;
  clear: () => Promise<void>;
  /** Opens the system browser. */
  openUrl: (url: string) => Promise<void>;
  /** Sends a token request. Backed by Rust, so the webview stays offline. */
  transport: TokenTransport;
  now?: () => Date;
};

export type AuthState =
  | { status: "signed_out" }
  | { status: "waiting_for_browser" }
  | { status: "signed_in"; email: string | null }
  | { status: "error"; message: string };

export const signedOut: AuthState = Object.freeze({ status: "signed_out" });

/**
 * What plan someone is on, in their words.
 *
 * `null` means the service could not be asked -- offline, or not configured --
 * which is different from being on the free plan and must not be described as
 * it. Telling a paying customer they are on the free plan because the network
 * hiccuped is worse than saying nothing.
 */
export function describePlan(
  account: {
    tier: "free" | "pro";
    status: string;
    currentPeriodEnd: string | null;
    entitled: boolean;
  } | null,
): string {
  if (account == null) {
    return "Your plan could not be checked just now.";
  }

  const until =
    account.currentPeriodEnd == null
      ? null
      : new Date(account.currentPeriodEnd).toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

  if (account.entitled && account.status === "canceled") {
    // Cancelled but still inside a paid period. Saying only "cancelled" would
    // read as access already lost, which is both wrong and alarming.
    return until
      ? `Toki Pro, cancelled. You keep it until ${until}.`
      : "Toki Pro, cancelled. You keep it until the end of this period.";
  }

  if (account.entitled) {
    return until ? `Toki Pro. Renews ${until}.` : "Toki Pro.";
  }

  if (account.status === "past_due" || account.status === "unpaid") {
    return "Your last payment did not go through. Update your card to restore Toki Pro.";
  }

  return "Free plan. Live guidance is part of Toki Pro.";
}

/** What to tell the user, in their terms rather than the protocol's. */
export function describeAuthState(state: AuthState): string {
  switch (state.status) {
    case "signed_in":
      return state.email
        ? `Signed in as ${state.email}.`
        : "Signed in.";
    case "waiting_for_browser":
      return "Finish signing in in your browser. Toki is waiting.";
    case "error":
      return state.message;
    default:
      return "Not signed in. Signing in unlocks guidance and syncs your plan.";
  }
}

/**
 * Read a stored session back.
 *
 * Anything unreadable is treated as no session at all rather than as an error.
 * A corrupted entry should land the user on the sign-in button, not on a wall
 * they cannot get past.
 */
export function parseStoredSession(raw: string | null): SessionTokens | null {
  if (!raw) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as Partial<SessionTokens>;
    if (
      typeof value.accessToken !== "string" ||
      typeof value.refreshToken !== "string" ||
      typeof value.expiresAt !== "number"
    ) {
      return null;
    }
    return {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: value.expiresAt,
      email: typeof value.email === "string" ? value.email : null,
    };
  } catch {
    return null;
  }
}

export class AuthSession {
  private tokens: SessionTokens | null = null;
  /** Held only between opening the browser and redeeming the code. */
  private pendingVerifier: string | null = null;
  private refreshInFlight: Promise<SessionTokens | null> | null = null;
  private readonly deps: SessionDeps;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  state(): AuthState {
    if (this.tokens) {
      return { status: "signed_in", email: this.tokens.email };
    }
    return this.pendingVerifier ? { status: "waiting_for_browser" } : signedOut;
  }

  /**
   * Restore a previous sign-in from the store.
   *
   * Called at launch, and again whenever the session may have changed
   * elsewhere. Toki runs several windows, each with its own JavaScript context
   * and therefore its own copy of this object: signing in from Preferences
   * leaves the overlay's copy empty, and without re-reading the store the
   * overlay would keep reporting "not signed in" until the app was restarted.
   */
  async restore(): Promise<AuthState> {
    this.tokens = parseStoredSession(await this.deps.load());
    return this.state();
  }

  /** Forget the in-memory session so the next use re-reads the store. */
  invalidate(): void {
    this.tokens = null;
    this.refreshInFlight = null;
  }

  async signIn(provider: "google" | "apple" = "google"): Promise<AuthState> {
    const { verifier, challenge } = await createPkcePair();
    this.pendingVerifier = verifier;

    await this.deps.openUrl(
      buildAuthorizeUrl({
        supabaseUrl: this.deps.config.supabaseUrl,
        provider,
        challenge,
      }),
    );

    return this.state();
  }

  /**
   * Finish sign-in when the browser sends the app a toki:// link.
   *
   * A callback with no sign-in underway is dropped. That is not a rare case:
   * any process on the machine can fire a toki:// link at this app, and on a
   * cold start macOS delivers one before anything has been set up.
   */
  async completeSignIn(callbackUrl: string): Promise<AuthState> {
    const callback = readAuthCallback(callbackUrl);

    if (!callback.ok) {
      this.pendingVerifier = null;
      return { status: "error", message: callback.error };
    }

    const verifier = this.pendingVerifier;
    if (!verifier) {
      return {
        status: "error",
        message: "That sign-in did not start here. Try signing in again.",
      };
    }

    // Cleared before the exchange, not after: a code is single-use, so a second
    // delivery of the same link must not be redeemable.
    this.pendingVerifier = null;

    try {
      const tokens = await exchangeCodeForSession({
        code: callback.code,
        verifier,
        transport: this.deps.transport,
      });
      await this.persist(tokens);
      return this.state();
    } catch (error) {
      return { status: "error", message: (error as Error).message };
    }
  }

  /**
   * The access token to send with a request, refreshed if it is about to lapse.
   *
   * Concurrent callers share one refresh. Two guidance requests arriving
   * together would otherwise each spend the refresh token, and the second
   * exchange invalidates the first — signing the user out mid-use.
   */
  async accessToken(): Promise<string | null> {
    if (!this.tokens) {
      // The store is the shared truth between windows, so an empty copy asks
      // it once before concluding that nobody is signed in. This is what makes
      // signing in from Preferences take effect in the overlay without a
      // restart, and it is cheap: it only runs while signed out.
      await this.restore();
    }

    if (!this.tokens) {
      return null;
    }

    const now = this.deps.now?.() ?? new Date();
    if (!needsRefresh(this.tokens, now)) {
      return this.tokens.accessToken;
    }

    this.refreshInFlight ??= this.runRefresh().finally(() => {
      this.refreshInFlight = null;
    });

    return (await this.refreshInFlight)?.accessToken ?? null;
  }

  private async runRefresh(): Promise<SessionTokens | null> {
    const refreshToken = this.tokens?.refreshToken;
    if (!refreshToken) {
      return null;
    }

    try {
      const tokens = await refreshSession({
        refreshToken,
        transport: this.deps.transport,
      });
      await this.persist(tokens);
      return tokens;
    } catch {
      // A refresh token that no longer works means the session is over —
      // revoked, expired, or signed out elsewhere. Clear it rather than
      // retrying against a credential that will never be accepted again.
      await this.signOut();
      return null;
    }
  }

  async signOut(): Promise<AuthState> {
    this.tokens = null;
    this.pendingVerifier = null;
    await this.deps.clear();
    return signedOut;
  }

  private async persist(tokens: SessionTokens): Promise<void> {
    this.tokens = tokens;
    await this.deps.save(JSON.stringify(tokens));
  }
}
