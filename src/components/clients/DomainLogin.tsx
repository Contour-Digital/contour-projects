"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

const HIDE_AFTER_MS = 30_000;

/** The stored domain login: hidden until revealed, then hidden again after 30 seconds. */
export function DomainLogin({ clientId, savedAt, onRemoved }: { clientId: string; savedAt: string; onRemoved: () => void }) {
  const [login, setLogin] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!login) return;
    const t = setTimeout(() => setLogin(null), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [login]);

  const reveal = async () => {
    setBusy(true);
    const { data, error } = await createClient().rpc("reveal_domain_login", { p_client_id: clientId });
    setBusy(false);
    if (error) return setError(error.message);
    const row = (data as { username: string; password: string }[] | null)?.[0];
    if (!row) return setError("No login is saved.");
    setError(null);
    setLogin(row);
  };

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">🔒 Domain login</span>
        {login ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setLogin(null)}>Hide</Button>
        ) : (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={reveal}>{busy ? "…" : "Reveal"}</Button>
        )}
      </div>
      {login ? (
        <dl className="mt-2 space-y-1 text-sm">
          {[
            ["Username", login.username],
            ["Password", login.password],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono">{value || "—"}</span>
                {value && (
                  <button type="button" className="text-xs text-brand-strong hover:underline" onClick={() => copy(label, value)}>
                    {copied === label ? "Copied" : "Copy"}
                  </button>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Saved {format(parseISO(savedAt), "d MMM yyyy")}. Every reveal is logged.</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        className="mt-2 text-xs text-slate-400 hover:text-red-600"
        onClick={async () => {
          if (!confirm("Delete the saved domain login? This can't be undone.")) return;
          const { error } = await createClient().rpc("remove_domain_login", { p_client_id: clientId });
          if (error) return setError(error.message);
          setLogin(null);
          onRemoved();
        }}
      >
        Delete login
      </button>
    </div>
  );
}
