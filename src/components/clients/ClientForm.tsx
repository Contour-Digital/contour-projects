"use client";

import { useState } from "react";
import type { Client } from "@/lib/types";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export type ClientInput = Omit<Client, "id" | "created_at" | "updated_at">;

const FIELDS: { key: keyof ClientInput; label: string; type?: string; textarea?: boolean; half?: boolean }[] = [
  { key: "name", label: "Contact name", half: true },
  { key: "company", label: "Company", half: true },
  { key: "email", label: "Email", type: "email", half: true },
  { key: "phone", label: "Phone", half: true },
  { key: "website", label: "Website", half: true },
  { key: "abn", label: "ABN", half: true },
  { key: "address", label: "Address", textarea: true },
  { key: "notes", label: "Notes (logins live elsewhere, not here)", textarea: true },
];

export function ClientForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: {
  initial?: Partial<Client>;
  onSubmit: (values: ClientInput) => Promise<string | null>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, (initial?.[f.key] as string | null) ?? ""]))
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const cleaned = Object.fromEntries(FIELDS.map((f) => [f.key, values[f.key].trim() || null])) as ClientInput;
        cleaned.name = cleaned.name ?? "";
        const err = await onSubmit(cleaned);
        setBusy(false);
        setError(err);
      }}
    >
      {FIELDS.map((f) => (
        <div key={f.key} className={f.half ? "" : "sm:col-span-2"}>
          <Field label={f.label}>
            {f.textarea ? (
              <textarea className="input min-h-[70px]" value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            ) : (
              <input
                className="input"
                type={f.type ?? "text"}
                required={f.key === "name"}
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </Field>
        </div>
      ))}
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
