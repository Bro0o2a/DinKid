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

-- ============ Update 3: profile pictures, last seen, admin codes ============


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

-- ============ Update 4: phone notifications ============


create extension if not exists pg_net with schema extensions;

-- One row per phone or computer that turned notifications on.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

-- Private settings: nobody can read this table from the app.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  url text not null default 'https://din-kid.vercel.app/api/push',
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict do nothing;

drop function if exists public.save_push_subscription(text, text, text);
create or replace function public.save_push_subscription(sub_endpoint text, sub_p256dh text, sub_auth text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into push_subscriptions (endpoint, user_id, p256dh, auth)
  values (sub_endpoint, auth.uid(), sub_p256dh, sub_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;

create or replace function public.remove_push_subscription(sub_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from push_subscriptions s where s.endpoint = sub_endpoint and s.user_id = auth.uid();
$$;

-- Sends a notification to everyone in the family except the person who wrote.
create or replace function public.notify_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  title text;
  body text;
  subs jsonb;
  cfg push_config;
begin
  if tg_table_name = 'messages' then
    author := new.user_id;
    body := left(new.body, 140);
  else
    author := new.created_by;
    body := 'New event: ' || new.title;
  end if;

  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)))
    into subs
  from push_subscriptions s
  join family_members m on m.user_id = s.user_id and m.family_id = new.family_id
  where s.user_id <> author;
  if subs is null then
    return new;
  end if;

  select p.display_name || ' · ' || f.name into title
  from profiles p, families f
  where p.id = author and f.id = new.family_id;

  select * into cfg from push_config where id = 1;
  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object(
      'title', coalesce(title, 'DinKin'),
      'body', body,
      'url', '/f/' || new.family_id,
      'tag', new.family_id::text,
      'subscriptions', subs
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret)
  );
  return new;
exception when others then
  -- A notification problem must never stop the message from being saved.
  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_family();

drop trigger if exists events_notify on public.events;
create trigger events_notify after insert on public.events
  for each row execute function public.notify_family();

select secret as "PUSH_SECRET (copy this)" from public.push_config;

-- ============ Update 5: reminders, chat photos, family photo ============

create extension if not exists pg_cron;

-- ---------- Family photo ----------
alter table public.families add column if not exists photo_url text;
grant select (photo_url) on public.families to authenticated;

-- ---------- Photos in chat ----------
alter table public.messages add column if not exists image_path text;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 4000 and (char_length(body) > 0 or image_path is not null));

-- Private bucket: files live in a folder named after the family, only its members can see them.
insert into storage.buckets (id, name, public)
values ('chat', 'chat', false)
on conflict (id) do update set public = false;

drop policy if exists "chat photos read" on storage.objects;
create policy "chat photos read" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.is_family_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "chat photos upload" on storage.objects;
create policy "chat photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and public.is_family_member(((storage.foldername(name))[1])::uuid));

-- ---------- Event reminders ----------
alter table public.events add column if not exists remind_minutes int default 60;
alter table public.events add column if not exists reminded_at timestamptz;
-- Time zone of the person who made the event, for the times written in notifications.
alter table public.events add column if not exists tz text;

-- Moving an event or changing its reminder sends the reminder again.
create or replace function public.reset_event_reminder()
returns trigger
language plpgsql
as $$
begin
  if new.starts_at is distinct from old.starts_at or new.remind_minutes is distinct from old.remind_minutes then
    new.reminded_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists events_reset_reminder on public.events;
create trigger events_reset_reminder before update on public.events
  for each row execute function public.reset_event_reminder();

-- Sends one notification to the family's devices (except `skip`, when given).
create or replace function public.push_to_family(fid uuid, skip uuid, title text, body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  subs jsonb;
  cfg push_config;
begin
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)))
    into subs
  from push_subscriptions s
  join family_members m on m.user_id = s.user_id and m.family_id = fid
  where skip is null or s.user_id <> skip;
  if subs is null then
    return;
  end if;
  select * into cfg from push_config where id = 1;
  perform net.http_post(
    url := cfg.url,
    body := jsonb_build_object('title', title, 'body', body, 'url', '/f/' || fid, 'tag', fid::text, 'subscriptions', subs),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret)
  );
