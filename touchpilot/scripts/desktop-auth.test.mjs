import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";

import {
  buildAuthorizeUrl,
  createPkcePair,
  needsRefresh,
  readAuthCallback,
} from "../apps/desktop/src/authPkce.ts";
import {
  AuthSession,
  describePlan,
  parseStoredSession,
  readAuthConfig,
} from "../apps/desktop/src/authSession.ts";

// The browser globals this code assumes. Node has WebCrypto but not btoa in
// every version's global scope.
globalThis.crypto ??= webcrypto;
globalThis.btoa ??= (binary) => Buffer.from(binary, "binary").toString("base64");

const config = {
  supabaseUrl: "https://project.supabase.co",
  anonKey: "anon-key",
};

function tokenResponse(overrides = {}) {
  return {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_in: 3600,
    user: { email: "a@b.com" },
    ...overrides,
  };
}

function makeDeps(overrides = {}) {
  const saved = [];
  return {
    saved,
    deps: {
      config,
      load: async () => null,
      save: async (value) => {
        saved.push(value);
      },
      clear: async () => {},
      openUrl: async () => {},
      transport: async () => tokenResponse(),
      ...overrides,
    },
  };
}

test("the challenge is the hash of the verifier, never the verifier itself", async () => {
  const { verifier, challenge } = await createPkcePair();

  assert.notEqual(challenge, verifier, "sending the verifier defeats PKCE");

  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(challenge, expected);
});

test("each sign-in gets a fresh verifier", async () => {
  const first = await createPkcePair();
  const second = await createPkcePair();
  assert.notEqual(first.verifier, second.verifier);
});

test("the authorize URL asks for s256, not plain", () => {
  const url = new URL(
    buildAuthorizeUrl({ ...config, provider: "google", challenge: "abc" }),
  );

  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
  assert.equal(url.searchParams.get("code_challenge"), "abc");
  assert.equal(url.searchParams.get("redirect_to"), "toki://auth/callback");
  assert.equal(
    url.searchParams.get("code_verifier"),
    null,
    "the verifier must never leave the app",
  );
});

test("a callback for some other path is refused", () => {
  // Any program can register a URL scheme and send this app a link.
  assert.equal(readAuthCallback("toki://auth/callback?code=x").ok, true);
  assert.equal(readAuthCallback("toki://something-else?code=x").ok, false);
  assert.equal(readAuthCallback("https://evil.test/auth/callback?code=x").ok, false);
  assert.equal(readAuthCallback("not a url").ok, false);
  assert.equal(readAuthCallback("toki://auth/callback").ok, false, "no code");
});

test("an error from the provider is surfaced, not swallowed", () => {
  const result = readAuthCallback(
    "toki://auth/callback?error=access_denied&error_description=User%20said%20no",
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "User said no");
});

test("a code arriving without a sign-in underway is refused", async () => {
  // A cold start delivers the link before anything is set up, and a hostile
  // process can send one at any time. Neither may produce a session.
  let exchanged = false;
  const { deps } = makeDeps({
    transport: async () => {
      exchanged = true;
      return tokenResponse();
    },
  });

  const session = new AuthSession(deps);
  const state = await session.completeSignIn("toki://auth/callback?code=stolen");

  assert.equal(state.status, "error");
  assert.equal(exchanged, false, "no exchange without a verifier");
});

test("the verifier is sent once and cannot be replayed", async () => {
  const bodies = [];
  const { deps } = makeDeps({
    transport: async (grantType, payload) => {
      bodies.push({ grantType, ...payload });
      return tokenResponse();
    },
  });

  const session = new AuthSession(deps);
  await session.signIn();
  assert.equal(session.state().status, "waiting_for_browser");

  const first = await session.completeSignIn("toki://auth/callback?code=abc");
  assert.equal(first.status, "signed_in");
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].auth_code, "abc");
  assert.ok(bodies[0].code_verifier, "the verifier is presented at redemption");

  // The same link delivered twice must not redeem again.
  const replay = await session.completeSignIn("toki://auth/callback?code=abc");
  assert.equal(replay.status, "error");
  assert.equal(bodies.length, 1, "the code is single use");
});

test("a signed-in session is written to the store, and read back", async () => {
  const { deps, saved } = makeDeps({ transport: async () => tokenResponse() });

  const session = new AuthSession(deps);
  await session.signIn();
  await session.completeSignIn("toki://auth/callback?code=abc");

  assert.equal(saved.length, 1);
  const restored = new AuthSession({ ...deps, load: async () => saved[0] });
  const state = await restored.restore();
  assert.equal(state.status, "signed_in");
  assert.equal(state.email, "a@b.com");
});

