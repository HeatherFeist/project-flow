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
needs a Google Cloud OAuth client and six Supabase Edge Functions. This is
the one part of the app that can't run purely client-side, since it needs
real secrets (a Gmail-send token, a Google OAuth client secret) that must
never ship to the browser.

Connecting Google runs as its own direct OAuth flow through our
`google-oauth-start` / `google-oauth-callback` functions — not through
Supabase Auth's identity-linking, which turned out not to reliably return a
refresh token for Calendar/Gmail scopes (particularly on Google Workspace
accounts).

**1. Google Cloud**

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the **Google Calendar API** and **Gmail API** (APIs & Services →
   Library).
3. Configure the OAuth consent screen (External is fine for testing with
   your own account; add the `.../auth/calendar` and `.../auth/gmail.send`
   scopes).
4. Create an **OAuth client ID** (Web application). Add this Authorized
   redirect URI, using your Supabase project ref:
   `https://<project-ref>.supabase.co/functions/v1/google-oauth-callback`
5. Note the **Client ID** and **Client secret**.

**2. Supabase Edge Functions**

The functions live in `supabase/functions/`. Deploy them with the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy send-quote-email
supabase functions deploy quote-response
supabase functions deploy available-slots
supabase functions deploy book-slot
supabase functions deploy google-oauth-start
supabase functions deploy google-oauth-callback
```

`supabase/config.toml` marks `google-oauth-callback`, `quote-response`,
`available-slots`, `book-slot`, `twilio-voice`, and `twilio-sms` as
`verify_jwt = false` — those are hit by Google's redirect, Twilio's
webhook servers, or an anonymous visitor, none of whom have a Supabase
login. Supabase's platform gateway rejects unauthenticated requests by
default (`UNAUTHORIZED_NO_AUTH_HEADER`) unless a function is explicitly
marked this way, so deploying straight from this repo (where the file
already exists) handles it automatically — you don't need to pass
`--no-verify-jwt` by hand.

Then set these as **Edge Function secrets** (Project Settings → Edge
Functions → Secrets, or `supabase secrets set KEY=value`):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SITE_URL=https://your-deployed-app-url
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically
by Supabase — you don't set those yourself.)

**3. Run the extra schema migrations**

Run, in order:
- [`docs/schema_v2_scheduling.sql`](docs/schema_v2_scheduling.sql) — Google
  connection table, scheduling-hours settings, quote accept-tokens.
- [`docs/schema_v4_google_oauth.sql`](docs/schema_v4_google_oauth.sql) —
  the one-time state table the direct OAuth flow uses.

**4. Connect your account**

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

**1. Twilio account + number**

1. Sign up at [twilio.com](https://www.twilio.com).
2. Buy a number: left sidebar → **Phone Numbers → Manage → Buy a number**.
   Pick a local US number, make sure the **Voice** and **SMS** capability
   checkboxes are shown as available for it (they are by default for most
   US numbers), and complete the purchase (~$1.15/month).
3. Get your credentials: left sidebar → **Account → API keys & tokens**
   (or the "Account Info" panel right on the Console dashboard home page).
   Copy the **Account SID** (starts with `AC...`) and click "Show" to
   reveal the **Auth Token**.

**2. Supabase Edge Functions**

```bash
supabase functions deploy twilio-voice
supabase functions deploy twilio-sms
supabase functions deploy send-job-reminder
```

Set these as Edge Function secrets — replace with the values from step 1:

```
supabase secrets set TWILIO_ACCOUNT_SID=AC...
supabase secrets set TWILIO_AUTH_TOKEN=...
```

**3. Point Twilio at the functions**

1. Left sidebar → **Phone Numbers → Manage → Active numbers**.
2. Click the phone number you bought (not a checkbox — click the number
   itself, e.g. `+1 737 258 3478`, to open its settings page).
3. You land on a page with a **Configure** tab already selected. Scroll to
   the **Voice Configuration** section.
4. Find the row labeled **"A call comes in"**. It has three parts: a
   dropdown (leave it set to **Webhook**), a URL text field, and an
   HTTP method dropdown next to it.
5. In the URL field, paste:
   `https://<project-ref>.supabase.co/functions/v1/twilio-voice`
   (replace `<project-ref>` with yours, e.g. `gkzddhskefldotphilif`).
6. Set the method dropdown next to it to **HTTP POST** (not GET).
7. Scroll down further to the **Messaging Configuration** section. Find
   **"A message comes in"** — same three-part row (dropdown/URL/method).
8. Paste: `https://<project-ref>.supabase.co/functions/v1/twilio-sms`,
   method **HTTP POST**.
