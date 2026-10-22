"use client";

import Link from "next/link";
import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { AdminTask, Client, Project, Stage, SupportSubtask, SupportTask, Task } from "@/lib/types";
import { recurrenceLabel } from "@/lib/adminTasks";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { StageBadge } from "@/components/ui/StageBadge";
import { AreaBadge } from "@/components/admin/AreaBadge";
import { TagBadge } from "@/components/support/TagBadge";
import { NewAdminTaskModal } from "@/components/admin/NewAdminTaskModal";

type AdminRow = AdminTask & { subtasks: { done: boolean }[] };
type SupportRow = SupportTask & { client: Pick<Client, "name" | "company"> | null; subtasks: Pick<SupportSubtask, "done">[] };
type Row = Task & { project: Pick<Project, "id" | "name" | "stage_id" | "archived"> & { client: { name: string; company: string | null } | null } };

async function load() {
  const supabase = createClient();
  const [tasks, stages, adminTasks, supportTasks] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, project:projects!inner(id,name,stage_id,archived, client:clients(name,company))")
      .eq("done", false)
      .eq("project.archived", false)
      .not("due_date", "is", null)
      .order("due_date")
      .then(must),
    supabase.from("stages").select("*").order("position").then(must),
    supabase
      .from("admin_tasks")
      .select("*")
      .is("parent_id", null)
      .eq("done", false)
      .not("due_date", "is", null)
      .order("due_date")
      .then(must),
    supabase
      .from("support_tasks")
      .select("*, client:clients(name,company), subtasks:support_subtasks(done)")
      .eq("done", false)
      .not("scheduled_date", "is", null)
      .order("scheduled_date")
      .then(must),
  ]);
  const open = adminTasks as AdminTask[];
  const subtasks = open.length
    ? ((await supabase.from("admin_tasks").select("parent_id, done").in("parent_id", open.map((t) => t.id)).then(must)) as Pick<AdminTask, "parent_id" | "done">[])
    : [];
  const withSubtasks: AdminRow[] = open.map((t) => ({ ...t, subtasks: subtasks.filter((s) => s.parent_id === t.id) }));
  return { tasks: tasks as Row[], stages: stages as Stage[], adminTasks: withSubtasks, supportTasks: supportTasks as SupportRow[] };
}

