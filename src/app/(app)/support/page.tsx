"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Client, SupportSubtask, SupportTag, SupportTask } from "@/lib/types";
import { SUPPORT_TAGS, groupByScheduledDate } from "@/lib/supportTasks";
import { formatMoney } from "@/lib/format";
import { recurrenceLabel } from "@/lib/adminTasks";
import { byClientName } from "@/lib/clients";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { TagBadge } from "@/components/support/TagBadge";
import { NewSupportTaskModal } from "@/components/support/NewSupportTaskModal";

type ClientRow = Pick<Client, "id" | "name" | "company" | "offboarded_at">;

async function load(showDone: boolean) {
  const supabase = createClient();
  const [tasks, clients, uninvoiced] = await Promise.all([
    supabase
      .from("support_tasks")
      .select("*")
      .eq("done", showDone)
      .order("scheduled_date", { ascending: !showDone, nullsFirst: false })
      .limit(showDone ? 200 : 1000)
      .then(must),
    supabase.from("clients").select("id,name,company,offboarded_at").order("name").then(must),
    supabase.from("support_tasks").select("price").eq("done", true).eq("invoiced", false).then(must),
  ]);
  const ids = (tasks as SupportTask[]).map((t) => t.id);
  const subtasks = ids.length
    ? ((await supabase.from("support_subtasks").select("task_id, done").in("task_id", ids).then(must)) as Pick<SupportSubtask, "task_id" | "done">[])
    : [];
  return {
    tasks: tasks as SupportTask[],
    clients: clients as ClientRow[],
    subtasks,
    uninvoiced: uninvoiced as Pick<SupportTask, "price">[],
  };
}

const clientName = (c: ClientRow | undefined) => (c ? c.company || c.name : "No client");
const toneClass = { late: "text-red-600", today: "text-amber-600", normal: "text-slate-700", muted: "text-slate-500" };

export default function SupportPage() {
  const router = useRouter();
  const [showDone, setShowDone] = useState(false);
  const [tag, setTag] = useState<SupportTag | "all">("all");
  const [clientId, setClientId] = useState("");
  const [adding, setAdding] = useState(false);
  const { data, setData, reload, error, loading } = useData(() => load(showDone), [showDone]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const today = format(new Date(), "yyyy-MM-dd");
  const rows = data.tasks.filter((t) => (tag === "all" || t.tag === tag) && (!clientId || t.client_id === clientId));
  const groups = groupByScheduledDate(rows, { today, completed: showDone });
  const total = (list: Pick<SupportTask, "price">[]) => list.reduce((sum, t) => sum + Number(t.price ?? 0), 0);
  // Clients with tasks in this list, so the filter stays short.
  const listedClients = data.clients.filter((c) => data.tasks.some((t) => t.client_id === c.id)).sort(byClientName);

  async function update(task: SupportTask, patch: Partial<SupportTask>) {
    // Ticking done moves a task to the other list.
    const leaves = "done" in patch;
    setData({ ...data!, tasks: leaves ? data!.tasks.filter((t) => t.id !== task.id) : data!.tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t)) });
    const { error } = await createClient().from("support_tasks").update(patch).eq("id", task.id);
    if (error) alert(error.message);
    reload();
  }

  const uninvoicedTotal = total(data.uninvoiced);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="On-Demand Support"
        subtitle={[
          showDone ? `${data.tasks.length} completed tasks` : `${data.tasks.length} open tasks · ${formatMoney(total(data.tasks))} scheduled`,
          data.uninvoiced.length > 0 && `${data.uninvoiced.length} done, not invoiced (${formatMoney(uninvoicedTotal)})`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={<Button onClick={() => setAdding(true)}>＋ New task</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "all" as const, label: "All" }, ...SUPPORT_TAGS].map((t) => (
            <button
              key={t.value}
              onClick={() => setTag(t.value)}
              className={clsx(
                "rounded-full px-3 py-1 text-sm",
                tag === t.value ? "bg-brand-navy text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-auto py-1 text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Filter by client">
            <option value="">All clients</option>
            {listedClients.map((c) => (
              <option key={c.id} value={c.id}>{clientName(c)}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show completed
          </label>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="card p-8 text-center text-slate-500">
          {showDone ? "Nothing completed yet." : rows.length === data.tasks.length ? "No support work scheduled. Add a task to get started." : "No open tasks match."}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className={clsx("mb-2 text-sm font-semibold", toneClass[g.tone])}>
                {g.title} · {g.rows.length}
                <span className="ml-2 font-normal text-slate-400">{formatMoney(total(g.rows))}</span>
              </h2>
              <ul className="card divide-y divide-slate-100">
                {g.rows.map((t) => {
                  const subs = data.subtasks.filter((s) => s.task_id === t.id);
                  const client = data.clients.find((c) => c.id === t.client_id);
                  return (
                    <li key={t.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50" onClick={() => router.push(`/support/${t.id}`)}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={t.done}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => update(t, { done: !t.done })}
                        aria-label={`${t.done ? "Reopen" : "Complete"} ${t.title}`}
                      />
                      <div className="min-w-0 flex-1">
                        <Link href={`/support/${t.id}`} className={clsx("font-medium hover:underline", t.done && "text-slate-500")} onClick={(e) => e.stopPropagation()}>
                          {t.title}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {[
                            clientName(client),
                            t.recurrence !== "none" && `↻ ${recurrenceLabel(t.recurrence)}`,
                            subs.length > 0 && `${subs.filter((s) => s.done).length}/${subs.length} subtasks`,
                            g.key === "overdue" && t.scheduled_date && `was ${format(parseISO(t.scheduled_date), "d MMM")}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div className="mt-1 sm:hidden"><TagBadge tag={t.tag} /></div>
                      </div>
                      <span className="hidden sm:block"><TagBadge tag={t.tag} /></span>
                      <span className="w-16 text-right text-xs text-slate-600">{t.price != null && formatMoney(Number(t.price))}</span>
                      {showDone && (
                        <label className="flex items-center gap-1 text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="h-3.5 w-3.5 accent-brand" checked={t.invoiced} onChange={() => update(t, { invoiced: !t.invoiced })} />
                          Invoiced
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {adding && (
        <NewSupportTaskModal
          clients={data.clients}
          defaultClientId={clientId}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
