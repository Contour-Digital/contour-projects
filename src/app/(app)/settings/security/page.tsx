"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { TotpSetup } from "@/components/auth/TotpSetup";

async function load() {
  return must(await createClient().auth.mfa.listFactors()).totp;
}

export default function SecuritySettingsPage() {
  const { data: factors, reload, error, loading } = useData(load);
  const [adding, setAdding] = useState(false);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !factors) return <p className="text-slate-500">Loading…</p>;

  async function remove(factorId: string) {
    if (!confirm("Remove this authenticator? It won't be able to sign you in any more.")) return;
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return alert(error.message);
    await supabase.auth.refreshSession();
    reload();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Security"
        subtitle="Signing in needs your password and a code from an authenticator app. Add a second device (another phone, or a password manager like 1Password) so losing one phone doesn't lock you out."
      />

      <div className="card divide-y divide-slate-100">
        {factors.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-slate-800">Authenticator app</p>
              <p className="text-sm text-slate-500">Added {formatDate(f.created_at)}</p>
            </div>
            <Button
              variant="danger"
              size="sm"
              disabled={factors.length === 1}
              title={factors.length === 1 ? "Add another authenticator before removing this one" : undefined}
              onClick={() => remove(f.id)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4">
        {adding ? (
          <div className="card max-w-sm p-6">
            <h2 className="mb-4 font-semibold text-brand-navy">Add an authenticator</h2>
            <TotpSetup
              onDone={() => {
                setAdding(false);
                reload();
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add another authenticator
          </Button>
        )}
      </div>
    </div>
  );
}
