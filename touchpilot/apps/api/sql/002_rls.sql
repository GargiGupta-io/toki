-- Row-level security. Run after 001_schema.sql.
--
-- Without this, any authenticated user can read every customer's subscription
-- by asking for it — the anon key is public by design and ships inside the
-- desktop app, so the database itself has to be the boundary rather than the
-- code in front of it.
--
-- The service role bypasses all of these. That is what makes it dangerous, and
-- why it lives only in server-side secrets and never in the app.

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.webhook_events enable row level security;

-- Profiles: a user sees only themselves.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Subscriptions: readable by their owner, and writable by nobody.
--
-- There is deliberately no insert or update policy. Granting one would let a
-- client set its own tier to whatever it liked, which is the whole game. Rows
-- are written only by the trigger in 001 and by the webhook handler, both of
-- which run with the service role.
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Webhook events: no policies at all, so the anon key cannot read or write
-- them. Only the service role touches this table.

-- Verification. Each of these should return zero rows for a normal user:
--
--   select * from public.subscriptions where user_id <> auth.uid();
--   select * from public.webhook_events;
--
-- If either returns data while signed in as an ordinary user, row-level
-- security is not actually on — check that the statements above ran.
