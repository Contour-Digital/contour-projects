"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Stage, StageTaskTemplate, WorkStatus } from "@/lib/types";
import { PICKABLE_STATUSES, statusOf } from "@/lib/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

async function load() {
  const supabase = createClient();
  const [stages, templates, projects] = await Promise.all([
    supabase.from("stages").select("*").order("position").then(must),
    supabase.from("stage_task_templates").select("*").order("position").then(must),
    supabase.from("projects").select("id,stage_id").eq("archived", false).then(must),
  ]);
  return {
    stages: stages as Stage[],
    templates: templates as StageTaskTemplate[],
    projects: projects as { id: string; stage_id: string }[],
  };
}

export default function StagesSettingsPage() {
  const { data, reload, error, loading } = useData(load);
  const [newStage, setNewStage] = useState("");

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;
  const supabase = createClient();

  async function run(op: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await op;
    if (error) alert(error.message);
    reload();
  }

  async function swap(a: Stage, b: Stage) {
    await supabase.from("stages").update({ position: b.position }).eq("id", a.id);
    await run(supabase.from("stages").update({ position: a.position }).eq("id", b.id));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Stages & automations"
        subtitle="Each stage has a task checklist. When a project enters a stage, its checklist is added to the project automatically. A checklist item can also change the project's status when it's ticked off. Projects entering a finished stage are marked Completed."
      />

      <div className="space-y-4">
        {data.stages.map((stage, i) => (
          <StageCard
            key={stage.id}
            stage={stage}
            templates={data.templates.filter((t) => t.stage_id === stage.id)}
            projectIds={data.projects.filter((p) => p.stage_id === stage.id).map((p) => p.id)}
            isLast={i === data.stages.length - 1}
            onUpdate={(patch) => run(supabase.from("stages").update(patch).eq("id", stage.id))}
            onMoveUp={i > 0 ? () => swap(stage, data.stages[i - 1]) : undefined}
            onMoveDown={i < data.stages.length - 1 ? () => swap(stage, data.stages[i + 1]) : undefined}
            onDelete={() => {
              if (data.projects.some((p) => p.stage_id === stage.id)) {
                return alert("Move the projects out of this stage before deleting it.");
              }
              if (confirm(`Delete the ${stage.name} stage and its checklist?`)) run(supabase.from("stages").delete().eq("id", stage.id));
            }}
            reload={reload}
          />
        ))}
      </div>

      <form
        className="card mt-4 flex gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newStage.trim()) return;
          const position = Math.max(0, ...data.stages.map((s) => s.position)) + 1;
          run(supabase.from("stages").insert({ name: newStage.trim(), position }));
          setNewStage("");
        }}
      >
        <input className="input" placeholder="New stage name" value={newStage} onChange={(e) => setNewStage(e.target.value)} />
        <Button disabled={!newStage.trim()}>Add stage</Button>
      </form>
    </div>
  );
}

