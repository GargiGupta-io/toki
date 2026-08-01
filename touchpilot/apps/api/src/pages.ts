// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * The two pages a customer's browser lands on after Stripe.
 *
 * Stripe only redirects to http or https, so `toki://` cannot be used and the
 * browser has to be sent somewhere real. Serving these from the service itself
 * means checkout works with no website, no domain, and nothing else deployed —
 * the address Fly issues on deploy is enough.
 *
 * They are deliberately tiny and self-contained: no fonts, no scripts, no
 * images, nothing fetched from anywhere. A page that runs no code cannot leak
 * who visited it to anyone, and someone has just typed a card number on the
 * previous screen.
 *
 * **Neither page is evidence of payment.** They are only what a browser gets
 * pointed at, and anyone can visit either by typing the address. Entitlement
 * comes from the signed webhook and nothing else.
 */

function page(title: string, heading: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    margin: 0; min-height: 100vh;
    display: grid; place-items: center;
    padding: 2rem;
    background: Canvas; color: CanvasText;
  }
  main { max-width: 28rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
  p { margin: 0 0 0.75rem; opacity: 0.85; }
  .quiet { font-size: 0.875rem; opacity: 0.6; }
</style>
</head>
<body>
<main>
<h1>${heading}</h1>
${body}
</main>
</body>
</html>
`;
}

export const thanksPage = page(
  "Toki — payment received",
  "You're all set",
  `<p>Your Toki Pro subscription is active. You can close this tab and go back
  to Toki.</p>
  <p class="quiet">Toki checks your plan when you return to it. If it still
  shows the free plan, open Settings from the Toki panel and choose Refresh
  plan under Account.</p>`,
);

export const pricingPage = page(
  "Toki — checkout cancelled",
  "Nothing was charged",
  `<p>You closed checkout before paying, so no payment was taken.</p>
  <p class="quiet">You can start again any time from Settings in Toki, under
  Account.</p>`,
);

/**
 * What a person sees at the root of the service.
 *
 * Supabase sends someone here when a sign-in fails, because a failed sign-in
 * cannot safely be sent to the app's own callback -- so the fallback is
 * whatever Site URL is configured, which is this service. Before this existed
 * they arrived at an API error saying "Only POST is supported", which tells
 * them nothing and looks broken.
 *
 * The message names the one thing that actually recovers it: start again from
 * inside Toki. Reloading the page cannot work -- the address holds a callback
 * that has already been spent, so retrying it fails identically forever.
 */
export function rootPage(query: URLSearchParams): string {
  const description =
    query.get("error_description") ?? query.get("error") ?? null;

  if (description == null) {
    return page(
      "Toki",
      "Toki",
      `<p>This is the service Toki talks to. There is nothing to see here.</p>`,
    );
  }

  const expired = /expired|state/i.test(description);

  return page(
    "Toki — sign-in did not finish",
    "Sign-in did not finish",
    `<p>${expired
      ? "The sign-in took too long and the link expired."
      : escapeText(description)}</p>
    <p class="quiet">Go back to Toki and choose Sign in again. Reloading this
    page will not work: the address holds a link that has already been used.</p>`,
  );
}

/** Provider text is shown to a person, so it must not carry markup through. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function htmlResponse(body: string) {
  return {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // The page is static and carries nothing about the visitor, but it is
      // still reached straight after a payment. Nothing is cached and nothing
      // is embeddable.
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    },
    body,
  };
}
