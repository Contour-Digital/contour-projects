import type { WorkStatus } from "@/lib/types";

/** Project and support task statuses, as in ClickUp. Completed is set automatically. */
export const STATUSES: { value: WorkStatus; label: string; color: string }[] = [
  { value: "underway", label: "Underway", color: "#16a34a" },
  { value: "waiting_on_client", label: "Waiting on Client", color: "#ea580c" },
  { value: "on_hold", label: "On Hold", color: "#dc2626" },
  { value: "completed", label: "Completed", color: "#475569" },
];

export const statusOf = (s: WorkStatus) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];

/** The statuses a person picks by hand. Completed only comes from finishing the work. */
export const PICKABLE_STATUSES = STATUSES.filter((s) => s.value !== "completed");
