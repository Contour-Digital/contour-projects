"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Client, Project, Stage, Task } from "@/lib/types";
import { daysSince, dueLabel, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { NewProjectModal } from "@/components/projects/NewProjectModal";

type ListProject = Project & { client: Pick<Client, "id" | "name" | "company"> | null };
type TaskSummary = Pick<Task, "project_id" | "stage_id" | "done" | "due_date">;

async function loadProjects() {
  const supabase = createClient();
  const [stages, projects, tasks, clients] = await Promise.all([
    supabase.from("stages").select("*").order("position").then(must),
    supabase
      .from("projects")
      .select("*, client:clients(id,name,company)")
      .eq("archived", false)
      .order("position")
      .then(must),
    supabase.from("tasks").select("project_id,stage_id,done,due_date").then(must),
    supabase.from("clients").select("id,name,company").order("name").then(must),
  ]);
  return {
    stages: stages as Stage[],
    projects: projects as ListProject[],
    tasks: tasks as TaskSummary[],
    clients: clients as Pick<Client, "id" | "name" | "company">[],
  };
}

export default function CurrentProjectsPage() {
  const router = useRouter();
  const { data, setData, reload, loading, error } = useData(loadProjects);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [hideClosed, setHideClosed] = useState(false);

  const tasksByProject = useMemo(() => {
    const map = new Map<string, TaskSummary[]>();
    for (const t of data?.tasks ?? []) {
      const list = map.get(t.project_id) ?? [];
      list.push(t);
      map.set(t.project_id, list);
    }
    return map;
  }, [data?.tasks]);

  // Ordered by stage, then by position within the stage.
  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const stageOrder = new Map(data.stages.map((s, i) => [s.id, i]));
    return data.projects
      .filter((p) => {
        const stage = data.stages.find((s) => s.id === p.stage_id);
        if (hideClosed && stage?.is_closed) return false;
        if (stageFilter && p.stage_id !== stageFilter) return false;
        return (
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.client?.name.toLowerCase().includes(q) ||
          p.client?.company?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (stageOrder.get(a.stage_id) ?? 0) - (stageOrder.get(b.stage_id) ?? 0) || a.position - b.position);
  }, [data, search, stageFilter, hideClosed]);

  if (error) return <p className="text-red-600">Couldn&apos;t load projects: {error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const activeCount = data.projects.filter((p) => !data.stages.find((s) => s.id === p.stage_id)?.is_closed).length;
  const pipeline = data.projects
    .filter((p) => !data.stages.find((s) => s.id === p.stage_id)?.is_closed)
    .reduce((sum, p) => sum + (p.value ?? 0), 0);

  // Moves the project to the bottom of `stageId`, which adds that stage's checklist.
  async function changeStage(projectId: string, stageId: string) {
    if (!data) return;
    const positions = data.projects.filter((p) => p.stage_id === stageId && p.id !== projectId).map((p) => p.position);
    const position = positions.length ? Math.max(...positions) + 1000 : 0;
    setData({
      ...data,
      projects: data.projects.map((p) => (p.id === projectId ? { ...p, stage_id: stageId, position } : p)),
    });
    const { error } = await createClient().from("projects").update({ stage_id: stageId, position }).eq("id", projectId);
    if (error) alert(error.message);
    reload();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Current projects</h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeCount} active · {formatMoney(pipeline) || "$0"} in progress
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-56" placeholder="Search projects or clients" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input w-auto" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} aria-label="Filter by stage">
            <option value="">All stages</option>
            {data.stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
            Hide completed
          </label>
          <Button onClick={() => setCreating(true)}>＋ New project</Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_7rem_6rem_4rem] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid">
          <span>Project</span>
          <span>Stage</span>
          <span>Stage tasks</span>
          <span>Due</span>
          <span className="text-right">Value</span>
          <span className="text-right" title="Days in this stage">Days</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.map((p) => {
            const stage = data.stages.find((s) => s.id === p.stage_id);
            const tasks = tasksByProject.get(p.id) ?? [];
            const stageTasks = tasks.filter((t) => t.stage_id === p.stage_id);
            const done = stageTasks.filter((t) => t.done).length;
            const nextDue = tasks
              .filter((t) => !t.done && t.due_date)
              .map((t) => t.due_date!)
              .sort()[0];
            const due = dueLabel(p.due_date && (!nextDue || p.due_date < nextDue) ? p.due_date : nextDue ?? null);
            return (
              <li
                key={p.id}
                className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_7rem_6rem_4rem]"
                onClick={() => router.push(`/projects/${p.id}`)}
              >
                <div className="min-w-0">
                  <Link href={`/projects/${p.id}`} className="block truncate text-sm font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {p.name}
                  </Link>
                  {p.client && <div className="truncate text-xs text-slate-500">{p.client.company || p.client.name}</div>}
                </div>

                <div className="flex min-w-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage?.color }} />
                  <select
                    className="min-w-0 max-w-full cursor-pointer truncate rounded-md border border-transparent bg-transparent py-1 pr-6 text-sm font-medium text-slate-700 hover:border-slate-200 focus:border-slate-300"
                    value={p.stage_id}
                    aria-label={`Stage for ${p.name}`}
                    onChange={(e) => changeStage(p.id, e.target.value)}
                  >
                    {data.stages.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2 md:col-span-1">
                  {stageTasks.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${(done / stageTasks.length) * 100}%`, backgroundColor: stage?.color }} />
                      </div>
                      <span className="text-[11px] text-slate-500">{done}/{stageTasks.length}</span>
                    </div>
                  ) : (
                    <span className="hidden text-xs text-slate-400 md:inline">No tasks</span>
                  )}
                </div>

                <div className="col-span-2 flex flex-wrap items-center gap-1.5 text-[11px] md:contents">
                  <div>
                    {due && (
                      <span
                        className={clsx(
                          "rounded px-1.5 py-0.5",
                          due.tone === "late" ? "bg-red-50 text-red-700" : due.tone === "soon" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {due.text}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-600 md:text-right md:text-sm">{formatMoney(p.value)}</div>
                  <div className="ml-auto text-slate-400 md:ml-0 md:text-right md:text-sm" title="Days in this stage">
                    {daysSince(p.stage_entered_at)}d
                  </div>
                </div>
              </li>
            );
          })}
          {rows.length === 0 && <li className="p-8 text-center text-sm text-slate-500">No projects match.</li>}
        </ul>
      </div>

      {creating && (
        <NewProjectModal
          stages={data.stages}
          clients={data.clients}
          defaultStageId={stageFilter || data.stages[0]?.id}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/projects/${id}`)}
        />
      )}
    </div>
  );
}
