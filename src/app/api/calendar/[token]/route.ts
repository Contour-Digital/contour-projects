import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gmailSender } from "@/lib/google";
import { meetingInfo } from "@/lib/booking/confirmation";
import { icsFor } from "@/lib/booking/sendConfirmation";
import type { Booking, BookingSettings, EventType } from "@/lib/types";

// Public: the "Apple Calendar / other" link in confirmation emails. The token is
// a random UUID per meeting, so a link only ever reveals its own meeting.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!UUID.test(token)) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("calendar_token", token)
    .eq("status", "confirmed")
    .maybeSingle();
  if (!booking) return new NextResponse("This meeting was cancelled or doesn't exist.", { status: 404 });

  const b = booking as Booking;
  const [{ data: settings }, { data: type }] = await Promise.all([
    admin.from("booking_settings").select("*").eq("id", 1).single(),
    b.event_type_id ? admin.from("event_types").select("*").eq("id", b.event_type_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const info = meetingInfo(b, type as EventType | null, settings as BookingSettings);

  return new NextResponse(icsFor(b, info, await gmailSender()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="meeting.ics"',
      "Cache-Control": "no-store",
    },
  });
}
