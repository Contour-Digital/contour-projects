"use client";

import Link from "next/link";
import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Project, Stage, Task } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { StageBadge } from "@/components/ui/StageBadge";

type Row = Task & { project: Pick<Project, "id" | "name" | "stage_id" | "archived"> & { client: { name: string; company: string | null } | null } };

async function load() {
  const supabase = createClient();
  const [tasks, stages] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, project:projects!inner(id,name,stage_id,archived, client:clients(name,company))")
      .eq("done", false)
      .eq("project.archived", false)
      .order("due_date", { nullsFirst: false })
      .then(must),
    supabase.from("stages").select("*").order("position").then(must),
  ]);
  return { tasks: tasks as Row[], stages: stages as Stage[] };
}

export default function TasksPage() {
  const { data, setData, error, loading } = useData(load);
  const [allStages, setAllStages] = useState(false);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const today = format(new Date(), "yyyy-MM-dd");
  const weekEnd = format(addDays(new Date(), 7), "yyyy-MM-dd");
  // By default, only tasks for the stage each project is in now.
  const visible = data.tasks.filter((t) => allStages || !t.stage_id || t.stage_id === t.project.stage_id);
  const groups = [
    { title: "Overdue", tone: "text-red-600", rows: visible.filter((t) => t.due_date && t.due_date < today) },
    { title: "Today", tone: "text-amber-600", rows: visible.filter((t) => t.due_date === today) },
    { title: "Next 7 days", tone: "text-slate-700", rows: visible.filter((t) => t.due_date && t.due_date > today && t.due_date <= weekEnd) },
    { title: "Later", tone: "text-slate-700", rows: visible.filter((t) => t.due_date && t.due_date > weekEnd) },
    { title: "No due date", tone: "text-slate-500", rows: visible.filter((t) => !t.due_date) },
  ];

  async function complete(task: Row) {
    setData({ ...data!, tasks: data!.tasks.filter((t) => t.id !== task.id) });
    await createClient().from("tasks").update({ done: true }).eq("id", task.id);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Tasks"
        subtitle={`${visible.length} open tasks across active projects`}
        actions={
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={allStages} onChange={(e) => setAllStages(e.target.checked)} />
            Include tasks from other stages
          </label>
        }
      />
      <div className="space-y-6">
        {groups.filter((g) => g.rows.length).map((g) => (
          <section key={g.title}>
            <h2 className={`mb-2 text-sm font-semibold ${g.tone}`}>{g.title} · {g.rows.length}</h2>
            <ul className="card divide-y divide-slate-100">
              {g.rows.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand" onChange={() => complete(t)} aria-label={`Complete ${t.title}`} />
                  <div className="min-w-0 flex-1">
                    <div>{t.title}</div>
                    <Link href={`/projects/${t.project.id}`} className="text-xs text-slate-500 hover:underline">
                      {t.project.name}
                      {t.project.client && ` · ${t.project.client.company || t.project.client.name}`}
                    </Link>
                  </div>
                  <StageBadge stage={data.stages.find((s) => s.id === t.stage_id)} />
                  {t.due_date && <span className="w-16 text-right text-xs text-slate-500">{format(parseISO(t.due_date), "d MMM")}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {visible.length === 0 && <p className="card p-8 text-center text-slate-500">Nothing to do. Nice.</p>}
      </div>
    </div>
  );
}
