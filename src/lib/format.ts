import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return format(parseISO(d), "d MMM yyyy");
}

export function formatMoney(v: number | null | undefined) {
  if (v == null) return "";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(v);
}

/** "Overdue 3d", "Due today", "Due in 4d" relative to today. */
export function dueLabel(d: string | null) {
  if (!d) return null;
  const diff = differenceInCalendarDays(parseISO(d), new Date());
  if (diff < 0) return { text: `Overdue ${-diff}d`, tone: "late" as const };
  if (diff === 0) return { text: "Due today", tone: "soon" as const };
  if (diff <= 3) return { text: `Due in ${diff}d`, tone: "soon" as const };
  return { text: format(parseISO(d), "d MMM"), tone: "ok" as const };
}

export function daysSince(iso: string) {
  return differenceInCalendarDays(new Date(), parseISO(iso));
}
