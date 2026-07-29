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

## Phase G — Desktop sign-in (~2h)

- Register the `toki://` scheme; add `tauri-plugin-deep-link` **and its
  capability permission** — the same class of bug already shipped once
- **PKCE.** A distributed desktop app has no client secret; skipping this is
  *the* classic desktop OAuth vulnerability
- Store tokens in the **Keychain**, reusing the Phase 5 code — never a file,
  never localStorage
- Refresh before expiry; sign out clears the Keychain and revokes server-side
- Handle the cold-start callback: macOS launches the app to deliver the deep link

---

## Phase H — Payments (~2h)

- Stripe **test-mode** product and price
- `POST /billing/checkout` for the signed-in user
- **Verify the webhook signature before parsing anything.** An unverified webhook
  endpoint lets anyone grant themselves a subscription
- **The webhook is the source of truth, never the browser redirect**
- Idempotency via `webhook_events` — Stripe retries and will send duplicates
- Honour `current_period_end` on cancellation rather than cutting off immediately

---

## Phase I — Real guidance, and minimising what the server sees (~2h)

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

---

## Phase J — Deploy (~1h)

- `Dockerfile` with the base image **pinned by digest**
- `fly.toml` — health check on `/health`, memory sized for base64 payloads
- **Secrets via `fly secrets set`, never in the image, never committed.** The
  Supabase `service_role` key and the Stripe secret are god-mode; extend the
  existing key-material test to catch their patterns
- Point the Stripe webhook at the deployed URL
- Confirm `/health` reports **live**, not fixture

---

## Phase K — Connect the desktop app (~45 min)

- **Add the API origin to `connect-src`.** The policy currently permits no remote
  origin, so guidance will fail silently until this lands — the CSP test already
  carries a comment flagging it
- Build-time API base URL, defaulting to localhost
- Honest states: signed out, no subscription, network unreachable

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
- Landing page on Cloudflare Pages, linking to GitHub Releases

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
