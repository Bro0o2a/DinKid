-- DinKin update 2: only the family admin can see and share the invite code.
-- Paste into Supabase: SQL Editor > New query > Run. Safe to run more than once.

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
