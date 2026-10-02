"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Client, Stage } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StageBadge } from "@/components/ui/StageBadge";
import { ClientForm } from "@/components/clients/ClientForm";

type Row = Client & { projects: { id: string; name: string; stage_id: string; archived: boolean }[] };

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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.clients ?? []).filter((c) =>
      !q || [c.name, c.company, c.email, c.phone].some((v) => v?.toLowerCase().includes(q))
    );
  }, [data, search]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Clients"
        subtitle={`${data.clients.length} clients`}
        actions={
          <>
            <input className="input w-56" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button onClick={() => setAdding(true)}>＋ New client</Button>
          </>
        }
      />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Contact</th>
              <th className="px-4 py-2.5 font-medium">Projects</th>
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
                  <div>{c.email}</div>
                  <div className="text-xs text-slate-500">{c.phone}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {c.projects.filter((p) => !p.archived).map((p) => (
                      <span key={p.id} title={p.name}>
                        <StageBadge stage={data.stages.find((s) => s.id === p.stage_id)} />
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">No clients yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <Modal title="New client" onClose={() => setAdding(false)} wide>
          <ClientForm
            submitLabel="Create client"
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              const { data, error } = await createClient().from("clients").insert(values).select("id").single();
              if (error) return error.message;
              router.push(`/clients/${data.id}`);
              return null;
            }}
          />
        </Modal>
      )}
    </div>
  );
}
