-- Toki: users, subscriptions, and webhook bookkeeping.
--
-- Run in the Supabase SQL editor, in order: 001_schema.sql then 002_rls.sql.
-- Splitting them is deliberate — the tables are useless without the access
-- rules, and applying only the first would leave every customer's subscription
-- readable by any authenticated user.
--
-- Supabase owns auth.users. Nothing here duplicates it; profiles hangs off it
-- so a deleted account takes its rows with it.

create extension if not exists "uuid-ossp";

-- A row per signed-in person, created automatically on first sign-in.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- Subscription state, driven by Stripe webhooks rather than by the browser
-- redirect. The redirect can be closed, replayed, or forged; the webhook is
-- signed and is the only thing allowed to grant access.
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  -- Mirrors Stripe's own vocabulary so there is no translation layer to get
  -- wrong: trialing, active, past_due, canceled, incomplete, unpaid.
  status text not null default 'inactive',
  tier text not null default 'free',
  -- Access is honoured to the end of a paid period rather than cut off the
  -- moment someone cancels.
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);
create index if not exists subscriptions_stripe_customer_idx
  on public.subscriptions (stripe_customer_id);

-- Stripe retries deliveries and will send the same event more than once.
-- Recording the id and refusing duplicates is what stops one payment being
-- processed twice.
create table if not exists public.webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

-- Give every new account a free tier immediately, so an unpaid user is a
-- working user rather than a broken one. Without this a fresh sign-in has no
-- subscription row at all and every gated check has to special-case null.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;

  insert into public.subscriptions (user_id, status, tier)
    values (new.id, 'inactive', 'free')
    on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
