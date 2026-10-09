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
