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

-- ============================================================================
-- COMPASS-03 · Discernment partners
-- The fourth test asks whether a signal can stand in the light of the body of Christ.
-- A person invites up to three partners (or their pastor) with a one-time link. Partners see ONLY the
-- entries the person chooses to share, and can answer with words of counsel. Either side can end it.

alter table public.entries add column if not exists shared boolean not null default false;
alter table public.entries add column if not exists shared_at timestamptz;

create table if not exists public.invites (
  code text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  owner_name text not null check (char_length(owner_name) between 1 and 40),
  role text not null default 'partner' check (role in ('partner', 'pastor')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
create index if not exists invites_owner on public.invites (owner);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  partner uuid not null references auth.users(id) on delete cascade,
  role text not null default 'partner' check (role in ('partner', 'pastor')),
  owner_name text not null check (char_length(owner_name) between 1 and 40),
  partner_name text not null check (char_length(partner_name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (owner, partner),
  check (owner <> partner)
);
create index if not exists partners_partner on public.partners (partner);

create table if not exists public.counsel (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists counsel_entry on public.counsel (entry_id, created_at);

-- Helpers (security definer so policies never loop through each other).
create or replace function public.is_partner_of(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partners where owner = p_owner and partner = auth.uid());
$$;

create or replace function public.can_see_entry(p_entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entries e
    where e.id = p_entry
      and (e.user_id = auth.uid() or (e.shared and exists (select 1 from public.partners p where p.owner = e.user_id and p.partner = auth.uid())))
  );
$$;

create or replace function public.entry_owner(p_entry uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.entries where id = p_entry;
$$;

-- Partners can read the entries that were shared with them.
drop policy if exists entries_partner_select on public.entries;
create policy entries_partner_select on public.entries for select to authenticated
  using (shared and public.is_partner_of(user_id));

-- Invites: the owner sees and cancels their own. They are created and accepted only through the functions below.
alter table public.invites enable row level security;
drop policy if exists invites_own_select on public.invites;
drop policy if exists invites_own_delete on public.invites;
create policy invites_own_select on public.invites for select to authenticated using (owner = (select auth.uid()));
create policy invites_own_delete on public.invites for delete to authenticated using (owner = (select auth.uid()) and used_at is null);

-- Partners: both sides can see the link, and either side can end it.
alter table public.partners enable row level security;
drop policy if exists partners_both_select on public.partners;
drop policy if exists partners_both_delete on public.partners;
create policy partners_both_select on public.partners for select to authenticated using (owner = (select auth.uid()) or partner = (select auth.uid()));
create policy partners_both_delete on public.partners for delete to authenticated using (owner = (select auth.uid()) or partner = (select auth.uid()));

-- Counsel: written and read by the entry's owner and by partners the entry was shared with.
alter table public.counsel enable row level security;
drop policy if exists counsel_select on public.counsel;
drop policy if exists counsel_insert on public.counsel;
drop policy if exists counsel_delete on public.counsel;
create policy counsel_select on public.counsel for select to authenticated using (public.can_see_entry(entry_id));
create policy counsel_insert on public.counsel for insert to authenticated with check (author = (select auth.uid()) and public.can_see_entry(entry_id));
create policy counsel_delete on public.counsel for delete to authenticated using (author = (select auth.uid()) or public.entry_owner(entry_id) = (select auth.uid()));

-- Counsel carries the writer's name as the entry's owner knows them, set here, not by the app.
create or replace function public.counsel_name() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if (select count(*) from public.counsel where entry_id = new.entry_id) >= 50 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  o := public.entry_owner(new.entry_id);
  new.author := auth.uid();
  new.author_name := case
    when o = auth.uid() then null
    else coalesce((select partner_name from public.partners where owner = o and partner = auth.uid()), 'Partner')
  end;
  return new;
end $$;
drop trigger if exists counsel_name on public.counsel;
create trigger counsel_name before insert on public.counsel for each row execute function public.counsel_name();

-- Create an invitation link (up to 3 partners, up to 5 open invitations).
create or replace function public.create_invite(p_role text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text;
begin
  if me is null then raise exception 'sign_in' using errcode = '42501'; end if;
  if p_role not in ('partner', 'pastor') then raise exception 'bad_role' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'name' using errcode = '22023'; end if;
  if (select count(*) from public.partners where owner = me) >= 3 then raise exception 'max_partners' using errcode = '22023'; end if;
  if (select count(*) from public.invites where owner = me and used_at is null and expires_at > now()) >= 5 then raise exception 'max_invites' using errcode = '22023'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)); -- built in, works on every Supabase project
  insert into public.invites (code, owner, owner_name, role) values (c, me, trim(p_name), p_role);
  return c;
end $$;

-- What the person opening the link sees before accepting.
create or replace function public.invite_info(p_code text)
returns table (owner_name text, role text, status text)
language sql stable security definer set search_path = public as $$
  select i.owner_name, i.role,
    case when i.used_at is not null then 'used'
         when i.expires_at <= now() then 'expired'
         when i.owner = auth.uid() then 'self'
         else 'ok' end
  from public.invites i where i.code = upper(trim(p_code));
$$;

create or replace function public.accept_invite(p_code text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i public.invites;
begin
  if me is null then raise exception 'sign_in' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'name' using errcode = '22023'; end if;
  select * into i from public.invites where code = upper(trim(p_code)) for update;
  if not found or i.used_at is not null or i.expires_at <= now() then raise exception 'invalid' using errcode = '22023'; end if;
  if i.owner = me then raise exception 'self' using errcode = '22023'; end if;
  if (select count(*) from public.partners where owner = i.owner) >= 3 then raise exception 'max_partners' using errcode = '22023'; end if;
  if (select count(*) from public.partners where partner = me) >= 50 then raise exception 'max_walking' using errcode = '22023'; end if;
  insert into public.partners (owner, partner, role, owner_name, partner_name)
    values (i.owner, me, i.role, i.owner_name, trim(p_name))
    on conflict (owner, partner) do update set role = excluded.role, partner_name = excluded.partner_name;
  update public.invites set used_by = me, used_at = now() where code = i.code;
  return i.owner_name;
end $$;

revoke all on public.invites, public.partners, public.counsel from anon;
revoke all on public.invites, public.partners, public.counsel from authenticated;
grant select, delete on public.invites, public.partners to authenticated;
grant select, insert, delete on public.counsel to authenticated;
grant update (shared, shared_at) on public.entries to authenticated;

revoke all on function public.create_invite(text, text), public.accept_invite(text, text), public.invite_info(text),
  public.is_partner_of(uuid), public.can_see_entry(uuid), public.entry_owner(uuid) from public, anon;
grant execute on function public.create_invite(text, text), public.accept_invite(text, text), public.invite_info(text),
  public.is_partner_of(uuid), public.can_see_entry(uuid), public.entry_owner(uuid) to authenticated;
grant execute on function public.invite_info(text) to anon;

-- ============================================================================
-- COMPASS-04 · Email notices
-- When a signal is shared, partners get a short email; when counsel is written, the other side does.
-- Emails never contain the signal or the counsel itself, only a link back. Anyone can turn them off.

create table if not exists public.email_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  notify boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.email_prefs enable row level security;
drop policy if exists email_prefs_own on public.email_prefs;
create policy email_prefs_own on public.email_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.email_prefs from anon;
grant select, insert, update on public.email_prefs to authenticated;

-- A log of notices sent, read only by the server (no policies: signed-in users cannot see or change it).
create table if not exists public.notices (
  id bigserial primary key,
  actor uuid references auth.users(id) on delete cascade,
  recipient uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('share', 'counsel')),
  ref uuid,
  sent_at timestamptz not null default now()
);
create index if not exists notices_recent on public.notices (recipient, kind, ref, sent_at desc);
create index if not exists notices_actor on public.notices (actor, sent_at desc);
alter table public.notices enable row level security;
revoke all on public.notices from anon, authenticated;

-- The server's role (used only by the notice function in Netlify).
grant select on public.entries, public.partners, public.journeys, public.counsel, public.email_prefs to service_role;
grant select, insert on public.notices to service_role;
grant usage, select on sequence public.notices_id_seq to service_role;
