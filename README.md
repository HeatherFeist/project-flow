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
supabase functions deploy create-job
```

`create-job` is what the dashboard/Schedule "New job" dialog calls when you
schedule a job yourself — if Google is connected it also creates the
matching Google Calendar event (with an email reminder), so a job you add
by hand reminds you the same way one booked through the public quote page
does.

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

You don't have to wait on a client to book, either — click "New job" on
the Schedule page, or click straight on a day in the Dashboard calendar,
and Project Flow creates the Google Calendar event (with an email
reminder) for you the same way.

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

Customers can also attach a **photo or video** of the project (camera icon
next to the message box) — Claude actually looks at it (video gets a few
frames auto-extracted client-side, since Claude only accepts images) and
factors what it sees into the estimate and follow-up questions. Photos are
uploaded to a public Supabase Storage bucket and, if a visit gets booked,
saved onto the resulting Job for Nick to see later. There's also a mic
button for voice input, using the browser's free built-in speech
recognition (no setup, hidden automatically in browsers without support).

Homewyse has no public API or licensed data feed for third-party apps, so
the Price Book is a business-owned reference table instead (Settings →
Price Book, or the sidebar) — seed it with the built-in starter items,
import real historical prices from a Jobber (or other tool) CSV export, or
build it from scratch.

**Fallback pricing for jobs not in the Price Book — the Unit Cost Method.**
The Price Book is always checked first and preferred when it has a match.
When it doesn't, the chatbot builds a rough estimate itself using the Unit
Cost Method — the same buildup approach pricing guides like Homewyse use:
estimated labor hours × a fair going rate for your **Service area**, plus a
reasonable materials cost. Set your Service area in **Settings → Business
profile** (e.g. "Dayton, OH") — without it, the chatbot has no market to
localize rates to and just says it doesn't have pricing yet instead. This
is a *reasoned* estimate from Claude's general knowledge of regional costs,
not a live local pricing feed — always shown as rough and non-binding, same
as a Price Book match.

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

**3. Run the extra schema migrations**

Run [`docs/schema_v5_price_book_chat.sql`](docs/schema_v5_price_book_chat.sql)
— it adds the `price_book_items` table. Then run
[`docs/schema_v8_estimate_uploads.sql`](docs/schema_v8_estimate_uploads.sql)
— it creates the public `estimate-uploads` Storage bucket (with a 20MB
size limit and an image/video-only allow-list) and adds `photo_urls` to
`jobs`.

**4. Add starter price book items**

In the app, go to **Price Book → Load starter items** for a reasonable
starting point (general handyman labor, common plumbing/electrical/carpentry
jobs), then edit anything that doesn't match real rates. Also run
[`docs/schema_v10_service_area.sql`](docs/schema_v10_service_area.sql) and
set a Service area in Settings so the Unit Cost Method fallback above works.

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

### Platform subscription billing (charging owners $49/mo to use Project Flow)

This is different from the two Stripe/PayPal sections above — those move
money from a business owner's *customers* to *that owner*, through an
account each owner controls. This section is the other direction: Project
Flow charging **business owners** to use the app itself, through **your
own, separate Stripe account** for the product. Don't reuse Nick's Stripe
keys here — set up a distinct Stripe account for Project Flow the product.

Includes a **7-day free trial** — a card is required to start it (Stripe
Checkout always collects one for a subscription), but nothing is charged
until the trial ends, and it auto-cancels instead of charging if the card
fails at that point. The trial is only granted the first time an owner
subscribes — if they cancel and come back later, it's a normal paid start.

**1. Stripe**

1. Sign up for a **new** Stripe account at
   [dashboard.stripe.com](https://dashboard.stripe.com) — this is the
   platform's account, not any individual owner's.
2. Create a **Product** (Product catalog → + Add product), e.g. "Project
   Flow subscription", with a **recurring Price**: $49.00/month. Copy that
   price's ID (starts with `price_...`).
3. Get the **Secret key** (Developers → API keys) — test mode first.

**2. Supabase Edge Functions**

```bash
supabase functions deploy create-subscription-checkout
supabase functions deploy create-billing-portal-session
supabase functions deploy platform-stripe-webhook
```

Set these secrets:

```
PLATFORM_STRIPE_SECRET_KEY=sk_...
PLATFORM_STRIPE_PRICE_ID=price_...
```

**3. Add the webhook**

In the **platform** Stripe Dashboard (not Nick's) → Developers → Webhooks
→ **Add endpoint**:
- URL: `https://<project-ref>.supabase.co/functions/v1/platform-stripe-webhook`
- Events to send: `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`

