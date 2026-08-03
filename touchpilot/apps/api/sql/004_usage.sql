-- Toki: the free tier's monthly allowance.
--
-- Run after 003_billing.sql, in the Supabase SQL editor.
--
-- Every guidance request costs money at the model provider, so the free tier
-- needs a ceiling that is not merely advertised. The per-minute rate limiter
-- already in front of this is a different control: it stops a burst, and its
-- counters live in one process's memory, so they reset on deploy and each
-- instance would allow the whole allowance again. Neither property is
-- acceptable for something a person has paid to lift.
--
-- So the count lives here, and the decision is made here.

create table if not exists public.guidance_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The first day of the month this count belongs to. A date rather than a
  -- rolling window: a rolling window has to be recomputed from a log of every
  -- request, and keeping that log means keeping a record of when each person
  -- asked Toki for help, which is the sort of thing this project has spent its
  -- effort not collecting. One integer per person per month says what is owed
  -- and nothing about behaviour.
  period_start date not null,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

-- Claim one request, or refuse.
--
-- The check and the increment are one statement on purpose. Read-then-write
-- from the service lets two requests arriving together both read the same
-- count, both find room, and both proceed -- and the busier the account, the
-- more likely that is. The database is the only place this can be settled.
--
-- Returns the new count, or -1 when the allowance is already spent. The `where`
-- on the conflict branch is what refuses: when it fails no row is returned, and
-- nothing is incremented.
create or replace function public.claim_guidance_request(
  p_user_id uuid,
  p_period_start date,
  p_limit integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_limit <= 0 then
    return -1;
  end if;

  insert into public.guidance_usage as u (user_id, period_start, used)
  values (p_user_id, p_period_start, 1)
  on conflict (user_id, period_start) do update
    set used = u.used + 1,
        updated_at = now()
    where u.used < p_limit
  returning u.used into v_used;

  return coalesce(v_used, -1);
end;
$$;

-- Give a request back.
--
-- Claiming happens before the model is called, so a burst cannot overrun the
-- allowance while several requests are in flight. The cost of that ordering is
-- that a provider failure would otherwise consume something the person never
-- received an answer for. Never drops below zero: a release without a matching
-- claim must not hand out free credit.
create or replace function public.release_guidance_request(
  p_user_id uuid,
  p_period_start date
) returns void
language sql
security definer
set search_path = public
as $$
  update public.guidance_usage
    set used = greatest(used - 1, 0),
        updated_at = now()
    where user_id = p_user_id and period_start = p_period_start;
$$;

alter table public.guidance_usage enable row level security;

-- Readable by its owner so the app can show what is left. Writable by nobody:
-- there is deliberately no insert, update, or delete policy, because a client
-- that could write this row could reset its own counter. The service role
-- bypasses these, and is the only thing that ever writes here.
drop policy if exists "read own usage" on public.guidance_usage;
create policy "read own usage"
  on public.guidance_usage for select
  using (auth.uid() = user_id);

-- The functions run as their owner, so they must not be callable by a client
-- directly -- that would be a write path around the policy above.
revoke execute on function public.claim_guidance_request(uuid, date, integer)
  from anon, authenticated;
revoke execute on function public.release_guidance_request(uuid, date)
  from anon, authenticated;