export default function TasksPage() {
  const { data, setData, reload, error, loading } = useData(load);
  const [allStages, setAllStages] = useState(false);
  const [adding, setAdding] = useState(false);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const today = format(new Date(), "yyyy-MM-dd");
  const weekEnd = format(addDays(new Date(), 7), "yyyy-MM-dd");
  // By default, only tasks for the stage each project is in now.
  const visible = data.tasks.filter((t) => allStages || !t.stage_id || t.stage_id === t.project.stage_id);
  const items = [
    ...visible.map((t) => ({ kind: "project" as const, id: t.id, due: t.due_date, task: t })),
    ...data.adminTasks.map((t) => ({ kind: "admin" as const, id: t.id, due: t.due_date, task: t })),
    ...data.supportTasks.map((t) => ({ kind: "support" as const, id: t.id, due: t.scheduled_date, task: t })),
  ].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  const groups = [
    { title: "Overdue", tone: "text-red-600", rows: items.filter((t) => t.due && t.due < today) },
    { title: "Today", tone: "text-amber-600", rows: items.filter((t) => t.due === today) },
    { title: "Next 7 days", tone: "text-slate-700", rows: items.filter((t) => t.due && t.due > today && t.due <= weekEnd) },
    { title: "Later", tone: "text-slate-700", rows: items.filter((t) => t.due && t.due > weekEnd) },
  ];

  async function complete(task: Row) {
    setData({ ...data!, tasks: data!.tasks.filter((t) => t.id !== task.id) });
    await createClient().from("tasks").update({ done: true }).eq("id", task.id);
  }

  async function completeAdmin(task: AdminRow) {
    setData({ ...data!, adminTasks: data!.adminTasks.filter((t) => t.id !== task.id) });
    const { error } = await createClient().from("admin_tasks").update({ done: true }).eq("id", task.id);
    if (error) alert(error.message);
    // A repeating task makes its next one.
    if (task.recurrence !== "none") reload();
  }

  async function completeSupport(task: SupportRow) {
    setData({ ...data!, supportTasks: data!.supportTasks.filter((t) => t.id !== task.id) });
    const { error } = await createClient().from("support_tasks").update({ done: true }).eq("id", task.id);
    if (error) alert(error.message);
    if (task.recurrence !== "none") reload();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Tasks"
        subtitle={`Scheduled work: ${visible.length} project tasks · ${data.adminTasks.length} admin tasks · ${data.supportTasks.length} support tasks`}
        actions={
          <>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={allStages} onChange={(e) => setAllStages(e.target.checked)} />
              Include tasks from other stages
            </label>
            <Button onClick={() => setAdding(true)}>＋ New task</Button>
          </>
        }
      />
      <div className="space-y-6">
        {groups.filter((g) => g.rows.length).map((g) => (
          <section key={g.title}>
            <h2 className={`mb-2 text-sm font-semibold ${g.tone}`}>{g.title} · {g.rows.length}</h2>
            <ul className="card divide-y divide-slate-100">
              {g.rows.map((item) =>
                item.kind === "project" ? (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand" onChange={() => complete(item.task)} aria-label={`Complete ${item.task.title}`} />
                    <div className="min-w-0 flex-1">
                      <div>{item.task.title}</div>
                      <Link href={`/projects/${item.task.project.id}`} className="text-xs text-slate-500 hover:underline">
                        {item.task.project.name}
                        {item.task.project.client && ` · ${item.task.project.client.company || item.task.project.client.name}`}
                      </Link>
                    </div>
                    <StageBadge stage={data.stages.find((s) => s.id === item.task.stage_id)} />
                    {item.due && <span className="w-16 text-right text-xs text-slate-500">{format(parseISO(item.due), "d MMM")}</span>}
                  </li>
                ) : item.kind === "admin" ? (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand" onChange={() => completeAdmin(item.task)} aria-label={`Complete ${item.task.title}`} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/business/${item.id}`} className="hover:underline">{item.task.title}</Link>
                      <div className="text-xs text-slate-500">
                        {[
                          item.task.recurrence !== "none" && `↻ ${recurrenceLabel(item.task.recurrence)}`,
                          item.task.subtasks.length > 0 &&
                            `${item.task.subtasks.filter((s) => s.done).length}/${item.task.subtasks.length} subtasks`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <span className="hidden sm:block"><AreaBadge area={item.task.area} /></span>
                    {item.due && <span className="w-16 text-right text-xs text-slate-500">{format(parseISO(item.due), "d MMM")}</span>}
                  </li>
                ) : (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand" onChange={() => completeSupport(item.task)} aria-label={`Complete ${item.task.title}`} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/support/${item.id}`} className="hover:underline">{item.task.title}</Link>
                      <div className="text-xs text-slate-500">
                        {[
                          item.task.client ? item.task.client.company || item.task.client.name : "On-Demand Support",
                          item.task.recurrence !== "none" && `↻ ${recurrenceLabel(item.task.recurrence)}`,
                          item.task.subtasks.length > 0 &&
                            `${item.task.subtasks.filter((s) => s.done).length}/${item.task.subtasks.length} subtasks`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <span className="hidden sm:block"><TagBadge tag={item.task.tag} /></span>
                    {item.due && <span className="w-16 text-right text-xs text-slate-500">{format(parseISO(item.due), "d MMM")}</span>}
                  </li>
                )
              )}
            </ul>
          </section>
        ))}
        {items.length === 0 && <p className="card p-8 text-center text-slate-500">Nothing to do. Nice.</p>}
      </div>
      {adding && (
        <NewAdminTaskModal
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