Copy that endpoint's **signing secret** and set it:

```
PLATFORM_STRIPE_WEBHOOK_SECRET=whsec_...
```

**4. Turn on Stripe's Customer Portal**

Settings → Billing → Customer portal, in the platform Stripe Dashboard —
turn it on (needed for the "Manage billing" button to work) and enable
"Customers can cancel subscriptions".

**5. Run the extra schema migration**

Run [`docs/schema_v9_platform_subscriptions.sql`](docs/schema_v9_platform_subscriptions.sql)
— adds the `subscriptions` table and a `profiles.is_exempt` flag.

That's it — any signed-in owner without an active subscription gets
redirected to `/subscribe`; after paying, the webhook flips their status to
`active` and they're back in. **To comp your own account** (or anyone
else's) without paying, run in the Supabase SQL editor:

```sql
update profiles set is_exempt = true where id = '<your user id>';
```

When ready for real billing, swap the test-mode `PLATFORM_STRIPE_SECRET_KEY`
for the live key and repeat the webhook step for live mode.

### In-app help chatbot (site navigation + renovation Q&A)

A small chat widget (the ? bubble, bottom-right on every page once you're
signed in) — separate from the public estimate chatbot. It's for **you**,
not your customers: ask it how to do something in the app ("how do I
import my old invoices?") and it answers with the right page and a
clickable link, or ask it a general renovation/repair question ("what
order should a bathroom remodel happen in?") and it answers from general
knowledge, flagging anything structural/electrical/plumbing/permit-related
as something to confirm with a licensed pro and local codes. It doesn't
touch your business data — no price book, no client info — so nothing new
to secure there.

**Supabase Edge Function**

```bash
supabase functions deploy app-help-chat
```

No new secret needed — it reuses `ANTHROPIC_API_KEY` from the estimate
chatbot setup above. No schema migration either.

### Onboarding wizard (new owners, right after their trial starts)

A short guided setup a brand-new owner sees once, right after subscribing
(before the first Dashboard view) — no code/secrets needed, pure frontend:
1. **Business info** — name, phone, contact email, service area (same
   fields as Settings → Business profile).
2. **Bring your data over** — if they're coming from Jobber or another
   tool, the same CSV importers used elsewhere (Clients, Jobs, Quotes,
   Price Book history) right inline, or skip if starting fresh.
3. **Connect the essentials** — a plain-language rundown of Google
   Calendar/Gmail, Twilio, and Payments, pointing at Settings for each
   (optional, skippable).

Run [`docs/schema_v10_service_area.sql`](docs/schema_v10_service_area.sql)
and [`docs/schema_v11_onboarding.sql`](docs/schema_v11_onboarding.sql) if
you haven't already — the second one adds `profiles.onboarding_completed`
(backfilled to `true` for existing accounts, so this never re-triggers for
Nick's own account) and is what the wizard flips once someone finishes or
you can flip manually to skip it for an account:

```sql
update profiles set onboarding_completed = true where id = '<user id>';
```

### Google review requests (send clients a direct link after a job)

**Important:** no app — Project Flow included — can post a review onto a
Google Business Profile on a customer's behalf. Reviews can only be
authored by the actual customer, signed into their own Google account,
through Google's own review flow; anything that auto-posted reviews would
violate Google's policies. What this does instead — the same thing
Jobber/Housecall Pro/etc. do — is send the client a **direct link straight
to your Google review form** once a job's marked completed, so leaving a
review is one tap for them instead of them having to search for your
business first.

**1. Get your Google review link**

In your Google Business Profile (business.google.com or the Business
Profile app) → Home → look for **"Get more reviews"** or **"Ask for
reviews"** → copy the shareable link it gives you (looks like
`https://g.page/r/.../review`).

**2. Paste it into Settings**

**Settings → Business profile → Google review link.**

**3. Supabase Edge Function**

```bash
supabase functions deploy send-review-request
```

No new secret needed — it reuses Twilio/Google credentials already set up
above. No schema migration beyond
[`docs/schema_v12_google_review_link.sql`](docs/schema_v12_google_review_link.sql).

That's it — once a job's status is set to **Completed**, a **"Request
review"** button appears on that job's detail page. It texts the client if
they have a phone number and Twilio's connected, or emails them via Gmail
otherwise.

### Receipt photo uploads on invoices

Each invoice now has its own detail page (click the eye icon on an
invoice row) with a **Receipts** card — snap a photo of a materials
receipt and it's attached right to that invoice, so job costs are on
record alongside what was billed. Uses a **private** Storage bucket
(unlike the public one the estimate chatbot uses) — only the signed-in
owner can see their own receipts, resolved to short-lived signed URLs
rather than public links.

**Run the schema migration**

Run
[`docs/schema_v13_invoice_receipts.sql`](docs/schema_v13_invoice_receipts.sql)
— creates the private `receipts` Storage bucket and adds
`invoices.receipt_paths`. No edge function, no secret — this is pure
Storage + RLS.

### Payment milestones (deposit + progress payments)

An invoice can optionally be split into a sequence of payments instead of
one lump total — e.g. a deposit up front, a progress payment partway
through, a final payment at completion. When creating an invoice, check
**"Split into payment milestones"** and add rows (title + amount, must sum
to the invoice total). The client then sees each milestone listed on the
`/pay/:token` page and pays them **in order** — later ones stay locked
until the one before it is paid. Invoices with no milestones keep working
exactly as before (pay any partial amount, in any number of payments).

**Run the schema migration**

Run
[`docs/schema_v14_invoice_milestones.sql`](docs/schema_v14_invoice_milestones.sql)
— adds the `invoice_milestones` table and `invoice_payments.milestone_id`.

**Redeploy the payment functions** (their logic changed to understand
milestones):

```bash
supabase functions deploy create-invoice-checkout
supabase functions deploy create-paypal-order
supabase functions deploy capture-paypal-order
supabase functions deploy invoice-pay-info
supabase functions deploy stripe-webhook
```

No new secrets — this reuses the Stripe/PayPal setup from the sections
above.

### Job-site photo capture (CompanyCam-style)

`jobs.photo_urls` already existed (schema_v8), but the only way photos got
into it was a customer attaching one through the public estimate chatbot
before a job even existed. Now there's an **"Add photos"** button right on
the Job detail page — snap unlimited before/during/after shots as you work
a job, same idea as CompanyCam: organized automatically (they're already
scoped to the job), instantly viewable, easy to remove a bad shot.

**Run the schema migration**

Run [`docs/schema_v15_job_photos.sql`](docs/schema_v15_job_photos.sql) —
creates the `job-photos` Storage bucket (public reads, like
estimate-uploads, but only the owning user can add/remove files). No edge
function, no secret.

### Photo tagging, markup, and a client-facing gallery

Three more CompanyCam-style pieces on top of the basic capture above:

- **"Taken by" tagging.** Each photo can note who took it — type a name
  when adding photos and it's remembered as a suggestion next time. This
  is a plain text tag, not a real team-member account — Project Flow is
  one login per business today, so there's no invite-a-crew-member/roles
  system behind it, just a label on the photo.
- **Markup/annotation.** Hover a photo → the pencil icon opens a simple
  draw-and-label tool (freehand pen in a few colors, tap-to-place text
  notes, undo/clear) right in the browser — no external editor needed.
  Saving replaces that photo with the marked-up version.
- **Client-facing gallery.** Once a job has photos, a **"Share gallery"**
  button copies a no-login link (`/job-gallery/:token`) showing them in a
  timeline, with captions — safe to text or email a client so they can
  watch progress without an account. Captions are editable inline under
  each photo thumbnail.

This upgrades photo storage from a plain URL list to a real
`job_photos` table (one row per photo, with a timestamp, caption, and
"taken by"), so — unlike the section above — this one needs a schema
migration plus a small public edge function for the gallery.

**Run the schema migration**

Run
[`docs/schema_v16_job_photo_gallery.sql`](docs/schema_v16_job_photo_gallery.sql)
— adds the `job_photos` table and `jobs.photo_share_token`. Existing
photos from the estimate chatbot (`jobs.photo_urls`) are untouched and
still show in their own read-only section on the Job page — they just
don't appear in the new table/gallery since they predate it.

**Supabase Edge Function**

```bash
supabase functions deploy job-photos-info
```

No secret needed.

### Client portal (sign in, approve quotes, pay milestones, request work)

A persistent dashboard for clients — `/portal/:ownerId/login` — instead of
only ever getting one-off links. **Not a Supabase Auth account** (no
passwords, no new auth provider to configure): it's an email magic-link
flow —

1. Client enters their email → if it matches one of your clients, they get
   an email with a one-time login link (sent via your connected Gmail,
   same as everything else).
2. Clicking it exchanges that one-time link for a 30-day session, stored
   in the browser (not a cookie/Supabase session).
3. The dashboard shows their jobs (with a link to that job's photo
   gallery), quotes, and invoices — Accept/Decline and paying
   (including milestones) link straight to the already-working
   `/q/:token` and `/pay/:token` pages, so nothing about those flows was
   duplicated or re-risked.
4. A **"Need something else?"** box lets them ask for additional work —
   it shows up as a **new request** on your Dashboard (with a "Mark
   reviewed" button) rather than auto-creating a quote, since scoping and
   pricing new work still needs you.

Share the login link once — **Settings → Client Portal** has it, with a
copy button.

**1. Run the schema migration**

Run
[`docs/schema_v17_client_portal.sql`](docs/schema_v17_client_portal.sql)
— adds `client_portal_login_tokens`, `client_portal_sessions`, and
`service_requests`.

**2. Supabase Edge Functions**

```bash
supabase functions deploy portal-login-request
supabase functions deploy portal-verify
supabase functions deploy portal-dashboard
supabase functions deploy portal-request-service
```

No new secrets — this reuses your existing Google connection to send the
login email.

### Structured communications log + search

Two smaller but real gaps closed:

- **Communications log.** Inbound texts used to just get appended as
  plain-text lines onto `clients.notes` — functional, but not a real log.
  Now every inbound/outbound text, missed call, and outbound review-request
  email is written to a proper `client_messages` table and shown as a
  timeline on the Client detail page (icon per channel, sent/received,
  timestamped). Missed calls are now logged for **existing** clients too —
  previously that only happened for brand-new leads.
- **Search.** Clients, Schedule, Quotes, and Invoices all had plain
  unfiltered lists with no way to find anything in a growing list. Each now
  has a search box (client-side, instant) — Clients searches
  name/email/phone/address, Schedule searches title/client/address/status,
  Quotes searches client/status/notes, Invoices searches client/status.

**Run the schema migration**

Run [`docs/schema_v18_client_messages.sql`](docs/schema_v18_client_messages.sql)
— adds the `client_messages` table.

**Redeploy the Twilio + notification functions** (their logging changed):

```bash
supabase functions deploy twilio-sms
supabase functions deploy twilio-voice
supabase functions deploy send-job-reminder
supabase functions deploy send-review-request
```

No new secrets.

### Materials catalog (separate from the Price Book)

The Price Book is what you **charge customers** per job type; **Materials**
(`/materials`) is what you **pay suppliers** for parts/supplies — a
separate catalog with product name, category, supplier, SKU/item #, cost,
unit, and an optional product-page URL so reordering the exact same item
later on homedepot.com/lowes.com is one click instead of a re-search.

**No live Home Depot/Lowe's API** — neither retailer offers one to third
parties, and scraping their sites isn't something this app will do (against
their Terms of Service, fragile, and risks getting blocked). Instead:

- **Add manually** as you go, or
- **Import a CSV** — if Nick has a Home Depot Pro Xtra or Lowe's Pro
  account, both let you export purchase history to CSV. Same
  upload → map columns → preview → import pattern as the other importers
  in the app.

**Run the schema migration**

Run [`docs/schema_v19_materials.sql`](docs/schema_v19_materials.sql) —
creates the `materials` table. No edge function, no secret.

### Scan receipts into Materials automatically

Connects the two features above: every receipt photo attached to an
invoice (Invoice detail page → Receipts) is automatically sent to Claude's
vision to pull out line items — product name, price, and SKU if it's
printed. Nothing is written to the database sight-unseen — a review dialog
shows the extracted items first (editable, with a checkbox per row) so you
can fix anything misread or uncheck lines that aren't real materials
before they land in your Materials catalog. Already-uploaded receipts can
be scanned any time via the small icon on their thumbnail.

**1. Supabase Edge Function**

```bash
supabase functions deploy extract-receipt-items
```

No new secret — it reuses `ANTHROPIC_API_KEY` from the estimate chatbot
setup. No schema migration.

### Scan old invoices into the Price Book automatically

Companion feature to the receipt scanner above, but for the other side of
the ledger: **Price Book → "Scan old invoice"** lets you photograph (or
upload a photo of) a past paper invoice, and Claude's vision reads off
every billed service line item — description, price, and a best-guess
category and unit (flat/per hour/per sq ft/per linear ft). Same
review-before-saving pattern as receipts: nothing lands in the Price Book
until you've checked the extracted rows (editable, with a checkbox per
row to drop anything that isn't real billed labor), so a misread price or
a stray subtotal line never sneaks in.

This is the AI-extraction counterpart to the CSV price-history importer
already in Price Book and the onboarding wizard — use CSV import if you
already have exported invoice data in spreadsheet form (it's exact,
zero-guessing), and use this when all you have is old paper/PDF invoices
with no digital export to work from. Each scanned item is added at its
exact price (not a range) — edit the low/high spread afterward if you'd
rather it reflect several jobs instead of one.

**1. Supabase Edge Function**

```bash
supabase functions deploy extract-invoice-items
```

No new secret — it reuses `ANTHROPIC_API_KEY` from the estimate chatbot
setup. No schema migration.

### AI project visualizations on quotes ("what it'll look like when done")

Upload a photo of the space (a bathroom, say) plus optional reference
photos of the exact tile/flooring/fixtures you're proposing, describe the
changes in a prompt, and generate an "after" image — attached right to
the quote, so the client sees it alongside the numbers on the same link
they already get.

**This is a different AI than everything else in the app.** Claude (used
everywhere else — the estimate chatbot, the help assistant, receipt
scanning) can *look at* images but can't generate or edit them. This uses
**Google's Gemini image model** ("Nano Banana" / `gemini-2.5-flash-image`)
instead — a separate product from the Google Calendar/Gmail OAuth
connection elsewhere in this app, with its own plain API key (not OAuth).

**Bring-your-own-key, deliberately.** This is billed per image generated,
not a flat cost — so unlike everything else in the app, there's **no
platform-wide `GEMINI_API_KEY` secret to set**. Each owner enters their
own key in **Settings → AI Project Visualizations**, and Google bills
their usage (typically a few cents per image) directly to that key. This
keeps one subscriber's generation habits from ever costing you (or anyone
else) money — the feature is simply off until an owner adds their own key.

**1. Supabase Edge Function**

```bash
supabase functions deploy generate-quote-visualization
```

No secret to set — see above.

**2. Run the extra schema migrations**

Run, in order:
- [`docs/schema_v20_quote_visualizations.sql`](docs/schema_v20_quote_visualizations.sql)
  — adds the `quote_visualizations` table and a public `quote-visuals`
  Storage bucket (results need to show on the client-facing `/q/:token`
  page; only the owning user can write to it, same pattern as job photos).
- [`docs/schema_v21_gemini_byok.sql`](docs/schema_v21_gemini_byok.sql) —
  adds `profiles.gemini_api_key`.

**3. Redeploy `quote-response`** (it now also returns visualizations for
the public quote page):

```bash
supabase functions deploy quote-response
```

**4. Get a Gemini API key** (each owner does this themselves, in Settings)
— go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
→ **Get API key** → paste it into **Settings → AI Project
Visualizations**.

That's it — open any quote (Quotes → the eye icon) and there's a "Project
visualization" section: upload a before photo, optionally add reference
photos of materials/fixtures, write what should change, and generate.
Results show automatically on the client's quote link.

**A note on quality:** this produces a genuinely useful, compelling
visualization — not a pixel-perfect CAD rendering. Treat it as "here's a
strong sense of the direction," not an exact preview of every material
detail.

### Bring-your-own Twilio/Stripe/PayPal (multi-tenant credentials)

Up through schema v21, Twilio (calls/texts), Stripe (invoice payments),
and PayPal (invoice payments) were all **platform-wide secrets** — every
subscriber's calls, texts, and client payments routed through the same
account (Nick's). That's fine for a single-business tool, but wrong once
there's more than one real subscriber: someone else's client
communications and client money have no business flowing through
someone else's Twilio/Stripe/PayPal account.

**This is now bring-your-own-key, with a non-breaking fallback.** Each
owner can enter their own Twilio/Stripe/PayPal credentials in
**Settings**. If an owner hasn't set their own yet, the app keeps working
exactly as before, falling back to the platform-wide secrets
(`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`, `STRIPE_SECRET_KEY`/
`STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`) — so
nothing breaks for Nick's existing account, and nothing has to be filled
in immediately. For consistency (and so the platform secrets can
eventually be retired), it's worth migrating Nick's own account to use
its own credentials here too, whenever convenient.

**No webhook URL changes needed.** Stripe webhooks for invoice payments
still all point at the same `stripe-webhook` Edge Function URL, even
though each owner now has their own Stripe account and (optionally) their
own webhook signing secret — the function tries the incoming signature
against every connected owner's secret (plus the platform fallback) until
one validates. Forging a valid signature still requires actually knowing
one of those real secrets, so this doesn't weaken verification.

**Not touched:** the *platform* Stripe account used for Project Flow's
own $49/mo subscription billing (`PLATFORM_STRIPE_SECRET_KEY` etc.) is a
separate, genuinely platform-wide secret — that's Project Flow's own
revenue, not a pass-through to a client, so it stays as-is.

**1. Redeploy the affected Edge Functions**

```bash
supabase functions deploy create-invoice-checkout
supabase functions deploy stripe-webhook
supabase functions deploy create-paypal-order
supabase functions deploy capture-paypal-order
supabase functions deploy twilio-voice
supabase functions deploy twilio-sms
supabase functions deploy send-job-reminder
supabase functions deploy send-review-request
```

**2. Run the schema migration**

- [`docs/schema_v22_payment_comms_byok.sql`](docs/schema_v22_payment_comms_byok.sql)
  — adds `twilio_settings.twilio_account_sid`/`twilio_auth_token`, and a
  new `payment_settings` table (Stripe secret key + webhook secret,
  PayPal client ID + secret + sandbox/live mode), owner-scoped by RLS.

**3. Each owner fills in their own credentials in Settings** (optional —
leave blank to keep using the platform's shared account for now):
- **Calls & Texts (Twilio)** — Account SID and Auth Token, from the
  [Twilio Console](https://console.twilio.com).
- **Payments** — Stripe secret key (from the
  [Stripe Dashboard](https://dashboard.stripe.com/apikeys)) and webhook
  signing secret (from
  [Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks) —
  point it at the *same* `stripe-webhook` URL as before), plus PayPal
  client ID/secret (from the
  [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications))
  and sandbox/live mode.

### Automatic appointment reminders

The "Text reminder" button on a job (`send-job-reminder`) has always been
a manual send. There's now a fully automatic version alongside it: turn
on **Settings → Scheduling → Automatic appointment reminders** and pick
how far ahead (2 hours, 4 hours, 24 hours, 2 days, or off), and Project
Flow texts the client on its own — no one has to remember to click
anything.

**How it works:** a new Edge Function, `send-scheduled-reminders`, runs
on an hourly schedule (not called from the app) and texts every job
that's now within its owner's reminder window and hasn't been reminded
yet. `jobs.reminder_sent_at` makes this safe to run every hour without
double-texting anyone.

**1. Run the schema migration**

[`docs/schema_v23_reminders_leads.sql`](docs/schema_v23_reminders_leads.sql)
— adds `scheduling_settings.reminder_hours_before` (0 = off, the default
until you turn it on) and `jobs.reminder_sent_at`.

**2. Deploy the Edge Function**

```bash
supabase functions deploy send-scheduled-reminders
```

**3. Schedule it to actually run** — this is the one genuinely new kind
of setup step in the app so far: everything else runs when a user clicks
something or a webhook fires, but this needs to run *on its own, once an
hour*, forever. Supabase does this with `pg_cron` (a scheduler) +
`pg_net` (lets Postgres make an HTTP call) — both are official Supabase
Postgres extensions, no new service to sign up for.

In the Supabase dashboard: **Database → Extensions**, enable `pg_cron`
and `pg_net` if they aren't already. Then in the **SQL Editor**, run
(swap in your project ref and `service_role` secret key — **Settings →
API** — both are also detailed in the migration file's comments):

```sql
select cron.schedule(
  'send-scheduled-reminders-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-scheduled-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

That's a one-time setup — it stays scheduled from then on. Nothing sends
until an owner actually turns the setting on in Settings, so this is safe
to set up ahead of anyone using it.

### Leads & Requests

A new **Leads & Requests** page in the sidebar pulls together everyone
who's reached out but isn't a job yet:
- **New leads** — clients auto-captured from a missed call, an inbound
  text, or the estimate chatbot (the same capture flows that already
  existed; this just gives them a dedicated place to be worked instead of
  only showing up mixed into the full Clients list). A lead
  automatically moves to "Already converted" the moment it has a real job
  or quote.
- **Service requests from clients** — the client portal's "I'd also like…"
  requests (`service_requests` table) finally have somewhere to show up;
  that data was already being captured but had no page to view it on
  until now. Mark one reviewed once you've followed up.

No schema migration — this is a new view over `clients.source` and the
already-existing `service_requests` table, both from earlier migrations.
No new Edge Function either, since it's a client-side page over data the
app already has.

### Quotes pipeline (board view)

**Quotes** now has a **List / Pipeline** toggle. Pipeline shows the same
quotes as four drag-and-drop columns (Draft, Sent, Accepted, Declined) —
drag a card to a new column to change its status, same effect as picking
a new status in the list view, just faster when you're triaging a batch
of quotes at once. No schema change, no new Edge Function — it's a second
view over the existing `quotes.status` field.

### Job checklists

Every job detail page now has a **Checklist** card — a simple ordered
list of checkboxes (a punch list, safety steps, anything you don't want
missed) separate from the existing freeform Notes, since a checklist
needs done/not-done state per line rather than a timestamped log.

**Run the schema migration**

[`docs/schema_v24_costing_checklists_expenses.sql`](docs/schema_v24_costing_checklists_expenses.sql)
— adds `job_checklist_items`. No Edge Function, no secret.

### Job costing & expense tracking

Two features sharing one ledger table (`expenses`), since a job's cost
and the business's general expenses are really the same kind of record —
one is just tagged to a job and one isn't:

- **Job Costing** — a new card on every job detail page. Log what a job
  actually cost (materials — optionally pulled straight from your
  Materials catalog so the price is already right, labor, fuel, permits,
  whatever) and it's weighed against that job's revenue (its invoice
  total if one exists, or its quote total if not) for a real profit/margin
  number per job — not just a guess.
- **Expenses** (new page in the sidebar) — the full ledger: every expense
  across the business, job-tied or general overhead (insurance, office
  supplies, a tool that isn't tied to one job), filterable by category,
  with a running total. Add an expense from either place — a job-tied one
  added from Expenses shows up on that job's Job Costing card too, and
  vice versa, since it's the same table either way.

**Run the schema migration**

Same file as above —
[`docs/schema_v24_costing_checklists_expenses.sql`](docs/schema_v24_costing_checklists_expenses.sql)
also adds the `expenses` table and `expense_category` enum. No Edge
Function, no secret — this is all client-side against the database
directly, like Materials and Price Book.

### Files & Media library

A new **Files & Media** page in the sidebar pulls together every photo
and file that already existed scattered across the app — job-site
photos, invoice receipts, and AI project visualizations — into one
searchable, browsable place instead of only ever being reachable one job
or invoice at a time. Search filters by client or job name; each
thumbnail links back to where it actually lives (the job, invoice, or
quote).

No schema migration, no new Edge Function — this reads the same
`job_photos`, `invoices.receipt_paths`, and `quote_visualizations` data
that already existed from earlier migrations, just presented as one
library instead of requiring you to already know which job/invoice/quote
to look under.

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
  via Gmail with Accept/Decline links, CSV import, and a List/Pipeline
  toggle for a drag-and-drop board view of the same statuses.
- **Leads & Requests** — new leads auto-captured from missed calls/texts/
  the chatbot, and "I'd also like…" requests from the client portal, both
  in one place instead of buried in the full Clients list.
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
  Customers can also attach a photo or video, which Claude actually
  analyzes to sharpen the estimate; saved onto the Job if a visit is booked.
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
  create-job/          auth required: dashboard/Schedule "New job" — same Calendar sync as book-slot
  twilio-voice/        Twilio Voice webhook: ring the owner, auto-text (+ chat link) + log a lead if missed
  twilio-sms/          Twilio Messaging webhook: logs inbound texts as leads, replies with the chat link
  send-job-reminder/   texts a client an appointment reminder for a job (auth required)
  send-review-request/ auth required: texts/emails a client a direct link to leave a Google review
  estimate-chat/       public: Claude tool-using agent — price book lookup, slot check, booking
  send-invoice-email/  emails an invoice via the owner's Gmail with a Pay Now link (auth required)
  invoice-pay-info/    public: invoice details for the /pay/:token page
  create-invoice-checkout/ public: creates a Stripe Checkout session for a chosen amount
  stripe-webhook/       public (Stripe-signature verified): records payments, updates invoice status
  create-paypal-order/  public: creates a PayPal order for a chosen amount
  capture-paypal-order/ public: captures the order on redirect-back, records the payment
  create-subscription-checkout/    auth required: starts the platform $49/mo subscription checkout
  create-billing-portal-session/   auth required: opens Stripe's Billing Portal for the owner
  platform-stripe-webhook/         public (Stripe-signature verified): syncs the subscriptions table
  app-help-chat/        auth required: in-app site-navigation + renovation Q&A assistant
  job-photos-info/      public: job title + photo timeline for the /job-gallery/:token page
  portal-login-request/ public: emails a client a one-time login link
  portal-verify/         public: exchanges a login link for a session token
  portal-dashboard/      public (session-scoped): jobs/quotes/invoices for the portal
  portal-request-service/ public (session-scoped): logs a client's "I'd also like..." request
  extract-receipt-items/ auth required: Claude vision pulls line items off a receipt photo
  extract-invoice-items/ auth required: Claude vision pulls service line items off a photographed old invoice
  send-scheduled-reminders/ scheduled (pg_cron, not called from the app): auto-texts upcoming appointment reminders
  generate-quote-visualization/ auth required: Gemini image model generates an "after" visualization
docs/schema.sql                 Supabase schema + RLS policies
docs/schema_v2_scheduling.sql   Google connections, scheduling hours, quote tokens
docs/schema_v3_twilio.sql       Twilio number/forwarding settings, client lead source
docs/schema_v4_google_oauth.sql One-time state table for the direct Google OAuth flow
docs/schema_v5_price_book_chat.sql Price Book table
docs/schema_v6_stripe_payments.sql Invoice pay tokens/amount_paid, invoice_payments table
docs/schema_v7_paypal_payments.sql Adds provider/paypal_order_id to invoice_payments
docs/schema_v8_estimate_uploads.sql Public estimate-uploads Storage bucket, jobs.photo_urls
docs/schema_v9_platform_subscriptions.sql subscriptions table, profiles.is_exempt comp flag
docs/schema_v10_service_area.sql Adds profiles.service_area, for the Unit Cost Method pricing fallback
docs/schema_v11_onboarding.sql   Adds profiles.onboarding_completed, for the setup wizard
docs/schema_v12_google_review_link.sql Adds profiles.google_review_link, for review requests
docs/schema_v13_invoice_receipts.sql Private receipts Storage bucket, invoices.receipt_paths
docs/schema_v14_invoice_milestones.sql invoice_milestones table, invoice_payments.milestone_id
docs/schema_v15_job_photos.sql   Public job-photos Storage bucket, owner-writable
docs/schema_v16_job_photo_gallery.sql job_photos table, jobs.photo_share_token
docs/schema_v17_client_portal.sql client_portal_login_tokens, client_portal_sessions, service_requests
docs/schema_v18_client_messages.sql client_messages table (structured communications log)
docs/schema_v19_materials.sql    materials table (separate catalog from Price Book)
docs/schema_v20_quote_visualizations.sql quote_visualizations table + public quote-visuals bucket
docs/schema_v21_gemini_byok.sql  Adds profiles.gemini_api_key (bring-your-own-key)
docs/schema_v22_payment_comms_byok.sql Adds twilio_settings SID/token + payment_settings table (bring-your-own-key)
docs/schema_v23_reminders_leads.sql Adds scheduling_settings.reminder_hours_before + jobs.reminder_sent_at, pg_cron setup notes
docs/schema_v24_costing_checklists_expenses.sql Adds job_checklist_items + expenses (job costing & expense tracking)
```
