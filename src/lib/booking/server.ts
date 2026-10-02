import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusy } from "@/lib/google";
import type { BookingSettings, EventType } from "@/lib/types";
import type { Interval } from "./availability";

export async function loadSettings(): Promise<BookingSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("booking_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as BookingSettings;
}

export async function loadEventType(slug: string): Promise<EventType | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("event_types").select("*").eq("slug", slug).eq("active", true).maybeSingle();
  return (data as EventType | null) ?? null;
}

export async function loadActiveEventTypes(): Promise<EventType[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("event_types").select("*").eq("active", true).order("position");
  return (data as EventType[] | null) ?? [];
}

/** Everything that blocks a slot: Google busy times plus confirmed bookings. */
export async function busyBetween(settings: BookingSettings, start: Date, end: Date): Promise<Interval[]> {
  const admin = createAdminClient();
  const [google, { data: bookings }] = await Promise.all([
    getBusy(settings.calendar_id, start, end),
    admin
      .from("bookings")
      .select("start_at,end_at")
      .eq("status", "confirmed")
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString()),
  ]);
  return [
    ...google,
    ...(bookings ?? []).map((b) => ({ start: new Date(b.start_at), end: new Date(b.end_at) })),
  ];
}