test("an unreadable stored session means signed out, not a crash", async () => {
  assert.equal(parseStoredSession(null), null);
  assert.equal(parseStoredSession("{not json"), null);
  assert.equal(parseStoredSession('{"accessToken":"a"}'), null, "incomplete");

  const { deps } = makeDeps({ load: async () => "{corrupt" });
  assert.equal((await new AuthSession(deps).restore()).status, "signed_out");
});

test("a token about to expire is refreshed before it is used", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const at = (seconds) => ({
    accessToken: "a",
    refreshToken: "r",
    expiresAt: Math.floor(now.getTime() / 1000) + seconds,
    email: null,
  });

  assert.equal(needsRefresh(at(3600), now), false);
  assert.equal(needsRefresh(at(30), now), true, "refresh before the failure");
  assert.equal(needsRefresh(at(-1), now), true);
});

test("simultaneous requests share one refresh", async () => {
  // Each exchange invalidates the previous refresh token, so two refreshes in
  // flight together would sign the user out mid-use.
  let refreshes = 0;
  const { deps } = makeDeps({
    load: async () =>
      JSON.stringify({
        accessToken: "old",
        refreshToken: "r",
        expiresAt: 0,
        email: null,
      }),
    transport: async () => {
      refreshes += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return tokenResponse({ access_token: "fresh" });
    },
  });

  const session = new AuthSession(deps);
  await session.restore();

  const tokens = await Promise.all([
    session.accessToken(),
    session.accessToken(),
    session.accessToken(),
  ]);

  assert.deepEqual(tokens, ["fresh", "fresh", "fresh"]);
  assert.equal(refreshes, 1, "one refresh, not three");
});

test("a refresh token that no longer works ends the session", async () => {
  let cleared = false;
  const { deps } = makeDeps({
    load: async () =>
      JSON.stringify({
        accessToken: "old",
        refreshToken: "revoked",
        expiresAt: 0,
        email: null,
      }),
    clear: async () => {
      cleared = true;
    },
    transport: async () => ({ error_description: "Invalid refresh token" }),
  });

  const session = new AuthSession(deps);
  await session.restore();

  assert.equal(await session.accessToken(), null);
  assert.equal(cleared, true, "a dead credential is not kept");
  assert.equal(session.state().status, "signed_out");
});

test("a refresh that cannot be written down still signs the request", async () => {
  // The one that bit. Exchanging the credential and saving the result shared a
  // try, so a keychain that refused every write was read as a rejected refresh
  // token: signed out on each refresh, while signed in, with a keychain message
  // over whatever the person was actually doing.
  let cleared = 0;
  const { deps } = makeDeps({
    load: async () =>
      JSON.stringify({
        accessToken: "old",
        refreshToken: "still-good",
        expiresAt: 0,
        email: "a@b.com",
      }),
    save: async () => {
      throw new Error("The specified item could not be found in the keychain.");
    },
    clear: async () => {
      cleared += 1;
    },
    transport: async () => tokenResponse({ access_token: "access-2" }),
  });

  const session = new AuthSession(deps);
  await session.restore();

  assert.equal(
    await session.accessToken(),
    "access-2",
    "the refreshed token works whether or not it could be stored",
  );
  assert.equal(session.state().status, "signed_in");
  assert.equal(cleared, 0, "a working session is not thrown away");
});

test("an expired sign-in ends quietly when the store will not forget it", async () => {
  // A keychain bug made every write fail, so clearing the dead credential threw
  // and the throw escaped into whatever the person was doing -- "Guidance
  // unavailable: the specified item could not be found", which names neither
  // what went wrong nor what to do. The sign-in had simply expired.
  const { deps } = makeDeps({
    load: async () =>
      JSON.stringify({
        accessToken: "old",
        refreshToken: "revoked",
        expiresAt: 0,
        email: null,
      }),
    clear: async () => {
      throw new Error("The specified item could not be found in the keychain.");
    },
    transport: async () => ({ error_description: "Invalid refresh token" }),
  });

  const session = new AuthSession(deps);
  await session.restore();

  assert.equal(
    await session.accessToken(),
    null,
    "asking for a token reports no token, not a storage error",
  );
  assert.equal(
    session.state().status,
    "signed_out",
    "the session is over even though storage kept the credential",
  );
});

