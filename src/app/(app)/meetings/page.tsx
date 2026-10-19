"use client";

import Link from "next/link";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Booking, EventType } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

async function load() {
  const supabase = createClient();
  const [bookings, types] = await Promise.all([
    supabase.from("bookings").select("*").order("start_at", { ascending: true }).then(must),
    supabase.from("event_types").select("*").then(must),
  ]);
  return { bookings: bookings as Booking[], types: types as EventType[] };
}

export default function MeetingsPage() {
  const { data, reload, error, loading } = useData(load);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const now = new Date().toISOString();
  const rows =
    tab === "upcoming"
      ? data.bookings.filter((b) => b.end_at >= now)
      : data.bookings.filter((b) => b.end_at < now).reverse();

  async function cancel(b: Booking) {
    if (!confirm(`Cancel the meeting with ${b.name}? They'll get a cancellation email from Google Calendar.`)) return;
    setBusyId(b.id);
    const res = await fetch(`/api/bookings/${b.id}/cancel`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) alert((await res.json()).error ?? "Could not cancel");
    reload();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Meetings"
        subtitle="Meetings booked through your booking page."
        actions={<Link href="/settings/booking"><Button variant="secondary">Booking page settings</Button></Link>}
      />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx("flex-1 rounded-md px-4 py-1.5 capitalize", tab === t ? "bg-white font-medium shadow-sm" : "text-slate-600")}
          >
            {t}
          </button>
        ))}
      </div>
      <ul className="space-y-3">
        {rows.map((b) => {
          const type = data.types.find((t) => t.id === b.event_type_id);
          return (
            <li key={b.id} className={clsx("card flex flex-wrap items-start gap-4 p-4", b.status === "cancelled" && "opacity-60")}>
              <div className="w-36 shrink-0 text-sm">
                <div className="font-semibold">{format(parseISO(b.start_at), "EEE d MMM")}</div>
                <div className="text-slate-500">{format(parseISO(b.start_at), "h:mm a")} – {format(parseISO(b.end_at), "h:mm a")}</div>
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">
                  {b.name}
                  {b.company && <span className="font-normal text-slate-500"> · {b.company}</span>}
                  {b.status === "cancelled" && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">Cancelled</span>}
                </div>
                <div className="text-slate-500">
                  {type?.name ?? "Booking"} · <a className="hover:underline" href={`mailto:${b.email}`}>{b.email}</a>
                  {b.phone && <> · <a className="hover:underline" href={`tel:${b.phone}`}>{b.phone}</a></>}
                </div>
                {b.message && <p className="mt-1.5 whitespace-pre-wrap text-slate-600">{b.message}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {b.meet_link && <a className="text-brand-strong hover:underline" href={b.meet_link} target="_blank" rel="noreferrer">Google Meet link</a>}
                  {b.client_id && <Link className="text-brand-strong hover:underline" href={`/clients/${b.client_id}`}>Client record</Link>}
                  {!b.google_event_id && b.status === "confirmed" && <span className="text-amber-700">Not on Google Calendar</span>}
                </div>
              </div>
              {tab === "upcoming" && b.status === "confirmed" && (
                <Button size="sm" variant="danger" disabled={busyId === b.id} onClick={() => cancel(b)}>
                  {busyId === b.id ? "Cancelling…" : "Cancel"}
                </Button>
              )}
            </li>
          );
        })}
        {rows.length === 0 && <li className="card p-8 text-center text-slate-500">No {tab} meetings.</li>}
      </ul>
    </div>
  );
}
