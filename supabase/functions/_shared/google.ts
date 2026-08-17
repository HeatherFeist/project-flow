// Shared helpers for talking to Google's APIs from Supabase Edge Functions.
// Requires these project secrets (see README's "Deploying the scheduling
// feature" section):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided by Supabase)

import { createClient } from "npm:@supabase/supabase-js@2";

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface GoogleConnection {
  user_id: string;
  google_email: string | null;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
}

// Returns a live access token for the given user, refreshing it against
// Google's token endpoint if the cached one has expired.
export async function getFreshAccessToken(userId: string): Promise<string> {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("google_connections")
    .select("*")
    .eq("user_id", userId)
    .single<GoogleConnection>();

  if (error || !data) {
    throw new Error("This account hasn't connected Google yet.");
  }

  const expiresAt = data.access_token_expires_at
    ? new Date(data.access_token_expires_at).getTime()
    : 0;

  if (data.access_token && expiresAt - Date.now() > 60_000) {
    return data.access_token;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to refresh Google token: ${await res.text()}`);
  }

  const json = await res.json();
  const access_token = json.access_token as string;
  const expires_in = json.expires_in as number;

  await supabase
    .from("google_connections")
    .update({
      access_token,
      access_token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return access_token;
}

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/** Builds the URL to send the browser to for the Google consent screen. */
export function buildGoogleAuthUrl(params: { redirectUri: string; state: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", Deno.env.get("GOOGLE_CLIENT_ID")!);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
}

/** Exchanges a Google OAuth authorization code for tokens (first leg). */
export async function exchangeGoogleCode(params: {
  code: string;
  redirectUri: string;
}): Promise<{ access_token: string; refresh_token?: string; expires_in: number; id_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google code exchange failed: ${await res.text()}`);
  }

  return res.json();
}

/** Looks up the connected Google account's email address. */
export async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.email ?? null;
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Sends an email as the connected Google account via the Gmail API.
export async function sendGmail(params: {
  accessToken: string;
  fromEmail: string;
  fromName?: string;
  to: string;
  subject: string;
  html: string;
}) {
  const { accessToken, fromEmail, fromName, to, subject, html } = params;
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ].join("\r\n");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64UrlEncode(message) }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gmail send failed: ${await res.text()}`);
  }
}

// Returns busy [start, end) intervals (ISO strings) on the user's primary
// calendar between `timeMin` and `timeMax`.
export async function getBusyIntervals(params: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
}): Promise<{ start: string; end: string }[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      items: [{ id: "primary" }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Calendar freeBusy failed: ${await res.text()}`);
  }

  const json = await res.json();
  return json.calendars?.primary?.busy ?? [];
}

// Creates an event on the user's primary calendar; returns the event id.
// By default overrides the calendar's default reminders with an explicit
// email reminder, so the owner gets a reminder in their inbox even if
// their Google Calendar's own default reminders aren't set to email.
export async function createCalendarEvent(params: {
  accessToken: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  timezone: string;
  attendeeEmail?: string;
  reminderMinutes?: number[];
}): Promise<string> {
  const reminderMinutes = params.reminderMinutes ?? [60, 1440];
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: params.summary,
        description: params.description,
        location: params.location,
        start: { dateTime: params.start, timeZone: params.timezone },
        end: { dateTime: params.end, timeZone: params.timezone },
        attendees: params.attendeeEmail ? [{ email: params.attendeeEmail }] : undefined,
        reminders: {
          useDefault: false,
          overrides: reminderMinutes.map((minutes) => ({ method: "email", minutes })),
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Calendar event creation failed: ${await res.text()}`);
  }

  const json = await res.json();
  return json.id as string;
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
