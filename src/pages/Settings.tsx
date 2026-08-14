import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck2, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { connectGoogle } from "@/lib/googleAuth";
import { useGoogleConnection, useSaveSchedulingSettings, useSchedulingSettings } from "@/hooks/useScheduling";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const { data: googleConnection, isLoading: googleLoading } = useGoogleConnection(user?.id);
  const { data: schedulingSettings } = useSchedulingSettings(user?.id);
  const saveSchedulingSettings = useSaveSchedulingSettings();

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
        <CardContent className="pb-6">
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
