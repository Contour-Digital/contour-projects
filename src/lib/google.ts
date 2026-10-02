import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Google Calendar over plain REST: the official SDK is large and we only need
// four calls (token, freebusy, insert, delete).

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri() {
  return `${siteUrl()}/api/google/callback`;
}

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // Always ask, so Google always returns a refresh token.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function emailFromIdToken(idToken?: string) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function exchangeCodeAndStore(code: string) {
  const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token");
  const admin = createAdminClient();
  const { error } = await admin.from("google_connection").upsert({
    id: 1,
    email: emailFromIdToken(tokens.id_token),
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    connected_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function disconnectGoogle() {
  const admin = createAdminClient();
  const { data } = await admin.from("google_connection").select("refresh_token").eq("id", 1).maybeSingle();
  if (data?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, {
      method: "POST",
    }).catch(() => undefined);
  }
  await admin.from("google_connection").delete().eq("id", 1);
}

/** A valid access token, or null when Google isn't connected. */
async function accessToken(): Promise<string | null> {
  if (!googleConfigured()) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("google_connection").select("*").eq("id", 1).maybeSingle();
  if (!data) return null;

  const expires = data.access_token_expires_at ? new Date(data.access_token_expires_at).getTime() : 0;
  if (data.access_token && expires - Date.now() > 60_000) return data.access_token;

  const tokens = await tokenRequest({ refresh_token: data.refresh_token, grant_type: "refresh_token" });
  await admin
    .from("google_connection")
    .update({
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq("id", 1);
  return tokens.access_token;
}

async function googleFetch(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  if (!token) return null;
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`Google Calendar ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

/** Busy blocks from the calendar, or [] when Google isn't connected. */
export async function getBusy(calendarId: string, timeMin: Date, timeMax: Date) {
  const res = await googleFetch("/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  });
  if (!res) return [];
  const json = await res.json();
  const busy: { start: string; end: string }[] = json.calendars?.[calendarId]?.busy ?? [];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

export type NewEvent = {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  timezone: string;
  attendee: { email: string; name: string };
  location?: string;
  addMeet: boolean;
  requestId: string;
};

/** Creates the event and emails the invite. Returns null when Google isn't connected. */
export async function createEvent(calendarId: string, e: NewEvent) {
  const params = new URLSearchParams({ sendUpdates: "all", conferenceDataVersion: e.addMeet ? "1" : "0" });
  const res = await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    method: "POST",
    body: JSON.stringify({
      summary: e.summary,
      description: e.description,
      location: e.location,
      start: { dateTime: e.start.toISOString(), timeZone: e.timezone },
      end: { dateTime: e.end.toISOString(), timeZone: e.timezone },
      attendees: [{ email: e.attendee.email, displayName: e.attendee.name }],
      reminders: { useDefault: true },
      conferenceData: e.addMeet
        ? { createRequest: { requestId: e.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } }
        : undefined,
    }),
  });
  if (!res) return null;
  const json = await res.json();
  return { id: json.id as string, meetLink: (json.hangoutLink as string | undefined) ?? null };
}

export async function deleteEvent(calendarId: string, eventId: string) {
  await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "DELETE",
  });
}
