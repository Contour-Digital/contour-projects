import type { LocationType } from "@/lib/types";

export const LOCATION_TYPES: LocationType[] = ["google_meet", "phone", "in_person", "custom"];

/** How each location reads to someone booking. */
export const LOCATION_LABEL: Record<LocationType, string> = {
  google_meet: "Google Meet video call",
  phone: "Phone call",
  in_person: "In person",
  custom: "Other",
};

export type LocationOptions = {
  location_types?: LocationType[] | null;
  location_details?: Partial<Record<LocationType, string>> | null;
  location_type: LocationType;
  location_detail: string | null;
};

/** The locations a meeting type offers, in a stable order. Falls back to the single legacy location. */
export function offeredLocations(t: LocationOptions): LocationType[] {
  const list = t.location_types?.length ? t.location_types : [t.location_type];
  return LOCATION_TYPES.filter((l) => list.includes(l));
}

export function locationDetail(t: LocationOptions, type: LocationType): string | null {
  const detail = t.location_details?.[type] ?? (t.location_type === type ? t.location_detail : null);
  return detail?.trim() || null;
}

/** One line describing a location, e.g. "In person: 12 Smith St". */
export function describeLocation(t: LocationOptions, type: LocationType): string {
  const detail = locationDetail(t, type);
  if (type === "custom") return detail ?? LOCATION_LABEL.custom;
  return detail ? `${LOCATION_LABEL[type]}: ${detail}` : LOCATION_LABEL[type];
}
