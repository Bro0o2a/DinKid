-- DinKin update 3: profile pictures, "last seen", and invite codes on the admin home screen.
-- Paste into Supabase: SQL Editor > New query > Run. Safe to run more than once.

alter table public.profiles add column if not exists last_seen_at timestamptz;

-- The app calls this while someone has DinKin open.
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set last_seen_at = now() where id = auth.uid();
$$;

-- Invite codes for every family the caller is admin of.
create or replace function public.my_admin_codes()
returns table (family_id uuid, invite_code text)
language sql
security definer
set search_path = public
stable
as $$
  select f.id, f.invite_code
  from families f
  join family_members m on m.family_id = f.id
  where m.user_id = auth.uid() and m.role = 'admin';
$$;

-- Profile pictures: public bucket, each person writes only inside their own folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars upload own" on storage.objects;
create policy "avatars upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
