import { NextResponse } from "next/server";
import { requireTeam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteEvent } from "@/lib/google";
import { loadSettings } from "@/lib/booking/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeam();
  if (denied) return denied;
  const { id } = await params;

  const supabase = await createClient();
  const { data: booking } = await supabase.from("bookings").select("google_event_id").eq("id", id).single();
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (booking.google_event_id) {
    try {
      const settings = await loadSettings();
      await deleteEvent(settings.calendar_id, booking.google_event_id);
    } catch (err) {
      console.error(err);
      return NextResponse.json({ error: "Could not remove the Google Calendar event." }, { status: 502 });
    }
  }
  await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
  return NextResponse.json({ ok: true });
}
