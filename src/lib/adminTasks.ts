import type { AdminArea, Recurrence } from "@/lib/types";

export const AREAS: { value: AdminArea; label: string; color: string }[] = [
  { value: "admin", label: "Admin", color: "#64748b" },
  { value: "business", label: "Business management", color: "#8b5cf6" },
  { value: "outreach", label: "Client outreach", color: "#0098ff" },
];

export const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export const areaOf = (a: AdminArea) => AREAS.find((x) => x.value === a) ?? AREAS[0];
export const recurrenceLabel = (r: Recurrence) => RECURRENCES.find((x) => x.value === r)?.label ?? "";
