"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { Client } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

/** Moves a client to Former clients. Their record, projects and bookings are kept. */
export function OffboardModal({
  client,
  activeProjects,
  onClose,
  onDone,
}: {
  client: Client;
  activeProjects: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState("");
  const [archiveProjects, setArchiveProjects] = useState(true);
  const [removeLogin, setRemoveLogin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={`Offboard ${client.company || client.name}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = await createClient().rpc("offboard_client", {
            p_client_id: client.id,
            p_date: date,
            p_reason: reason,
            p_archive_projects: archiveProjects,
            p_remove_domain_login: removeLogin,
          });
          setBusy(false);
          if (error) return setError(error.message);
          onDone();
        }}
      >
        <p className="text-sm text-slate-600">
          They&apos;ll move to Former clients. Their details, projects and bookings are kept, and you can restore them any time.
        </p>
        <Field label="Services ended on">
          <input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reason or handover notes">
          <textarea className="input min-h-[70px]" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {activeProjects > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={archiveProjects} onChange={(e) => setArchiveProjects(e.target.checked)} />
            Archive their {activeProjects} active project{activeProjects === 1 ? "" : "s"}
          </label>
        )}
        {client.domain_login_updated_at && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={removeLogin} onChange={(e) => setRemoveLogin(e.target.checked)} />
            Delete their saved domain login
          </label>
        )}
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Before you finish, check you&apos;ve cancelled their hosting{client.maintenance_subscription ? " and maintenance billing" : ""}, handed over
          their domain and website files if they&apos;re moving, and removed any access they gave us.
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={busy}>{busy ? "Offboarding…" : "Offboard client"}</Button>
        </div>
      </form>
    </Modal>
  );
}
