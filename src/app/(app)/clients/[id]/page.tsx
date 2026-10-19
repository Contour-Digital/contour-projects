"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Booking, Client, Project, Stage } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { StageBadge } from "@/components/ui/StageBadge";
import { ClientCard } from "@/components/clients/ClientCard";
import { ClientForm } from "@/components/clients/ClientForm";
import { OffboardModal } from "@/components/clients/OffboardModal";
import { saveClient } from "@/components/clients/saveClient";
import { NewProjectModal } from "@/components/projects/NewProjectModal";

async function load(id: string) {
  const supabase = createClient();
  const [client, projects, stages, bookings, clients] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single().then(must),
    supabase.from("projects").select("*").eq("client_id", id).order("created_at", { ascending: false }).then(must),
    supabase.from("stages").select("*").order("position").then(must),
    supabase.from("bookings").select("*").eq("client_id", id).order("start_at", { ascending: false }).then(must),
    supabase.from("clients").select("id,name,company").order("name").then(must),
  ]);
  return {
    client: client as Client,
    projects: projects as Project[],
    stages: stages as Stage[],
    bookings: bookings as Booking[],
    clients: clients as Pick<Client, "id" | "name" | "company">[],
  };
}

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, reload, error, loading } = useData(() => load(id), [id]);
  const [editing, setEditing] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [offboarding, setOffboarding] = useState(false);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;
  const { client } = data;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/clients" className="text-sm text-slate-500 hover:text-slate-800">← Clients</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{client.company || client.name}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</Button>
          <Button onClick={() => setNewProject(true)}>＋ New project</Button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Client information</h2>
          {editing ? (
            <ClientForm
              initial={client}
              onCancel={() => setEditing(false)}
              onSubmit={async (values, login) => {
                const hadLogin = Boolean(client.domain_login_updated_at);
                if (hadLogin && values.domain_location !== "external" && !confirm("The domain isn't external any more, so the saved domain login will be deleted. Continue?")) {
                  return null;
                }
                const res = await saveClient(id, values, login, hadLogin);
                if ("error" in res) {
                  reload();
                  return res.error;
                }
                setEditing(false);
                reload();
                return null;
              }}
            />
          ) : (
            <ClientCard client={client} showLink={false} onLoginRemoved={reload} />
          )}
          {!editing && (
            <div className="mt-4 flex flex-wrap gap-2">
              {client.offboarded_at ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const { error } = await createClient().rpc("restore_client", { p_client_id: id });
                    if (error) return alert(error.message);
                    reload();
                  }}
                >
                  Restore as current client
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setOffboarding(true)}>Offboard client</Button>
              )}
            </div>
          )}
          {!editing && (
            <button
              className="mt-4 text-xs text-slate-400 hover:text-red-600"
              onClick={async () => {
                if (!confirm(`Delete ${client.company || client.name}? Their projects stay but lose the client link.`)) return;
                await createClient().from("clients").delete().eq("id", id);
                router.push("/clients");
              }}
            >
              Delete client
            </button>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Projects</h2>
            {data.projects.length === 0 && <p className="text-sm text-slate-500">No projects yet.</p>}
            <ul className="divide-y divide-slate-100">
              {data.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-strong">
                    <span className="font-medium">
                      {p.name}
                      {p.archived && <span className="ml-2 text-xs text-slate-400">archived</span>}
                    </span>
                    <span className="flex items-center gap-3 text-sm text-slate-500">
                      {formatMoney(p.value)}
                      <StageBadge stage={data.stages.find((s) => s.id === p.stage_id)} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Bookings</h2>
            {data.bookings.length === 0 && <p className="text-sm text-slate-500">No bookings.</p>}
            <ul className="space-y-2 text-sm">
              {data.bookings.map((b) => (
                <li key={b.id} className="flex justify-between gap-3">
                  <span className={b.status === "cancelled" ? "text-slate-400 line-through" : ""}>
                    {format(parseISO(b.start_at), "EEE d MMM yyyy, h:mm a")}
                  </span>
                  {b.message && <span className="truncate text-slate-500">{b.message}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {offboarding && (
        <OffboardModal
          client={client}
          activeProjects={data.projects.filter((p) => !p.archived).length}
          onClose={() => setOffboarding(false)}
          onDone={() => {
            setOffboarding(false);
            reload();
          }}
        />
      )}

      {newProject && (
        <NewProjectModal
          stages={data.stages}
          clients={data.clients}
          defaultClientId={id}
          onClose={() => setNewProject(false)}
          onCreated={(pid) => router.push(`/projects/${pid}`)}
        />
      )}
    </div>
  );
}
