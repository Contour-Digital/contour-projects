import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { gmailSender, sendGmail, siteUrl } from "@/lib/google";
import type { Booking, BookingSettings, EventType } from "@/lib/types";
import { EMAIL_LOGO_PATH, buildIcs, buildMime, calendarLinks, emailHtml, emailText, meetingInfo, meetingVars, renderTemplate, type MeetingInfo } from "./confirmation";

export const NOT_ALLOWED =
  "The app isn't allowed to send email yet. Reconnect Google in Settings, Booking page, and tick the Gmail permission.";

export function icsFor(booking: Booking, info: MeetingInfo, organizerEmail?: string | null) {
  return buildIcs({ ...info, uid: booking.ical_uid || `${booking.id}@contour-projects`, organizerEmail });
}

/**
 * Emails the client a confirmation from the connected Gmail account, using the
 * saved template unless a subject/body is given. Throws with a readable message.
 */
export async function sendConfirmation(bookingId: string, override?: { subject?: string; body?: string }) {
  const sender = await gmailSender();
  if (!sender) throw new Error(NOT_ALLOWED);

  const admin = createAdminClient();
  const [{ data: booking }, { data: settings }] = await Promise.all([
    admin.from("bookings").select("*").eq("id", bookingId).single(),
    admin.from("booking_settings").select("*").eq("id", 1).single(),
  ]);
  if (!booking || !settings) throw new Error("Meeting not found");
  const b = booking as Booking;
  const s = settings as BookingSettings;
  if (!b.email) throw new Error("This client has no email address.");

  const { data: type } = b.event_type_id
    ? await admin.from("event_types").select("*").eq("id", b.event_type_id).maybeSingle()
    : { data: null };

  const info = meetingInfo(b, type as EventType | null, s);
  const vars = meetingVars(info);
  const subject = renderTemplate(override?.subject || s.confirmation_subject, vars);
  const body = renderTemplate(override?.body || s.confirmation_body, vars);
  const links = calendarLinks(info, `${siteUrl()}/api/calendar/${b.calendar_token}.ics`);

  await sendGmail(
    buildMime({
      from: { name: s.confirmation_from_name || s.owner_name, email: s.confirmation_from_email || sender },
      to: { name: b.name, email: b.email },
      subject,
      text: emailText(body, links),
      html: emailHtml(body, links, `${siteUrl()}${EMAIL_LOGO_PATH}`),
      ics: icsFor(b, info, sender),
    })
  );
  await admin.from("bookings").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", b.id);
}
