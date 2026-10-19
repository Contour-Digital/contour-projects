import { addDays, differenceInCalendarDays, format, getISODay, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { BookingSettings, RepeatingRule, TimeRange, WeeklyHours } from "@/lib/types";

export type Interval = { start: Date; end: Date };

type SlotOptions = {
  settings: Pick<
    BookingSettings,
    "timezone" | "weekly_hours" | "min_notice_hours" | "max_days_ahead" | "buffer_minutes" | "slot_interval_minutes"
  > &
    Partial<Pick<BookingSettings, "availability_mode" | "repeating_hours">>;
  durationMinutes: number;
  /** Times already taken: Google Calendar busy blocks and confirmed bookings. */
  busy: Interval[];
  /** First and last calendar day to return, in the *visitor's* timezone, as YYYY-MM-DD. */
  from: string;
  to: string;
  visitorTimezone: string;
  now?: Date;
};

const MINUTE = 60_000;

/**
 * Working hours for one owner-local date (YYYY-MM-DD). In repeating mode a
 * rule applies on its start date and every `every_days` days after it; several
 * rules can apply on the same day.
 */
export function hoursForDate(settings: SlotOptions["settings"], date: string): TimeRange[] {
  const day = parseISO(date);
  if (settings.availability_mode !== "repeating") {
    return settings.weekly_hours[String(getISODay(day)) as keyof WeeklyHours] ?? [];
  }
  return (settings.repeating_hours ?? []).filter((rule) => repeatsOn(rule, day)).flatMap((rule) => rule.hours);
}

function repeatsOn(rule: RepeatingRule, day: Date) {
  if (!rule.start_date || !(rule.every_days >= 1)) return false;
  const diff = differenceInCalendarDays(day, parseISO(rule.start_date));
  return diff >= 0 && diff % Math.floor(rule.every_days) === 0;
}

function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

/**
 * Every bookable start time between `from` and `to`, grouped by the visitor's
 * local date. Working hours (weekly or repeating) are applied in the owner's timezone; buffers are
 * kept clear before and after each busy block.
 */
export function computeSlots(opts: SlotOptions): Record<string, string[]> {
  const { settings, durationMinutes, busy, from, to, visitorTimezone } = opts;
  const now = opts.now ?? new Date();
  const tz = settings.timezone;
  const step = Math.max(5, settings.slot_interval_minutes) * MINUTE;
  const duration = durationMinutes * MINUTE;
  const buffer = settings.buffer_minutes * MINUTE;
  const earliest = new Date(now.getTime() + settings.min_notice_hours * 60 * MINUTE);
  const latest = new Date(now.getTime() + settings.max_days_ahead * 24 * 60 * MINUTE);

  const result: Record<string, string[]> = {};
  // Owner-local days that could fall inside the visitor's range (timezones can
  // shift a day either way).
  let day = addDays(parseISO(from), -1);
  const lastDay = addDays(parseISO(to), 1);

  while (day <= lastDay) {
    const date = format(day, "yyyy-MM-dd");
    for (const range of hoursForDate(settings, date)) {
      const windowStart = fromZonedTime(`${date}T${range.start}:00`, tz);
      const windowEnd = fromZonedTime(`${date}T${range.end}:00`, tz);
      for (let t = windowStart.getTime(); t + duration <= windowEnd.getTime(); t += step) {
        const slot = { start: new Date(t), end: new Date(t + duration) };
        if (slot.start < earliest || slot.start > latest) continue;
        const padded = { start: new Date(t - buffer), end: new Date(t + duration + buffer) };
        if (busy.some((b) => overlaps(padded, b))) continue;
        const visitorDate = formatInTimeZone(slot.start, visitorTimezone, "yyyy-MM-dd");
        if (visitorDate < from || visitorDate > to) continue;
        (result[visitorDate] ??= []).push(slot.start.toISOString());
      }
    }
    day = addDays(day, 1);
  }

  // Repeating rules can overlap on the same day, so drop repeated start times.
  for (const key of Object.keys(result)) result[key] = [...new Set(result[key])].sort();
  return result;
}

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
