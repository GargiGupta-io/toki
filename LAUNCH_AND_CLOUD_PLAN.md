# Toki — Final Plan

Consolidates the launch-readiness work (complete), the security review, and the
remaining cloud work into one ordered list.

Security is threaded into the phase it belongs to rather than collected into a
phase of its own — a security phase at the end is how security becomes the thing
that gets dropped when time runs short.

---

## Context

Toki is a flagship portfolio project: a fully built product, demonstrated
end to end, without a domain purchase or real customers. Payments run in **test
mode** — the entire flow works and moves no real money, which needs no business
entity and no tax handling.

Toki holds camera, microphone, and screen-recording permission. That combination
is the whole security story: it has the capabilities of spyware and must be
visibly, provably trustworthy. Most items below follow from that.

---

## Already done

Committed on `launch-readiness-fixes`, 325 tests passing.

| | |
|---|---|
| Git protection | 3 branches; `main` untouched as a revert point |
| Screenshot privacy | Diagnostics and screen captures are separate consents, both off by default; withdrawing consent deletes collected files; asking about diagnostics no longer creates the folder |
| Release packaging | Signed DMG builds and mounts; notarize + staple script; `npm run verify` as a single gate; version pinned across four files |
| Content security policy | **No remote origin permitted at all** — MediaPipe is bundled and checksum-pinned, and the OpenAI call is made from Rust. A hand-tracking failure is now visible in the overlay rather than silent |
| API key handling | Keychain instead of an environment variable; a real Preferences window; the key never crosses back over the bridge |
| Auto-updater | Signature chain verified (key IDs match); publishing creates a **draft** release by default |
| Backend skeleton | Runs in fixture mode with no credentials; licence checking and rate limiting are real logic against stubbed stores |

**Signing and notarization need no code changes** — they wait only on the
Developer ID `.p12`, which exists on another Mac.

---

## Phase A — Fix what is exploitable today (~1 hour)

### A1. Toki executes a binary from a writable directory

**The problem.** Toki runs `codex` from `~/.local/bin`, `/opt/homebrew/bin`, and
others, then falls back to `which`. `~/.local/bin` is writable without sudo.
On macOS, permissions attach to the responsible process, so a binary Toki
launches operates inside Toki's screen-recording grant.

Any process running as the user can drop a file there and have its code read the
screen. An app that could never obtain that permission gets it by having Toki run
its code. **This is live right now.**

**Swapping the CLI does not fix it.** `claude` resolves from the same writable
directories. Same vulnerability, different filename.

**Do.**

- Gate the CLI path behind a developer setting, **off by default** — a planted
  binary then never runs for an ordinary user.
- Verify the binary's code signature before executing; refuse unsigned or ad-hoc.
- Delete the `which` fallback entirely — it resolves through `PATH`, the least
  trustworthy source available.
- Swap `codex` for `claude` while in there, since the Codex subscription is gone.

→ `apps/desktop/src-tauri/src/lib.rs` (`find_codex_binary`, ~2647),
  `apps/desktop/src/App.tsx` (the `"codex-subscription"` call sites)

### A2. The updater private key has no passphrase

I generated it with an empty one. That key can sign an update **every installed
Toki accepts and installs silently** — higher impact than the Apple certificate,
because nobody sees it happen.

**Do.** Regenerate with a passphrase, put the passphrase in a password manager,
and back the key up somewhere other than this Mac. Lose it and existing users can
never be updated again.

---

## Phase B — The pointer bug (unestimated)

An ~805 ms gap where MediaPipe reports no hand at all, longer than the 500 ms
recovery grace. Set aside during launch work; still unfixed.

This is the product. A reviewer who opens the app and finds gesture tracking
unreliable will not be persuaded by the auth flow. **It outranks everything below
it**, and the 500 ms grace should be re-derived from a clean trace rather than
kept at a value fitted to contaminated data.

---

## Phase C — Authorship protection (~40 min)

