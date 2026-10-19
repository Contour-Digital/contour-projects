import type { EventType } from "@/lib/types";
import { locationDetail, offeredLocations } from "@/lib/booking/locations";
import type { PublicEventType } from "@/components/booking/BookingWidget";

/** Only the fields a visitor should see. */
export function toPublic(t: EventType): PublicEventType {
  return {
    slug: t.slug,
    name: t.name,
    description: t.description,
    duration_minutes: t.duration_minutes,
    questions: t.questions ?? [],
    locations: offeredLocations(t).map((type) => ({ type, detail: locationDetail(t, type) })),
    color: t.color,
  };
}