end;
$$;
revoke execute on function public.push_to_family(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.notify_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  title text;
  body text;
begin
  if tg_table_name = 'messages' then
    author := new.user_id;
    body := coalesce(nullif(left(new.body, 140), ''), '📷 Photo');
  else
    author := new.created_by;
    body := '📅 New event: ' || new.title || ' · ' || to_char(new.starts_at at time zone coalesce(new.tz, 'Asia/Beirut'), 'Dy DD Mon, HH24:MI');
  end if;
  select p.display_name || ' · ' || f.name into title
  from profiles p, families f
  where p.id = author and f.id = new.family_id;
  perform push_to_family(new.family_id, author, coalesce(title, 'DinKin'), body);
  return new;
exception when others then
  -- A notification problem must never stop the message from being saved.
  return new;
end;
$$;

-- Runs every minute: reminds the whole family before each event.
create or replace function public.send_due_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  for e in
    update events ev set reminded_at = now()
    from families f
    where f.id = ev.family_id
      and ev.reminded_at is null
      and ev.remind_minutes is not null
      and ev.starts_at - make_interval(mins => ev.remind_minutes) <= now()
      and ev.starts_at > now() - interval '30 minutes'
    returning ev.family_id, ev.title, ev.starts_at, ev.remind_minutes, ev.tz, f.name as family_name
  loop
    begin
      perform push_to_family(
        e.family_id,
        null,
        '⏰ ' || e.title,
        case
          when e.starts_at <= now() + interval '1 minute' then 'Starting now'
          when e.starts_at < now() + interval '60 minutes' then 'In ' || ceil(extract(epoch from e.starts_at - now()) / 60) || ' minutes'
          when e.starts_at < now() + interval '20 hours' then 'At ' || to_char(e.starts_at at time zone coalesce(e.tz, 'Asia/Beirut'), 'HH24:MI')
          else to_char(e.starts_at at time zone coalesce(e.tz, 'Asia/Beirut'), 'Dy DD Mon, HH24:MI')
        end || ' · ' || e.family_name
      );
    exception when others then
      null;
    end;
  end loop;
end;
$$;
revoke execute on function public.send_due_reminders() from public, anon, authenticated;

select cron.unschedule('dinkin-reminders') where exists (select 1 from cron.job where jobname = 'dinkin-reminders');
select cron.schedule('dinkin-reminders', '* * * * *', 'select public.send_due_reminders()');

-- ============ Update 6: replies, reactions, voice, seen, polls, birthdays ============
-- DinKin update 6: replies, reactions, voice messages, "seen", polls and birthdays.
-- Paste into Supabase: SQL Editor > New query > Run. Run updates 4 and 5 first. Safe to run more than once.

-- ---------- Replies, voice messages, polls ----------
alter table public.messages add column if not exists reply_to bigint references public.messages (id) on delete set null;
alter table public.messages add column if not exists audio_path text;
-- A poll is a message: {"question": "...", "options": ["...", "..."]}
alter table public.messages add column if not exists poll jsonb;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 4000 and (char_length(body) > 0 or image_path is not null or audio_path is not null or poll is not null));

