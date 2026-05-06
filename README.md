# ShiftAlert — Workforce Sharing for Chipotle Stores

A workforce-sharing app for a cluster of 10+ Chipotle stores. When a store is
understaffed, a manager posts a shift request; the system broadcasts an SMS to
matching workers at neighbouring stores. Workers reply **YES** to claim the
shift; the first N to respond are confirmed.

Built with Next.js 14, Supabase, Twilio, Tailwind.

---

## Quick start (TL;DR)

```bash
nvm use 20            # Next.js 14 needs Node 18.17+. v16 will not work.
npm install
# ...fill in .env.local (see "Environment variables" below)
npm run dev           # http://localhost:3000
```

You won't be able to log in or send SMS until Supabase + Twilio are wired up
(steps 2 and 3). The `/register` page will work as soon as Supabase is
connected and `0001_init.sql` + `seed.sql` have been run.

Useful npm scripts:

| Command          | What it does                              |
|------------------|-------------------------------------------|
| `npm run dev`    | Start the dev server on port 3000         |
| `npm run build`  | Production build (also runs type-check)   |
| `npm run start`  | Run the production build                  |
| `npm run lint`   | ESLint                                    |

---

## Setup

### 1. Install dependencies

Requires **Node 18.17+** (Node 20 recommended). Check with `node -v`. If you're
on nvm and have a newer version installed, run `nvm use 20` first.

```bash
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in `supabase/migrations/` against the project (SQL editor
   or `supabase db push`):
   - `0001_init.sql` — schema, indexes, RLS policies
   - `0002_claim_shift_seat.sql` — atomic claim RPC used by the SMS webhook
3. Optionally run `supabase/seed.sql` to populate four sample stores.
4. Create a manager auth user via Supabase Auth → Users, then insert a row in
   `public.managers` linking that auth user id to a store id (see commented
   block at the end of `seed.sql`).

### 3. Twilio

1. Buy a phone number with SMS capability.
2. In the number's **Messaging** settings, point the inbound webhook at:
   `https://YOUR_DOMAIN/api/twilio/reply`  (POST).
3. For local development, expose port 3000 via `ngrok` and point the webhook at
   the ngrok URL.

### 4. Environment variables

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
NEXTAUTH_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run

```bash
npm run dev
```

Visit:
- `/register` — worker self-registration
- `/login` — manager login
- `/dashboard` — manager dashboard

---

## How it works

1. **Worker registers** at `/register` with employee ID, name, phone, home
   store, and roles.
2. **Manager logs in** at `/login` and posts a shift request from
   `/dashboard/new`.
3. **Server broadcasts SMS** to every active worker at a *different* store who
   covers the requested role. The shift's UUID is embedded in the message body.
4. **Workers reply YES.** The webhook at `/api/twilio/reply`:
   - Validates the Twilio signature.
   - Resolves the worker by phone, the shift by embedded UUID (or falls back to
     the worker's most recent eligible open shift).
   - Calls `claim_shift_seat` — a Postgres function that atomically increments
     `headcount_confirmed` only if seats remain.
   - Inserts a `confirmed` or `waitlisted` row in `shift_claims` and replies
     with TwiML.
5. **Dashboard updates live** via Supabase Realtime on `shift_requests` and
   `shift_claims`.
6. **STOP** marks `workers.is_active = false`. **START** re-enables.

---

## Project layout

```
app/
  api/
    workers/register/         POST — create worker
    shifts/                   GET  — list shifts for caller's store
                              POST — create + broadcast SMS
    shifts/[id]/              GET  — shift detail + claims
                              PATCH — cancel
    twilio/reply/             POST — inbound SMS webhook
  dashboard/
    layout.tsx                manager nav
    page.tsx                  list of own-store shifts
    new/                      create-shift form
    requests/[id]/            detail + Realtime claim list
  login/                      manager auth
  logout/                     POST signs out
  register/                   worker registration
lib/
  supabase/{client,server}.ts Supabase clients (browser, server, service-role)
  twilio.ts                   lazy Twilio SDK init
  broadcast.ts                outbound SMS broadcast
  auth.ts                     requireManager() helper
  roles.ts                    role enum + labels
  phone.ts                    E.164 normalisation (US/CA)
  format.ts                   date/time formatters
supabase/
  migrations/                 schema + RPC
  seed.sql                    sample stores
middleware.ts                 protects /dashboard/*
```

---

## Troubleshooting

**`npm run dev` errors with `Unsupported engine` / `Cannot find module 'next'`**
You're on Node < 18.17. Run `nvm use 20` (or upgrade Node) and `npm install`
again.

**Login redirects you back to `/login?error=no_manager`**
Your Supabase Auth user exists but there's no row in `public.managers` for
that user id. Insert one — see the commented block at the bottom of
`supabase/seed.sql`.

**Worker registration says "We couldn't load the store list"**
Either Supabase env vars are missing/wrong in `.env.local`, or `0001_init.sql`
hasn't been run. Hard-reload after fixing.

**Twilio webhook always returns 403**
Twilio signature validation is enforced in production
(`NODE_ENV=production`). Make sure `NEXT_PUBLIC_APP_URL` exactly matches the
URL you registered with Twilio (including `https://` and no trailing slash),
and that `TWILIO_AUTH_TOKEN` is set. For local dev with `ngrok`, set
`NEXT_PUBLIC_APP_URL` to your ngrok URL.

**SMS broadcast doesn't send to anyone**
The query filters to *active workers at a different store from the requester
who cover the requested role*. If you only have one store seeded, every
worker is excluded. Seed at least two stores and register a worker at the
non-requesting one.

**Realtime updates don't show on the dashboard**
Enable Realtime on the `shift_requests` and `shift_claims` tables in the
Supabase dashboard (Database → Replication).

