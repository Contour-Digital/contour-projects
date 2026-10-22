import type { SupportTag } from "@/lib/types";
import { tagOf } from "@/lib/supportTasks";
import { StageBadge } from "@/components/ui/StageBadge";

export function TagBadge({ tag }: { tag: SupportTag }) {
  const t = tagOf(tag);
  return <StageBadge stage={{ name: t.label, color: t.color }} />;
}
