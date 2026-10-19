import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { requireTeam } from "@/lib/auth";
import { busyBetween, loadSettings } from "@/lib/booking/server";
import { sendConfirmation } from "@/lib/booking/sendConfirmation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEvent } from "@/lib/google";
import type { EventType, LocationType } from "@/lib/types";

// Ad hoc meetings: booked by the team from Meetings, at any time, ignoring the
// booking page's hours, notice and buffers.

type Body = {
  clientId?: string | null;
  saveAsClient?: boolean;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  eventTypeId?: string | null;
  title?: string;
  durationMinutes?: number;
  locationType?: LocationType;
  locationDetail?: string;
  date?: string; // YYYY-MM-DD in the owner's timezone
  time?: string; // HH:mm in the owner's timezone
  details?: string;
  sendInvite?: boolean;
  sendConfirmation?: boolean;
  subject?: string;
  body?: string;
  /** Book even though it clashes with something already on the calendar. */
  force?: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  const denied = await requireTeam();
  if (denied) return denied;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const settings = await loadSettings();

  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const company = clean(body.company, 120);
  const details = clean(body.details, 4000);
  if (!name) return NextResponse.json({ error: "Who is the meeting with?" }, { status: 400 });
  if (email && !EMAIL.test(email)) return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  if ((body.sendInvite || body.sendConfirmation) && !email) {
    return NextResponse.json({ error: "Add an email address to send an invite or confirmation." }, { status: 400 });
  }

  let eventType: EventType | null = null;
  if (body.eventTypeId) {
    const { data } = await admin.from("event_types").select("*").eq("id", body.eventTypeId).maybeSingle();
    eventType = (data as EventType | null) ?? null;
    if (!eventType) return NextResponse.json({ error: "That meeting type no longer exists." }, { status: 400 });
  }
  const title = eventType ? null : clean(body.title, 120);
  if (!eventType && !title) return NextResponse.json({ error: "Give the meeting a name." }, { status: 400 });

  const duration = Math.round(Number(body.durationMinutes) || eventType?.duration_minutes || 30);
  if (duration < 5 || duration > 720) return NextResponse.json({ error: "Length must be between 5 and 720 minutes." }, { status: 400 });

  const date = clean(body.date, 10);
  const time = clean(body.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "Pick a date and start time." }, { status: 400 });
  }
  const start = fromZonedTime(`${date}T${time}:00`, settings.timezone);
  const end = new Date(start.getTime() + duration * 60_000);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "Pick a date and start time." }, { status: 400 });

  const locationType: LocationType = body.locationType ?? eventType?.location_type ?? "google_meet";
  const locationDetail = clean(body.locationDetail, 300);
  const location =
    locationType === "google_meet"
      ? null // the Meet link is added once Google creates it
      : locationType === "phone"
        ? `Phone call${phone ? `: ${settings.owner_name} will call ${phone}` : ""}`
        : locationDetail || null;

  if (!body.force) {
    const clashes = (await busyBetween(settings, start, end)).filter((b) => b.start < end && start < b.end);
    if (clashes.length) {
      return NextResponse.json(
        { error: "This time overlaps something already in your calendar.", conflict: true },
        { status: 409 }
      );
    }
  }

  // Link to the chosen client, or (if asked) find or create one for a new contact.
  let clientId: string | null = null;
  if (body.clientId) {
    const { data } = await admin.from("clients").select("id").eq("id", body.clientId).maybeSingle();
    clientId = data?.id ?? null;
  } else if (body.saveAsClient) {
    const { data: existing } = email
      ? await admin.from("clients").select("id").ilike("email", email).limit(1).maybeSingle()
      : { data: null };
    if (existing) {
      clientId = existing.id;
    } else {
      const { data: created } = await admin
        .from("clients")
        .insert({ name, email: email || null, phone: phone || null, company: company || null })
        .select("id")
        .single();
      clientId = created?.id ?? null;
    }
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      source: "ad_hoc",
      event_type_id: eventType?.id ?? null,
      title,
      client_id: clientId,
      name,
      email: email || null,
      phone: phone || null,
      company: company || null,
      message: details || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      timezone: settings.timezone,
      location,
      location_type: locationType,
    })
    .select("id")
    .single();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not save the meeting. Please try again." }, { status: 500 });
  }

  const warnings: string[] = [];
  const meetingName = eventType?.name ?? title!;
  try {
    const event = await createEvent(settings.calendar_id, {
      summary: `${meetingName}: ${name}${company ? ` (${company})` : ""}`,
      description: [details, email && `Email: ${email}`, phone && `Phone: ${phone}`].filter(Boolean).join("\n"),
      start,
      end,
      timezone: settings.timezone,
      attendee: body.sendInvite && email ? { email, name } : undefined,
      location: location ?? undefined,
      addMeet: locationType === "google_meet",
      requestId: randomUUID(),
    });
    if (event) {
      await admin
        .from("bookings")
        .update({
          google_event_id: event.id,
          meet_link: event.meetLink,
          ical_uid: event.icalUid,
          invite_sent: Boolean(body.sendInvite && email),
        })
        .eq("id", booking.id);
    } else {
      warnings.push("Google Calendar isn't connected, so the meeting isn't on your calendar and no invite was sent.");
    }
  } catch (err) {
    console.error("Google event creation failed", err);
    warnings.push("Saved, but Google Calendar didn't accept the event, so no invite was sent.");
  }

  if (body.sendConfirmation && email) {
    try {
      await sendConfirmation(booking.id, { subject: body.subject, body: body.body });
    } catch (err) {
      console.error("Confirmation email failed", err);
      warnings.push(`The confirmation email wasn't sent: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ ok: true, id: booking.id, warnings });
}
