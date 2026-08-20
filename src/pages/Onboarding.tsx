import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useCompleteOnboarding } from "@/hooks/useOnboarding";
import { ImportClientsDialog } from "@/components/ImportClientsDialog";
import { ImportJobsDialog } from "@/components/ImportJobsDialog";
import { ImportQuotesDialog } from "@/components/ImportQuotesDialog";
import { ImportPriceHistoryDialog } from "@/components/ImportPriceHistoryDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Profile } from "@/types/domain";

const STEPS = ["Business info", "Bring your data over", "Connect the essentials", "Done"];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const completeOnboarding = useCompleteOnboarding();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [cameFromElsewhere, setCameFromElsewhere] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data ?? { id: user.id, email: user.email ?? null }));
  }, [user]);

  async function saveBusinessInfo() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      business_name: profile.business_name ?? null,
      phone: profile.phone ?? null,
      email: profile.email ?? user.email ?? null,
      service_area: profile.service_area ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStep(1);
  }

  async function finish() {
    if (!user) return;
    try {
      await completeOnboarding.mutateAsync(user.id);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't finish setup — try again.");
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <Sparkles className="mx-auto size-8 text-primary" />
          <CardTitle className="text-2xl">Let's set up your business</CardTitle>
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={`h-1.5 w-8 rounded-full ${i <= step ? "bg-primary" : "bg-secondary"}`}
                title={label}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pb-6">
          {step === 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                A few basics — you can always change these later in Settings.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="business_name">Business name</Label>
                <Input
                  id="business_name"
                  value={profile.business_name ?? ""}
                  onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                  placeholder="Shears Handyman Services"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Business phone</Label>
                <Input
                  id="phone"
                  value={profile.phone ?? ""}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact_email">Contact email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={profile.email ?? ""}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="service_area">Service area</Label>
                <Input
                  id="service_area"
                  placeholder="Dayton, OH"
                  value={profile.service_area ?? ""}
                  onChange={(e) => setProfile({ ...profile, service_area: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Used by the estimate chatbot to rough-price jobs that aren't in your Price Book yet.
                </p>
              </div>
              <Button className="w-full" onClick={saveBusinessInfo} disabled={saving}>
                {saving ? "Saving…" : "Continue"} <ArrowRight className="size-4" />
              </Button>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">
                Coming from Jobber, Housecall Pro, or another tool? You can bring your existing clients,
                jobs, quotes, and pricing history over as a CSV export from wherever it lives now.
              </p>
              {cameFromElsewhere === null && (
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => setCameFromElsewhere(true)}>
                    Yes, I have data to bring over
                  </Button>
                  <Button variant="outline" onClick={() => setCameFromElsewhere(false)}>
                    No, starting fresh
                  </Button>
                </div>
              )}
              {cameFromElsewhere && (
                <div className="grid grid-cols-2 gap-2">
                  <ImportClientsDialog />
                  <ImportJobsDialog />
                  <ImportQuotesDialog />
                  <ImportPriceHistoryDialog />
                </div>
              )}
              {cameFromElsewhere !== null && (
                <Button className="w-full" onClick={() => setStep(2)}>
                  Continue <ArrowRight className="size-4" />
                </Button>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Optional, but worth doing early — each of these unlocks more of the app. All can be set up
                any time from Settings, so feel free to skip for now.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <strong>Google Calendar &amp; Gmail</strong> — send quotes/invoices from your own email
                    and let clients book real open slots on your calendar.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <strong>Calls &amp; texts (Twilio)</strong> — auto-text missed callers a link to the
                    estimate chatbot instead of losing the lead.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <strong>Payments</strong> — let clients pay invoices by card, Cash App, or PayPal, with
                    partial/deposit payments.
                  </span>
                </li>
              </ul>
              <Button className="w-full" onClick={() => setStep(3)}>
                Continue <ArrowRight className="size-4" />
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex flex-col items-center gap-2 py-2 text-center">
                <Check className="size-8 text-primary" />
                <p className="text-sm text-muted-foreground">
                  You're set up. Head to Settings any time to connect Google, Twilio, or payments, or add
                  more to your Price Book.
                </p>
              </div>
              <Button className="w-full" onClick={finish} disabled={completeOnboarding.isPending}>
                {completeOnboarding.isPending ? "Finishing…" : "Go to Dashboard"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