function StageCard({
  stage,
  templates,
  projectIds,
  isLast,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDelete,
  reload,
}: {
  stage: Stage;
  templates: StageTaskTemplate[];
  projectIds: string[];
  isLast: boolean;
  onUpdate: (patch: Partial<Stage>) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(stage.name);
  const [title, setTitle] = useState("");
  const [offset, setOffset] = useState("");
  const [setsStatus, setSetsStatus] = useState<WorkStatus | "">("");
  const [lastAdded, setLastAdded] = useState<StageTaskTemplate | null>(null);
  const supabase = createClient();

  async function addTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const position = Math.max(-1, ...templates.map((t) => t.position)) + 1;
    const { data, error } = await supabase
      .from("stage_task_templates")
      .insert({
        stage_id: stage.id,
        title: title.trim(),
        due_offset_days: offset === "" ? null : Number(offset),
        sets_status: setsStatus || null,
        position,
      })
      .select("*")
      .single();
    if (error) return alert(error.message);
    setTitle("");
    setOffset("");
    setSetsStatus("");
    setLastAdded(data as StageTaskTemplate);
    reload();
  }

  // New checklist items only apply to projects entering the stage from now on;
  // this pushes one onto projects that are already there.
  async function applyToExisting(t: StageTaskTemplate) {
    const due = t.due_offset_days == null ? null : new Date(Date.now() + t.due_offset_days * 86_400_000).toISOString().slice(0, 10);
    const { error } = await supabase.from("tasks").insert(
      projectIds.map((pid) => ({ project_id: pid, stage_id: stage.id, template_id: t.id, title: t.title, notes: t.description, due_date: due, position: t.position }))
    );
    if (error) return alert(error.message);
    setLastAdded(null);
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <input
          type="color"
          className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          value={stage.color}
          onChange={(e) => onUpdate({ color: e.target.value })}
          aria-label="Stage colour"
        />
        <input
          className="input max-w-[220px] font-medium"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== stage.name && onUpdate({ name: name.trim() })}
          aria-label="Stage name"
        />
        <span className="text-xs text-slate-500">{projectIds.length} projects · {templates.length} tasks</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={!onMoveUp} onClick={onMoveUp} aria-label="Move up">↑</Button>
          <Button size="sm" variant="ghost" disabled={!onMoveDown} onClick={onMoveDown} aria-label="Move down">↓</Button>
          <Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>{open ? "Close" : "Edit checklist"}</Button>
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-brand" checked={stage.auto_advance} disabled={isLast} onChange={(e) => onUpdate({ auto_advance: e.target.checked })} />
              Move to the next stage automatically when every task here is done
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-brand" checked={stage.is_closed} onChange={(e) => onUpdate({ is_closed: e.target.checked })} />
              Counts as finished (not active work)
            </label>
          </div>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">{t.title}</span>
                <StatusSetting
                  value={t.sets_status}
                  onChange={async (sets_status) => {
                    const { error } = await supabase.from("stage_task_templates").update({ sets_status }).eq("id", t.id);
                    if (error) alert(error.message);
                    reload();
                  }}
                />
                <span className="text-xs text-slate-500">
                  {t.due_offset_days == null ? "no due date" : `due ${t.due_offset_days === 0 ? "same day" : `+${t.due_offset_days}d`}`}
                </span>
                <button
                  className="text-slate-300 hover:text-red-600"
                  aria-label="Remove task"
                  onClick={async () => {
                    await supabase.from("stage_task_templates").delete().eq("id", t.id);
                    reload();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
            {templates.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No checklist for this stage yet.</li>}
          </ul>

          <form onSubmit={addTemplate} className="flex flex-wrap gap-2">
            <input className="input min-w-[200px] flex-1" placeholder="Task, e.g. Send invoice" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input
              className="input w-36"
              type="number"
              min="0"
              placeholder="Due after (days)"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              aria-label="Due this many days after entering the stage"
            />
            <StatusSetting value={setsStatus || null} onChange={(v) => setSetsStatus(v ?? "")} boxed />
            <Button disabled={!title.trim()}>Add task</Button>
          </form>

          {lastAdded && projectIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-soft/50 p-3 text-sm">
              <span>Also add &ldquo;{lastAdded.title}&rdquo; to the {projectIds.length} project{projectIds.length === 1 ? "" : "s"} already in {stage.name}?</span>
              <Button size="sm" onClick={() => applyToExisting(lastAdded)}>Add to them</Button>
              <Button size="sm" variant="ghost" onClick={() => setLastAdded(null)}>No thanks</Button>
            </div>
          )}

          <button className="text-xs text-slate-400 hover:text-red-600" onClick={onDelete}>Delete stage</button>
        </div>
      )}
    </div>
  );
}

/** "When ticked, set the project's status to…" for one checklist item. */
function StatusSetting({ value, onChange, boxed }: { value: WorkStatus | null; onChange: (v: WorkStatus | null) => void; boxed?: boolean }) {
  return (
    <select
      className={boxed ? "input w-auto" : "rounded-md border border-transparent bg-transparent py-0.5 pr-6 text-xs hover:border-slate-200"}
      style={value ? { color: statusOf(value).color } : undefined}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as WorkStatus | null)}
      aria-label="When ticked off, set the project status to"
      title="When ticked off, set the project status to"
    >
      <option value="">{boxed ? "Status unchanged" : "No status change"}</option>
      {PICKABLE_STATUSES.map((s) => (
        <option key={s.value} value={s.value}>Sets {s.label}</option>
      ))}
    </select>
  );
}
