"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Activity, Client, Project, ProjectNote, Stage, Task } from "@/lib/types";
import { byClientName } from "@/lib/clients";
import { daysSince, dueLabel, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { StageBadge } from "@/components/ui/StageBadge";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { ClientCard } from "@/components/clients/ClientCard";

async function loadProject(id: string) {
  const supabase = createClient();
  const [project, stages, tasks, notes, activity, clients] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single().then(must),
    supabase.from("stages").select("*").order("position").then(must),
    supabase.from("tasks").select("*").eq("project_id", id).order("position").order("created_at").then(must),
    supabase.from("project_notes").select("*").eq("project_id", id).order("created_at", { ascending: false }).then(must),
    supabase.from("activity").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(30).then(must),
    supabase.from("clients").select("*").order("name").then(must),
  ]);
  return {
    project: project as Project,
    stages: stages as Stage[],
    tasks: tasks as Task[],
    notes: notes as ProjectNote[],
    activity: activity as Activity[],
    clients: clients as Client[],
  };
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, setData, reload, error, loading } = useData(() => loadProject(id), [id]);
  const [newTask, setNewTask] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);

  if (error) return <p className="text-red-600">Couldn&apos;t load this project: {error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const { project, stages, tasks } = data;
  const supabase = createClient();
  const stage = stages.find((s) => s.id === project.stage_id);
  const client = data.clients.find((c) => c.id === project.client_id) ?? null;
  const stageIndex = stages.findIndex((s) => s.id === project.stage_id);
  const nextStage = stages[stageIndex + 1];

  async function updateProject(patch: Partial<Project>) {
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) return alert(error.message);
    reload();
  }

  async function toggleTask(task: Task) {
    // Optimistic tick, then reload in case the stage auto-advanced.
    setData({ ...data!, tasks: tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)) });
    const { error } = await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
    if (error) alert(error.message);
    reload();
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    const maxPos = Math.max(0, ...tasks.filter((t) => t.stage_id === project.stage_id).map((t) => t.position));
    const { error } = await supabase
      .from("tasks")
      .insert({ project_id: id, stage_id: project.stage_id, title: newTask.trim(), position: maxPos + 1 });
    if (error) return alert(error.message);
    setNewTask("");
    reload();
  }

  async function updateTask(taskId: string, patch: Partial<Task>) {
    const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
    if (error) alert(error.message);
    reload();
  }

  async function deleteTask(taskId: string) {
    await supabase.from("tasks").delete().eq("id", taskId);
    reload();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    const { error } = await supabase.from("project_notes").insert({ project_id: id, body: note.trim() });
    if (error) return alert(error.message);
    setNote("");
    reload();
  }

  async function deleteProject() {
    if (!confirm(`Delete "${project.name}" and all its tasks and notes? This can't be undone.`)) return;
    await supabase.from("projects").delete().eq("id", id);
    router.push("/projects");
  }

  // Current stage first, then the others in stage order, then tasks with no stage.
  const groups: { key: string; title: string; stage?: Stage; tasks: Task[] }[] = [];
  const ordered = [stage, ...stages.filter((s) => s.id !== project.stage_id)].filter(Boolean) as Stage[];
  for (const s of ordered) {
    const list = tasks.filter((t) => t.stage_id === s.id);
    if (list.length || s.id === project.stage_id) groups.push({ key: s.id, title: s.name, stage: s, tasks: list });
  }
  const loose = tasks.filter((t) => !t.stage_id || !stages.some((s) => s.id === t.stage_id));
  if (loose.length) groups.push({ key: "general", title: "General", tasks: loose });

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/projects" className="text-sm text-slate-500 hover:text-slate-800">← Current Projects</Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <StageBadge stage={stage} />
            <StatusPicker status={project.status} label="Project status" onChange={(status) => updateProject({ status })} />
            <span>{daysSince(project.stage_entered_at)} days in stage</span>
            {client && (
              <>
                <span>·</span>
                <Link href={`/clients/${client.id}`} className="hover:text-slate-800 hover:underline">{client.company || client.name}</Link>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-auto"
            value={project.stage_id}
            onChange={(e) => updateProject({ stage_id: e.target.value })}
            aria-label="Stage"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {nextStage && (
            <Button onClick={() => updateProject({ stage_id: nextStage.id })}>Move to {nextStage.name} →</Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Tasks</h2>
            <div className="space-y-5">
              {groups.map((g) => {
                const done = g.tasks.filter((t) => t.done).length;
                const isCurrent = g.stage?.id === project.stage_id;
                return (
                  <div key={g.key}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {g.stage && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.stage.color }} />}
                        {g.title}
                        {isCurrent && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand-strong">current</span>}
                        {isCurrent && g.stage?.auto_advance && (
                          <span className="font-normal normal-case tracking-normal text-slate-400">auto-advances when done</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{done}/{g.tasks.length}</span>
                    </div>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                      {g.tasks.filter((t) => !t.done).map((t) => (
                        <TaskRow key={t.id} task={t} onToggle={() => toggleTask(t)} onUpdate={(p) => updateTask(t.id, p)} onDelete={() => deleteTask(t.id)} />
                      ))}
                      {done > 0 && (
                        <li>
                          <details>
                            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700">
                              Completed tasks ({done})
                            </summary>
                            <ul className="divide-y divide-slate-100 border-t border-slate-100">
                              {g.tasks.filter((t) => t.done).map((t) => (
                                <TaskRow key={t.id} task={t} onToggle={() => toggleTask(t)} onUpdate={(p) => updateTask(t.id, p)} onDelete={() => deleteTask(t.id)} />
                              ))}
                            </ul>
                          </details>
                        </li>
                      )}
                      {isCurrent && (
                        <li className="p-2">
                          <form onSubmit={addTask} className="flex gap-2">
                            <input className="input" placeholder="Add a task to this stage" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
                            <Button variant="secondary" disabled={!newTask.trim()}>Add</Button>
                          </form>
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Notes</h2>
            <form onSubmit={addNote} className="space-y-2">
              <textarea className="input min-h-[70px]" placeholder="Add a note, call summary, decision…" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex justify-end">
                <Button disabled={!note.trim()}>Add note</Button>
              </div>
            </form>
            <ul className="mt-4 space-y-3">
              {data.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <div className="mt-1.5 flex justify-between text-xs text-slate-400">
                    <span>{n.author_email} · {format(parseISO(n.created_at), "d MMM yyyy, h:mm a")}</span>
                    <button
                      className="hover:text-red-600"
                      onClick={async () => {
                        if (!confirm("Delete this note?")) return;
                        await supabase.from("project_notes").delete().eq("id", n.id);
                        reload();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Client</h2>
              <select
                className="input w-40 py-1 text-xs"
                value={project.client_id ?? ""}
                onChange={(e) => updateProject({ client_id: e.target.value || null })}
                aria-label="Change client"
              >
                <option value="">No client</option>
                {[...data.clients].sort(byClientName).map((c) => (
                  <option key={c.id} value={c.id}>{c.company || c.name}</option>
                ))}
              </select>
            </div>
            {client ? <ClientCard client={client} /> : <p className="text-sm text-slate-500">No client linked yet.</p>}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Details</h2>
              <button className="text-sm text-brand-strong hover:underline" onClick={() => setEditing(!editing)}>
                {editing ? "Cancel" : "Edit"}
              </button>
            </div>
            {editing ? (
              <ProjectDetailsForm
                project={project}
                onSave={async (patch) => {
                  await updateProject(patch);
                  setEditing(false);
                }}
              />
            ) : (
              <dl className="space-y-2 text-sm">
                <Row label="Value">{project.value != null ? `$${Number(project.value).toLocaleString("en-AU")}` : "—"}</Row>
                <Row label="Start">{formatDate(project.start_date) || "—"}</Row>
                <Row label="Due">{formatDate(project.due_date) || "—"}</Row>
                {project.description && <p className="whitespace-pre-wrap pt-2 text-slate-600">{project.description}</p>}
              </dl>
            )}
            <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
              <Button size="sm" variant="secondary" onClick={() => updateProject({ archived: !project.archived })}>
                {project.archived ? "Unarchive" : "Archive"}
              </Button>
              <Button size="sm" variant="danger" onClick={deleteProject}>Delete</Button>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Activity</h2>
            <ul className="space-y-2 text-sm">
              {data.activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span className="text-slate-700">{a.message}</span>
                  <span className="shrink-0 text-xs text-slate-400">{format(parseISO(a.created_at), "d MMM")}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onUpdate,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onUpdate: (patch: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const due = task.done ? null : dueLabel(task.due_date);
  return (
    <li className="group flex items-center gap-3 px-3 py-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-brand" checked={task.done} onChange={onToggle} aria-label={`Mark "${task.title}" done`} />
      <span className={clsx("flex-1", task.done && "text-slate-400 line-through")}>{task.title}</span>
      {due && (
        <span className={clsx("text-xs", due.tone === "late" ? "text-red-600" : due.tone === "soon" ? "text-amber-600" : "text-slate-400")}>
          {due.text}
        </span>
      )}
      <input
        type="date"
        className="w-[7.5rem] rounded border-0 bg-transparent p-0 text-xs text-slate-400 opacity-0 focus:opacity-100 group-hover:opacity-100"
        value={task.due_date ?? ""}
        onChange={(e) => onUpdate({ due_date: e.target.value || null })}
        aria-label="Due date"
      />
      <button className="text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100" onClick={onDelete} aria-label="Delete task">
        ✕
      </button>
    </li>
  );
}

function ProjectDetailsForm({ project, onSave }: { project: Project; onSave: (patch: Partial<Project>) => void }) {
  const [form, setForm] = useState({
    name: project.name,
    value: project.value?.toString() ?? "",
    start_date: project.start_date ?? "",
    due_date: project.due_date ?? "",
    description: project.description ?? "",
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name.trim() || project.name,
          value: form.value ? Number(form.value) : null,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          description: form.description.trim() || null,
        });
      }}
    >
      <Field label="Name">
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Value (AUD)">
        <input className="input" type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start">
          <input className="input" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </Field>
        <Field label="Due">
          <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </Field>
      </div>
      <Field label="Description">
        <textarea className="input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <Button className="w-full">Save</Button>
    </form>
  );
}
