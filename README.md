# 🏡 DinKin

**Live app:** https://din-kid.vercel.app

A private live chat for your family, with shared events and shopping/orders lists.
No phone numbers: the family admin signs in with email and password; everyone else joins with just their name and the admin's 6‑letter family code, and stays signed in on their phone.

Works on any phone or laptop browser, and can be added to the home screen like an app (PWA).

## Features (v1)

- **Families** – create one, share the invite code, relatives join with it. You can be in several families.
- **Live chat** – messages appear instantly for everyone. Arabic and English both display correctly.
- **Events** – birthdays, dinners, appointments, with date, place and notes.
- **Lists** – "shu badna men l dukkene": add items, say *I'll get it*, tick them off.
- **Family tab** – invite code, members, change your name, leave.

## Stack

| Part | Tool | Cost |
| --- | --- | --- |
| App | Next.js 15 + React + Tailwind CSS | free |
| Database, login, realtime | [Supabase](https://supabase.com) | free tier |
| Hosting | [Vercel](https://vercel.com) | free tier |

Privacy is enforced in the database itself (Row Level Security in `supabase/schema.sql`): a person can only read the chat, events and lists of families they belong to.

## Setup (once, ~15 minutes)

### 1. Create the Supabase project
1. Sign up at [supabase.com](https://supabase.com) and click **New project** (any name, e.g. `dinkin`; pick the closest region).
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key (or the **Publishable key**; either works).

### 2. Turn on sign-in
- **Email + password** is on by default. Turn off **Authentication → Sign In / Providers → Email → Confirm email** so relatives can join without waiting for an email (the free email sender only reaches your own address).
- **Google** (optional): **Authentication → Providers → Google**, follow Supabase's guide to paste a Google Client ID and secret.
- **Authentication → URL Configuration**: set **Site URL** to your live address (e.g. `https://dinkin.vercel.app`) and add `http://localhost:3000` under Redirect URLs.

- **Allow anonymous sign-ins** (Authentication → Sign In / Providers): turn on, so relatives can join with only their name + code.

### 3. Run it on your computer
```bash
cp .env.example .env.local   # then paste the URL and anon key into .env.local
npm install
npm run dev                  # open http://localhost:3000
```

### 4. Put it online
1. Go to [vercel.com](https://vercel.com), sign in with GitHub, **Add New → Project**, pick this repo.
2. Add the two environment variables from `.env.example`. After running database update 4, also add `PUSH_SECRET` (see below).
3. Click **Deploy**, then send the link to the family 🎉

On iPhone: open the link in Safari → Share → *Add to Home Screen*. On Android: Chrome menu → *Install app*.

## Project structure

```
supabase/schema.sql      database tables, security rules, realtime
src/app/page.tsx         login or your families
src/app/f/[id]/page.tsx  a family: Chat · Events · Lists · Family tabs
src/components/          one file per screen (Chat, Events, Lists, Members, Login, Home)
src/lib/                 Supabase client, types, realtime hooks
```

## Ideas for next versions

Photos and voice notes in chat, push notifications, event reminders, polls ("ween mnetghadda l jom3a?"), multiple named lists, read receipts.

## Database updates

When the app gets new database features, run the new file from `supabase/migrations/` in the Supabase SQL Editor (once):

- `002_admin_invite.sql`: only the family admin can see, share or change the invite code, and can remove members or make another admin.
- `003_profiles_presence.sql`: profile pictures, "last seen" times, and invite codes for all your families on the home screen.
- `004_push.sql`: phone notifications for new messages and events. It shows a key at the end: add it in Vercel as the environment variable `PUSH_SECRET`, then redeploy. On iPhone, notifications work after adding DinKin to the Home Screen.
- `005_calendar_photos.sql`: event reminders for the whole family, photos in the chat, and a family photo. Run it after 004.
- `006_chat_extras.sql`: replies, reactions, voice messages, seen ticks, polls, birthdays, and Arabic notification texts. Run it after 005.