The realistic threat is not a company building a competitor. It is an individual
cloning the repository and presenting it as their own portfolio or coursework.
That changes what is worth doing.

### Already the strongest evidence — nothing to do

**698 commits by a single author, spanning 2026-05-31 to 2026-07-29,
timestamped by GitHub.** Someone who clones this has one commit and no history,
and history cannot be manufactured after the fact. In a DMCA claim, a platform
report, or an employer's check, this is what settles the question.

The `learnings/` directory compounds it: 25 phase documents recording decisions
as they were made. Reproducing that convincingly is harder than writing the code.

### Worth adding

1. **`LICENCE`** — done. Source-available: reading and evaluation permitted;
   redistribution, derivative works, commercial use, and presenting the work as
   your own are not. Absent a licence, default copyright already reserves all
   rights, but silence reads as an oversight rather than a position. The licence
   is also what makes a GitHub DMCA takedown straightforward rather than arguable.

2. **Copyright headers on the distinctive files** — the gesture state machines,
   the intent arbiter, the API service. A header travels with a file that is
   copied piecemeal, where a root `LICENCE` does not. Not every file; the ones
   worth lifting.

3. **Attribution in the README** (Phase L) — author, the licence, and a link to
   the commit history.

4. **The identifiers already in the bundle** — `app.toki.desktop`, the publisher
   string, the signing certificate. A copier either leaves them, which proves
   the copy, or strips them, which leaves a diff. Nothing to add; do not remove
   them.

### Not worth doing

