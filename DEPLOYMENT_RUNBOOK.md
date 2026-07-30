# Deploying the Toki API

> **Host: Render, free tier.** 750 instance hours a month, no card required.
> The service sleeps after fifteen minutes idle and takes about a minute to
> wake; the desktop app reports a slow first request rather than failing.
>
> **Fly.io was the earlier plan and is out** -- no free tier for new accounts,
> and it refuses to create an app without payment details. `apps/api/fly.toml`
> is kept because the container is identical either way, so moving back costs
> nothing if that ever changes.

Everything below runs against real services and costs real money in small
amounts. Nothing here needs to happen for the desktop app to build or for the
tests to pass — the service reports plainly when it is unconfigured rather than
half-working.

**Nothing in this file is a secret, and no secret should ever be added to it.**
Credentials live in `fly secrets`, in `apps/api/.env` (git-ignored), and in the
macOS Keychain. If a credential ends up in a file inside this repository,
rotate it rather than deleting it — it is in the git history either way.

---

## What you have already done

Phase D covered the account setup. You should already hold, from that session:

- the Supabase URL, anon key, service role key, and JWT secret
- a Stripe secret key and **a price id** — you do not need to create the price
  again; it only has to be pasted into `fly secrets set` below

What is genuinely still outstanding is the `003_billing.sql` migration, the
webhook registration (which needs the deployed address, so it cannot happen
first), and the deploy itself.

---

## What the deployed address is

Render gives the service a URL when it first deploys, of the form
`https://toki-api.onrender.com`. It costs nothing and needs no domain.

It is a machine address; two things use it and no human visits it:

| Address | Who calls it | Why |
|---|---|---|
| `…/billing/webhook` | Stripe's servers | To say "this person paid". Nothing else may grant access |
| `…/vision` | The Toki app on a Mac | To ask a model where to click |

**Toki needs no landing page.** After checkout Stripe returns the customer's
browser to `…/thanks`, a small page this service serves itself.

---

## Before the first deploy

### 1. Run the database migrations

Supabase dashboard, SQL editor, in this order:

| File | What it does |
|---|---|
| `apps/api/sql/001_schema.sql` | Tables, and the trigger giving every new account a free tier |
| `apps/api/sql/002_rls.sql` | The access rules. **The tables are dangerous without this** |
| `apps/api/sql/003_billing.sql` | One column that stops an out-of-order webhook undoing a newer one |

All three are already applied on the live project, verified 2026-07-31.

### 2. The Stripe price — already done

Have the id to hand for the dashboard. It starts with `price_`, not `prod_`.

---

## Deploying

The whole configuration is `render.yaml` at the repository root, so Render
reads it rather than being clicked together by hand.

1. Push the branch to GitHub.
2. Render → **New → Blueprint** → pick the repository. It finds `render.yaml`
   and proposes one free web service called `toki-api`.
3. It will ask for the values marked `sync: false`. Paste them from
   `apps/api/.env`:

   | Variable | Notes |
   |---|---|
   | `SUPABASE_URL` | |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Bypasses every access rule.** Server only |
   | `SUPABASE_JWT_SECRET` | Mints a token for any account. Server only |
   | `STRIPE_SECRET_KEY` | Moves money |
   | `STRIPE_PRICE_ID` | |
   | `STRIPE_WEBHOOK_SECRET` | Set after step 5 |
   | `TOKI_PROVIDER_API_KEY` | OpenAI. Leave blank until there are credits |

4. Deploy. The first build takes a few minutes; it builds the Docker image.
5. Register the webhook: Stripe → Developers → Webhooks → Add endpoint, at
   `https://<your-service>.onrender.com/billing/webhook`, with the events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy the `whsec_` it shows, set it in Render, and let it redeploy.

**The free tier sleeps after fifteen minutes idle** and takes about a minute to
wake. Stripe retries a webhook that times out, so a sleeping service does not
lose events — it just answers the first one slowly.

### Which secret is which

| Secret | What it can do if leaked |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Reads and writes every row, ignoring all access rules** |
| `SUPABASE_JWT_SECRET` | Mint a token for any account |
| `STRIPE_SECRET_KEY` | Move money |
| `STRIPE_WEBHOOK_SECRET` | Grant anyone a paid subscription for free |
| `TOKI_PROVIDER_API_KEY` | Spend your model credits |
| `SUPABASE_ANON_KEY` | **Nothing.** Public by design; it ships inside the app. The access rules protect the data, not this key's secrecy |

---

## Checking it worked

```bash
curl https://<your-service>.onrender.com/health
```

The reply names the mode. `fixture` means no model credential reached the
process, so answers are placeholders — said plainly rather than pretended.

Render's log tab prints one line each for authentication, vision, and payments
at startup, saying which are configured. A missing credential shows up there
rather than as a confusing failure later.

**The logs carry no request bodies.** Bodies hold screenshots and voice, so
logging records method, path, and status and nothing else. That is deliberate;
do not add body logging to debug something.

---

## The desktop build

The app needs to know where the service is. In `apps/desktop/.env`:

```
VITE_TOKI_SUPABASE_URL=https://<project>.supabase.co
VITE_TOKI_SUPABASE_ANON_KEY=<anon public key>
VITE_TOKI_GUIDANCE_ENDPOINT=https://<your-service>.onrender.com
```

These are compiled into the app, so all three must be safe to publish. The
service role key and the Stripe secret are not, and neither belongs in a
desktop build.

Sign-in does **not** need the service — the token exchange goes straight to
Supabase — so the first two alone make sign-in work. The third is what turns on
guidance and billing.

Supabase also needs `toki://auth/callback` added under Authentication → URL
Configuration → Redirect URLs, or the provider refuses to send anyone back.

---

## What is not automated on purpose

Deploying, setting secrets, and running migrations are all manual. Each of them
is a step that costs money, changes a live database, or exposes a public URL,
and none of them should ever happen as a side effect of a commit.
