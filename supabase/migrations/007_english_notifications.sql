-- DinKin update 7: phone notifications in English again.
-- Run this in Supabase > SQL Editor after 006.

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

