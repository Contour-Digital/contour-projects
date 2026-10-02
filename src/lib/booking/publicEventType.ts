import type { EventType } from "@/lib/types";
import type { PublicEventType } from "@/components/booking/BookingWidget";

/** Only the fields a visitor should see. */
export function toPublic(t: EventType): PublicEventType {
  return {
    slug: t.slug,
    name: t.name,
    description: t.description,
    duration_minutes: t.duration_minutes,
    location_type: t.location_type,
    location_detail: t.location_detail,
    color: t.color,
  };
}
