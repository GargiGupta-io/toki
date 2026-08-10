/**
 * Signing in, and paying.
 *
 * Two separate things that share a page, which is the whole reason this file
 * is shaped the way it is.
 *
 * Nobody is asked to sign in until they have said what they want. Signing in
 * is then a step toward something rather than a toll booth in front of a price
 * list — every other page on this site stays public and unauthenticated, and
 * both prices are readable by a stranger.
 *
 * But sign-in is also offered on its own, above the cards. Someone coming back
 * to check what they're paying for, or to cancel, has no business being walked
 * through a checkout button to get there. So there are two entry points and
 * they must not be confused with each other:
 *
 *   Sign in       → sign in, come back, stop.
 *   Get Pro       → sign in if needed, come back, carry straight on to Stripe.
 *
 * The difference is one remembered word. The round trip through Google discards
 * everything in the page, so what the person was doing is written down before
 * they leave and read back when they return. Without that, signing in dumps
 * someone back on the page with no memory of why they signed in, and they have
 * to find the button again — which reads as the payment having failed.
 *
 * What this file does not do: it never sees a Stripe key, never decides
 * entitlement, and never talks to the Toki service directly. It asks this
 * site's own /api, which forwards to the service from a server. Entitlement is
 * still granted only by Stripe's signed webhook, exactly as before.
 */

(() => {
  "use strict";

  const INTENT_KEY = "toki:after-sign-in";

  const button = document.getElementById("pay");
  const note = document.getElementById("pay-note");
  const state = document.getElementById("account-state");
  const signinBtn = document.getElementById("signin");
  const signoutBtn = document.getElementById("signout");

  if (!button) return;

  let client = null;

  function say(message, busy) {
    if (note) note.textContent = message;
    button.disabled = Boolean(busy);
  }

  function whoami(message) {
    if (state) state.textContent = message;
  }

  /** Which of the two buttons is offered, never both. */
  function showSignedIn(yes) {
    if (signinBtn) signinBtn.hidden = yes;
    if (signoutBtn) signoutBtn.hidden = !yes;
  }

  function busyAccount(yes) {
    if (signinBtn) signinBtn.disabled = yes;
    if (signoutBtn) signoutBtn.disabled = yes;
  }

  async function api(path, token) {
    // Every one of these is POST-only on the service — /account answers a GET
    // with 405 — so the method is fixed here rather than left to each caller.
    const response = await fetch(`/api/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: token ? `Bearer ${token}` : "",
      },
      body: "{}",
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  }

  async function start() {
    const config = await fetch("/api/config").then((r) => (r.ok ? r.json() : null));
    if (!config) {
      whoami("Sign-in is unavailable on this deployment.");
      showSignedIn(false);
      busyAccount(true);
      say("Sign-in is unavailable on this deployment.", true);
      return;
    }

    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        // A code left in the address bar after sign-in is noise, and a refresh
        // would try to spend a code that has already been used.
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });

    if (signinBtn) signinBtn.onclick = () => signIn(null);
    if (signoutBtn) signoutBtn.onclick = signOut;

    const { data } = await client.auth.getSession();
    const session = data.session ?? null;

    const intent = sessionStorage.getItem(INTENT_KEY);
    if (session && intent === "checkout") {
      sessionStorage.removeItem(INTENT_KEY);
      history.replaceState(null, "", location.pathname);
      await checkout(session.access_token);
      return;
    }
    // Arrived back from a plain sign-in: clear the note, don't buy anything.
    if (intent) sessionStorage.removeItem(INTENT_KEY);

    await render(session);
  }

  async function render(session) {
    busyAccount(false);

    if (!session) {
      showSignedIn(false);
      whoami("You're not signed in.");
      button.textContent = "Get Pro";
      say("You'll be asked to sign in first.", false);
      button.onclick = () => signIn("checkout");
      return;
    }

    showSignedIn(true);
    const email = session.user?.email ?? "your account";
    whoami(`Signed in as ${email}. Checking your plan…`);

    const account = await api("account", session.access_token);
    if (!account.ok) {
      whoami(`Signed in as ${email}.`);
      button.textContent = "Get Pro";
      say("Couldn't check your plan just now. You can still continue.", false);
      button.onclick = () => checkout(session.access_token);
      return;
    }

    const who = account.body.email ?? email;

    // `entitled` is the service's single answer to "is this person paying" —
    // it already accounts for a cancelled subscription that still has time
    // left on it, so nothing here needs to re-derive that.
    if (account.body.entitled) {
      whoami(`Signed in as ${who} — Pro is active.`);
      button.textContent = "Manage subscription";
      say("Change or cancel your subscription on Stripe.", false);
      button.onclick = () => portal(session.access_token);
      return;
    }

    whoami(`Signed in as ${who} — on the free tier.`);
    button.textContent = "Get Pro";
    say("", false);
    button.onclick = () => checkout(session.access_token);
  }

  /** `intent` is "checkout" to continue paying on return, or null to just
   *  sign in and stop there. */
  async function signIn(intent) {
    // Written down before leaving, because the round trip through the provider
    // discards everything else.
    if (intent) sessionStorage.setItem(INTENT_KEY, intent);
    else sessionStorage.removeItem(INTENT_KEY);

    busyAccount(true);
    say("Taking you to sign in…", true);

    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}${location.pathname}` },
    });

    if (error) {
      sessionStorage.removeItem(INTENT_KEY);
      busyAccount(false);
      say("Sign-in could not start. Try again.", false);
    }
  }

  async function signOut() {
    busyAccount(true);
    whoami("Signing out…");
    await client.auth.signOut().catch(() => {});
    await render(null);
  }

  async function checkout(token) {
    say("Opening checkout…", true);
    const result = await api("billing/checkout", token);
    if (result.ok && result.body.url) {
      location.href = result.body.url;
      return;
    }
    say(result.body.error ?? "Checkout is unavailable right now.", false);
  }

  async function portal(token) {
    say("Opening your billing page…", true);
    const result = await api("billing/portal", token);
    if (result.ok && result.body.url) {
      location.href = result.body.url;
      return;
    }
    say(result.body.error ?? "The billing page is unavailable right now.", false);
  }

  start().catch(() => {
    whoami("Something went wrong setting up sign-in.");
    busyAccount(false);
    say("Something went wrong setting up sign-in.", false);
  });
})();
