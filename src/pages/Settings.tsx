import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck2, Copy, ExternalLink, Loader2, MessageCircle, PhoneCall } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { connectGoogle } from "@/lib/googleAuth";
import { useGoogleConnection, useSaveSchedulingSettings, useSchedulingSettings } from "@/hooks/useScheduling";
import { useSaveTwilioSettings, useTwilioSettings } from "@/hooks/useTwilio";
import { useCreateBillingPortalSession, useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Profile } from "@/types/domain";

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function timeOptions() {
  const options: { value: number; label: string }[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    options.push({ value: minutes, label });
  }
  return options;
}
const TIME_OPTIONS = timeOptions();

export default function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const { data: subscriptionData, isLoading: subscriptionLoading } = useSubscription(user?.id);
  const billingPortal = useCreateBillingPortalSession();

  const {
    data: googleConnection,
    isLoading: googleLoading,
    error: googleError,
  } = useGoogleConnection(user?.id);

  // Handle the redirect back from google-oauth-callback: /settings?google=connected
  // or /settings?google=error&message=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;

    if (result === "connected") {
      toast.success("Google account connected");
      queryClient.invalidateQueries({ queryKey: ["google_connection"] });
    } else if (result === "error") {
      const message = params.get("message") ?? "Failed to connect Google";
      toast.error(message, { duration: 12000 });
    }

    // Strip the query params so a refresh doesn't re-show the toast.
    window.history.replaceState({}, "", window.location.pathname);
  }, [queryClient]);
  const { data: schedulingSettings } = useSchedulingSettings(user?.id);
  const saveSchedulingSettings = useSaveSchedulingSettings();
  const { data: twilioSettings, isLoading: twilioLoading, error: twilioError } = useTwilioSettings(user?.id);
  const saveTwilioSettings = useSaveTwilioSettings();
  const [twilioForm, setTwilioForm] = useState({
    twilio_phone_number: "",
    forward_to_phone: "",
    missed_call_message: "",
  });
  const [savingTwilio, setSavingTwilio] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data ?? { id: user.id, email: user.email ?? null });
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!twilioSettings) return;
    setTwilioForm({
      twilio_phone_number: twilioSettings.twilio_phone_number,
      forward_to_phone: twilioSettings.forward_to_phone ?? "",
      missed_call_message: twilioSettings.missed_call_message,
    });
  }, [twilioSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      business_name: profile.business_name ?? null,
      phone: profile.phone ?? null,
      email: profile.email ?? user.email ?? null,
      service_area: profile.service_area ?? null,
      google_review_link: profile.google_review_link ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Settings saved");
  }

  async function handleConnectGoogle() {
    setConnecting(true);
    try {
      await connectGoogle();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect Google");
      setConnecting(false);
    }
  }

  async function handleSaveTwilio(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingTwilio(true);
    try {
      await saveTwilioSettings.mutateAsync({
        user_id: user.id,
        twilio_phone_number: twilioForm.twilio_phone_number,
        forward_to_phone: twilioForm.forward_to_phone || null,
        missed_call_message: twilioForm.missed_call_message || undefined,
      });
      toast.success("Twilio settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Twilio settings");
    } finally {
      setSavingTwilio(false);
    }
  }

  function toggleDay(day: number) {
    if (!schedulingSettings || !user) return;
    const work_days = schedulingSettings.work_days.includes(day)
      ? schedulingSettings.work_days.filter((d) => d !== day)
      : [...schedulingSettings.work_days, day].sort();
    saveSchedulingSettings.mutate({ ...schedulingSettings, user_id: user.id, work_days });
  }

  function updateSetting<K extends "work_start_minutes" | "work_end_minutes" | "slot_duration_minutes">(
    key: K,
    value: number,
  ) {
    if (!schedulingSettings || !user) return;
    saveSchedulingSettings.mutate({ ...schedulingSettings, user_id: user.id, [key]: value });
  }

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Your business profile.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>Shown on quotes and invoices you send to clients.</CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="business_name">Business name</Label>
              <Input
                id="business_name"
                value={profile.business_name ?? ""}
                onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
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
                Used by the estimate chatbot to price jobs that aren't in your Price Book — it estimates a
                rough labor + materials cost for this area instead of just saying "no pricing available."
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="google_review_link">Google review link</Label>
              <Input
                id="google_review_link"
                placeholder="https://g.page/r/.../review"
                value={profile.google_review_link ?? ""}
                onChange={(e) => setProfile({ ...profile, google_review_link: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Lets you send a client a direct link to leave a Google review after a completed job (the
                "Request review" button on a job). Find yours in your Google Business Profile — under
                Home, look for "Get more reviews" or "Ask for reviews" and copy the shareable link.
                Project Flow can't post reviews for you (only Google itself can, and only through the
                customer's own account) — this just makes it one tap for them.
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Your Project Flow subscription.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          {subscriptionLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : subscriptionData?.isExempt ? (
            <p className="text-sm text-muted-foreground">This account has complimentary access.</p>
          ) : subscriptionData?.isActive ? (
            <>
              <p className="text-sm">
                {subscriptionData.subscription?.status === "trialing" ? (
                  <>
                    <span className="font-medium text-foreground">Free trial</span> — $49/month starts
                    {subscriptionData.subscription?.current_period_end
                      ? ` ${new Date(subscriptionData.subscription.current_period_end).toLocaleDateString()}`
                      : " soon"}
                    .
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">Active</span> — $49/month
                    {subscriptionData.subscription?.current_period_end
                      ? `, renews ${new Date(subscriptionData.subscription.current_period_end).toLocaleDateString()}`
                      : ""}
                    .
                  </>
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={billingPortal.isPending}
                onClick={async () => {
                  try {
                    const { url } = await billingPortal.mutateAsync();
                    window.location.href = url;
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Couldn't open billing portal");
                  }
                }}
              >
                {billingPortal.isPending ? "Opening…" : "Manage billing"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No active subscription.</p>
              <Button type="button" asChild>
                <a href="/subscribe">Subscribe — $49/mo</a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Calendar &amp; Email</CardTitle>
          <CardDescription>
            Connect Google once to send quotes from your Gmail and offer clients real open slots from your
            calendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pb-6">
          {googleError && (
            <p className="text-sm text-destructive">
              Couldn't check your Google connection: {googleError.message}. This usually means{" "}
              <code>docs/schema_v2_scheduling.sql</code> hasn't been run in Supabase yet.
            </p>
          )}
          {googleLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : googleConnection ? (
            <div className="flex items-center gap-2 text-sm">
              <CalendarCheck2 className="size-4 text-success" />
              Connected as <span className="font-medium">{googleConnection.google_email}</span>
            </div>
          ) : (
            <Button onClick={handleConnectGoogle} disabled={connecting}>
              {connecting ? "Redirecting…" : "Connect Google"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calls &amp; Texts (Twilio)</CardTitle>
          <CardDescription>
            Missed calls auto-text the caller a callback message; inbound texts get logged as leads in
            Clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          {twilioError && (
            <p className="text-sm text-destructive">
              Couldn't load Twilio settings: {twilioError.message}. This usually means{" "}
              <code>docs/schema_v3_twilio.sql</code> hasn't been run in Supabase yet.
            </p>
          )}
          {twilioLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <form onSubmit={handleSaveTwilio} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="twilio_number">Twilio phone number</Label>
                <Input
                  id="twilio_number"
                  placeholder="+17372583478"
                  value={twilioForm.twilio_phone_number}
                  onChange={(e) => setTwilioForm({ ...twilioForm, twilio_phone_number: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="forward_to">Ring through to (real cell number)</Label>
                <Input
                  id="forward_to"
                  placeholder="+19375551234"
                  value={twilioForm.forward_to_phone}
                  onChange={(e) => setTwilioForm({ ...twilioForm, forward_to_phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="missed_call_message">Missed-call auto-text</Label>
                <Textarea
                  id="missed_call_message"
                  value={twilioForm.missed_call_message}
                  onChange={(e) => setTwilioForm({ ...twilioForm, missed_call_message: e.target.value })}
                  placeholder="Sorry we missed your call! Reply here and let us know what you need."
                />
              </div>
              {twilioSettings && (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
                  <PhoneCall className="size-4 text-success" />
                  Configured — point your Twilio number's Voice and Messaging webhooks at the{" "}
                  <code>twilio-voice</code> and <code>twilio-sms</code> Edge Functions (see README).
                </div>
              )}
              <Button type="submit" disabled={savingTwilio}>
                {savingTwilio ? "Saving…" : "Save"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Invoice "Pay Now" links accept card, Cash App Pay, and PayPal. Each processor is set up
            with your own account's keys as server secrets — not connected here in the app (see the
            README's setup steps for exactly what to configure).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>Stripe — card &amp; Cash App Pay, Instant Payout to a debit card</span>
            <Button variant="outline" size="sm" asChild>
              <a href="https://dashboard.stripe.com/register" target="_blank" rel="noreferrer">
                Sign up for Stripe
              </a>
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>PayPal — a more familiar option for some clients</span>
            <Button variant="outline" size="sm" asChild>
              <a href="https://www.paypal.com/bizsignup/" target="_blank" rel="noreferrer">
                Sign up for PayPal
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estimate Chatbot</CardTitle>
          <CardDescription>
            Missed-call and new-text auto-replies link here automatically. You can also share this link
            directly — on your website, business card, etc. Give customers a rough estimate from your{" "}
            <a href="/price-book" className="underline">
              Price Book
            </a>{" "}
            and book a free visit on your calendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pb-6">
          {user && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Direct link</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/estimate/${user.id}`}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Copy link"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/estimate/${user.id}`);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" title="Open chat" asChild>
                    <a href={`/estimate/${user.id}`} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-4" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label className="text-xs">Embed on your website</Label>
                <p className="text-xs text-muted-foreground">
                  A simple, step-by-step guide — pick your website platform and it shows exactly where to
                  paste the code. Safe to send to whoever manages the site; no login needed.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/embed-guide/${user.id}`}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Copy guide link"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/embed-guide/${user.id}`);
                      toast.success("Guide link copied");
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" title="Open guide" asChild>
                    <a href={`/embed-guide/${user.id}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduling</CardTitle>
          <CardDescription>Open hours clients can book from once they accept a quote.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          {!schedulingSettings ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Work days</Label>
                <div className="flex flex-wrap gap-3">
                  {DAYS.map((day) => (
                    <label key={day.value} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={schedulingSettings.work_days.includes(day.value)}
                        onCheckedChange={() => toggleDay(day.value)}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start time</Label>
                  <Select
                    value={String(schedulingSettings.work_start_minutes)}
                    onValueChange={(v) => updateSetting("work_start_minutes", Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={String(t.value)}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>End time</Label>
                  <Select
                    value={String(schedulingSettings.work_end_minutes)}
                    onValueChange={(v) => updateSetting("work_end_minutes", Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={String(t.value)}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Job length</Label>
                <Select
                  value={String(schedulingSettings.slot_duration_minutes)}
                  onValueChange={(v) => updateSetting("slot_duration_minutes", Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[30, 60, 90, 120, 180, 240].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m >= 60 ? `${m / 60} hour${m > 60 ? "s" : ""}` : `${m} minutes`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Timezone: {schedulingSettings.timezone}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
