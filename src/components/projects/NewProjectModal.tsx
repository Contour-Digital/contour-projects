"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Client, Stage } from "@/lib/types";
import { byClientName } from "@/lib/clients";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const NEW_CLIENT = "__new__";

export function NewProjectModal({
  stages,
  clients,
  defaultStageId,
  defaultClientId,
  onClose,
  onCreated,
}: {
  stages: Stage[];
  clients: Pick<Client, "id" | "name" | "company">[];
  defaultStageId?: string;
  defaultClientId?: string;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState(defaultStageId ?? stages[0]?.id ?? "");
  const [clientId, setClientId] = useState(defaultClientId ?? (clients.length ? "" : NEW_CLIENT));
  const [newClient, setNewClient] = useState({ name: "", company: "", email: "", phone: "" });
  const [value, setValue] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();

    let finalClientId: string | null = clientId || null;
    if (clientId === NEW_CLIENT) {
      if (!newClient.name.trim()) {
        setBusy(false);
        return setError("Give the new client a name.");
      }
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: newClient.name.trim(),
          company: newClient.company.trim() || null,
          email: newClient.email.trim() || null,
          phone: newClient.phone.trim() || null,
        })
        .select("id")
        .single();
      if (error) {
        setBusy(false);
        return setError(error.message);
      }
      finalClientId = data.id;
    }

    // New projects go to the top of their column.
    const { data: top } = await supabase
      .from("projects")
      .select("position")
      .eq("stage_id", stageId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: name.trim(),
        stage_id: stageId,
        client_id: finalClientId,
        value: value ? Number(value) : null,
        due_date: dueDate || null,
        description: description.trim() || null,
        position: (top?.position ?? 1000) - 1000,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    onCreated(data.id);
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Project name">
          <input className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website rebuild" />
        </Field>

        <Field label="Client">
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {[...clients].sort(byClientName).map((c) => (
              <option key={c.id} value={c.id}>
                {c.company ? `${c.company} (${c.name})` : c.name}
              </option>
            ))}
            <option value={NEW_CLIENT}>＋ New client…</option>
          </select>
        </Field>

        {clientId === NEW_CLIENT && (
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <Field label="Contact name">
              <input className="input" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
            </Field>
            <Field label="Company">
              <input className="input" value={newClient.company} onChange={(e) => setNewClient({ ...newClient, company: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
            </Field>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Stage">
            <select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Value (AUD)">
            <input className="input" type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Due date">
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Description">
          <textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <p className="text-xs text-slate-500">The stage&apos;s task checklist is added to the project automatically.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !name.trim() || !stageId}>{busy ? "Creating…" : "Create project"}</Button>
        </div>
      </form>
    </Modal>
  );
}