9. Scroll to the very bottom of the page and click the blue **Save
   configuration** button — nothing takes effect until you click this.

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

### Estimate chatbot setup (Price Book + Claude-powered scheduling chat)

A text-based chatbot at `/estimate/:ownerId` — the link every missed-call
and new-lead text above points to. It chats with the customer about their
job, gives a rough estimate from your **Price Book**, and can book a free
estimate visit directly onto your Google Calendar. It's a Claude "agent"
with three tools: look up the price book, check open slots, and book a
visit — same underlying scheduling logic as the quote-acceptance flow.

Homewyse has no public API or licensed data feed for third-party apps, so
the Price Book is a business-owned reference table instead (Settings →
Price Book, or the sidebar) — seed it with the built-in starter items and
adjust them to match real rates, or build it from scratch.

**1. Get an Anthropic API key**

Create one at [console.anthropic.com](https://console.anthropic.com) →
API Keys.

**2. Supabase Edge Function**

```bash
supabase functions deploy estimate-chat
```

Set this secret:

```
ANTHROPIC_API_KEY=...
```

(Optional: set `CLAUDE_MODEL` to override the default `claude-haiku-4-5-20251001`
— e.g. to a Sonnet model for smarter but pricier conversations.)

**3. Run the extra schema migration**

Run [`docs/schema_v5_price_book_chat.sql`](docs/schema_v5_price_book_chat.sql)
— it adds the `price_book_items` table.

**4. Add starter price book items**

In the app, go to **Price Book → Load starter items** for a reasonable
starting point (general handyman labor, common plumbing/electrical/carpentry
jobs), then edit anything that doesn't match real rates.

That's it — the chat link is already wired into the Twilio missed-call and
new-text auto-replies from the section above, and is also shown (with a
copy button) in **Settings → Estimate Chatbot** for sharing anywhere else
— a website, a business card, etc.

**Embedding on another website**: add `?embed=1` to the link to drop the
chat inline into any page via an iframe, instead of it opening as a
standalone page — works on any site builder that allows a raw HTML/embed
block (WordPress, Squarespace, Wix, Webflow, custom code, ...):

```html
<iframe
  src="https://flow.w3bbworldwide.com/estimate/<ownerId>?embed=1"
  style="width: 100%; height: 600px; border: none;"
  allow="microphone"
></iframe>
```

The `allow="microphone"` is needed for the chat's voice-input button to
work once it's embedded cross-origin — without it, the browser silently
blocks mic access inside the iframe.

### Stripe payments setup (invoice "Pay Now" + partial payments)

Simple architecture, not Stripe Connect: this uses **one Stripe account**
(Nick's own), configured only via secrets — no per-user Stripe settings in
the app. Right fit for one business; would need Stripe Connect instead if
Project Flow ever serves multiple separate businesses.

**1. Stripe**

1. Sign up / log in at [dashboard.stripe.com](https://dashboard.stripe.com).
2. Get your **Secret key** (Developers → API keys). Use the **test mode**
   key first to try the flow before going live.

**2. Supabase Edge Functions**

```bash
supabase functions deploy send-invoice-email
supabase functions deploy invoice-pay-info
supabase functions deploy create-invoice-checkout
supabase functions deploy stripe-webhook
```

Set this secret:

```
STRIPE_SECRET_KEY=sk_...
```

**3. Add the webhook**

In the Stripe Dashboard → Developers → Webhooks → **Add endpoint**:
- URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- Event to send: `checkout.session.completed`

Stripe shows a **signing secret** (`whsec_...`) for that endpoint once
created — set it too:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

**4. Run the extra schema migration**

Run [`docs/schema_v6_stripe_payments.sql`](docs/schema_v6_stripe_payments.sql)
— it adds `pay_token`/`sent_at`/`amount_paid_cents` to `invoices` and a new
`invoice_payments` table (one row per payment, so partial payments/deposits
are fully supported).

That's it — from then on, **Invoices → Send** emails the client a "Pay Now"
link; the public `/pay/:token` page lets them pay the full balance or a
partial amount by **card or Cash App Pay** via Stripe Checkout (hosted by
Stripe — no payment data ever touches Project Flow's servers); and the
invoice's status and paid amount update automatically via the webhook the
moment a payment succeeds.

**Card + Cash App Pay, deliberately no ACH bank-transfer.** ACH settles in
3-5 business days no matter which processor moves it (Plaid, Stripe,
Dwolla — same underlying banking network), which conflicts with Nick
needing deposit funds the same day to buy materials. Card and Cash App Pay
both use standard, card-speed payout timing and both support Stripe's
**Instant Payout** — ACH-settled funds can't use it until days later
anyway. Cash App Pay is a native Stripe Checkout payment method (not a
separate Cash App/Block integration) — see
[Stripe's Cash App Pay docs](https://docs.stripe.com/payments/cash-app-pay).

**Why not Venmo or a raw Plaid integration**: Venmo has no general
merchant/developer API for one-off charges — it's built around
peer-to-peer username/QR requests, so there's no way to wire an automated
"Pay Now" button or webhook to it the way we did with Stripe. Plaid alone
doesn't move money either — it's a bank-linking/verification layer, not a
payment rail; you'd still need a processor (Dwolla, or Stripe's own ACH
support) on top of it, plus real NACHA/ACH-origination compliance weight.
Given the speed requirement already rules out ACH, neither is worth
adding here. PayPal and Square were also considered — both offer the same
"instant transfer to a debit card" mechanic Stripe already provides, at
similar-or-higher fees, so there's no speed or cost advantage to adding
them alongside what's already built.

**Getting Nick same-day access to the money — Stripe Instant Payout:**
1. Client pays by card → funds typically become "available" in Nick's
   Stripe balance within about a day (often faster on an established
   account).
2. He needs a **debit card** (not just his bank account) added under
   Stripe Dashboard → Settings → Payouts — Instant Payout specifically
   requires one.
3. From there, he presses **Instant Payout** whenever he wants that
   balance moved — funds land on the debit card in about 30 minutes, for a
   small fee (~1%, minimum ~$0.50).

His regular bank account (Huntington) stays connected for Stripe's normal
payout schedule for everything he doesn't pull out instantly.

When ready for real payments, swap the test-mode `STRIPE_SECRET_KEY` for
Nick's live key (and repeat the webhook step for live mode — test and live
webhooks are separate).

### PayPal setup (second payment option on invoices)

An independent payment option alongside Stripe — some clients simply
prefer paying with an account they already have. Same simple-architecture
approach: one PayPal business account, configured via secrets, no
Connect-style per-user setup.

**1. PayPal**

1. Sign up for a PayPal **Business** account at
   [paypal.com/bizsignup](https://www.paypal.com/bizsignup/) (there's also
   a signup link right in **Settings → Payments**).
2. Create an app at [developer.paypal.com](https://developer.paypal.com) →
   Apps & Credentials, to get a **Client ID** and **Client Secret**. Use
   the **Sandbox** credentials first to test the flow before going live.

**2. Supabase Edge Functions**

```bash
supabase functions deploy create-paypal-order
supabase functions deploy capture-paypal-order
```

Set these secrets:

```
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
```

(Leave `PAYPAL_MODE` unset for sandbox testing; set `PAYPAL_MODE=live`
once you switch to live credentials.)

**3. Run the extra schema migration**

Run [`docs/schema_v7_paypal_payments.sql`](docs/schema_v7_paypal_payments.sql)
— it adds `provider`/`paypal_order_id` columns to `invoice_payments` so
Stripe and PayPal payments are both tracked in the same table.

That's it — the `/pay/:token` page now shows a **"Pay with PayPal"** button
alongside the Stripe one. Unlike Stripe, this flow doesn't use a webhook —
the payment is captured directly when PayPal redirects the payer back to
the app, which keeps the setup simpler at the cost of one edge case: if
someone closes their browser mid-flow after approving but before the
redirect completes, that payment won't be recorded automatically and would
need reconciling from the PayPal dashboard. Acceptable for now; a PayPal
webhook could be added later for extra robustness if this turns out to
matter in practice.

## What's built

- **Auth** — Supabase email/password sign-up & sign-in, protected routes.
- **Clients** — list, create, a detail page rolling up a client's jobs,
  quotes, and invoices, and a **CSV import** (Clients → Import CSV) for
  bringing a contact list over from Jobber or any other tool — upload,
  match up the columns, done.
- **Schedule** — job list with status, a create-job dialog, a job detail
  page with status changes and freeform notes, and CSV import (auto-matches
  or creates the client per row).
- **Quotes** — create with line items, auto-totaled, status tracking
  (draft/sent/accepted/declined), a "Send" button that emails the client
  via Gmail with Accept/Decline links, and CSV import.
- **Public quote page** (`/q/:token`, no login) — client accepts or
  declines, then picks an open slot; booking creates the Job, the Google
  Calendar event, and links back the auto-generated invoice.
- **Invoices** — same shape as quotes plus a due date and payment status
  (draft/sent/partially_paid/paid/overdue). Automatically created (as a
  draft) the moment a client accepts a quote. A "Send" button emails a
  "Pay Now" link; clients can pay the full balance or a partial
  amount/deposit by card, Cash App Pay, or PayPal, and the invoice updates
  automatically on payment.
- **Settings** — business profile, Google connection, scheduling hours
  (work days/times, job length), Twilio number + forwarding setup, and
  Stripe/PayPal signup links.
- **Calls & texts** — missed calls auto-text the caller (with a link to the
  estimate chatbot) and log them as a lead; inbound texts do the same; a
  "Text reminder" button on jobs sends an SMS appointment reminder.
- **Price Book** — business-owned reference table of job types and typical
  price ranges (seedable with reasonable starter values), used by the
  estimate chatbot.
- **Estimate chatbot** (`/estimate/:ownerId`, no login) — a Claude-powered
  chat that asks what the customer needs, gives a rough estimate from the
  Price Book, and can book a free estimate visit — creating the Client, the
  Job, and the real Google Calendar event, same as the quote-acceptance
  flow. Linked automatically from missed-call/new-text auto-replies, and
  shareable from Settings. Has a mic button for voice input (browser
  speech-to-text, no extra setup) so customers can talk instead of type —
  hidden automatically in browsers that don't support it (e.g. Firefox).
- **Dashboard** — at-a-glance counts, a month calendar of scheduled jobs,
  and a next-up list.

## Roadmap: the Claude agent layer

Phase 1 (core PM app), phase 1.5 (quote → schedule → invoice automation),
and now the customer-facing chatbot above are done. What's left from the
original phase-2 sketch:

1. **Office copilot** — an in-app assistant *for Nick*, not the customer —
   drafts quotes, invoice line items, and client follow-up messages from a
   plain-English description of the job.
2. **Smarter reminders** — nudges Nick about quotes sitting unanswered too
   long, or jobs missing a Price Book match the chatbot had to punt on.
3. **Voice AI on the call itself** — right now callers only reach the
   chatbot via a text link after a missed call; a real-time voice AI that
   talks to callers live (via Twilio Media Streams) is a substantially
   bigger build and was deliberately deferred — see the "How should callers
   reach the chatbot" decision point in project history.

## Project structure

```
src/
  components/ui/     shadcn-style primitives (button, dialog, table, ...)
  components/layout/ app shell (sidebar layout, protected route)
  contexts/           Supabase auth context
  hooks/               TanStack Query hooks per resource (clients, jobs, ...)
  lib/                 Supabase client, Google connect helper, edge-function fetch helpers
  pages/               route-level screens (PublicQuote.tsx is the unauthenticated /q/:token page)
  types/               shared domain types
supabase/functions/
  _shared/             Google token refresh/exchange, Gmail/Twilio send, Calendar API, TwiML helpers
  google-oauth-start/    auth required: creates a one-time state row, returns the Google consent URL
  google-oauth-callback/ public (state-token scoped): exchanges the code, saves the connection
  send-quote-email/    emails a quote via the owner's Gmail (auth required)
  quote-response/      public accept/decline + auto-creates the invoice on accept
  available-slots/     public: business hours minus Google Calendar busy times
  book-slot/           public: creates the Job + the real Google Calendar event
  twilio-voice/        Twilio Voice webhook: ring the owner, auto-text (+ chat link) + log a lead if missed
  twilio-sms/          Twilio Messaging webhook: logs inbound texts as leads, replies with the chat link
  send-job-reminder/   texts a client an appointment reminder for a job (auth required)
  estimate-chat/       public: Claude tool-using agent — price book lookup, slot check, booking
  send-invoice-email/  emails an invoice via the owner's Gmail with a Pay Now link (auth required)
  invoice-pay-info/    public: invoice details for the /pay/:token page
  create-invoice-checkout/ public: creates a Stripe Checkout session for a chosen amount
  stripe-webhook/       public (Stripe-signature verified): records payments, updates invoice status
  create-paypal-order/  public: creates a PayPal order for a chosen amount
  capture-paypal-order/ public: captures the order on redirect-back, records the payment
docs/schema.sql                 Supabase schema + RLS policies
docs/schema_v2_scheduling.sql   Google connections, scheduling hours, quote tokens
docs/schema_v3_twilio.sql       Twilio number/forwarding settings, client lead source
docs/schema_v4_google_oauth.sql One-time state table for the direct Google OAuth flow
docs/schema_v5_price_book_chat.sql Price Book table
docs/schema_v6_stripe_payments.sql Invoice pay tokens/amount_paid, invoice_payments table
docs/schema_v7_paypal_payments.sql Adds provider/paypal_order_id to invoice_payments
```
