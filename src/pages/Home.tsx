import { Link, Navigate } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  Calendar,
  Camera,
  Check,
  ClipboardCheck,
  FileText,
  Inbox,
  MessageSquareText,
  Receipt,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";

// The public marketing homepage — this is what a logged-out visitor to
// flow.w3bbworldwide.com sees. A signed-in visitor is bounced straight to
// their Dashboard (see the redirect below), so this page only ever has to
// do one job: explain the product and get someone to start a trial.
//
// Visuals are icon-based gradient panels rather than real photography —
// no stock-photo dependency to keep working or go stale. Swap in real
// photos of actual jobs/team members whenever you have them; that beats
// generic stock for a real local business anyway.

interface FeatureSection {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  icon: LucideIcon;
}

const SECTIONS: FeatureSection[] = [
  {
    id: "clients",
    eyebrow: "Client Management",
    title: "Every client, job, and conversation in one place",
    description:
      "A real CRM built for service work — plus a client-facing hub so customers can check in on their own project without calling you.",
    bullets: [
      "Client profiles rolling up every job, quote, and invoice",
      "A client portal — customers sign in to approve quotes, pay milestones, and ask for more work",
      "Online booking straight off an accepted quote, checked against your real calendar",
      "New leads (missed calls, texts, chatbot conversations) and client requests, triaged in one queue",
    ],
    icon: Users,
  },
  {
    id: "scheduling",
    eyebrow: "Scheduling & Field Work",
    title: "Run the job site, not just the calendar",
    description:
      "Two-way texting, job checklists, and a full photo/media trail your clients can see — so nothing gets lost between the estimate and the invoice.",
    bullets: [
      "Calendar scheduling synced with Google Calendar, both directions",
      "Per-job checklists so nothing on a punch list gets missed",
      "Job-site photos with team tagging, annotation, and a shareable client gallery",
      "Two-way texting with a structured conversation log per client",
      "Automatic appointment reminders and missed-call text-back — no manual follow-up",
    ],
    icon: Calendar,
  },
  {
    id: "quotes",
    eyebrow: "Quotes & AI Visualizations",
    title: "Quotes clients can actually picture",
    description:
      "Line-item quotes with one-tap accept/decline, and an AI-generated \"after\" photo showing the client what the finished job will look like.",
    bullets: [
      "Auto-totaled line items, sent by email with a direct accept/decline link",
      "Upload a before photo + materials, describe the change, get a real \"after\" visualization",
      "A drag-and-drop pipeline view across draft/sent/accepted/declined",
      "Booking a job the moment a quote's accepted — calendar event and invoice included",
    ],
    icon: FileText,
  },
  {
    id: "payments",
    eyebrow: "Invoicing & Payments",
    title: "Get paid without chasing anyone down",
    description:
      "Card, Cash App Pay, and PayPal on every invoice — full balance, a deposit, or milestone-by-milestone.",
    bullets: [
      "Invoices auto-created the moment a quote's accepted",
      "Partial payments, deposits, and milestone payment schedules",
      "Snap a photo of a receipt and AI pulls out the line items for you",
      "Each business connects its own Stripe/PayPal — client payments never pass through anyone else's account",
    ],
    icon: Receipt,
  },
  {
    id: "money",
    eyebrow: "Price Book, Materials & Job Costing",
    title: "Know what a job actually made you",
    description:
      "A price book for what you charge, a materials catalog for what you pay suppliers, and real job costing tying the two together.",
    bullets: [
      "A price book of typical job types and rates, used to power instant customer estimates",
      "A materials catalog with supplier, SKU, and cost — importable from Home Depot/Lowe's Pro purchase history",
      "Photograph an old invoice or receipt and AI extracts the line items automatically",
      "Job costing weighs real cost against real revenue for an actual profit/margin number per job",
      "One expense ledger for job-specific costs and general business overhead alike",
    ],
    icon: Banknote,
  },
  {
    id: "ai",
    eyebrow: "AI That Actually Helps",
    title: "An AI estimator that works while you're on another job",
    description:
      "A chatbot on your own site gives customers a real rough estimate and books a free visit — day or night, without you touching your phone.",
    bullets: [
      "Embeddable estimate chatbot — customers describe the job, get a price range, book a visit",
      "Customers can attach photos, video, or just talk — the chatbot actually looks and listens",
      "Missed calls and new texts feed leads straight into the same chatbot automatically",
      "An in-app help assistant that answers \"how do I...\" questions about Project Flow itself",
    ],
    icon: Sparkles,
  },
];

