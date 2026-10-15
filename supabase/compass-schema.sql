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

-- ============================================================================
-- COMPASS-05 · One journal with CLUB 24E
-- A CLUB 24E member links their account to their Attunement Compass journal. Linking needs a 6-digit code
-- emailed to them, so only the true owner of the email can connect. Signals tested inside CLUB 24E are then
-- saved to the same journal. Only the server (the bridge function) reads these tables.

-- Where a signal was tested: on attunementcompass.com, or inside CLUB 24E.
alter table public.entries add column if not exists origin text not null default 'compass';
do $$ begin
  alter table public.entries add constraint entries_origin_check check (origin in ('compass', 'club24e'));
exception when duplicate_object then null; end $$;

create table if not exists public.links (
  club_user uuid primary key,
  compass_user uuid not null references auth.users(id) on delete cascade,
  email text not null,
  app text not null default 'club24e' check (app in ('club24e')),
  linked_at timestamptz not null default now()
);
create index if not exists links_compass_user on public.links (compass_user);
alter table public.links enable row level security;
-- The person can see which apps are linked to their journal, and unlink them.
drop policy if exists links_own_select on public.links;
drop policy if exists links_own_delete on public.links;
create policy links_own_select on public.links for select to authenticated using (compass_user = (select auth.uid()));
create policy links_own_delete on public.links for delete to authenticated using (compass_user = (select auth.uid()));
revoke all on public.links from anon, authenticated;
grant select, delete on public.links to authenticated;

create table if not exists public.link_codes (
  club_user uuid primary key,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sends int not null default 1,
  window_start timestamptz not null default now()
);
alter table public.link_codes enable row level security;
revoke all on public.link_codes from anon, authenticated;

-- Find a Compass account by email (server only).
create or replace function public.compass_user_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;
revoke all on function public.compass_user_by_email(text) from public, anon, authenticated;
grant execute on function public.compass_user_by_email(text) to service_role;

grant select, insert, delete on public.links, public.link_codes to service_role;
grant update on public.link_codes to service_role;
grant select, insert on public.journeys to service_role;
grant insert, update on public.entries to service_role;
grant select on public.reflections to service_role;

-- ============================================================================
-- COMPASS-06 · Church care
-- A pastor sees everyone who asked them to walk with them, in one place, with who needs a word first.
-- Progress (days practised, last practised, steps kept) is shown only when the person allows it; on by
-- default for a pastor they invited themselves, off for partners, and anyone can change it at any time.
-- The words of an entry are still never seen unless that entry is shared.
-- Pastor and member can also write to each other outside any one entry ("care notes").

alter table public.partners add column if not exists show_progress boolean not null default false;

-- The person (owner) decides what each partner may see.
drop policy if exists partners_owner_update on public.partners;
create policy partners_owner_update on public.partners for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
grant update (show_progress) on public.partners to authenticated;

-- Accepting: a pastor link shows progress from the start (the person was told when making the link).
-- A pastor may care for up to 300 people; anyone may be a partner to up to 50.
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
  if i.role = 'partner' and (select count(*) from public.partners where partner = me and role = 'partner') >= 50 then raise exception 'max_walking' using errcode = '22023'; end if;
  if (select count(*) from public.partners where partner = me) >= 300 then raise exception 'max_walking' using errcode = '22023'; end if;
  insert into public.partners (owner, partner, role, owner_name, partner_name, show_progress)
    values (i.owner, me, i.role, i.owner_name, trim(p_name), i.role = 'pastor')
    on conflict (owner, partner) do update set role = excluded.role, partner_name = excluded.partner_name;
  update public.invites set used_by = me, used_at = now() where code = i.code;
  return i.owner_name;
end $$;

-- Everyone I walk with, and how they are doing (progress only where they allow it).
create or replace function public.care_overview()
returns table (
  id uuid, owner uuid, owner_name text, role text, since timestamptz, show_progress boolean,
  round int, rounds_completed int, practised int, last_practised date,
  steps_done int, steps_not_yet int, steps_pending int,
  shared_count int, last_shared_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.owner, p.owner_name, p.role, p.created_at, p.show_progress,
    case when p.show_progress then j.round end,
    case when p.show_progress then j.rounds_completed end,
    case when p.show_progress then (select count(distinct e.local_date)::int from public.entries e where e.user_id = p.owner and e.round = j.round) end,
    case when p.show_progress then (select max(e.local_date) from public.entries e where e.user_id = p.owner) end,
    case when p.show_progress then (select count(*)::int from public.entries e where e.user_id = p.owner and e.round = j.round and e.step is not null and e.step_status = 'done') end,
    case when p.show_progress then (select count(*)::int from public.entries e where e.user_id = p.owner and e.round = j.round and e.step is not null and e.step_status = 'not_yet') end,
    case when p.show_progress then (select count(*)::int from public.entries e where e.user_id = p.owner and e.round = j.round and e.step is not null and e.step_status = 'pending') end,
    (select count(*)::int from public.entries e where e.user_id = p.owner and e.shared),
    (select max(e.shared_at) from public.entries e where e.user_id = p.owner and e.shared)
  from public.partners p
  left join public.journeys j on j.user_id = p.owner
  where p.partner = auth.uid()
  order by p.owner_name;
$$;
revoke all on function public.care_overview() from public, anon;
grant execute on function public.care_overview() to authenticated;

-- Care notes: a short word between a person and someone walking with them, outside any one entry.
create table if not exists public.care_notes (
  id uuid primary key default gen_random_uuid(),
  link uuid not null references public.partners(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists care_notes_link on public.care_notes (link, created_at desc);

create or replace function public.in_link(p_link uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.partners where id = p_link and (owner = auth.uid() or partner = auth.uid()));
$$;
revoke all on function public.in_link(uuid) from public, anon;
grant execute on function public.in_link(uuid) to authenticated;

create or replace function public.care_note_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.partners;
begin
  select * into p from public.partners where id = new.link;
  if not found or auth.uid() not in (p.owner, p.partner) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if (select count(*) from public.care_notes where link = new.link and author = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  new.author := auth.uid();
  new.author_name := case when auth.uid() = p.owner then p.owner_name else p.partner_name end;
  new.created_at := now();
  new.read_at := null;
  return new;
end $$;
drop trigger if exists care_note_before on public.care_notes;
create trigger care_note_before before insert on public.care_notes for each row execute function public.care_note_before();

alter table public.care_notes enable row level security;
drop policy if exists care_notes_select on public.care_notes;
drop policy if exists care_notes_insert on public.care_notes;
drop policy if exists care_notes_read on public.care_notes;
drop policy if exists care_notes_delete on public.care_notes;
create policy care_notes_select on public.care_notes for select to authenticated using (public.in_link(link));
create policy care_notes_insert on public.care_notes for insert to authenticated with check (author = (select auth.uid()) and public.in_link(link));
-- Only the one it was written to can mark it read.
create policy care_notes_read on public.care_notes for update to authenticated
  using (public.in_link(link) and author <> (select auth.uid())) with check (public.in_link(link) and author <> (select auth.uid()));
create policy care_notes_delete on public.care_notes for delete to authenticated using (author = (select auth.uid()));
revoke all on public.care_notes from anon, authenticated;
grant select, insert, delete on public.care_notes to authenticated;
grant update (read_at) on public.care_notes to authenticated;

-- Email notices learn one more kind: a care note.
alter table public.notices drop constraint if exists notices_kind_check;
alter table public.notices add constraint notices_kind_check check (kind in ('share', 'counsel', 'care'));
grant select on public.care_notes to service_role;

notify pgrst, 'reload schema';
