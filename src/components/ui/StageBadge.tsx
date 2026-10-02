import type { Stage } from "@/lib/types";

export function StageBadge({ stage }: { stage: Pick<Stage, "name" | "color"> | undefined }) {
  if (!stage) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${stage.color}1f`, color: stage.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
      {stage.name}
    </span>
  );
}