test("signing out reports a store that refuses to forget", async () => {
  // The opposite of the case above. Pressing Sign out and being told nothing
  // while the credential survives is worse than an error, so this path keeps
  // throwing; only the automatic one stays quiet.
  const { deps } = makeDeps({
    clear: async () => {
      throw new Error("The specified item could not be found in the keychain.");
    },
  });

  await assert.rejects(() => new AuthSession(deps).signOut());
});

test("signing out clears the store even with nothing signed in", async () => {
  let cleared = 0;
  const { deps } = makeDeps({
    clear: async () => {
      cleared += 1;
    },
  });

  const session = new AuthSession(deps);
  assert.equal((await session.signOut()).status, "signed_out");
  assert.equal(cleared, 1);
  assert.equal(await session.accessToken(), null);
});

test("sign-in is absent rather than broken when no project is configured", () => {
  assert.equal(readAuthConfig({}), null);
  assert.equal(readAuthConfig({ VITE_TOKI_SUPABASE_URL: "https://x.co" }), null);
  assert.deepEqual(
    readAuthConfig({
      VITE_TOKI_SUPABASE_URL: " https://x.co ",
      VITE_TOKI_SUPABASE_ANON_KEY: " key ",
    }),
    { supabaseUrl: "https://x.co", anonKey: "key" },
  );
});

// --- Several windows, one sign-in -------------------------------------------

test("signing in from another window takes effect without a restart", async () => {
  // Toki runs the overlay and Preferences as separate windows, each with its
  // own JavaScript context and therefore its own copy of the session. Sign-in
  // happens in Preferences; the overlay is what makes guidance requests. If the
  // overlay only read the store once at launch, a user would sign in, see
  // "signed in" in Preferences, and have guidance keep refusing them until they
  // quit and reopened the app.
  const store = { value: null };
  const make = () =>
    new AuthSession({
      ...makeDeps().deps,
      load: async () => store.value,
      save: async (value) => {
        store.value = value;
      },
      clear: async () => {
        store.value = null;
      },
    });

  const overlay = make();
  const preferences = make();

  // The overlay starts before anyone has signed in.
  assert.equal((await overlay.restore()).status, "signed_out");
  assert.equal(await overlay.accessToken(), null);

  // Sign-in happens in the other window.
  await preferences.signIn();
  assert.equal(
    (await preferences.completeSignIn("toki://auth/callback?code=abc")).status,
    "signed_in",
  );

  assert.equal(
    await overlay.accessToken(),
    "access-1",
    "the overlay must pick up a sign-in made elsewhere",
  );
});

test("signing out elsewhere stops the other window using the old token", async () => {
  // The lazy re-read cannot catch this on its own: the token this window is
  // holding stays valid until it expires, so without being told, the overlay
  // would keep making paid requests as a user who has signed out.
  const store = { value: null };
  const deps = {
    ...makeDeps().deps,
    load: async () => store.value,
    save: async (value) => {
      store.value = value;
    },
    clear: async () => {
      store.value = null;
    },
  };

  const overlay = new AuthSession(deps);
  const preferences = new AuthSession(deps);

  await preferences.signIn();
  await preferences.completeSignIn("toki://auth/callback?code=abc");
  assert.equal(await overlay.accessToken(), "access-1");

  await preferences.signOut();

  // Without the notification the overlay still holds a usable token.
  overlay.invalidate();
  assert.equal(
    await overlay.accessToken(),
    null,
    "a signed-out user must not keep making paid requests",
  );
});

test("a plan is described in the user's terms, and the unknown case is not a plan", () => {
  assert.match(
    describePlan(null),
    /could not be checked/,
    "an unreachable service must not be reported as the free plan",
  );
  assert.match(
    describePlan({ tier: "free", status: "inactive", currentPeriodEnd: null, entitled: false }),
    /Free plan/,
  );
  assert.match(
    describePlan({
      tier: "pro",
      status: "active",
      currentPeriodEnd: "2027-01-01T00:00:00.000Z",
      entitled: true,
    }),
    /Toki Pro\. Renews/,
  );
  // Cancelled but still inside a paid period: saying only "cancelled" would
  // read as access already lost.
  assert.match(
    describePlan({
      tier: "pro",
      status: "canceled",
      currentPeriodEnd: "2027-01-01T00:00:00.000Z",
      entitled: true,
    }),
    /You keep it until/,
  );
  assert.match(
    describePlan({ tier: "pro", status: "past_due", currentPeriodEnd: null, entitled: false }),
    /did not go through/,
  );
});
