# Toki

**A macOS assistant that watches your hands and shows you where to click.**

You hold up a hand; Toki tracks it and moves a soft marker across the screen.
You hold a key and say what you're looking for; Toki looks at your screen and
points at the control you need.

It points. **It never clicks, and it never moves your real cursor.** That
distinction is the product, and most of the engineering below follows from it.

Built by [Gargi Gupta](https://github.com/GargiGupta-io) · 700+ commits ·
432 tests

---

## The constraint everything follows from

Toki holds camera, microphone, and screen-recording permission at the same
time. That is the capability set of spyware. An app with those grants has to be
provably trustworthy, not merely well-intentioned, and that shapes nearly every
decision here.

Three consequences worth reading even if you read nothing else.

### The window can't reach the internet

The app's content security policy permits **zero remote origins** — not the
API, not the auth provider, not a font. MediaPipe's hand-tracking models are
bundled and checksum-pinned rather than fetched. Every outbound call — sign-in,
guidance, billing — is made from Rust instead.

The reasoning: a policy is per-window, not per-caller. Allowing Toki's own API
through allows it for *any* script that ever ends up in that window. Routing
through Rust also keeps access tokens out of the JavaScript heap entirely.

A test asserts nothing in the app calls `fetch`, because a direct call would be
blocked at runtime and would surface as a feature that mysteriously does
nothing.

### Nothing is ever searched for on your machine

Toki used to resolve a helper binary by scanning `~/.local/bin`,
`/opt/homebrew/bin`, then falling back to `which`.

On macOS, permissions attach to the **responsible process** — anything Toki
launches runs inside Toki's screen-recording grant. `~/.local/bin` is writable
without sudo. So any process running as the user could drop a file there and
have its code read the screen through Toki. An app that could never obtain that
permission would get it by having Toki run its code.

All directory searching was deleted. A path is used only because somebody typed
it into settings; it must be absolute and must exist.

### Secrets live in the Keychain, never in environment variables

This began as a bug, not a policy. **An app launched from Finder inherits no
shell environment**, so `OPENAI_API_KEY` is simply absent for every ordinary
user, however valid their key. It works only for the developer who launched it
from a terminal. That single root cause produced three separate bugs before it
was recognised.

---

## How it's put together

```
apps/desktop     Tauri app — Rust host, React and TypeScript front end
apps/api         The service: accounts, payments, and the vision call
packages/shared  Types both sides agree on
packages/ai      Guidance contracts and validation
```

**On your Mac.** Hand tracking runs locally through MediaPipe — camera frames
never leave the machine. The overlay, the pointer, the gesture state machines,
and the mapping from a model's answer to a place on screen are all here.

**On the server.** Only two things need one: a model credential that cannot be
shipped inside a distributed app, and a public address Stripe can deliver
payment notifications to. Sign-in and reading your plan go straight to Supabase
and need no service at all.

The service is handed a prompt and one image. **It knows nothing about your
display, your calibration, or what your accessibility scan found** — turning an
answer back into a place on screen happens on your Mac, where that knowledge
already lives. Its copy of your data is as close to useless as it can be made.

---

## Decisions worth defending

### Sign-in uses PKCE

A distributed desktop app cannot hold a client secret — anything shipped inside
it can be read out of the binary. Without one, the authorization code returning
through `toki://` is all that stands between an attacker and a session, and any
program on the machine can register a URL scheme and race for that callback.

PKCE closes it: a random verifier is invented locally, only its hash is sent
when sign-in starts, and the original is presented when the code is redeemed. A
stolen code is worthless. Skipping this is *the* classic desktop OAuth
vulnerability.

The verifier is cleared **before** the exchange, not after, so a replayed
callback cannot buy a second session.

### The payment webhook is answered before anything is parsed

It carries no token — the caller is Stripe, not a person — and the signature
covers the exact bytes sent. Parsing the JSON and re-serialising produces a
different string, every genuine event then fails, and that is the usual way
this check ends up disabled.

The endpoint is a public URL with no login, so that signature is the entire
security boundary. Without it, anyone who finds the address subscribes
themselves for free.

The webhook is also the **only** thing that grants access. The browser redirect
after checkout is not evidence of payment — it can be closed, replayed, or
typed by hand.

Event ids are claimed *before* the work, so racing duplicates cannot both get
through, and released on failure with a 500 — because a 500 asks Stripe to
retry, while a 200 drops the event permanently and leaves someone paying for
access they never received.

Webhooks are not delivered in order either, so an update carries the event's
timestamp and matches no row if an older one arrives late.

### The database is the trust boundary

The anon key ships inside the app and is **public by design** — it identifies
the project and grants nothing. Row-level security is what protects data. The
subscriptions table has a read policy and deliberately no insert or update
policy, so a client cannot set its own tier.

### Tests assert why, not what

> "A tier the client asks for is never honoured."
> "A failed event is released so Stripe retries it."
> "No request is sent while signed out."

Several were proven to fail *before* the fix rather than assumed to work — the
cross-window session tests were run against the old code and confirmed red, a
single green pixel was planted to confirm the monochrome icon check catches it,
a fake credential planted to confirm the secret scanner fires.

**A test that cannot fail is decoration.**

---

## Running it

You need your own Supabase project, Stripe account (test mode is fine), and a
model credential. Nothing here is shared.

```bash
cd touchpilot
npm install
npm run verify          # typecheck, Rust check, and every test
npm run desktop:dev     # the app
```

The service runs without credentials and **says so on every reply** rather than
inventing answers:

```bash
npm run api:dev
```

Deployment is in [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md).

---

## Honest state

Working and deployed: hand tracking, the overlay, sign-in, payments end to end,
the service on a free host.

Not done: guidance runs on fixtures until there are model credits, and it says
so. Notarization waits on a certificate. One known bug — an ordinary pinch
reaches the pressing state but fires no event.

---

## Licence

Source-available, not open source. Read it, evaluate it, learn from it.
Redistribution, derivative works, commercial use, and presenting it as your own
are not permitted. See [`LICENSE`](LICENSE).
