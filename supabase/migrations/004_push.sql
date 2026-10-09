-- DinKin update 4: phone notifications for new messages and events.
-- Paste into Supabase: SQL Editor > New query > Run. Safe to run more than once.
-- The last line shows your notification key: copy it into Vercel as PUSH_SECRET.

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
