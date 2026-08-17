# Project Flow

A job/project management app for handyman & field-service businesses —
clients, scheduling, quotes, and invoicing, built to eventually run with a
Claude-powered agent as an office copilot, customer-facing chat, and
scheduling assistant.

Stack: Vite + React + TypeScript + Tailwind v4 + shadcn/ui-style components +
Supabase (Postgres, Auth) + TanStack Query + React Router.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase project URL + anon key
npm run dev
```

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`docs/schema.sql`](docs/schema.sql) — it creates
   the `profiles`, `clients`, `jobs`, `job_notes`, `quotes`, and `invoices`
   tables with Row Level Security scoped to `owner_id = auth.uid()`, so each
   signed-in user only ever sees their own business's data.
3. Copy your project's `URL` and `anon` public key (Project Settings → API)
   into `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Email/password auth is enabled by default in Supabase — sign up from the
   app's login screen to create your first account.

(Optional) Generate typed Supabase queries once your schema is settled:

```bash
supabase gen types typescript --project-id <project-id> > src/types/database.ts
```

Then swap `createClient(...)` in `src/lib/supabase.ts` for
`createClient<Database>(...)`.

### Google setup (quote emails + Calendar scheduling)

The quote → email → accept/decline → book-a-slot → Google Calendar flow
needs a Google Cloud OAuth client and four Supabase Edge Functions. This is
the one part of the app that can't run purely client-side, since it needs
real secrets (a Gmail-send token, a Google OAuth client secret) that must
never ship to the browser.

**1. Google Cloud**

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the **Google Calendar API** and **Gmail API** (APIs & Services →
   Library).
3. Configure the OAuth consent screen (External is fine for testing with
   your own account; add the `.../auth/calendar` and `.../auth/gmail.send`
   scopes).
4. Create an **OAuth client ID** (Web application). Add this Authorized
   redirect URI, using your Supabase project ref:
   `https://<project-ref>.supabase.co/auth/v1/callback`
5. Note the **Client ID** and **Client secret**.

**2. Supabase Auth**

1. Authentication → Providers → **Google**: paste in the Client ID/secret
   and enable the provider.
2. Authentication → Settings: turn on **"Allow manual linking"**. This is
   what lets a user who's already signed in with email/password *add* a
   Google identity (for Calendar + Gmail) without it creating a second
   account or signing them out.

**3. Supabase Edge Functions**

The functions live in `supabase/functions/`. Deploy them with the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy send-quote-email
supabase functions deploy quote-response
supabase functions deploy available-slots
supabase functions deploy book-slot
```

Then set these as **Edge Function secrets** (Project Settings → Edge
Functions → Secrets, or `supabase secrets set KEY=value`):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SITE_URL=https://your-deployed-app-url
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically
by Supabase — you don't set those yourself.)

**4. Run the extra schema migration**

Run [`docs/schema_v2_scheduling.sql`](docs/schema_v2_scheduling.sql) in the
SQL editor (after `docs/schema.sql`) — it adds the Google connection table,
scheduling-hours settings, and the quote accept-token columns.

**5. Connect your account**

In the app, go to **Settings → Google Calendar & Email** and click
"Connect Google". After that, sending a quote (Quotes → Send) emails the
client from your Gmail with Accept/Decline links; accepting lets them pick
an open slot computed from your **Settings → Scheduling** hours minus
what's already busy on your Google Calendar, and booking creates both the
Job in Project Flow and the real Google Calendar event.

### Twilio setup (missed-call text-back, inbound-text leads, SMS reminders)

Same reasoning as the Google setup above: sending texts and answering calls
needs a real secret (Twilio's Auth Token) held server-side, so this runs
through Edge Functions too.

**1. Twilio**

1. Sign up at [twilio.com](https://www.twilio.com) and buy a phone number
   with Voice + SMS capability (~$1.15/month).
2. From the Twilio Console home page, note your **Account SID** and
   **Auth Token**.

**2. Supabase Edge Functions**

```bash
supabase functions deploy twilio-voice
supabase functions deploy twilio-sms
supabase functions deploy send-job-reminder
```

Set these as Edge Function secrets:

```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
```

**3. Point Twilio at the functions**

In the Twilio Console, on your phone number's configuration page:
- **"A call comes in"** webhook (HTTP POST) →
  `https://<project-ref>.supabase.co/functions/v1/twilio-voice`
