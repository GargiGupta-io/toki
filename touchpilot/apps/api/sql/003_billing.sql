-- Toki: ordering protection for Stripe webhooks.
--
-- Run after 001_schema.sql and 002_rls.sql.
--
-- Webhooks are not guaranteed to arrive in the order the events happened. A
-- retry of an older event can land after a newer one, and applying it would
-- quietly undo a change -- reviving a cancelled subscription, or cancelling a
-- live one. Recording which event a row was last written from lets an older
-- event be recognised and dropped.

alter table public.subscriptions
  add column if not exists last_event_at timestamptz not null default 'epoch';

-- Rows created before this column existed must sort as "never written by an
-- event", or the first real event would be treated as stale and ignored.
update public.subscriptions
  set last_event_at = 'epoch'
  where last_event_at is null;

-- The webhook writer filters on this column, so an index keeps that cheap.
create index if not exists subscriptions_last_event_idx
  on public.subscriptions (last_event_at);
