import clsx from "clsx";
import type { WorkStatus } from "@/lib/types";
import { PICKABLE_STATUSES, statusOf } from "@/lib/status";
import { StageBadge } from "@/components/ui/StageBadge";

export function StatusBadge({ status }: { status: WorkStatus }) {
  const s = statusOf(status);
  return <StageBadge stage={{ name: s.label, color: s.color }} />;
}

/** A status pill that opens a dropdown. Shows Completed only while the work is completed. */
export function StatusPicker({
  status,
  onChange,
  label = "Status",
  className,
}: {
  status: WorkStatus;
  onChange: (status: WorkStatus) => void;
  label?: string;
  className?: string;
}) {
  const s = statusOf(status);
  const options = status === "completed" ? [statusOf("completed"), ...PICKABLE_STATUSES] : PICKABLE_STATUSES;
  return (
    <select
      className={clsx("cursor-pointer rounded-full border-0 py-0.5 pl-2 pr-7 text-xs font-medium focus:ring-2 focus:ring-slate-300", className)}
      style={{ backgroundColor: `${s.color}1f`, color: s.color }}
      value={status}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as WorkStatus)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="text-slate-800">{o.label}</option>
      ))}
    </select>
  );
}