- **"A message comes in"** webhook (HTTP POST) →
  `https://<project-ref>.supabase.co/functions/v1/twilio-sms`

**4. Run the extra schema migration**

Run [`docs/schema_v3_twilio.sql`](docs/schema_v3_twilio.sql) — it adds the
`twilio_settings` table and a `source` column on `clients` so auto-created
leads (from a missed call or inbound text) are flagged in the UI.

**5. Connect your account**

In the app, go to **Settings → Calls & Texts (Twilio)** and enter the
Twilio number you bought and the real cell phone it should ring through to
(e.g. Nick's). Customize the missed-call auto-text if you like.

That's it — from then on:
- A call to the Twilio number rings the configured cell for 20 seconds; if
  unanswered, the caller gets auto-texted and is logged as a new lead in
  **Clients** (tagged "missed call").
- A text to the Twilio number gets an auto-acknowledgement and is logged
  the same way (tagged "new text"), or appended to notes if they're
  already a client.
- The **"Text reminder"** button on a scheduled job's detail page sends the
  client an SMS appointment reminder from the Twilio number.

If you want Nick's existing business number in this flow rather than
replacing it, keep his real number as-is and set his carrier's **call
forwarding on no-answer** to ring the Twilio number — his line keeps working
exactly as it does today, and only unanswered calls fall through to the
automation.

## What's built

- **Auth** — Supabase email/password sign-up & sign-in, protected routes.
- **Clients** — list, create, and a detail page rolling up a client's jobs,
  quotes, and invoices.
- **Schedule** — job list with status, a create-job dialog, and a job detail
  page with status changes and freeform notes.
- **Quotes** — create with line items, auto-totaled, status tracking
  (draft/sent/accepted/declined), and a "Send" button that emails the
  client via Gmail with Accept/Decline links.
- **Public quote page** (`/q/:token`, no login) — client accepts or
  declines, then picks an open slot; booking creates the Job, the Google
  Calendar event, and links back the auto-generated invoice.
- **Invoices** — same shape as quotes plus a due date and payment status
  (draft/sent/paid/overdue). Automatically created (as a draft) the moment
  a client accepts a quote.
- **Settings** — business profile, Google connection, scheduling hours
  (work days/times, job length), and Twilio number + forwarding setup.
- **Calls & texts** — missed calls auto-text the caller and log them as a
  lead; inbound texts do the same; a "Text reminder" button on jobs sends
  an SMS appointment reminder.
- **Dashboard** — at-a-glance counts, a month calendar of scheduled jobs,
  and a next-up list.

## Roadmap: the Claude agent layer

This scaffold is phase 1 (core PM app) plus the phase-1.5 quote → schedule
→ invoice automation above. Planned phase 2 work:

1. **Office copilot** — an in-app assistant that drafts quotes, invoice
   line items, and client follow-up messages from a plain-English
   description of the job.
2. **Customer-facing chat** — a website widget where customers describe
   what they need; the agent turns the conversation into a lead / draft job
   in Project Flow.
3. **Smarter reminders** — the agent sends automated reminders to
   customers and crew ahead of a job, and nudges you about quotes sitting
   unanswered too long.

## Project structure

```
src/
  components/ui/     shadcn-style primitives (button, dialog, table, ...)
  components/layout/ app shell (sidebar layout, protected route)
  contexts/           Supabase auth context
  hooks/               TanStack Query hooks per resource (clients, jobs, ...)
  lib/                 Supabase client, Google auth linking, edge-function fetch helpers
  pages/               route-level screens (PublicQuote.tsx is the unauthenticated /q/:token page)
  types/               shared domain types
supabase/functions/
  _shared/             Google token refresh, Gmail/Twilio send, Calendar API, TwiML helpers
  send-quote-email/    emails a quote via the owner's Gmail (auth required)
  quote-response/      public accept/decline + auto-creates the invoice on accept
  available-slots/     public: business hours minus Google Calendar busy times
  book-slot/           public: creates the Job + the real Google Calendar event
  twilio-voice/        Twilio Voice webhook: ring the owner, auto-text + log a lead if missed
  twilio-sms/          Twilio Messaging webhook: logs inbound texts as leads/notes
  send-job-reminder/   texts a client an appointment reminder for a job (auth required)
docs/schema.sql               Supabase schema + RLS policies
docs/schema_v2_scheduling.sql Google connections, scheduling hours, quote tokens
docs/schema_v3_twilio.sql     Twilio number/forwarding settings, client lead source
```
