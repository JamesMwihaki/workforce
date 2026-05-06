# Workforce Solution — Agent Build Plan

## Project Overview
A workforce-sharing web app for a cluster of 10+ Chipotle stores. When a store is understaffed,
a manager posts a shift request through a dashboard. The system broadcasts an SMS to all
registered workers at neighboring stores who match the required role. Workers reply "YES" to
claim the shift. The first N to respond are confirmed. No corporate integration — fully independent.

---

## Tech Stack
- **Framework:** Next.js 14 (App Router, TypeScript)
- **Database & Auth:** Supabase (PostgreSQL + Supabase Auth for managers)
- **SMS:** Twilio (outbound broadcast + inbound webhook for replies)
- **Hosting:** Vercel
- **Styling:** Tailwind CSS

---

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
NEXTAUTH_SECRET=
NEXT_PUBLIC_APP_URL=
```

---

## Database Schema

### `stores`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | Store name/identifier |
| address | text | |
| created_at | timestamp | |

### `workers`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| employee_id | text (unique) | Chipotle employee number — used for verification |
| name | text | |
| phone | text | E.164 format e.g. +12345678901 |
| store_id | uuid (FK → stores) | Home store |
| roles | text[] | Array: 'line_crew', 'cashier', 'prep', 'kitchen' |
| is_active | boolean | Default true |
| created_at | timestamp | |

### `managers`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | Matches Supabase Auth user id |
| name | text | |
| email | text (unique) | Used for Supabase Auth login |
| store_id | uuid (FK → stores) | Store they manage |
| created_at | timestamp | |

### `shift_requests`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| requesting_store_id | uuid (FK → stores) | |
| created_by | uuid (FK → managers) | |
| role | text | One of: 'line_crew', 'cashier', 'prep', 'kitchen' |
| shift_date | date | |
| start_time | time | |
| end_time | time | |
| headcount_needed | integer | How many workers needed |
| headcount_confirmed | integer | Default 0 |
| status | text | 'open' | 'filled' | 'cancelled' |
| created_at | timestamp | |

### `shift_claims`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| shift_request_id | uuid (FK → shift_requests) | |
| worker_id | uuid (FK → workers) | |
| status | text | 'confirmed' | 'waitlisted' |
| claimed_at | timestamp | |

---

## Application Pages & Routes

### Public Pages
| Route | Description |
|---|---|
| `/register` | Worker self-registration form |
| `/register/success` | Confirmation page after successful registration |

### Manager Pages (auth required)
| Route | Description |
|---|---|
| `/login` | Manager login page (Supabase Auth) |
| `/dashboard` | Overview: open requests, recent activity |
| `/dashboard/new` | Form to create a new shift request |
| `/dashboard/requests/[id]` | Detail view: who confirmed, status, timeline |

### API Routes
| Route | Method | Description |
|---|---|---|
| `/api/workers/register` | POST | Save new worker registration |
| `/api/shifts` | POST | Create shift request + trigger SMS broadcast |
| `/api/shifts` | GET | List shift requests for manager's store |
| `/api/shifts/[id]` | GET | Get single shift request with claims |
| `/api/shifts/[id]` | PATCH | Cancel a shift request |
| `/api/twilio/reply` | POST | Twilio webhook — handles inbound "YES" replies |

---

## Phase 1 — Project Setup

**Goal:** Working Next.js project connected to Supabase, deployable to Vercel.

Tasks:
1. Initialize Next.js 14 project with TypeScript and Tailwind CSS
2. Install dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `twilio`, `zod`
3. Set up Supabase project (create via Supabase dashboard, save credentials to `.env.local`)
4. Create all database tables using the schema above (SQL migration file in `/supabase/migrations/`)
5. Enable Row Level Security (RLS) on all tables
6. Set up `.env.local` with all required environment variables (placeholders)
7. Create `/lib/supabase/client.ts` and `/lib/supabase/server.ts` helper files
8. Create `/lib/twilio.ts` helper to initialize Twilio client
9. Confirm `npm run dev` starts without errors

---

## Phase 2 — Worker Registration

**Goal:** Any worker can visit `/register`, fill out the form, and be saved to the database.

Tasks:
1. Build `/register` page with the following form fields:
   - Employee ID (text, required) — must be unique, used as verification
   - Full Name (text, required)
   - Phone Number (text, required) — validate and store in E.164 format
   - Home Store (dropdown — populated from `stores` table)
   - Role(s) (checkboxes — Line Crew, Cashier, Prep, Kitchen) — at least one required
2. On submit, call `POST /api/workers/register`
3. API validates all fields with Zod, checks employee_id is not already registered, inserts into `workers` table
4. On success, redirect to `/register/success`
5. Build `/register/success` page with a confirmation message
6. Handle errors gracefully (duplicate employee ID, missing fields)

---

## Phase 3 — Manager Auth

**Goal:** Managers can log in and access protected dashboard routes.

Tasks:
1. Set up Supabase Auth (email + password) for managers
2. Build `/login` page with email/password form
3. On login, use Supabase Auth — redirect to `/dashboard` on success
4. Create middleware (`middleware.ts`) to protect all `/dashboard/*` routes — redirect to `/login` if not authenticated
5. Add a logout button available on all dashboard pages
6. Seed at least one manager account and one store for testing (SQL seed file)

---

## Phase 4 — Manager Dashboard

**Goal:** Manager can see their open requests and create new shift requests.

Tasks:
1. Build `/dashboard` page:
   - List all shift requests created by the manager's store
   - Show status badge (open / filled / cancelled) for each
   - Show headcount progress (e.g. "2 / 3 confirmed")
   - Link to detail page for each request
   - Button to create a new request
2. Build `/dashboard/new` page with shift request form:
   - Role (dropdown: Line Crew, Cashier, Prep, Kitchen)
   - Date (date picker)
   - Start Time / End Time (time pickers)
   - Number of workers needed (number input, min 1)
   - Submit button
3. On submit, call `POST /api/shifts`
4. Build `/dashboard/requests/[id]` page:
   - Show full request details
   - List confirmed workers (name, home store)
   - Show real-time status using Supabase Realtime subscription
   - Cancel button (calls `PATCH /api/shifts/[id]`)
5. Use Supabase Realtime on the dashboard to reflect claim updates without page refresh

---

## Phase 5 — SMS System

**Goal:** When a shift request is created, SMS is broadcast to matching workers. Replies are handled automatically.

### Outbound (broadcast)
1. In `POST /api/shifts`, after saving the shift request to the database:
   - Query all workers where `role && roles` (role is in their roles array) AND `store_id != requesting_store_id` AND `is_active = true`
   - Send each worker an SMS via Twilio with the message:
     ```
     [ShiftAlert] {Store Name} needs a {Role} on {Date} from {Start} to {End}.
     Reply YES to claim this shift. Reply STOP to unsubscribe.
     Shift ID: {shift_request_id}
     ```
   - The Shift ID in the message body allows the webhook to know which shift is being claimed

### Inbound (webhook)
2. Build `POST /api/twilio/reply` webhook:
   - Twilio calls this endpoint when a worker replies
   - Parse the reply body — check if it contains "YES" (case-insensitive)
   - Extract the Shift ID from the worker's most recently sent message (look up by their phone number in `shift_claims` or match via Twilio message context)
   - Look up the worker by phone number in the `workers` table
   - Look up the shift request by Shift ID
   - If shift is still `open` and `headcount_confirmed < headcount_needed`:
     - Insert a row into `shift_claims` with `status = 'confirmed'`
     - Increment `shift_requests.headcount_confirmed`
     - If now fully filled, update `shift_requests.status = 'filled'`
     - Reply to worker: "You're confirmed for {Date} {Start}-{End} at {Store}. Thank you!"
   - If shift is already filled:
     - Insert row into `shift_claims` with `status = 'waitlisted'`
     - Reply to worker: "Thanks for responding — this shift has been filled. We'll reach out for future shifts."
   - Register the Twilio webhook URL in the Twilio console pointing to `{NEXT_PUBLIC_APP_URL}/api/twilio/reply`

---

## Phase 6 — Polish & Error Handling

**Goal:** App is stable, mobile-friendly, and handles edge cases.

Tasks:
1. Make all pages fully responsive (mobile-first — workers will use phones)
2. Add loading states to all forms and buttons
3. Add error messages for all API failures
4. Protect `POST /api/shifts` so only authenticated managers can call it
5. Validate Twilio webhook requests using Twilio's signature validation middleware
6. Handle STOP replies — set `workers.is_active = false` to respect opt-outs
7. Add a simple nav/header to all dashboard pages (store name, manager name, logout)
8. Test the full flow end-to-end

---

## Suggested Build Order for Agents

1. Phase 1 — Project Setup
2. Phase 2 — Worker Registration (visible, testable immediately)
3. Phase 3 — Manager Auth
4. Phase 4 — Manager Dashboard
5. Phase 5 — SMS System
6. Phase 6 — Polish

---

## Notes
- Each phase should be independently testable before moving to the next
- Keep all Twilio and Supabase credentials out of source code — `.env.local` only
- Twilio webhook requires a public URL — use `ngrok` for local testing of Phase 5
- The `shift_request_id` embedded in SMS messages is the linking key for the reply webhook
