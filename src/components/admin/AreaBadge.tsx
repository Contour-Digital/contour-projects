import type { AdminArea } from "@/lib/types";
import { areaOf } from "@/lib/adminTasks";
import { StageBadge } from "@/components/ui/StageBadge";

export function AreaBadge({ area }: { area: AdminArea }) {
  const a = areaOf(area);
  return <StageBadge stage={{ name: a.label, color: a.color }} />;
}