Obfuscation (pointless with public source, and packed binaries draw scrutiny
during Apple's malware scan), licence keys in the client (trivially removed),
and attempting to prevent forks (impossible on a public repository).

### The part that cannot be copied

An interviewer can tell. Someone presenting this as their own cannot explain why
the content security policy permits no remote origin, why diagnostics and screen
captures are separate consents, or why a doubled hyphen in an XML comment made
`codesign` fail. The decisions are the work, and they do not travel with the
files.

**No repo split.** An earlier draft recommended moving the backend to a private
repository. That was wrong for this project: splitting protects revenue, and
there is none. It costs two repositories, two CI setups, cross-repo coordination,
and a reviewer who has to be granted access to see half the work — to guard code
nobody can run without their own Supabase project, Stripe account, and API
credits.

It also hides the most persuasive part. Auth with PKCE, webhook signature
verification, idempotency, per-licence rate limiting, row-level security, a
service that runs without credentials — that is the evidence that the whole
system was built, not just a UI. For a portfolio piece, showing it is the point.

Revisit only if Toki starts earning. At that point the prompts and ranking logic
become worth protecting, and extracting them is an afternoon's work.

Obfuscating the binary remains pointless regardless: it protects nothing while
the source is on GitHub, and packed binaries draw scrutiny during Apple's malware
scan.

---

## Phase D — Cloud accounts (~30 min, yours)

Everything downstream is blocked on these. Free tiers throughout; each issues its
own hostname, so **no domain is ever purchased**.

1. **Supabase** — auth *and* Postgres in one project, so users, licences, and
   subscriptions share a database instead of splitting across vendors
2. **Stripe** — stay in **test mode**; the full flow, no real money
3. **Fly.io** — tolerates multi-megabyte bodies and slow vision calls, which
   Cloudflare Workers may not
4. **Cloudflare** — DNS and Pages only
5. Record every secret in `.env.example` as **a name with no value**

---

## Phase E — Database (~30 min)

- `profiles`, `subscriptions`, `webhook_events` (the last for idempotency)
- **Row-level security so a user can only ever read their own rows** — without
  it, one authenticated user can read every customer's subscription
- Seed a `free` tier so unpaid accounts still function

---

## Phase F — Backend authentication (~1h)

- Verify the Supabase JWT **signature and expiry server-side**; never trust
  claims from the client
- `SupabaseLicenceStore` implementing the existing `LicenceStore` seam
- Tier-based rate limits reusing `createInMemoryRateLimiter`
- `401` on a bad token, `402` when a paid feature needs a subscription

**Rate limiting is in memory** — correct for one instance, wrong for two, since
each would allow the full quota. `RateLimiter` is the seam to back it with
something shared once more than one instance runs.

---

## Phase G — Desktop sign-in (~2h) — **done**

- Register the `toki://` scheme; add `tauri-plugin-deep-link` **and its
  capability permission** — the same class of bug already shipped once
- **PKCE.** A distributed desktop app has no client secret; skipping this is
  *the* classic desktop OAuth vulnerability
- Store tokens in the **Keychain**, reusing the Phase 5 code — never a file,
  never localStorage
- Refresh before expiry; sign out clears the Keychain and revokes server-side
- Handle the cold-start callback: macOS launches the app to deliver the deep link

**What was built.** `authPkce.ts` (verifier/challenge, callback parsing, token
requests), `authSession.ts` (the session's whole life, every outside thing
injected so it is testable), `authBindings.ts` (the Tauri-only wiring), three
Keychain commands and one network command in Rust, an Account section in
Preferences, and 14 tests in `scripts/desktop-auth.test.mjs`.

**Two decisions worth recording.**

*The token calls go through Rust, not the webview.* The window's security policy
permits no remote origin, and relaxing it for Supabase would relax it for every
script in the window. Rust makes the call instead, so the window keeps no
network reach at all and the exchange never passes through the JavaScript heap.
The URL is built in Rust from the configured project and refused unless it is
https, so the command cannot be pointed anywhere else.

*The verifier is never written to disk.* It lives in one variable and is cleared
before the code is redeemed, so a replayed callback cannot buy a second session.
The cost is that a callback arriving after the app has quit cannot complete —
the user is told to sign in again. Persisting the verifier to close that gap
would leave a second copy of the only secret in the flow sitting on disk, which
is a worse trade than one retry.

Three files have to agree for any of this to work — `Info.plist`, `tauri.conf.json`,
and the capability list — and a mismatch fails *silently*: the browser finishes,
macOS finds nothing to hand the link to, and the app waits forever. A test in
`scripts/app-updates.test.mjs` now asserts all three.

---

## Phase H — Payments (~2h) — **done**

- Stripe **test-mode** product and price
- `POST /billing/checkout` for the signed-in user
- **Verify the webhook signature before parsing anything.** An unverified webhook
  endpoint lets anyone grant themselves a subscription
- **The webhook is the source of truth, never the browser redirect**
- Idempotency via `webhook_events` — Stripe retries and will send duplicates
- Honour `current_period_end` on cancellation rather than cutting off immediately

**What was built.** `stripe.ts` (signature check and the two API calls),
`billing.ts` (events into entitlement, and the Supabase writer), `/billing/checkout`,
`/billing/portal`, `/billing/webhook`, migration `003_billing.sql`, and 19 tests
in `scripts/api-billing.test.mjs`.

**Three decisions worth recording.**

*The webhook is answered before authentication and before any parsing.* It
carries no token — the caller is Stripe, not a person — and its body has to
reach the signature check as the exact bytes that were sent. Parsing the JSON
and re-serialising it produces a different string and every real event then
fails, which is the usual way this check ends up being turned off.

*A failed event gives its claim back.* Event ids are claimed before the work, so
two deliveries racing cannot both get through. If the work then fails the claim
is released and a 500 is returned, because a 500 is what asks Stripe to retry.
Answering 200 on a failure drops the event for good and leaves someone paying
for access they never received.

*Out-of-order events cannot undo a newer state.* Webhooks are not delivered in
order, and a retried older event landing after a newer one would revive a
cancelled subscription or cancel a live one. `003_billing.sql` adds
`last_event_at`, and the writer filters on it, so an older event matches no row
and changes nothing.

---

## Phase I — Real guidance, and minimising what the server sees (~2h) — **done**

Replaces the CLI dependency on the shipping path.

- Implement `requestGuidance` against the **Anthropic API** — no binary, nothing
  for the user to install, and no subprocess inside Toki's permission grant
- Model `claude-opus-5`; constrain the response to the `GuidanceResult` schema so
  a valid object comes back rather than prose to parse, with the existing
  `validateGuidanceResult` as a second belt
- **Effort is the latency dial, and the default is wrong here.** Guidance is
  latency-sensitive — someone is waiting to be shown where to click. The default
  is `high`; the lower levels are unusually strong on this model. Measure on real
  screenshots.
- Thinking is **on by default**, and `max_tokens` caps thinking *plus* the
  answer — size it with headroom or responses truncate mid-object

**Screenshot minimisation** — inherent to the product, so bound it:

- **Send the cropped, downscaled image, not the full screen.** The preprocessing
  already produces one; confirm that is what actually goes out
- Never persist, never log — already true server-side; keep it true
- **Say so plainly in the README.** For an app with these permissions, that
  statement is a feature

**What was built.** `vision.ts` on the server, `hostedVisionProvider.ts` and
`tokiApiClient.ts` on the desktop, a `/vision` endpoint behind the paid gate,
and 15 tests in `scripts/hosted-guidance.test.mjs`.

**The split of work is the design.** The server is given a prompt and one image
and knows nothing about the user's display, calibration, or what their
accessibility scan found. Turning the model's answer back into a place on screen
happens on the desktop, where that knowledge already lives. The server's copy of
the data is as close to useless as it can be made.

**The plan's own warning turned out to be the bug.** The first version set
`max_tokens` to 1024 — enough for the small JSON target object. Thinking is on
by default on this model family and is counted inside that ceiling, so the
response would have truncated mid-object the moment the model reasoned at all,
and it would have looked like a parse bug rather than a budget one. Now 8192,
with a test asserting the headroom.

**Effort is still unmeasured.** It is the latency dial and someone is waiting to
be shown where to click. It is configurable through `TOKI_VISION_EFFORT` and
left unset, taking the model's default, because guessing a value without
measuring on real screenshots would be picking a number and calling it a
decision. **This is the one open item in this phase.**

**Screenshot minimisation was already true.** Live guidance refuses to run
without an active-window crop — it throws rather than sending the whole desktop.
That predates this phase; it is now also bounded server-side at 5 MB.

---

## Phase J — Deploy (~1h) — **built, not yet deployed**

- `Dockerfile` with the base image **pinned by digest**
- `fly.toml` — health check on `/health`, memory sized for base64 payloads
- **Secrets via `fly secrets set`, never in the image, never committed.** The
  Supabase `service_role` key and the Stripe secret are god-mode; extend the
  existing key-material test to catch their patterns
- Point the Stripe webhook at the deployed URL
- Confirm `/health` reports **live**, not fixture

**What was built.** `apps/api/Dockerfile` (multi-stage, base image pinned by
digest, no dev tooling, runs as `node` not root), `apps/api/fly.toml` (https
enforced, health check on `/health`, scale to zero), `DEPLOYMENT_RUNBOOK.md`,
and 7 tests in `scripts/deployment-config.test.mjs` including one that fails if
any credential-shaped string appears in a committed deployment file.

**Verified:** the service starts, `/health` answers, and the startup log
correctly reports which of authentication, vision, and payments is configured.
An unsigned webhook and an untokened `/vision` call were both refused against
the running process.

**Not verified: the image has never been built.** Docker is installed on this
machine but not running, so `docker build` was never executed. The Dockerfile is
reasoned about, not proven. **Build it once before trusting the deploy.**

---

## Phase K — Connect the desktop app (~45 min) — **done**

- ~~**Add the API origin to `connect-src`.**~~ **This turned out to be the wrong
  fix and was not done.** Allowing the API's origin in the window's policy would
  allow it for every script in that window, not only for Toki's own code. The
  request goes out through Rust instead, so the policy stays absolute: the
  window still reaches no remote origin at all. Sign-in, guidance, and billing
  all take the same route. A new test asserts that neither the API client nor
  the token exchange calls `fetch`, because a direct call would be blocked at
  runtime and would surface as a feature that mysteriously does nothing.
- Build-time API base URL, defaulting to localhost
- Honest states: signed out, no subscription, network unreachable

---

## Phase K3 — Two gaps found by asking "does the app know I paid?" — **done**

Both would have shipped and both looked fine in isolation.

**A sign-in did not reach the part that needed it.** Toki runs the overlay and
Preferences as separate windows, each with its own JavaScript context and so its
own copy of the session. Sign-in happens in Preferences; the overlay is what
makes guidance requests. The overlay read the store once at launch, so a user
would sign in, see "signed in" in Preferences, and have guidance keep refusing
them until they quit and reopened the app.

Fixed in both directions, because they need different mechanisms. A sign-in is
picked up lazily — an empty session asks the store once before concluding nobody
is signed in, which costs nothing since it only runs while signed out. A sign-out
cannot work that way: the token the overlay already holds stays valid until it
expires, so Preferences announces the change and the overlay drops its copy.
Otherwise a signed-out user keeps making paid requests.

**Nothing told the app what plan someone was on.** Entitlement could only be
discovered by attempting a paid request and being refused, which meant a paying
customer's own app could not tell them they were paying — and offered to sell
them what they already had.

Added `POST /account`, read from the database against the id in the verified
token. Preferences now names the plan, shows "Upgrade" only to someone who is
not entitled and "Manage plan" only to someone with a Stripe customer, and
re-checks when the window regains focus — payment completes in the browser and
is confirmed to the *service*, so returning to the window is when a person
expects to see what they bought.

Both are covered by tests that were confirmed to fail without the fix.

---

## Phase K2 — Retire the Preferences window (~1h)

The Preferences window exists because credentials have to be entered by hand
while there is no backend. Once the hosted service holds the model credentials,
a user has nothing to type, and a window full of file paths and API keys is
developer surface shipped to people who should never see it.

**Do.** Fold the controls a user genuinely needs — the diagnostics consents,
sign-in, subscription state — into the existing settings panel near the notch.
Drop the API key field, the whisper paths, and the update check, or keep them
behind a developer-only route.

Depends on Phase I: the fields cannot go until the backend supplies what they
configure.

---

## Phase L — Presentation (~2h)

For a portfolio project this is the highest-leverage work, and it is easy to
under-rate. **A reviewer opens the repo before the app.**

The audience is a company assessing whether one person built a whole system.
Write for that reader specifically — they are looking for the parts most
portfolio projects skip.

- **A README that sells it.** Right now someone landing on the repo cannot tell
  what Toki is. This is the single best hour available.
- **A demo video or GIF** — gestures cannot be understood from text
- **Walk the architecture end to end**, and name the unglamorous parts out loud:
  desktop app → authenticated API → Stripe checkout → webhook-driven
  subscription state → model provider. Payments, auth, and rate limiting are the
  parts that distinguish a shipped product from a demo, and a reviewer will not
  go looking for them in the source
- **Foreground the engineering**: 325 tests, hardened runtime, signed and
  notarized, a real update pipeline, a documented privacy model. Most portfolio
  projects have none of it, and it is invisible unless stated
- **The privacy model is a selling point, not a disclaimer.** An app that can see
  the screen, writes nothing by default, and permits no remote origin in its
  webview — say that plainly and explain why each decision was made
### The landing page — built, not yet published

Lives in `docs/` at the repository root. Static: one HTML file, one stylesheet,
one script, three images. No build step, no framework, no dependencies, and no
request to any third party at runtime — the type is the system stack and the
motion is hand-written, because a site advertising an app whose window permits
zero remote origins should not itself load code off someone else's CDN.

**Hosted on GitHub Pages, not Cloudflare Pages.** The repository is already
public, so Pages costs nothing, needs no account anywhere else, and needs no
card. It serves from `main` at `/docs`, which is the only branch-folder pair
Pages accepts besides the repository root.

Publishing takes one setting nobody can set from here: **Settings → Pages →
Source: Deploy from a branch → `main` / `docs`**. It then serves at
`https://gargigupta-io.github.io/toki/`.

What the page deliberately does not do:

- **It does not sell.** Pricing is described; there is no checkout. A
  subscription attaches to a Supabase account and is granted only by Stripe's
  signed webhook, so a button on a website has no account to attach to.
  Checkout starts inside the app, after sign-in.
- **The Gatekeeper section has been removed**, because the app is now signed
  and notarized and Apple's ticket is stapled to it, so macOS opens it without
  a block. Until that was true the page carried the full first-open routine.

  If a future build ever ships signed but **not** notarized, that section has
  to come back: Developer ID signing alone does not satisfy Gatekeeper for a
  downloaded app. The check is
  `xcrun stapler validate /Applications/Toki.app && spctl -a -vvv /Applications/Toki.app`,
  which must report `source=Notarized Developer ID`. Note also that Apple
  removed the Control-click → Open bypass in macOS 15, so any restored
  instructions must lead with System Settings → Privacy & Security → **Open
  Anyway**.
- **It claims nothing the README does not.** Guidance running on fixtures, the
  pending notarization, and the pinch bug are all on the page.

Open: the Download button points at `releases/latest`, which needs a published
release to resolve.

---

## Ongoing hygiene

- **Dependabot** on the public repo
- **`npm audit` in the verify gate**
- Docker base image pinned by digest (Phase J)

Ordinary practice, but it matters more here: a malicious dependency inside an app
that can see the screen is a different proposition. The strict CSP already helps
more than it looks — with no remote origin permitted, a compromised package in
the webview has nowhere to send anything.

---

## Deliberately not doing

Certificate pinning, anti-debugging, custom crypto, runtime integrity checks,
binary obfuscation. Real cost, negligible benefit, and each adds a way for the
app to break in the field. Obfuscation additionally risks the notarization scan.

---

## Verification

**A1** — plant a dummy `~/.local/bin/claude` and confirm it is never executed
with the setting off.

**Phase G** — sign in returns to the app signed in; tokens survive a restart,
refresh silently, and clear on sign out.

**Phase H** — a Stripe **test card** completes checkout and the tier updates with
no manual intervention. An unverified webhook is rejected.

**Phase I** — guidance works with the Claude CLI **renamed or removed**, proving
the dependency is gone. Confirm the cropped image is what leaves the machine.

**Phase K** — an unauthenticated request is refused; an over-quota one throttles.

**Whole pipeline** — sign, notarize, staple, then open the disk image **on a
different Mac**, one that has never trusted the local development certificate.
That is the only real test of what a user experiences.

Plus the outstanding manual pass: Preferences opens, a key saves to the Keychain,
and hand tracking survives the security policy.

---

## Order and effort

| Phase | Work | Time | Blocked by |
|---|---|---|---|
| A | Codex path + updater passphrase | 1 hr | — |
| B | **The pointer bug** | unestimated | — |
| C | Authorship protection | 40 min | — |
| D | Cloud accounts | 30 min | your signup |
| E | Database schema | 30 min | D |
| F | Backend auth | 1 hr | E |
| G | Desktop sign-in | 2 hrs | F |
| H | Payments | 2 hrs | F |
| I | Real guidance + screenshot minimisation | 2 hrs | credits |
| J | Deploy | 1 hr | D |
| K | Connect desktop app | 45 min | J |
| L | README, demo, landing page | 2 hrs | — |

**Phase A is an hour and closes a live hole — do it first.**

**Phase B outranks everything after it.** A flagship project whose core feature
is unreliable undermines every other thing on this list.

**Phase L is underrated.** For a portfolio piece it may matter more than the auth
flow, and it needs nothing from anyone else.
