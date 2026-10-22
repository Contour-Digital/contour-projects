"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Client, Stage } from "@/lib/types";
import { HOSTING_LABELS, byClientName } from "@/lib/clients";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StageBadge } from "@/components/ui/StageBadge";
import { ClientForm } from "@/components/clients/ClientForm";
import { saveClient } from "@/components/clients/saveClient";

type Row = Client & { projects: { id: string; name: string; stage_id: string; archived: boolean }[] };

type MaintenanceFilter = "all" | "yes" | "no";

async function load() {
  const supabase = createClient();
  const [clients, stages] = await Promise.all([
    supabase.from("clients").select("*, projects(id,name,stage_id,archived)").order("name").then(must),
    supabase.from("stages").select("*").order("position").then(must),
  ]);
  return { clients: clients as Row[], stages: stages as Stage[] };
}

export default function ClientsPage() {
  const router = useRouter();
  const { data, error, loading } = useData(load);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceFilter>("all");
  const [showFormer, setShowFormer] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.clients ?? [])
      .filter((c) => !q || [c.name, c.company, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)))
      .filter((c) => maintenance === "all" || c.maintenance_subscription === (maintenance === "yes"))
      .sort(byClientName);
  }, [data, search, maintenance]);

  const current = rows.filter((c) => !c.offboarded_at);
  const former = rows.filter((c) => c.offboarded_at);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Clients"
        subtitle={`${data.clients.filter((c) => !c.offboarded_at).length} current clients · ${data.clients.filter((c) => !c.offboarded_at && c.maintenance_subscription).length} on maintenance`}
        actions={
          <>
            <input className="input w-56" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select
              className="input w-auto"
              aria-label="Maintenance subscription"
              value={maintenance}
              onChange={(e) => setMaintenance(e.target.value as MaintenanceFilter)}
            >
              <option value="all">All clients</option>
              <option value="yes">On maintenance</option>
              <option value="no">No maintenance</option>
            </select>
            <Button onClick={() => setAdding(true)}>＋ New client</Button>
          </>
        }
      />
      <div className="space-y-6">
        {current.length > 0 ? (
          <ClientGroup rows={current} stages={data.stages} />
        ) : (
          <p className="card px-4 py-8 text-center text-sm text-slate-500">No clients match.</p>
        )}

        {former.length > 0 && (
          <div>
            <button className="text-sm font-medium text-slate-500 hover:text-slate-800" onClick={() => setShowFormer(!showFormer)}>
              {showFormer ? "▾" : "▸"} Former clients ({former.length})
            </button>
            {showFormer && (
              <div className="mt-3">
                <ClientGroup rows={former} stages={data.stages} former />
              </div>
            )}
          </div>
        )}
      </div>

      {adding && (
        <Modal title="New client" onClose={() => setAdding(false)} wide>
          <ClientForm
            submitLabel="Create client"
            onCancel={() => setAdding(false)}
            onSubmit={async (values, login) => {
              const res = await saveClient(null, values, login);
              if ("error" in res) return res.error;
              router.push(`/clients/${res.id}`);
              return null;
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function ClientGroup({ rows, stages, former }: { rows: Row[]; stages: Stage[]; former?: boolean }) {
  const router = useRouter();
  return (
    <section>
      <div className="card overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Contact</th>
              <th className="hidden w-32 px-4 py-2.5 font-medium sm:table-cell">Hosting</th>
              <th className="w-32 px-4 py-2.5 font-medium">{former ? "Left" : "Maintenance"}</th>
              <th className="hidden w-48 px-4 py-2.5 font-medium sm:table-cell">Projects</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/clients/${c.id}`)}>
                <td className="px-4 py-3">
                  <Link href={`/clients/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {c.company || c.name}
                  </Link>
                  {c.company && <div className="text-xs text-slate-500">{c.name}</div>}
                </td>
                <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                  <div className="truncate">{c.email}</div>
                  <div className="text-xs text-slate-500">{c.phone}</div>
                </td>
                <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                  {c.hosting_subscription ? HOSTING_LABELS[c.hosting_subscription] : <span className="text-xs text-slate-400">None</span>}
                </td>
                <td className="px-4 py-3">
                  {former ? (
                    <span className="text-slate-500">{c.offboarded_at && format(parseISO(c.offboarded_at), "MMM yyyy")}</span>
                  ) : c.maintenance_subscription ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Yes</span>
                  ) : (
                    <span className="text-xs text-slate-400">No</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <div className="flex flex-wrap gap-1.5">
                    {c.projects.filter((p) => !p.archived).map((p) => (
                      <span key={p.id} title={p.name}>
                        <StageBadge stage={stages.find((s) => s.id === p.stage_id)} />
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No clients here yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
