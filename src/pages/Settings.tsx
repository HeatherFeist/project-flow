import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck2, Code2, Copy, Loader2, MessageCircle, PhoneCall } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { connectGoogle } from "@/lib/googleAuth";
import { useGoogleConnection, useSaveSchedulingSettings, useSchedulingSettings } from "@/hooks/useScheduling";
import { useSaveTwilioSettings, useTwilioSettings } from "@/hooks/useTwilio";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Profile } from "@/types/domain";

const WEBSITE_PLATFORMS: { value: string; label: string; instructions: string }[] = [
  {
    value: "wordpress",
    label: "WordPress",
    instructions: "Edit the page → add a Custom HTML block (search \"HTML\" in the block inserter) → paste the code below.",
  },
  {
    value: "squarespace",
    label: "Squarespace",
    instructions: "Edit the page → Add Block → Code Block → paste the code below.",
  },
  {
    value: "wix",
    label: "Wix",
    instructions: "Open the Editor → Add → Embed → Embed a Widget (HTML iframe) → paste the code below.",
  },
  {
    value: "webflow",
    label: "Webflow",
    instructions: "Add an Embed element (from the Add panel, under Components) → paste the code below.",
  },
  {
    value: "other",
    label: "Other / custom site",
    instructions: "Paste the code below anywhere in your site's HTML where you want the chat to appear.",
  },
];

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
  const [websitePlatform, setWebsitePlatform] = useState("wordpress");

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
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
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
                <Label className="text-xs">Embed on Nick's website</Label>
                <Select value={websitePlatform} onValueChange={setWebsitePlatform}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEBSITE_PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {WEBSITE_PLATFORMS.find((p) => p.value === websitePlatform)?.instructions}
                </p>
                {(() => {
                  const snippet = `<iframe src="${window.location.origin}/estimate/${user.id}?embed=1" style="width: 100%; height: 600px; border: none;" allow="microphone"></iframe>`;
                  return (
                    <div className="flex items-start gap-2">
                      <Textarea readOnly value={snippet} className="min-h-16 font-mono text-xs" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Copy embed code"
                        onClick={() => {
                          navigator.clipboard.writeText(snippet);
                          toast.success("Embed code copied");
                        }}
                      >
                        <Code2 className="size-4" />
                      </Button>
                    </div>
                  );
                })()}
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
