"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { AdminArea, AdminTask, AdminTaskClient, Client, Recurrence } from "@/lib/types";
import { AREAS, RECURRENCES } from "@/lib/adminTasks";
import { dueLabel, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

async function loadTask(id: string) {
  const supabase = createClient();
  const [task, subtasks, recipients, clients] = await Promise.all([
    supabase.from("admin_tasks").select("*").eq("id", id).single().then(must),
    supabase.from("admin_tasks").select("*").eq("parent_id", id).order("position").order("created_at").then(must),
    supabase.from("admin_task_clients").select("*").eq("task_id", id).order("created_at").then(must),
    supabase.from("clients").select("*").order("name").then(must),
  ]);
  return {
    task: task as AdminTask,
    subtasks: subtasks as AdminTask[],
    recipients: recipients as AdminTaskClient[],
    clients: clients as Client[],
  };
}

const clientName = (c: Client | undefined) => (c ? c.company || c.name : "Deleted client");

export default function AdminTaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, setData, reload, error, loading } = useData(() => loadTask(id), [id]);
  const [newSub, setNewSub] = useState("");
  const [newSubDue, setNewSubDue] = useState("");
  const [addClientId, setAddClientId] = useState("");

  if (error) return <p className="text-red-600">Couldn&apos;t load this task: {error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const { task, subtasks, recipients, clients } = data;
  const supabase = createClient();
  const listed = new Set(recipients.map((r) => r.client_id));
  const unlisted = clients.filter((c) => !listed.has(c.id));

  async function updateTask(patch: Partial<AdminTask>) {
    setData({ ...data!, task: { ...task, ...patch } });
    const { error } = await supabase.from("admin_tasks").update(patch).eq("id", id);
    if (error) alert(error.message);
    reload();
  }

  async function updateSub(subId: string, patch: Partial<AdminTask>) {
    setData({ ...data!, subtasks: subtasks.map((s) => (s.id === subId ? { ...s, ...patch } : s)) });
    const { error } = await supabase.from("admin_tasks").update(patch).eq("id", subId);
    if (error) alert(error.message);
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!newSub.trim()) return;
    const maxPos = Math.max(0, ...subtasks.map((s) => s.position));
    const { error } = await supabase
      .from("admin_tasks")
      .insert({ parent_id: id, area: task.area, title: newSub.trim(), due_date: newSubDue || null, position: maxPos + 1 });
    if (error) return alert(error.message);
    setNewSub("");
    setNewSubDue("");
    reload();
  }

  async function deleteSub(subId: string) {
    await supabase.from("admin_tasks").delete().eq("id", subId);
    reload();
  }

  async function addClients(ids: string[]) {
    if (!ids.length) return;
    const { error } = await supabase.from("admin_task_clients").insert(ids.map((client_id) => ({ task_id: id, client_id })));
    if (error) return alert(error.message);
    setAddClientId("");
    reload();
  }

  async function updateRecipient(clientId: string, patch: Partial<AdminTaskClient>) {
    setData({ ...data!, recipients: recipients.map((r) => (r.client_id === clientId ? { ...r, ...patch } : r)) });
    const { error } = await supabase.from("admin_task_clients").update(patch).eq("task_id", id).eq("client_id", clientId);
    if (error) alert(error.message);
  }

  async function removeRecipient(clientId: string) {
    await supabase.from("admin_task_clients").delete().eq("task_id", id).eq("client_id", clientId);
    reload();
  }

  async function deleteTask() {
    if (!confirm(`Delete "${task.title}" with its subtasks and client list? This can't be undone.`)) return;
    await supabase.from("admin_tasks").delete().eq("id", id);
    router.push("/business");
  }

  const due = task.done ? null : dueLabel(task.due_date);
  const emailedCount = recipients.filter((r) => r.emailed).length;
  const emails = recipients
    .filter((r) => !r.emailed)
    .map((r) => clients.find((c) => c.id === r.client_id)?.email)
    .filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/business" className="text-sm text-slate-500 hover:text-slate-800">← Business &amp; Outreach</Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <input
            key={task.updated_at}
            className={clsx("w-full rounded-lg border border-transparent bg-transparent px-1 text-2xl font-semibold tracking-tight hover:border-slate-200 focus:border-brand focus:outline-none", task.done && "text-slate-400 line-through")}
            defaultValue={task.title}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== task.title && updateTask({ title: e.target.value.trim() })}
            aria-label="Task title"
          />
          <div className="mt-1 px-1 text-sm text-slate-500">
            {task.done
              ? `Done ${task.done_at ? formatDate(task.done_at.slice(0, 10)) : ""}${task.next_created ? " · the next one has been created" : ""}`
              : due && <span className={clsx(due.tone === "late" && "text-red-600", due.tone === "soon" && "text-amber-600")}>{due.text}</span>}
          </div>
        </div>
        <Button variant={task.done ? "secondary" : "primary"} onClick={() => updateTask({ done: !task.done })}>
          {task.done ? "Reopen" : task.recurrence !== "none" ? "Mark done and schedule next" : "Mark done"}
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Subtasks</h2>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {subtasks.map((s) => {
                const sDue = s.done ? null : dueLabel(s.due_date);
                return (
                  <li key={s.id} className="group flex items-center gap-3 px-3 py-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand" checked={s.done} onChange={() => updateSub(s.id, { done: !s.done })} aria-label={`Mark "${s.title}" done`} />
                    <span className={clsx("flex-1", s.done && "text-slate-400 line-through")}>{s.title}</span>
                    {sDue && (
                      <span className={clsx("text-xs", sDue.tone === "late" ? "text-red-600" : sDue.tone === "soon" ? "text-amber-600" : "text-slate-400")}>{sDue.text}</span>
                    )}
                    <input
                      type="date"
                      className="w-[7.5rem] rounded border-0 bg-transparent p-0 text-xs text-slate-400 opacity-0 focus:opacity-100 group-hover:opacity-100"
                      value={s.due_date ?? ""}
                      onChange={(e) => updateSub(s.id, { due_date: e.target.value || null })}
                      aria-label="Due date"
                    />
                    <button className="text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100" onClick={() => deleteSub(s.id)} aria-label="Delete subtask">
                      ✕
                    </button>
                  </li>
                );
              })}
              <li className="p-2">
                <form onSubmit={addSub} className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <input className="input" placeholder="Add a subtask" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
                  <input className="input w-40" type="date" value={newSubDue} onChange={(e) => setNewSubDue(e.target.value)} aria-label="Subtask due date" />
                  <Button variant="secondary" disabled={!newSub.trim()}>Add</Button>
                </form>
              </li>
            </ul>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                Clients to email
                {recipients.length > 0 && <span className="ml-2 text-sm font-normal text-slate-500">{emailedCount}/{recipients.length} emailed</span>}
              </h2>
              {emails.length > 0 && (
                <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(emails.join(", "))} title="Copies the email addresses of clients not yet emailed">
                  Copy emails
                </Button>
              )}
            </div>
            {recipients.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Client</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Email</th>
                      <th className="px-3 py-2 font-medium">Note</th>
                      <th className="px-3 py-2 text-center font-medium">Emailed</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recipients.map((r) => {
                      const c = clients.find((x) => x.id === r.client_id);
                      return (
                        <tr key={r.client_id} className="group">
                          <td className="px-3 py-2">
                            {c ? <Link href={`/clients/${c.id}`} className="hover:underline">{clientName(c)}</Link> : clientName(c)}
                          </td>
                          <td className="hidden px-3 py-2 text-slate-600 sm:table-cell">
                            {c?.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : <span className="text-slate-400">No email</span>}
                          </td>
                          <td className="px-3 py-1">
                            <input
                              key={r.note ?? ""}
                              className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm hover:border-slate-200 focus:border-brand focus:outline-none"
                              defaultValue={r.note ?? ""}
                              placeholder="Add a note"
                              onBlur={(e) => e.target.value !== (r.note ?? "") && updateRecipient(r.client_id, { note: e.target.value || null })}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-brand"
                              checked={r.emailed}
                              onChange={() => updateRecipient(r.client_id, { emailed: !r.emailed })}
                              aria-label={`Emailed ${clientName(c)}`}
                            />
                          </td>
                          <td className="px-2">
                            <button className="text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100" onClick={() => removeRecipient(r.client_id)} aria-label="Remove client">
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className={clsx("flex flex-wrap gap-2", recipients.length > 0 && "mt-3")}>
              <select className="input flex-1" value={addClientId} onChange={(e) => setAddClientId(e.target.value)} aria-label="Add a client">
                <option value="">{unlisted.length ? "Choose a client to add" : "Every client is on the list"}</option>
                {unlisted.map((c) => (
                  <option key={c.id} value={c.id}>{c.company ? `${c.company} (${c.name})` : c.name}</option>
                ))}
              </select>
              <Button variant="secondary" disabled={!addClientId} onClick={() => addClients([addClientId])}>Add</Button>
              <Button variant="ghost" disabled={!unlisted.length} onClick={() => addClients(unlisted.map((c) => c.id))}>Add all clients</Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Tick each client off once you&apos;ve emailed them. The app doesn&apos;t send the emails.</p>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Notes</h2>
            <textarea
              key={task.updated_at}
              className="input min-h-[140px]"
              defaultValue={task.notes ?? ""}
              placeholder="Email wording, links, anything to remember…"
              onBlur={(e) => e.target.value !== (task.notes ?? "") && updateTask({ notes: e.target.value || null })}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">Details</h2>
            <Field label="Type">
              <select className="input" value={task.area} onChange={(e) => updateTask({ area: e.target.value as AdminArea })}>
                {AREAS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input className="input" type="date" value={task.due_date ?? ""} onChange={(e) => updateTask({ due_date: e.target.value || null })} />
            </Field>
            <Field label="Repeat" hint={task.recurrence !== "none" ? "When you tick this off, the next one is created with the next due date, its subtasks reset and the same clients to email." : undefined}>
              <select className="input" value={task.recurrence} onChange={(e) => updateTask({ recurrence: e.target.value as Recurrence })}>
                {RECURRENCES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
            <div className="border-t border-slate-100 pt-3">
              <Button size="sm" variant="danger" onClick={deleteTask}>Delete task</Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
