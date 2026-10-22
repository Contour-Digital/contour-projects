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
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TagBadge } from "@/components/support/TagBadge";

async function loadTask(id: string) {
  const supabase = createClient();
  const [task, subtasks, clients] = await Promise.all([
    supabase.from("support_tasks").select("*").eq("id", id).single().then(must),
    supabase.from("support_subtasks").select("*").eq("task_id", id).order("position").order("created_at").then(must),
    supabase.from("clients").select("id,name,company,offboarded_at").order("name").then(must),
  ]);
  return {
    task: task as SupportTask,
    subtasks: subtasks as SupportSubtask[],
    clients: clients as Pick<Client, "id" | "name" | "company" | "offboarded_at">[],
  };
}

export default function SupportTaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, setData, reload, error, loading } = useData(() => loadTask(id), [id]);
  const [newSub, setNewSub] = useState("");

  if (error) return <p className="text-red-600">Couldn&apos;t load this task: {error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const { task, subtasks, clients } = data;
  const supabase = createClient();
  const client = clients.find((c) => c.id === task.client_id);
  // Offboarded clients aren't offered, unless this task is already theirs.
  const clientOptions = clients.filter((c) => !c.offboarded_at || c.id === task.client_id).sort(byClientName);

  async function updateTask(patch: Partial<SupportTask>) {
    setData({ ...data!, task: { ...task, ...patch } });
    const { error } = await supabase.from("support_tasks").update(patch).eq("id", id);
    if (error) alert(error.message);
    reload();
  }

  function changeTag(tag: SupportTag) {
    // Move the price to the new tag's, unless it had been set to something else.
    const keepPrice = task.price != null && Number(task.price) !== tagOf(task.tag).price;
    updateTask(keepPrice ? { tag } : { tag, price: tagOf(tag).price });
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

  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/support" className="text-sm text-slate-500 hover:text-slate-800">← On-Demand Support</Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <input
            key={task.updated_at}
            className={clsx("w-full rounded-lg border border-transparent bg-transparent px-1 text-2xl font-semibold tracking-tight hover:border-slate-200 focus:border-brand focus:outline-none", task.done && "text-slate-400 line-through")}
            defaultValue={task.title}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== task.title && updateTask({ title: e.target.value.trim() })}
            aria-label="Task name"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-sm text-slate-500">
            {client ? <Link href={`/clients/${client.id}`} className="hover:underline">{client.company || client.name}</Link> : <span>No client</span>}
            <TagBadge tag={task.tag} />
            <span>
              {task.done
                ? `Done ${task.done_at ? formatDate(task.done_at.slice(0, 10)) : ""}${task.next_created ? " · the next one has been scheduled" : ""}`
                : task.scheduled_date
                  ? `Scheduled for ${formatDate(task.scheduled_date)}`
                  : "Not scheduled"}
            </span>
            {task.recurrence !== "none" && <span>↻ {recurrenceLabel(task.recurrence)}</span>}
          </div>
        </div>
        <Button variant={task.done ? "secondary" : "primary"} onClick={() => updateTask({ done: !task.done })}>
          {task.done ? "Reopen" : task.recurrence !== "none" && !task.next_created ? "Mark done and schedule next" : "Mark done"}
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">
              Subtasks
              {subtasks.length > 0 && <span className="ml-2 text-sm font-normal text-slate-500">{doneCount}/{subtasks.length} done</span>}
            </h2>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {subtasks.map((s) => (
                <li key={s.id} className="group flex items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand" checked={s.done} onChange={() => updateSub(s.id, { done: !s.done })} aria-label={`Mark "${s.title}" done`} />
                  <input
                    key={s.title}
                    className={clsx("flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-brand focus:outline-none", s.done && "text-slate-400 line-through")}
                    defaultValue={s.title}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.title && updateSub(s.id, { title: e.target.value.trim() })}
                    aria-label="Subtask"
                  />
                  <button className="text-slate-300 opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100" onClick={() => deleteSub(s.id)} aria-label="Delete subtask">
                    ✕
                  </button>
                </li>
              ))}
              <li className="p-2">
                <form onSubmit={addSub} className="flex gap-2">
                  <input className="input" placeholder="Add a subtask" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
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
          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">Details</h2>
            <Field label="Client">
              <select className="input" value={task.client_id ?? ""} onChange={(e) => updateTask({ client_id: e.target.value || null })}>
                <option value="">No client</option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.company ? `${c.company} (${c.name})` : c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Scheduled for">
              <input className="input" type="date" value={task.scheduled_date ?? ""} onChange={(e) => updateTask({ scheduled_date: e.target.value || null })} />
            </Field>
            <Field label="Repeat" hint={task.recurrence !== "none" ? "When you tick this off, the next one is scheduled with the same client, tag, price and subtasks." : undefined}>
              <select className="input" value={task.recurrence} onChange={(e) => updateTask({ recurrence: e.target.value as Recurrence })}>
                {RECURRENCES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Tag" hint={`${tagOf(task.tag).description} · ${tagOf(task.tag).priceLabel}`}>
              <select className="input" value={task.tag} onChange={(e) => changeTag(e.target.value as SupportTag)}>
                {SUPPORT_TAGS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Price (AUD)">
              <input
                key={`${task.updated_at}-${task.price}`}
                className="input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                defaultValue={task.price ?? ""}
                onBlur={(e) => {
                  const price = e.target.value === "" ? null : Number(e.target.value);
                  if (price !== (task.price == null ? null : Number(task.price))) updateTask({ price });
                }}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={task.invoiced} onChange={() => updateTask({ invoiced: !task.invoiced })} />
              Invoiced
              {task.invoiced && task.invoiced_at && <span className="text-xs text-slate-500">{formatDate(task.invoiced_at.slice(0, 10))}</span>}
            </label>
            <div className="border-t border-slate-100 pt-3">
              <Button size="sm" variant="danger" onClick={deleteTask}>Delete task</Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
