-- CPS Legislation Tracker: database setup
-- Run this once in Supabase (SQL Editor, New query, paste, Run). It is safe to run again.
--
-- What it makes:
--   team_members  the people who can sign in, and the short name shown in "Added by"
--   team_docs     every shared record: client folders, bill tags and notes, hearings,
--                 CPS connections and the outreach log
-- Only people on team_members can read or change team_docs. Each record is stamped
-- automatically with who added it and who last changed it.

-- ---------- tables ----------
create table if not exists public.team_members (
  id         text primary key,                 -- short id, like kfarris
  full_name  text not null,                    -- Kathryn Farris
  short_name text not null,                    -- K. Farris (shown in "Added by")
  email      text not null unique,             -- work email; sign-in codes go here
  active     boolean not null default true,    -- set to false to remove someone's access
  sort       integer not null default 0        -- order in the name dropdown
);

create table if not exists public.team_docs (
  coll       text not null check (coll in ('clients', 'bill_clients', 'hearings', 'contacts', 'outreach')),
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  added_by   text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coll, id)
);

-- ---------- who is signed in ----------
create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where active and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

create or replace function public.my_short_name() returns text
language sql stable security definer set search_path = public as $$
  select short_name from public.team_members
  where active and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.my_profile()
returns table (id text, full_name text, short_name text, email text)
language sql stable security definer set search_path = public as $$
  select id, full_name, short_name, email from public.team_members
  where active and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

-- the names for the opening page's dropdown (and the email each name signs in with)
create or replace function public.team_directory()
returns table (id text, full_name text, short_name text, email text)
language sql stable security definer set search_path = public as $$
  select id, full_name, short_name, email from public.team_members
  where active order by sort, full_name
$$;

-- ---------- "Added by" stamps, set by the database so they can't be faked ----------
create or replace function public.stamp_team_doc() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := coalesce(public.my_short_name(), case when auth.role() = 'service_role' then 'Tracker' end);
begin
  if tg_op = 'INSERT' then
    new.added_by := coalesce(who, new.added_by);
    new.created_at := now();
  else
    new.added_by := old.added_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(who, new.updated_by, new.added_by);
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists team_docs_stamp on public.team_docs;
create trigger team_docs_stamp
  before insert or update on public.team_docs
  for each row execute function public.stamp_team_doc();

-- ---------- access rules ----------
alter table public.team_members enable row level security;
alter table public.team_docs enable row level security;

drop policy if exists "Team can read" on public.team_docs;
drop policy if exists "Team can add" on public.team_docs;
drop policy if exists "Team can edit" on public.team_docs;
drop policy if exists "Team can remove" on public.team_docs;
drop policy if exists "Team can see the team list" on public.team_members;

create policy "Team can read" on public.team_docs
  for select to authenticated using (public.is_team_member());
create policy "Team can add" on public.team_docs
  for insert to authenticated with check (public.is_team_member());
create policy "Team can edit" on public.team_docs
  for update to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy "Team can remove" on public.team_docs
  for delete to authenticated using (public.is_team_member());
create policy "Team can see the team list" on public.team_members
  for select to authenticated using (public.is_team_member());

revoke all on public.team_docs from anon;
revoke all on public.team_members from anon;
grant select, insert, update, delete on public.team_docs to authenticated;
grant select on public.team_members to authenticated;
grant all on public.team_docs, public.team_members to service_role;

revoke all on function public.team_directory() from public;
revoke all on function public.my_profile() from public;
revoke all on function public.is_team_member() from public;
revoke all on function public.my_short_name() from public;
grant execute on function public.team_directory() to anon, authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.is_team_member() to authenticated;
grant execute on function public.my_short_name() to authenticated;

-- ---------- live updates: everyone sees a teammate's edit within a second or two ----------
do $$
begin
  alter publication supabase_realtime add table public.team_docs;
exception when duplicate_object then null;
end
$$;

-- ---------- starting client folders ----------
insert into public.team_docs (coll, id, data, added_by, updated_by) values
  ('clients', 'general',      '{"name": "General", "kind": "general", "note": "Major legislation the team monitors that does not directly affect a client"}', 'CPS', 'CPS'),
  ('clients', 'pcma',         '{"name": "PCMA"}', 'CPS', 'CPS'),
  ('clients', 'pew-plastics', '{"name": "Pew Plastics"}', 'CPS', 'CPS'),
  ('clients', 'prime',        '{"name": "PRIME"}', 'CPS', 'CPS'),
  ('clients', 'trinity',      '{"name": "Trinity"}', 'CPS', 'CPS')
on conflict (coll, id) do nothing;
