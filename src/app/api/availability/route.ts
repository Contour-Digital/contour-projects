import { NextResponse, type NextRequest } from "next/server";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { computeSlots, isValidTimezone } from "@/lib/booking/availability";
import { busyBetween, loadEventType, loadSettings } from "@/lib/booking/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/availability?slug=discovery-call&from=2026-10-01&to=2026-10-31&tz=Australia/Sydney
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const slug = p.get("slug") ?? "";
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  const tz = p.get("tz") ?? "UTC";
  if (!DATE.test(from) || !DATE.test(to) || !isValidTimezone(tz)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const span = differenceInCalendarDays(parseISO(to), parseISO(from));
  if (span < 0 || span > 42) return NextResponse.json({ error: "Range too large" }, { status: 400 });

  const eventType = await loadEventType(slug);
  if (!eventType) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const settings = await loadSettings();

  // Wide enough to cover any timezone offset on either side.
  const rangeStart = addDays(parseISO(from), -2);
  const rangeEnd = addDays(parseISO(to), 3);
  try {
    const busy = await busyBetween(settings, rangeStart, rangeEnd);
    const days = computeSlots({
      settings,
      durationMinutes: eventType.duration_minutes,
      busy,
      from,
      to,
      visitorTimezone: tz,
    });
    return NextResponse.json({ days }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not load availability" }, { status: 502 });
  }
}
