-- DinKin update 5: event reminders, photos in chat, family photo.
-- Paste into Supabase: SQL Editor > New query > Run. Run update 4 first. Safe to run more than once.

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
