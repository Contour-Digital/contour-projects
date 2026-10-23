"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Client, Recurrence, SupportSubtask, SupportTag, SupportTask } from "@/lib/types";
import { SUPPORT_TAGS, tagOf } from "@/lib/supportTasks";
import { RECURRENCES, recurrenceLabel } from "@/lib/adminTasks";
import { byClientName } from "@/lib/clients";
import { dueLabel, formatDate, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TagBadge } from "@/components/support/TagBadge";
import { ClientCard } from "@/components/clients/ClientCard";

async function loadTask(id: string) {
  const supabase = createClient();
  const [task, subtasks, clients] = await Promise.all([
    supabase.from("support_tasks").select("*").eq("id", id).single().then(must),
    supabase.from("support_subtasks").select("*").eq("task_id", id).order("position").order("created_at").then(must),
    supabase.from("clients").select("*").order("name").then(must),
  ]);
  return {
    task: task as SupportTask,
    subtasks: subtasks as SupportSubtask[],
    clients: clients as Client[],
  };
}

export default function SupportTaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, setData, reload, error, loading } = useData(() => loadTask(id), [id]);
  const [newSub, setNewSub] = useState("");
  const [editing, setEditing] = useState(false);

  if (error) return <p className="text-red-600">Couldn&apos;t load this task: {error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const { task, subtasks, clients } = data;
  const supabase = createClient();
  const client = clients.find((c) => c.id === task.client_id) ?? null;
  // Offboarded clients aren't offered, unless this task is already theirs.
  const clientOptions = clients.filter((c) => !c.offboarded_at || c.id === task.client_id).sort(byClientName);
  const due = task.done ? null : dueLabel(task.scheduled_date);
  const open = subtasks.filter((s) => !s.done);
  const done = subtasks.filter((s) => s.done);

  async function updateTask(patch: Partial<SupportTask>) {
    setData({ ...data!, task: { ...task, ...patch } });
    const { error } = await supabase.from("support_tasks").update(patch).eq("id", id);
    if (error) alert(error.message);
    reload();
  }

  async function updateSub(subId: string, patch: Partial<SupportSubtask>) {
    setData({ ...data!, subtasks: subtasks.map((s) => (s.id === subId ? { ...s, ...patch } : s)) });
    const { error } = await supabase.from("support_subtasks").update(patch).eq("id", subId);
    if (error) alert(error.message);
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!newSub.trim()) return;
    const maxPos = Math.max(0, ...subtasks.map((s) => s.position));
    const { error } = await supabase.from("support_subtasks").insert({ task_id: id, title: newSub.trim(), position: maxPos + 1 });
    if (error) return alert(error.message);
    setNewSub("");
    reload();
  }

  async function deleteSub(subId: string) {
    await supabase.from("support_subtasks").delete().eq("id", subId);
    reload();
  }

  async function deleteTask() {
    if (!confirm(`Delete "${task.title}" and its subtasks? This can't be undone.`)) return;
    await supabase.from("support_tasks").delete().eq("id", id);
    router.push("/support");
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/support" className="text-sm text-slate-500 hover:text-slate-800">← On-Demand Support</Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={clsx("text-2xl font-semibold tracking-tight", task.done && "text-slate-400 line-through")}>{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <TagBadge tag={task.tag} />
            {task.done ? (
              <span>
                Done {task.done_at ? formatDate(task.done_at.slice(0, 10)) : ""}
                {task.next_created && " · the next one has been scheduled"}
              </span>
            ) : due ? (
              <span className={clsx(due.tone === "late" && "text-red-600", due.tone === "soon" && "text-amber-600")}>
                {due.tone === "ok" ? `Scheduled for ${formatDate(task.scheduled_date)}` : due.text}
              </span>
            ) : (
              <span>Not scheduled</span>
            )}
            {task.recurrence !== "none" && <span>↻ {recurrenceLabel(task.recurrence)}</span>}
            {client && (
              <>
                <span>·</span>
                <Link href={`/clients/${client.id}`} className="hover:text-slate-800 hover:underline">{client.company || client.name}</Link>
              </>
            )}
          </div>
        </div>
        <Button variant={task.done ? "secondary" : "primary"} onClick={() => updateTask({ done: !task.done })}>
          {task.done ? "Reopen" : task.recurrence !== "none" && !task.next_created ? "Mark done and schedule next" : "Mark done"}
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Tasks</h2>
              <span className="text-xs text-slate-400">{done.length}/{subtasks.length}</span>
            </div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {open.map((s) => (
                <SubtaskRow key={s.id} subtask={s} onUpdate={(p) => updateSub(s.id, p)} onDelete={() => deleteSub(s.id)} />
              ))}
              {done.length > 0 && (
                <li>
                  <details>
                    <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700">
                      Completed tasks ({done.length})
                    </summary>
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {done.map((s) => (
                        <SubtaskRow key={s.id} subtask={s} onUpdate={(p) => updateSub(s.id, p)} onDelete={() => deleteSub(s.id)} />
                      ))}
                    </ul>
                  </details>
                </li>
              )}
              <li className="p-2">
                <form onSubmit={addSub} className="flex gap-2">
                  <input className="input" placeholder="Add a task" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
                  <Button variant="secondary" disabled={!newSub.trim()}>Add</Button>
                </form>
              </li>
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Notes</h2>
            <textarea
              key={task.updated_at}
              className="input min-h-[140px]"
              defaultValue={task.notes ?? ""}
              placeholder="What the client asked for, links, logins to use…"
              onBlur={(e) => e.target.value !== (task.notes ?? "") && updateTask({ notes: e.target.value || null })}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Client</h2>
              <select
                className="input w-40 py-1 text-xs"
                value={task.client_id ?? ""}
                onChange={(e) => updateTask({ client_id: e.target.value || null })}
                aria-label="Change client"
              >
                <option value="">No client</option>
                {clientOptions.map((c) => (
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
              <SupportDetailsForm
                task={task}
                onSave={async (patch) => {
                  await updateTask(patch);
                  setEditing(false);
                }}
              />
            ) : (
              <dl className="space-y-2 text-sm">
                <Row label="Tag">{tagOf(task.tag).label}</Row>
                <Row label="Price">{task.price != null ? formatMoney(Number(task.price)) : "—"}</Row>
                <Row label="Scheduled">{formatDate(task.scheduled_date) || "—"}</Row>
                <Row label="Repeat">{recurrenceLabel(task.recurrence)}</Row>
                <Row label="Invoiced">{task.invoiced ? `Yes${task.invoiced_at ? `, ${formatDate(task.invoiced_at.slice(0, 10))}` : ""}` : "No"}</Row>
                <p className="pt-2 text-xs text-slate-500">{tagOf(task.tag).description} · {tagOf(task.tag).priceLabel}</p>
              </dl>
            )}
            <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
              <Button size="sm" variant="secondary" onClick={() => updateTask({ invoiced: !task.invoiced })}>
                {task.invoiced ? "Mark not invoiced" : "Mark invoiced"}
              </Button>
              <Button size="sm" variant="danger" onClick={deleteTask}>Delete</Button>
            </div>
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

function SubtaskRow({
  subtask,
  onUpdate,
  onDelete,
}: {
  subtask: SupportSubtask;
  onUpdate: (patch: Partial<SupportSubtask>) => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 px-3 py-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-brand" checked={subtask.done} onChange={() => onUpdate({ done: !subtask.done })} aria-label={`Mark "${subtask.title}" done`} />
      <input
        key={subtask.title}
        className={clsx("flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-brand focus:outline-none", subtask.done && "text-slate-400 line-through")}
        defaultValue={subtask.title}
        onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== subtask.title && onUpdate({ title: e.target.value.trim() })}
        aria-label="Task"
      />
      <button className="text-slate-300 opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100" onClick={onDelete} aria-label="Delete task">
        ✕
      </button>
    </li>
  );
}

function SupportDetailsForm({ task, onSave }: { task: SupportTask; onSave: (patch: Partial<SupportTask>) => void }) {
  const [form, setForm] = useState({
    title: task.title,
    tag: task.tag,
    price: task.price?.toString() ?? "",
    scheduled_date: task.scheduled_date ?? "",
    recurrence: task.recurrence,
  });

  function changeTag(tag: SupportTag) {
    // Move the price to the new tag's, unless it had been set to something else.
    const custom = form.price !== "" && Number(form.price) !== tagOf(form.tag).price;
    setForm({ ...form, tag, price: custom ? form.price : String(tagOf(tag).price) });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          title: form.title.trim() || task.title,
          tag: form.tag,
          price: form.price === "" ? null : Number(form.price),
          scheduled_date: form.scheduled_date || null,
          recurrence: form.recurrence,
        });
      }}
    >
      <Field label="Name">
        <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </Field>
      <Field label="Tag" hint={`${tagOf(form.tag).description} · ${tagOf(form.tag).priceLabel}`}>
        <select className="input" value={form.tag} onChange={(e) => changeTag(e.target.value as SupportTag)}>
          {SUPPORT_TAGS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Price (AUD)">
        <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Scheduled">
          <input className="input" type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
        </Field>
        <Field label="Repeat">
          <select className="input" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as Recurrence })}>
            {RECURRENCES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </Field>
      </div>
      {form.recurrence !== "none" && (
        <p className="text-xs text-slate-500">When you tick this off, the next one is scheduled with the same client, tag, price and tasks.</p>
      )}
      <Button className="w-full">Save</Button>
    </form>
  );
}
