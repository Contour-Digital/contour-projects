import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import { computeSlots, isValidTimezone } from "@/lib/booking/availability";
import { busyBetween, loadEventType, loadSettings } from "@/lib/booking/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEvent } from "@/lib/google";
import { describeLocation, offeredLocations } from "@/lib/booking/locations";
import { checkAnswers, formatAnswers } from "@/lib/booking/questions";
import type { LocationType } from "@/lib/types";
import { sendConfirmation } from "@/lib/booking/sendConfirmation";

type Body = {
  slug?: string;
  start?: string;
  tz?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  location?: string;
  answers?: Record<string, string | string[]>;
  website?: string; // honeypot: real people never fill this in
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ ok: true });

  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const company = clean(body.company, 120);
  const message = clean(body.message, 2000);
  const tz = clean(body.tz, 64) || "UTC";
  const start = new Date(clean(body.start, 40));

  if (!name || !EMAIL.test(email) || Number.isNaN(start.getTime()) || !isValidTimezone(tz)) {
    return NextResponse.json({ error: "Please fill in your name and a valid email." }, { status: 400 });
  }

  const eventType = await loadEventType(clean(body.slug, 80));
  if (!eventType) return NextResponse.json({ error: "This booking link no longer exists." }, { status: 404 });
  const offered = offeredLocations(eventType);
  // Only one option means nothing to choose; otherwise the booker must pick one we offer.
  const locationType = offered.length === 1 ? offered[0] : (offered.find((l) => l === body.location) as LocationType | undefined);
  if (!locationType) return NextResponse.json({ error: "Please choose where you'd like to meet." }, { status: 400 });
  if (locationType === "phone" && !phone) {
    return NextResponse.json({ error: "Please add a phone number so we can call you." }, { status: 400 });
  }
  const checked = checkAnswers(eventType.questions ?? [], body.answers);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { answers } = checked;

  const settings = await loadSettings();
  const end = new Date(start.getTime() + eventType.duration_minutes * 60_000);

  // Re-check the slot against live availability right before booking.
  const day = formatInTimeZone(start, tz, "yyyy-MM-dd");
  const busy = await busyBetween(settings, addDays(start, -1), addDays(start, 1));
  const open = computeSlots({ settings, durationMinutes: eventType.duration_minutes, busy, from: day, to: day, visitorTimezone: tz });
  if (!open[day]?.includes(start.toISOString())) {
    return NextResponse.json({ error: "Sorry, that time was just taken. Please pick another." }, { status: 409 });
  }

  const locationText =
    locationType === "phone"
      ? `Phone call: ${settings.owner_name} will call ${phone}`
      : locationType === "google_meet"
        ? null
        : describeLocation(eventType, locationType);

  const admin = createAdminClient();

  // Link the booking to an existing client with this email, or create one.
  let clientId: string | null = null;
  const { data: existing } = await admin.from("clients").select("id").ilike("email", email).limit(1).maybeSingle();
  if (existing) {
    clientId = existing.id;
  } else {
    const { data: created } = await admin
      .from("clients")
      .insert({ name, email, phone: phone || null, company: company || null, notes: `Added from a ${eventType.name} booking.` })
      .select("id")
      .single();
    clientId = created?.id ?? null;
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      event_type_id: eventType.id,
      client_id: clientId,
      name,
      email,
      phone: phone || null,
      company: company || null,
      message: message || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      timezone: tz,
      location_type: locationType,
      location: locationText,
      answers,
    })
    .select("id")
    .single();
  if (error) {
    // 23P01 = exclusion violation: someone else booked an overlapping time first.
    const status = error.code === "23P01" ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "Sorry, that time was just taken. Please pick another." : "Something went wrong. Please try again." },
      { status }
    );
  }

  const location = locationText ?? undefined;
  const description = [
    `Booked online by ${name} (${email}).`,
    `Where: ${locationText ?? "Google Meet"}`,
    company && `Company: ${company}`,
    phone && `Phone: ${phone}`,
    message && `\n${message}`,
    answers.length && `\n${formatAnswers(answers)}`,
  ]
    .filter(Boolean)
    .join("\n");

  let meetLink: string | null = null;
  try {
    const event = await createEvent(settings.calendar_id, {
      summary: `${eventType.name}: ${name}${company ? ` (${company})` : ""}`,
      description,
      start,
      end,
      timezone: settings.timezone,
      attendee: { email, name },
      location,
      addMeet: locationType === "google_meet",
      requestId: randomUUID(),
    });
    if (event) {
      meetLink = event.meetLink;
      await admin
        .from("bookings")
        .update({ google_event_id: event.id, meet_link: meetLink, ical_uid: event.icalUid, invite_sent: true })
        .eq("id", booking.id);
    }
  } catch (err) {
    // The booking is saved and shows in the dashboard even if Google is down.
    console.error("Google event creation failed", err);
  }

  if (settings.confirmation_enabled) {
    try {
      await sendConfirmation(booking.id);
    } catch (err) {
      // Not fatal: the Google invite has the details, and it can be resent from Meetings.
      console.error("Confirmation email failed", err);
    }
  }

  return NextResponse.json({ ok: true, start: start.toISOString(), end: end.toISOString(), meetLink, location });
}
