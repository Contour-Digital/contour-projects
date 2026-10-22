"use client";

import { useState } from "react";
import clsx from "clsx";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { Client, Recurrence, SupportTag } from "@/lib/types";
import { SUPPORT_TAGS, tagOf } from "@/lib/supportTasks";
import { RECURRENCES } from "@/lib/adminTasks";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function NewSupportTaskModal({
  clients,
  defaultClientId = "",
  defaultDate = format(new Date(), "yyyy-MM-dd"),
  onClose,
  onCreated,
}: {
  clients: Pick<Client, "id" | "name" | "company" | "offboarded_at">[];
  defaultClientId?: string;
  defaultDate?: string;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(defaultClientId);
  const [date, setDate] = useState(defaultDate);
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [tag, setTag] = useState<SupportTag>("content_updates");
  const [price, setPrice] = useState(String(tagOf("content_updates").price));
  const [subtasks, setSubtasks] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = clients.filter((c) => !c.offboarded_at);

  function pickTag(t: SupportTag) {
    setTag(t);
    setPrice(String(tagOf(t).price));
  }

  function setSubtask(i: number, value: string) {
    const next = subtasks.map((s, j) => (j === i ? value : s));
    // Keep one empty row at the end to type the next subtask into.
    if (next[next.length - 1].trim()) next.push("");
    setSubtasks(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("support_tasks")
      .insert({
        title: title.trim(),
        client_id: clientId,
        scheduled_date: date || null,
        tag,
        price: price === "" ? null : Number(price),
        recurrence,
        notes: notes.trim() || null,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const subs = subtasks.map((s) => s.trim()).filter(Boolean);
    if (subs.length) {
      const { error } = await supabase
        .from("support_subtasks")
        .insert(subs.map((s, i) => ({ task_id: data.id, title: s, position: i + 1 })));
      if (error) {
        setBusy(false);
        return setError(`The task was added but its subtasks weren't: ${error.message}`);
      }
    }
    setBusy(false);
    onCreated(data.id);
  }

  return (
    <Modal title="New support task" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Task">
          <input className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. October site maintenance" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_11rem_11rem]">
          <Field label="Client">
            <select className="input" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Choose a client</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>{c.company ? `${c.company} (${c.name})` : c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Scheduled for">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Repeat">
            <select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {RECURRENCES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
        </div>
        {recurrence !== "none" && (
          <p className="-mt-2 text-xs text-slate-500">When you tick this off, the next one is scheduled with the same client, tag, price and subtasks.</p>
        )}

        <fieldset>
          <legend className="label">Tag</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUPPORT_TAGS.map((t) => (
              <label
                key={t.value}
                className={clsx(
                  "flex cursor-pointer gap-2.5 rounded-lg border p-3 text-sm",
                  tag === t.value ? "border-brand bg-brand-soft" : "border-slate-200 hover:bg-slate-50"
                )}
              >
                <input type="radio" name="tag" className="mt-0.5 accent-brand" checked={tag === t.value} onChange={() => pickTag(t.value)} />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </span>
                  <span className="block text-xs text-slate-500">{t.description}</span>
                  <span className="block text-xs font-medium text-slate-700">{t.priceLabel}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Price (AUD)" hint={tag === "advanced_customization" ? "Set this to the quoted price for the scope." : undefined}>
          <input className="input sm:w-40" type="number" min="0" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>

        <div>
          <span className="label">Subtasks</span>
          <div className="space-y-2">
            {subtasks.map((s, i) => (
              <input
                key={i}
                className="input"
                value={s}
                onChange={(e) => setSubtask(i, e.target.value)}
                placeholder={i === 0 ? "e.g. Update the opening hours on the Contact page" : "Add another subtask"}
                aria-label={`Subtask ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <Field label="Notes">
          <textarea className="input min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What the client asked for, links, logins to use…" />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !title.trim() || !clientId}>{busy ? "Adding…" : "Add task"}</Button>
        </div>
      </form>
    </Modal>
  );
}