const TRUST_POINTS = [
  { icon: ClipboardCheck, label: "Built for handyman & home service businesses" },
  { icon: MessageSquareText, label: "Two-way texting, missed-call text-back" },
  { icon: Wand2, label: "AI estimates, visualizations, and receipt scanning" },
  { icon: Inbox, label: "Every lead and request in one queue" },
];

export default function Home() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-svh bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <span className="gradient-text text-lg font-semibold">Project Flow</span>
          </div>
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="hover:text-foreground">
                {s.eyebrow}
              </a>
            ))}
            <a href="#pricing" className="hover:text-foreground">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/login">
                Start free trial <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <Badge variant="secondary" className="mb-4">
            7-day free trial · $49/month · cancel anytime
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">
            Run your whole handyman business from <span className="gradient-text">one place</span>.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Clients, scheduling, quotes, invoicing, payments, and an AI estimator that works the phones
            for you — built specifically for handyman and home service businesses, not adapted from
            something bigger.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <Link to="/login">
                Start your free trial <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#clients">See what's included</a>
            </Button>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TRUST_POINTS.map((t) => (
              <div key={t.label} className="flex items-start gap-2 text-xs text-muted-foreground">
                <t.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                {t.label}
              </div>
            ))}
          </div>
        </div>

        <HeroVisual />
      </section>

      {/* Feature sections */}
      <div className="space-y-20 px-6 py-10 lg:space-y-28">
        {SECTIONS.map((section, i) => (
          <section
            key={section.id}
            id={section.id}
            className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-10 lg:grid-cols-2"
          >
            <div className={i % 2 === 1 ? "lg:order-2" : ""}>
              <p className="text-sm font-medium text-primary">{section.eyebrow}</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-3 text-muted-foreground">{section.description}</p>
              <ul className="mt-5 space-y-2.5">
                {section.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={i % 2 === 1 ? "lg:order-1" : ""}>
              <FeatureVisual icon={section.icon} />
            </div>
          </section>
        ))}
      </div>

      {/* Integrations strip */}
      <section className="border-y bg-muted/30 py-12">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">Connects with the tools you already use</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-lg font-medium text-muted-foreground/80">
            <span>Google Calendar</span>
            <span>Gmail</span>
            <span>Twilio</span>
            <span>Stripe</span>
            <span>PayPal</span>
            <span>Cash App Pay</span>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-2xl scroll-mt-20 px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">One plan. Everything included.</h2>
        <p className="mt-3 text-muted-foreground">
          No feature tiers, no per-seat pricing games — every feature on this page, from day one.
        </p>
        <div className="mt-8 rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">7 days free, then</p>
          <p className="mt-1 text-5xl font-semibold">
            $49<span className="text-lg font-normal text-muted-foreground">/month</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Cancel anytime.</p>
          <Button size="lg" className="mt-6 w-full" asChild>
            <Link to="/login">
              Start your free trial <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="font-medium text-foreground">Project Flow</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <a href="mailto:heatherf@w3bbworldwide.com" className="hover:text-foreground">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Abstract gradient "hero mock" — a big icon plus a couple of floating
// accent chips, standing in for a product screenshot without needing one.
function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-md">
      <div
        className="absolute inset-0 rounded-3xl shadow-xl"
        style={{ background: "var(--gradient-primary)" }}
      />
      <Camera className="absolute inset-0 m-auto size-24 text-white/90" strokeWidth={1.25} />
      <div className="absolute -left-4 top-8 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
        <Check className="size-3.5 text-success" /> Quote accepted
      </div>
      <div className="absolute -right-4 bottom-10 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
        <Banknote className="size-3.5 text-primary" /> Invoice paid — $1,240
      </div>
      <div className="absolute bottom-[-1rem] left-8 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
        <ClipboardCheck className="size-3.5 text-primary" /> 6/6 checklist done
      </div>
    </div>
  );
}

function FeatureVisual({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-muted/40 shadow-sm">
      <div className="absolute inset-0 opacity-90" style={{ background: "var(--gradient-primary)" }} />
      <Icon className="absolute inset-0 m-auto size-20 text-white/90" strokeWidth={1.25} />
    </div>
  );
}
