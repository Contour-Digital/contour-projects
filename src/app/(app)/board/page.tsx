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

type BoardProject = Project & { client: Pick<Client, "id" | "name" | "company"> | null };
type TaskSummary = Pick<Task, "project_id" | "stage_id" | "done" | "due_date">;

async function loadBoard() {
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
    projects: projects as BoardProject[],
    tasks: tasks as TaskSummary[],
    clients: clients as Pick<Client, "id" | "name" | "company">[],
  };
}

export default function BoardPage() {
  const router = useRouter();
  const { data, setData, reload, loading, error } = useData(loadBoard);
  const [search, setSearch] = useState("");
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ stageId: string; beforeId: string | null } | null>(null);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.projects ?? []).filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.client?.name.toLowerCase().includes(q) ||
        p.client?.company?.toLowerCase().includes(q)
    );
  }, [data?.projects, search]);

  if (error) return <p className="text-red-600">Couldn&apos;t load the board: {error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const columns = data.stages.filter((s) => !(hideClosed && s.is_closed));
  const activeCount = data.projects.filter((p) => !data.stages.find((s) => s.id === p.stage_id)?.is_closed).length;
  const pipeline = data.projects
    .filter((p) => !data.stages.find((s) => s.id === p.stage_id)?.is_closed)
    .reduce((sum, p) => sum + (p.value ?? 0), 0);

  // Drops the project into `stageId`, just above `beforeId` (or at the bottom).
  async function moveProject(projectId: string, stageId: string, beforeId: string | null) {
    if (!data || projectId === beforeId) return;
    const column = data.projects
      .filter((p) => p.stage_id === stageId && p.id !== projectId)
      .sort((a, b) => a.position - b.position);
    const index = beforeId ? column.findIndex((p) => p.id === beforeId) : column.length;
    const before = column[index - 1]?.position;
    const after = column[index]?.position;
    const position =
      before == null && after == null ? 0 : before == null ? after! - 1000 : after == null ? before + 1000 : (before + after) / 2;

    const moving = data.projects.find((p) => p.id === projectId);
    if (!moving) return;
    // Optimistic update so the card lands immediately.
    setData({
      ...data,
      projects: data.projects.map((p) => (p.id === projectId ? { ...p, stage_id: stageId, position } : p)),
    });
    const { error } = await createClient().from("projects").update({ stage_id: stageId, position }).eq("id", projectId);
    if (error) alert(error.message);
    // Reload: moving stage adds that stage's tasks.
    if (moving.stage_id !== stageId || error) reload();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeCount} active · {formatMoney(pipeline) || "$0"} in progress
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-56" placeholder="Search projects or clients" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
            Hide completed
          </label>
          <Button onClick={() => setCreatingIn(data.stages[0]?.id ?? "")}>＋ New project</Button>
        </div>
      </div>

      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        {columns.map((stage) => {
          const cards = filtered.filter((p) => p.stage_id === stage.id).sort((a, b) => a.position - b.position);
          const isTarget = dropTarget?.stageId === stage.id;
          return (
            <section
              key={stage.id}
              className={clsx(
                "flex w-72 shrink-0 flex-col rounded-xl bg-slate-100/80 p-2 transition",
                isTarget && "ring-2 ring-brand/40"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isTarget) setDropTarget({ stageId: stage.id, beforeId: null });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dropTarget) moveProject(dragId, stage.id, dropTarget.beforeId);
                setDragId(null);
                setDropTarget(null);
              }}
            >
              <header className="flex items-center justify-between px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <h2 className="text-sm font-semibold text-slate-700">{stage.name}</h2>
                  <span className="text-xs text-slate-400">{cards.length}</span>
                </div>
                <button
                  className="rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-white hover:text-slate-700"
                  title={`New project in ${stage.name}`}
                  onClick={() => setCreatingIn(stage.id)}
                >
                  +
                </button>
              </header>

              <div className="flex min-h-[60px] flex-1 flex-col gap-2">
                {cards.map((p, i) => {
                  const tasks = tasksByProject.get(p.id) ?? [];
                  const stageTasks = tasks.filter((t) => t.stage_id === stage.id);
                  const done = stageTasks.filter((t) => t.done).length;
                  const nextDue = tasks
                    .filter((t) => !t.done && t.due_date)
                    .map((t) => t.due_date!)
                    .sort()[0];
                  const due = dueLabel(p.due_date && (!nextDue || p.due_date < nextDue) ? p.due_date : nextDue ?? null);
                  return (
                    <div key={p.id}>
                      {isTarget && dropTarget?.beforeId === p.id && dragId !== p.id && <div className="mb-2 h-1 rounded bg-brand/50" />}
                      <Link
                        href={`/projects/${p.id}`}
                        draggable
                        onDragStart={(e) => {
                          setDragId(p.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDropTarget(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const beforeId = e.clientY < rect.top + rect.height / 2 ? p.id : cards[i + 1]?.id ?? null;
                          if (dropTarget?.stageId !== stage.id || dropTarget.beforeId !== beforeId) setDropTarget({ stageId: stage.id, beforeId });
                        }}
                        className={clsx(
                          "block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow",
                          dragId === p.id && "opacity-40"
                        )}
                      >
                        <div className="text-sm font-medium leading-snug">{p.name}</div>
                        {p.client && (
                          <div className="mt-0.5 truncate text-xs text-slate-500">{p.client.company || p.client.name}</div>
                        )}
                        {stageTasks.length > 0 && (
                          <div className="mt-2.5">
                            <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                              <span>Stage tasks</span>
                              <span>{done}/{stageTasks.length}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full" style={{ width: `${(done / stageTasks.length) * 100}%`, backgroundColor: stage.color }} />
                            </div>
                          </div>
                        )}
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
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
                          {p.value != null && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{formatMoney(p.value)}</span>}
                          <span className="ml-auto text-slate-400" title="Days in this stage">{daysSince(p.stage_entered_at)}d</span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
                {isTarget && dropTarget?.beforeId === null && <div className="h-1 rounded bg-brand/50" />}
              </div>
            </section>
          );
        })}
      </div>

      {creatingIn !== null && (
        <NewProjectModal
          stages={data.stages}
          clients={data.clients}
          defaultStageId={creatingIn}
          onClose={() => setCreatingIn(null)}
          onCreated={(id) => router.push(`/projects/${id}`)}
        />
      )}
    </div>
  );
}
