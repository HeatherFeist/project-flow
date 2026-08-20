// Standalone, no-login-required legal page. Required before Project Flow
// can even apply for Google Business Profile API access (Google requires
// a published privacy policy URL as a prerequisite for that application)
// — also just good practice for a real multi-tenant SaaS handling client
// contact info and payment references. Plain-language over legalese
// where possible; update the effective date and business/contact details
// before treating this as final.

const EFFECTIVE_DATE = "August 20, 2026";

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-1 text-muted-foreground">Effective {EFFECTIVE_DATE}</p>

      <p className="mt-6">
        Project Flow ("we," "us") is a job/project management tool used by service businesses ("owners")
        to manage their clients, quotes, invoices, and communications. This policy explains what data we
        collect, why, and how it's handled — both for business owners using Project Flow and for their
        clients who interact with an owner's business through it (quote links, the client portal, the
        estimate chatbot, payment pages).
      </p>

      <h2 className="mt-8 text-lg font-medium">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>Account info</strong> — email and business profile details an owner enters (business
          name, phone, service area).
        </li>
        <li>
          <strong>Client data an owner enters or imports</strong> — client names, contact info, addresses,
          job/quote/invoice details, photos, and communications logged through the app (texts, calls,
          emails sent via the app).
        </li>
        <li>
          <strong>Connected third-party account tokens</strong> — if an owner connects Google (Calendar/
          Gmail), we store an OAuth token to act on their behalf (create calendar events, send email as
          them). If an owner enters their own Twilio, Stripe, PayPal, or AI-provider API credentials, those
          are stored to make calls to those services on their behalf.
        </li>
        <li>
          <strong>Payment references</strong> — invoice payment status and provider transaction IDs. We do
          not store card numbers or bank details ourselves; those are handled directly by Stripe/PayPal.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">How it's used</h2>
      <p className="mt-2">
        Data is used to operate the features an owner turns on — sending quotes/invoices, scheduling jobs,
        texting/emailing clients, generating estimates or project visualizations, and processing payments.
        We don't sell data, and we don't use one owner's business data to serve another owner.
      </p>

      <h2 className="mt-8 text-lg font-medium">Third-party services</h2>
      <p className="mt-2">Depending on what an owner has connected, data may pass through:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Google (Calendar, Gmail, and — if connected — Business Profile) under Google's own terms.</li>
        <li>Twilio (calls/texts), Stripe and PayPal (payments), each under their own terms.</li>
        <li>
          Anthropic (Claude) and Google's Gemini image model, for the estimate chatbot, receipt/invoice
          scanning, the in-app help assistant, and project visualizations — images/text sent for those
          features are processed by the relevant AI provider to generate a response and are not used to
          train Project Flow's own systems.
        </li>
        <li>Supabase, our database/hosting provider, which stores all of the above.</li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">Data retention &amp; deletion</h2>
      <p className="mt-2">
        Data is retained for as long as an account is active. An owner can delete individual clients, jobs,
        quotes, or invoices at any time from within the app. To delete an entire account and its data,
        contact us using the details below.
      </p>

      <h2 className="mt-8 text-lg font-medium">Clients of a Project Flow business</h2>
      <p className="mt-2">
        If you're a client of a business that uses Project Flow (you received a quote link, invoice, text,
        or portal login from them), your data is controlled by that business, not by us directly — contact
        them first for anything relating to your own information. We act as their service provider.
      </p>

      <h2 className="mt-8 text-lg font-medium">Contact</h2>
      <p className="mt-2">Questions about this policy: heatherf@w3bbworldwide.com</p>
    </div>
  );
}
