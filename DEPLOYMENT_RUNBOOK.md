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

## What `<your-app>.fly.dev` is

It is **not a landing page and not a website you have to build.** When you
deploy, Fly issues an address derived from the app name in `fly.toml`. That name
is **`toki-ai`**, so the address is `https://toki-ai.fly.dev`. It costs nothing,
needs no domain purchase, and appears the moment the deploy succeeds.

Fly app names are unique across every Fly account, not just yours. `toki` and
`toki-api` are both already registered by other people; `toki-ai` was checked and
is free. If `fly launch` still refuses it — someone may claim it first, and DNS
is strong evidence rather than the authority — pick another name, change
`app = ` in `apps/api/fly.toml`, and every address below follows from it.

It is a machine address. Two things use it and no human visits it:

| Address | Who calls it | Why |
|---|---|---|
| `…fly.dev/billing/webhook` | Stripe's servers | To say "this person paid". Nothing else may grant access |
| `…fly.dev/vision` | The Toki app on a Mac | To ask a model where to click |

**Toki needs no landing page to work.** After checkout Stripe sends the
customer's browser to `…fly.dev/thanks`, a small page this service serves
itself. A marketing site is a later choice; nothing here waits on it.

---

## Before the first deploy

### 1. Run the database migrations

In the Supabase dashboard, SQL editor, in this order:

| File | What it does |
|---|---|
| `apps/api/sql/001_schema.sql` | Tables, and the trigger that gives every new account a free tier |
| `apps/api/sql/002_rls.sql` | The access rules. **The tables are dangerous without this** |
| `apps/api/sql/003_billing.sql` | One column that stops an out-of-order webhook undoing a newer one |

`003` is new for payments. If `001` and `002` are already applied, run only `003`.

### 2. The Stripe price — already done in Phase D

You created this already. Have the id to hand for the `fly secrets set` command
below. It starts with `price_`, not `prod_` — the product id is not what
checkout takes.

Only if you cannot find it: Stripe dashboard **in test mode** → Products → your
product → the price beneath it.

### 3. Register the webhook endpoint

Stripe → Developers → Webhooks → Add endpoint.

**This step comes after the first deploy**, because the address does not exist
until then. The order is: deploy → register the endpoint → set
`STRIPE_WEBHOOK_SECRET` → deploy again.

- URL: **`https://toki-ai.fly.dev/billing/webhook`**
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`

Copy the signing secret it shows you — it starts with `whsec_`. **This is the
one that matters.** It is the only thing standing between the endpoint and
anyone who finds the URL granting themselves a subscription, because the
endpoint has no login on it by design: the caller is Stripe, not a person.

---

## Deploying

```bash
cd touchpilot
fly launch --no-deploy --config apps/api/fly.toml   # first time only
```

Then set the credentials. These are stored encrypted on Fly's side and injected
into the process at run time; they are never in the image:

```bash
fly secrets set \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_JWT_SECRET=... \
  ANTHROPIC_API_KEY=... \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_PRICE_ID=price_... \
  STRIPE_WEBHOOK_SECRET=whsec_...
```

`TOKI_SITE_URL` is deliberately absent. Without it the service returns customers
to its own `/thanks` page, which is what makes checkout work with no website.
Set it later, if a marketing site ever exists.

Then deploy, from the repository root so the build can see the whole workspace:

```bash
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile .
```

### Which secret is which

| Secret | Where it comes from | What it can do if leaked |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project settings → API | **Reads and writes every row in the database, ignoring all access rules.** Server only. Never in the desktop app |
| `SUPABASE_JWT_SECRET` | Supabase → Project settings → API → JWT secret | Mint a token for any account. Server only |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | Move money |
| `STRIPE_WEBHOOK_SECRET` | Shown when the endpoint is registered | Grant anyone a paid subscription for free |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Spend your model credits |
| `SUPABASE_ANON_KEY` | Supabase → API | **Nothing.** Public by design; it ships inside the desktop app. The access rules are what protect the data, not this key's secrecy |

---

## Checking it actually worked

```bash
curl https://toki-ai.fly.dev/health
```

The reply names the mode. `fixture` means no model credential reached the
process, and the service will return placeholder answers rather than pretending.

```bash
fly logs
```

Startup prints one line each for authentication, vision, and payments, saying
which of them is configured. A missing credential shows up there rather than as
a confusing failure later.

**The log lines carry no request bodies.** Bodies hold screenshots and voice, so
the request logging records the method, the path, and the status and nothing
else. That is deliberate; do not add body logging to debug something.

### Testing the webhook without paying

```bash
stripe listen --forward-to https://toki-ai.fly.dev/billing/webhook
stripe trigger checkout.session.completed
```

`stripe listen` prints its own signing secret, which is different from the
dashboard one. Use whichever matches the path you are testing, or the signature
check will refuse the event — which is the check doing its job.

---

## The desktop build

The app needs to know where the service is. In `apps/desktop/.env`:

```
VITE_TOKI_SUPABASE_URL=https://<project>.supabase.co
VITE_TOKI_SUPABASE_ANON_KEY=<anon public key>
VITE_TOKI_GUIDANCE_ENDPOINT=https://toki-ai.fly.dev
```

These are compiled into the app, so they must all be values that are safe to
publish. The service role key and the Stripe secret are not, and neither has any
business being in a desktop build.

---

## What is not automated on purpose

Deploying, setting secrets, and running migrations are all manual. Each of them
is a step that costs money, changes a live database, or exposes a public URL,
and none of them should ever happen as a side effect of a commit.
