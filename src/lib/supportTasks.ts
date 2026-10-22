import { addDays, format, parseISO } from "date-fns";
import type { SupportTag } from "@/lib/types";

/** The On-Demand Support billing tags. price is the default price for a task with this tag. */
export const SUPPORT_TAGS: { value: SupportTag; label: string; description: string; price: number; priceLabel: string; color: string }[] = [
  {
    value: "content_updates",
    label: "Content Updates",
    description: "Minor site updates to text and images",
    price: 45,
    priceLabel: "$45 flat fee",
    color: "#0098ff",
  },
  {
    value: "site_enhancements",
    label: "Site Enhancements",
    description: "Adding new sections, layout adjustments, or minor design changes",
    price: 90,
    priceLabel: "$90 flat fee",
    color: "#8b5cf6",
  },
  {
    value: "advanced_customization",
    label: "Advanced Customization",
    description: "New page designs, integrations, or significant site changes",
    price: 180,
    priceLabel: "$180+ based on scope",
    color: "#ea580c",
  },
  {
    value: "notification_banner",
    label: "Notification Banner",
    description: "Updating and scheduling a customised notification banner",
    price: 35,
    priceLabel: "$35 flat fee",
    color: "#059669",
  },
];

export const tagOf = (t: SupportTag) => SUPPORT_TAGS.find((x) => x.value === t) ?? SUPPORT_TAGS[0];

export type DateGroup<T> = { key: string; title: string; tone: "late" | "today" | "normal" | "muted"; rows: T[] };

/**
 * Groups tasks under the date they're scheduled for. Open tasks: anything
 * before today goes under Overdue, then one heading per day from today, then
 * Not scheduled. Completed tasks: one heading per day, most recent first.
 */
export function groupByScheduledDate<T extends { scheduled_date: string | null; title: string }>(
  tasks: T[],
  { today, completed = false }: { today: string; completed?: boolean }
): DateGroup<T>[] {
  const byTitle = (a: T, b: T) => a.title.localeCompare(b.title);
  const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");
  const groups: DateGroup<T>[] = [];

  const overdue = completed ? [] : tasks.filter((t) => t.scheduled_date && t.scheduled_date < today);
  if (overdue.length) {
    overdue.sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!) || byTitle(a, b));
    groups.push({ key: "overdue", title: "Overdue", tone: "late", rows: overdue });
  }

  const dates = [...new Set(tasks.map((t) => t.scheduled_date).filter((d): d is string => !!d && (completed || d >= today)))].sort();
  if (completed) dates.reverse();
  for (const d of dates) {
    const day = format(parseISO(d), "EEEE d MMMM");
    const title = d === today ? `Today · ${day}` : d === tomorrow ? `Tomorrow · ${day}` : day;
    groups.push({
      key: d,
      title: parseISO(d).getFullYear() === parseISO(today).getFullYear() ? title : `${title} ${d.slice(0, 4)}`,
      tone: d === today && !completed ? "today" : "normal",
      rows: tasks.filter((t) => t.scheduled_date === d).sort(byTitle),
    });
  }

  const unscheduled = tasks.filter((t) => !t.scheduled_date).sort(byTitle);
  if (unscheduled.length) groups.push({ key: "none", title: "Not scheduled", tone: "muted", rows: unscheduled });
  return groups;
}
