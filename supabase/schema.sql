-- DinKin database schema
-- Paste this whole file into Supabase: Dashboard > SQL Editor > New query > Run.
-- Safe to run once on a fresh project.

-- ============ Tables ============

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Family member',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table public.messages (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_family_created_idx on public.messages (family_id, created_at desc);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  notes text,
  location text,
  starts_at timestamptz not null,
  created_by uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);
create index events_family_starts_idx on public.events (family_id, starts_at);

-- Shopping / orders / to-do items
create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  quantity text,
  done boolean not null default false,
  claimed_by uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);
create index list_items_family_idx on public.list_items (family_id, created_at);

-- ============ Helpers ============

-- True when the signed-in user belongs to the family.
create function public.is_family_member(fid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from family_members where family_id = fid and user_id = auth.uid()
  );
$$;

-- True when the signed-in user shares at least one family with another user.
create function public.shares_family_with(other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from family_members a
    join family_members b on a.family_id = b.family_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- Create a profile automatically for every new sign-up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Create a family and make the caller its admin. Returns the new family id.
create function public.create_family(family_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  code text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  loop
    code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from families where invite_code = code);
  end loop;

  insert into families (name, invite_code, created_by)
  values (trim(family_name), code, auth.uid())
  returning id into new_id;

  insert into family_members (family_id, user_id, role)
  values (new_id, auth.uid(), 'admin');

  return new_id;
end;
$$;

-- Join a family with its invite code. Returns the family id.
create function public.join_family(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select id into fid from families where invite_code = upper(trim(code));
  if fid is null then
    raise exception 'Invite code not found';
  end if;

  insert into family_members (family_id, user_id)
  values (fid, auth.uid())
  on conflict do nothing;

  return fid;
end;
$$;

-- ============ Row Level Security ============

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.messages enable row level security;
alter table public.events enable row level security;
alter table public.list_items enable row level security;

-- Profiles: see yourself and your relatives, edit only yourself.
create policy "profiles read" on public.profiles for select
  using (id = auth.uid() or public.shares_family_with(id));
create policy "profiles update self" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Families: members can read; admins can rename.
create policy "families read" on public.families for select
  using (public.is_family_member(id));
create policy "families update admin" on public.families for update
  using (exists (
    select 1 from public.family_members
    where family_id = families.id and user_id = auth.uid() and role = 'admin'
  ));

-- Members: members see each other; anyone can leave a family.
create policy "members read" on public.family_members for select
  using (public.is_family_member(family_id));
create policy "members leave" on public.family_members for delete
  using (user_id = auth.uid());

-- Messages: members read and post; authors delete their own.
create policy "messages read" on public.messages for select
  using (public.is_family_member(family_id));
create policy "messages insert" on public.messages for insert
  with check (user_id = auth.uid() and public.is_family_member(family_id));
create policy "messages delete own" on public.messages for delete
  using (user_id = auth.uid());

-- Events: members read, add, edit and delete.
create policy "events read" on public.events for select
  using (public.is_family_member(family_id));
create policy "events insert" on public.events for insert
  with check (created_by = auth.uid() and public.is_family_member(family_id));
create policy "events update" on public.events for update
  using (public.is_family_member(family_id));
create policy "events delete" on public.events for delete
  using (public.is_family_member(family_id));

-- List items: members read, add, tick off and delete.
create policy "items read" on public.list_items for select
  using (public.is_family_member(family_id));
create policy "items insert" on public.list_items for insert
  with check (created_by = auth.uid() and public.is_family_member(family_id));
create policy "items update" on public.list_items for update
  using (public.is_family_member(family_id));
create policy "items delete" on public.list_items for delete
  using (public.is_family_member(family_id));

-- ============ Realtime ============

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.list_items;
alter publication supabase_realtime add table public.family_members;

-- ============ Update 2: admin-only invite code ============


-- Members can no longer read invite_code directly.
revoke select on public.families from anon, authenticated;
grant select (id, name, created_by, created_at) on public.families to authenticated;

create or replace function public.is_family_admin(fid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from family_members
    where family_id = fid and user_id = auth.uid() and role = 'admin'
  );
$$;

-- Admin only: read the invite code.
create or replace function public.get_invite_code(fid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if not public.is_family_admin(fid) then
    raise exception 'Only the family admin can see the invite code';
  end if;
  select invite_code into code from families where id = fid;
  return code;
end;
$$;

-- Admin only: replace the invite code (old code stops working).
create or replace function public.regenerate_invite_code(fid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if not public.is_family_admin(fid) then
    raise exception 'Only the family admin can change the invite code';
  end if;
  loop
    code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from families where invite_code = code);
  end loop;
  update families set invite_code = code where id = fid;
  return code;
end;
$$;

-- Admin only: remove someone from the family.
create or replace function public.remove_member(fid uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_family_admin(fid) then
    raise exception 'Only the family admin can remove members';
  end if;
  if member = auth.uid() then
    raise exception 'Use "Leave family" to remove yourself';
  end if;
  delete from family_members where family_id = fid and user_id = member;
end;
$$;

-- Admin only: make another member an admin too.
create or replace function public.make_admin(fid uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_family_admin(fid) then
    raise exception 'Only the family admin can do this';
  end if;
  update family_members set role = 'admin' where family_id = fid and user_id = member;
end;
$$;
