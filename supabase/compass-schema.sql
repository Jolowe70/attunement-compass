-- THE ATTUNEMENT COMPASS · database for the 30-Day Attunement (COMPASS-02)
-- Run the whole file in Supabase → SQL Editor. It is safe to run again.
-- Every row belongs to one person, and only that person can read or change it.

create extension if not exists pgcrypto;

-- One row per person: where they are in the 30 days.
create table if not exists public.journeys (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 40),
  lang text not null default 'en' check (lang in ('en', 'es', 'fr', 'yo', 'ig', 'ha')),
  round int not null default 1 check (round between 1 and 1000),
  round_started_at timestamptz not null default now(),
  rounds_completed int not null default 0 check (rounds_completed between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per signal tested: the journal.
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  local_date date not null,
  round int not null default 1 check (round between 1 and 1000),
  day_no int check (day_no between 1 and 30),
  mode text not null default 'guided' check (mode in ('guided', 'compare', 'self')),
  domain text check (domain is null or domain in ('relationships', 'work', 'inner', 'social', 'financial', 'health', 'ministry', 'family', 'other', '')),
  pressure text check (pressure is null or pressure in ('urgent', 'gentle', 'unclear', '')),
  signal text not null check (char_length(signal) between 1 and 1200),
  source text check (source is null or source in ('truth', 'error', 'unclear')),
  my_source text check (my_source is null or my_source in ('truth', 'error', 'unclear')),
  summary text check (summary is null or char_length(summary) <= 600),
  tests jsonb check (tests is null or pg_column_size(tests) < 6000),
  my_tests jsonb check (my_tests is null or pg_column_size(my_tests) < 1000),
  stance text check (stance is null or stance in ('refute', 'affirm', 'wait')),
  prayer text check (prayer is null or char_length(prayer) <= 1200),
  passages jsonb check (passages is null or pg_column_size(passages) < 4000),
  step text check (step is null or char_length(step) <= 500),
  community text check (community is null or char_length(community) <= 400),
  step_status text not null default 'pending' check (step_status in ('pending', 'done', 'not_yet', 'released')),
  step_checked_at timestamptz,
  note text check (note is null or char_length(note) <= 1000)
);
create index if not exists entries_user_time on public.entries (user_id, created_at desc);

-- Weekly reflections, kept so the guide is asked once per week.
create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  round int not null check (round between 1 and 1000),
  week int not null check (week between 1 and 6),
  body jsonb not null check (pg_column_size(body) < 6000),
  created_at timestamptz not null default now(),
  unique (user_id, round, week)
);

-- New entries must carry a real local date (today, give or take time zones).
-- Checked only when a row is added, so restoring a backup never rejects older rows.
create or replace function public.check_entry_date() returns trigger language plpgsql as $$
begin
  if new.local_date not between current_date - 2 and current_date + 2 then
    raise exception 'local_date out of range' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists entries_date on public.entries;
create trigger entries_date before insert on public.entries for each row execute function public.check_entry_date();
alter table public.entries drop constraint if exists entries_local_date_check;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists journeys_touch on public.journeys;
create trigger journeys_touch before update on public.journeys for each row execute function public.touch_updated_at();

-- Row-level security: own rows only.
alter table public.journeys enable row level security;
alter table public.entries enable row level security;
alter table public.reflections enable row level security;

do $$
declare t text;
begin
  foreach t in array array['journeys', 'entries', 'reflections'] loop
    execute format('drop policy if exists %I on public.%I', t || '_own_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_own_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_own_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_own_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_own_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_own_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_own_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_own_delete', t);
  end loop;
end $$;

-- Visitors who are not signed in can touch nothing.
revoke all on public.journeys, public.entries, public.reflections from anon;
revoke all on public.journeys, public.entries, public.reflections from authenticated;
grant select, insert, delete on public.journeys, public.entries, public.reflections to authenticated;
-- A journal entry's history stays as it was; only the step check-in and a private note can change later.
grant update (step_status, step_checked_at, note) on public.entries to authenticated;
grant update (display_name, lang, round, round_started_at, rounds_completed) on public.journeys to authenticated;
grant update (body) on public.reflections to authenticated;
