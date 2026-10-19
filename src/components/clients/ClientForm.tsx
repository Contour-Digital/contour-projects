"use client";

import { useState } from "react";
import type { Client } from "@/lib/types";
import { CONTACT_LABELS, DOMAIN_LABELS, HOSTING_LABELS, LEAD_SOURCE_LABELS } from "@/lib/clients";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export type ClientInput = Omit<
  Client,
  "id" | "created_at" | "updated_at" | "domain_login_updated_at" | "offboarded_at" | "offboarding_reason"
>;

/** A new domain login to save, or null to leave the stored one as it is. */
export type DomainLoginInput = { username: string; password: string } | null;

type TextKey = Exclude<keyof ClientInput, "maintenance_subscription">;

type FieldDef = {
  key: TextKey;
  label: string;
  type?: string;
  textarea?: boolean;
  half?: boolean;
  options?: Record<string, string>;
};

const CONTACT_FIELDS: FieldDef[] = [
  { key: "name", label: "Contact name", half: true },
  { key: "company", label: "Company", half: true },
  { key: "email", label: "Email", type: "email", half: true },
  { key: "phone", label: "Phone", half: true },
  { key: "website", label: "Website", half: true },
  { key: "abn", label: "ABN", half: true },
  { key: "preferred_contact", label: "Preferred contact method", half: true, options: CONTACT_LABELS },
  { key: "google_drive_url", label: "Google Drive link", type: "url", half: true },
  { key: "address", label: "Address", textarea: true },
];

const ACCOUNT_FIELDS: FieldDef[] = [
  { key: "hosting_subscription", label: "Hosting subscription", half: true, options: HOSTING_LABELS },
  { key: "lead_source", label: "Lead source", half: true, options: LEAD_SOURCE_LABELS },
  { key: "client_since", label: "Client since", type: "date", half: true },
];

const DOMAIN_FIELDS: FieldDef[] = [
  { key: "domain_location", label: "Domain managed", half: true, options: DOMAIN_LABELS },
  { key: "domain_registrar", label: "Registrar or login page", half: true },
];

const NOTES_FIELD: FieldDef = { key: "notes", label: "Notes (put domain logins in the secure fields above)", textarea: true };

const TEXT_FIELDS = [...CONTACT_FIELDS, ...ACCOUNT_FIELDS, ...DOMAIN_FIELDS, NOTES_FIELD];

export function ClientForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: {
  initial?: Partial<Client>;
  onSubmit: (values: ClientInput, login: DomainLoginInput) => Promise<string | null>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, (initial?.[f.key] as string | null) ?? ""]))
  );
  const [maintenance, setMaintenance] = useState(initial?.maintenance_subscription ?? false);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasSavedLogin = Boolean(initial?.domain_login_updated_at);
  const external = values.domain_location === "external";

  const renderField = (f: FieldDef) => {
    const set = (v: string) => setValues({ ...values, [f.key]: v });
    return (
      <div key={f.key} className={f.half ? "" : "sm:col-span-2"}>
        <Field label={f.label}>
          {f.options ? (
            <select className="input" value={values[f.key]} onChange={(e) => set(e.target.value)}>
              <option value="">Not set</option>
              {Object.entries(f.options).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          ) : f.textarea ? (
            <textarea className="input min-h-[70px]" value={values[f.key]} onChange={(e) => set(e.target.value)} />
          ) : (
            <input
              className="input"
              type={f.type ?? "text"}
              required={f.key === "name"}
              value={values[f.key]}
              onChange={(e) => set(e.target.value)}
            />
          )}
        </Field>
      </div>
    );
  };

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const cleaned = {
          ...Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, values[f.key].trim() || null])),
          maintenance_subscription: maintenance,
        } as unknown as ClientInput;
        cleaned.name = cleaned.name ?? "";
        const newLogin =
          external && (login.username.trim() || login.password) ? { username: login.username.trim(), password: login.password } : null;
        const err = await onSubmit(cleaned, newLogin);
        setBusy(false);
        setError(err);
      }}
    >
      {CONTACT_FIELDS.map(renderField)}

      <h3 className="pt-2 text-sm font-semibold sm:col-span-2">Subscriptions</h3>
      {ACCOUNT_FIELDS.map(renderField)}
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={maintenance} onChange={(e) => setMaintenance(e.target.checked)} />
        Maintenance subscription
      </label>

      <h3 className="pt-2 text-sm font-semibold sm:col-span-2">Domain</h3>
      {DOMAIN_FIELDS.map(renderField)}
      {external && (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2 sm:grid-cols-2">
          <p className="text-xs text-slate-600 sm:col-span-2">
            🔒 The domain login is encrypted and stored in the Australian database. It only shows when you click to reveal it, and every view is logged.
            {hasSavedLogin && " A login is already saved. Leave these blank to keep it."}
          </p>
          <Field label="Login username">
            <input
              className="input"
              autoComplete="off"
              value={login.username}
              onChange={(e) => setLogin({ ...login, username: e.target.value })}
            />
          </Field>
          <Field label="Login password">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={login.password}
              onChange={(e) => setLogin({ ...login, password: e.target.value })}
            />
          </Field>
        </div>
      )}

      {renderField(NOTES_FIELD)}

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
