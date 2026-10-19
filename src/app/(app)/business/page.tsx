"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { AdminArea, AdminTask, AdminTaskClient } from "@/lib/types";
import { AREAS, recurrenceLabel } from "@/lib/adminTasks";
import { dueLabel, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { AreaBadge } from "@/components/admin/AreaBadge";
import { NewAdminTaskModal } from "@/components/admin/NewAdminTaskModal";

async function load(showDone: boolean) {
  const supabase = createClient();
  const tasks = (await supabase
    .from("admin_tasks")
    .select("*")
    .is("parent_id", null)
    .eq("done", showDone)
    .order(showDone ? "done_at" : "due_date", { ascending: !showDone, nullsFirst: false })
    .limit(showDone ? 100 : 1000)
    .then(must)) as AdminTask[];
  const ids = tasks.map((t) => t.id);
  const [subtasks, recipients] = ids.length
    ? await Promise.all([
        supabase.from("admin_tasks").select("parent_id, done").in("parent_id", ids).then(must),
        supabase.from("admin_task_clients").select("task_id, emailed").in("task_id", ids).then(must),
      ])
    : [[], []];
  return {
    tasks,
    subtasks: subtasks as Pick<AdminTask, "parent_id" | "done">[],
    recipients: recipients as Pick<AdminTaskClient, "task_id" | "emailed">[],
  };
}

export default function BusinessPage() {
  const router = useRouter();
  const [showDone, setShowDone] = useState(false);
  const [area, setArea] = useState<AdminArea | "all">("all");
  const [adding, setAdding] = useState(false);
  const { data, setData, reload, error, loading } = useData(() => load(showDone), [showDone]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const rows = data.tasks.filter((t) => area === "all" || t.area === area);

  async function toggle(task: AdminTask) {
    setData({ ...data!, tasks: data!.tasks.filter((t) => t.id !== task.id) });
    const { error } = await createClient().from("admin_tasks").update({ done: !task.done }).eq("id", task.id);
    if (error) alert(error.message);
    if (task.recurrence !== "none") reload();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Business & Outreach"
        subtitle="Admin, business management and client outreach tasks"
        actions={<Button onClick={() => setAdding(true)}>＋ New task</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "all" as const, label: "All" }, ...AREAS].map((a) => (
            <button
              key={a.value}
              onClick={() => setArea(a.value)}
              className={clsx(
                "rounded-full px-3 py-1 text-sm",
                area === a.value ? "bg-brand-navy text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show completed
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="card p-8 text-center text-slate-500">{showDone ? "Nothing completed yet." : "No open tasks here."}</p>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {rows.map((t) => {
            const subs = data.subtasks.filter((s) => s.parent_id === t.id);
            const recips = data.recipients.filter((r) => r.task_id === t.id);
            const due = t.done ? null : dueLabel(t.due_date);
            return (
              <li key={t.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50" onClick={() => router.push(`/business/${t.id}`)}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={t.done}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(t)}
                  aria-label={`${t.done ? "Reopen" : "Complete"} ${t.title}`}
                />
                <div className="min-w-0 flex-1">
                  <Link href={`/business/${t.id}`} className={clsx("font-medium hover:underline", t.done && "text-slate-400 line-through")} onClick={(e) => e.stopPropagation()}>
                    {t.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {[
                      t.recurrence !== "none" && `↻ ${recurrenceLabel(t.recurrence)}`,
                      subs.length > 0 && `${subs.filter((s) => s.done).length}/${subs.length} subtasks`,
                      recips.length > 0 && `${recips.filter((r) => r.emailed).length}/${recips.length} clients emailed`,
                      t.done && t.done_at && `Done ${formatDate(t.done_at.slice(0, 10))}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <span className="hidden sm:block"><AreaBadge area={t.area} /></span>
                {due && (
                  <span className={clsx("w-20 text-right text-xs", due.tone === "late" ? "text-red-600" : due.tone === "soon" ? "text-amber-600" : "text-slate-500")}>
                    {due.text}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <NewAdminTaskModal
          defaultArea={area === "all" ? "outreach" : area}
          onClose={() => setAdding(false)}
          onCreated={(id) => router.push(`/business/${id}`)}
        />
      )}
    </div>
  );
}
