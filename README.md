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

## What's built

- **Auth** — Supabase email/password sign-up & sign-in, protected routes.
- **Clients** — list, create, and a detail page rolling up a client's jobs,
  quotes, and invoices.
- **Schedule** — job list with status, a create-job dialog, and a job detail
  page with status changes and freeform notes.
- **Quotes** — create with line items, auto-totaled, status tracking
  (draft/sent/accepted/declined).
- **Invoices** — same shape as quotes plus a due date and payment status
  (draft/sent/paid/overdue).
- **Settings** — business profile shown on quotes/invoices.
- **Dashboard** — at-a-glance counts and next-up jobs.

## Roadmap: the Claude agent layer

This scaffold is phase 1 (core PM app). Planned phase 2 work, once the data
model is proven out:

1. **Office copilot** — an in-app assistant that drafts quotes, invoice
   line items, and client follow-up messages from a plain-English
   description of the job.
2. **Customer-facing chat** — a website widget where customers describe
   what they need; the agent turns the conversation into a lead / draft job
   in Project Flow.
3. **Scheduling & reminders** — the agent watches the schedule, flags
   conflicts, and sends automated reminders to customers and crew ahead of
   a job.

## Project structure

```
src/
  components/ui/     shadcn-style primitives (button, dialog, table, ...)
  components/layout/ app shell (sidebar layout, protected route)
  contexts/           Supabase auth context
  hooks/               TanStack Query hooks per resource (clients, jobs, ...)
  lib/                 Supabase client, cn()/formatting helpers
  pages/               route-level screens
  types/               shared domain types
docs/schema.sql        Supabase schema + RLS policies
```