-- ---------- Reactions ----------
create table if not exists public.message_reactions (
  message_id bigint not null references public.messages (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;
drop policy if exists "reactions read" on public.message_reactions;
create policy "reactions read" on public.message_reactions for select
  using (public.is_family_member(family_id));
drop policy if exists "reactions add" on public.message_reactions;
create policy "reactions add" on public.message_reactions for insert
  with check (
    user_id = auth.uid() and public.is_family_member(family_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.family_id = message_reactions.family_id)
  );
drop policy if exists "reactions remove own" on public.message_reactions;
create policy "reactions remove own" on public.message_reactions for delete
  using (user_id = auth.uid());

-- ---------- Poll votes (one choice per person) ----------
create table if not exists public.poll_votes (
  message_id bigint not null references public.messages (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  choice int not null check (choice >= 0),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.poll_votes enable row level security;
drop policy if exists "votes read" on public.poll_votes;
create policy "votes read" on public.poll_votes for select
  using (public.is_family_member(family_id));
drop policy if exists "votes add" on public.poll_votes;
create policy "votes add" on public.poll_votes for insert
  with check (
    user_id = auth.uid() and public.is_family_member(family_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.family_id = poll_votes.family_id and m.poll is not null)
  );
drop policy if exists "votes change own" on public.poll_votes;
create policy "votes change own" on public.poll_votes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "votes remove own" on public.poll_votes;
create policy "votes remove own" on public.poll_votes for delete
  using (user_id = auth.uid());

-- ---------- "Seen": the newest message each person has read ----------
create table if not exists public.message_reads (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_id bigint not null default 0,
  read_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
alter table public.message_reads enable row level security;
drop policy if exists "reads read" on public.message_reads;
create policy "reads read" on public.message_reads for select
  using (public.is_family_member(family_id));

create or replace function public.mark_read(fid uuid, mid bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into message_reads (family_id, user_id, last_read_id, read_at)
  select fid, auth.uid(), mid, now()
  where public.is_family_member(fid)
  on conflict (family_id, user_id) do update
    set last_read_id = greatest(message_reads.last_read_id, excluded.last_read_id), read_at = now()
    where excluded.last_read_id > message_reads.last_read_id;
$$;

-- ---------- Birthdays ----------
alter table public.profiles add column if not exists birthday date;

-- Runs every morning: tells each family whose birthday it is.
create or replace function public.send_birthday_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
begin
  for b in
    select m.family_id, p.id as user_id, p.display_name
    from profiles p
    join family_members m on m.user_id = p.id
    where p.birthday is not null
      and extract(month from p.birthday) = extract(month from now() at time zone 'Asia/Beirut')
      and extract(day from p.birthday) = extract(day from now() at time zone 'Asia/Beirut')
  loop
    begin
      perform push_to_family(b.family_id, b.user_id, '🎂 ' || b.display_name, 'اليوم عيد ميلاد ' || b.display_name || ' 🎉');
    exception when others then
      null;
    end;
  end loop;
end;
$$;
revoke execute on function public.send_birthday_reminders() from public, anon, authenticated;

select cron.unschedule('dinkin-birthdays') where exists (select 1 from cron.job where jobname = 'dinkin-birthdays');
select cron.schedule('dinkin-birthdays', '0 6 * * *', 'select public.send_birthday_reminders()');

-- ---------- Notification text for the new kinds of message ----------
create or replace function public.notify_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  title text;
  body text;
begin
  if tg_table_name = 'messages' then
    author := new.user_id;
    body := case
      when new.poll is not null then '🗳️ تصويت: ' || coalesce(new.poll ->> 'question', '')
      when new.audio_path is not null then '🎤 رسالة صوتية'
      else coalesce(nullif(left(new.body, 140), ''), '📷 صورة')
    end;
  else
    author := new.created_by;
    body := '📅 موعد جديد: ' || new.title || ' · ' || to_char(new.starts_at at time zone coalesce(new.tz, 'Asia/Beirut'), 'DD/MM HH24:MI');
  end if;
  select p.display_name || ' · ' || f.name into title
  from profiles p, families f
  where p.id = author and f.id = new.family_id;
  perform push_to_family(new.family_id, author, coalesce(title, 'DinKin'), body);
  return new;
exception when others then
  return new;
end;
$$;

-- Event reminders in Arabic too.
create or replace function public.send_due_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  for e in
    update events ev set reminded_at = now()
    from families f
    where f.id = ev.family_id
      and ev.reminded_at is null
      and ev.remind_minutes is not null
      and ev.starts_at - make_interval(mins => ev.remind_minutes) <= now()
      and ev.starts_at > now() - interval '30 minutes'
    returning ev.family_id, ev.title, ev.starts_at, ev.tz, f.name as family_name
  loop
    begin
      perform push_to_family(
        e.family_id,
        null,
        '⏰ ' || e.title,
        case
          when e.starts_at <= now() + interval '1 minute' then 'هلّق'
          when e.starts_at < now() + interval '60 minutes' then 'بعد ' || ceil(extract(epoch from e.starts_at - now()) / 60) || ' دقيقة'
          when e.starts_at < now() + interval '20 hours' then 'الساعة ' || to_char(e.starts_at at time zone coalesce(e.tz, 'Asia/Beirut'), 'HH24:MI')
          else to_char(e.starts_at at time zone coalesce(e.tz, 'Asia/Beirut'), 'DD/MM') || ' الساعة ' || to_char(e.starts_at at time zone coalesce(e.tz, 'Asia/Beirut'), 'HH24:MI')
        end || ' · ' || e.family_name
      );
    exception when others then
      null;
    end;
  end loop;
end;
$$;
revoke execute on function public.send_due_reminders() from public, anon, authenticated;

-- ---------- Live updates ----------
do $$
begin
  begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.poll_votes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.message_reads; exception when duplicate_object then null; end;
end $$;

-- ============ Update 7: notifications in English ============
-- Runs every morning: tells each family whose birthday it is.
create or replace function public.send_birthday_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
begin
  for b in
    select m.family_id, p.id as user_id, p.display_name
    from profiles p
    join family_members m on m.user_id = p.id
    where p.birthday is not null
      and extract(month from p.birthday) = extract(month from now() at time zone 'Asia/Beirut')
      and extract(day from p.birthday) = extract(day from now() at time zone 'Asia/Beirut')
  loop
    begin
      perform push_to_family(b.family_id, b.user_id, '🎂 ' || b.display_name, 'Today is ' || b.display_name || '''s birthday 🎉');
    exception when others then
      null;
    end;
  end loop;
end;
$$;
revoke execute on function public.send_birthday_reminders() from public, anon, authenticated;


-- ---------- Message and event notifications ----------
create or replace function public.notify_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  title text;
  body text;
begin
  if tg_table_name = 'messages' then
    author := new.user_id;
    body := case
      when new.poll is not null then '🗳️ Poll: ' || coalesce(new.poll ->> 'question', '')
      when new.audio_path is not null then '🎤 Voice message'
      else coalesce(nullif(left(new.body, 140), ''), '📷 Photo')
    end;
  else
    author := new.created_by;
    body := '📅 New event: ' || new.title || ' · ' || to_char(new.starts_at at time zone coalesce(new.tz, 'Asia/Beirut'), 'Dy DD Mon, HH24:MI');
  end if;
  select p.display_name || ' · ' || f.name into title
  from profiles p, families f
  where p.id = author and f.id = new.family_id;
  perform push_to_family(new.family_id, author, coalesce(title, 'DinKin'), body);
  return new;
exception when others then
  return new;
end;
$$;

-- Event reminders.
create or replace function public.send_due_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  for e in
    update events ev set reminded_at = now()
    from families f
    where f.id = ev.family_id
      and ev.reminded_at is null
      and ev.remind_minutes is not null
      and ev.starts_at - make_interval(mins => ev.remind_minutes) <= now()
      and ev.starts_at > now() - interval '30 minutes'
    returning ev.family_id, ev.title, ev.starts_at, ev.tz, f.name as family_name
  loop
    begin
      perform push_to_family(
        e.family_id,
        null,
        '⏰ ' || e.title,
        case
          when e.starts_at <= now() + interval '1 minute' then 'Starting now'
          when e.starts_at < now() + interval '60 minutes' then 'In ' || ceil(extract(epoch from e.starts_at - now()) / 60) || ' minutes'
          when e.starts_at < now() + interval '20 hours' then 'At ' || to_char(e.starts_at at time zone coalesce(e.tz, 'Asia/Beirut'), 'HH24:MI')
          else to_char(e.starts_at at time zone coalesce(e.tz, 'Asia/Beirut'), 'Dy DD Mon, HH24:MI')
        end || ' · ' || e.family_name
      );
    exception when others then
      null;
    end;
  end loop;
end;
$$;
revoke execute on function public.send_due_reminders() from public, anon, authenticated;

