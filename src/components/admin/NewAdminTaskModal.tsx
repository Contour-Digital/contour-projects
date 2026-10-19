"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AdminArea, Recurrence } from "@/lib/types";
import { AREAS, RECURRENCES } from "@/lib/adminTasks";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function NewAdminTaskModal({
  defaultArea = "admin",
  onClose,
  onCreated,
}: {
  defaultArea?: AdminArea;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<AdminArea>(defaultArea);
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await createClient()
      .from("admin_tasks")
      .insert({ title: title.trim(), area, due_date: dueDate || null, recurrence, notes: notes.trim() || null })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    onCreated(data.id);
  }

  return (
    <Modal title="New task" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Task">
          <input className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Remind clients about public holiday notices" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type">
            <select className="input" value={area} onChange={(e) => setArea(e.target.value as AdminArea)}>
              {AREAS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Repeat">
            <select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {RECURRENCES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {recurrence !== "none" && (
          <p className="text-xs text-slate-500">When you tick this off, the next one is created with the next due date.</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add task"}</Button>
        </div>
      </form>
    </Modal>
  );
}
