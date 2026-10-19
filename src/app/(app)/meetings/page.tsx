"use client";

import Link from "next/link";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { Booking, EventType } from "@/lib/types";
import { LOCATION_LABEL } from "@/lib/booking/locations";
import type { Booking, BookingSettings, Client, EventType } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { AdHocMeetingModal } from "@/components/meetings/AdHocMeetingModal";
import { SendConfirmationModal } from "@/components/meetings/SendConfirmationModal";

async function load() {
  const supabase = createClient();
  const [bookings, types, clients, settings, google] = await Promise.all([
    supabase.from("bookings").select("*").order("start_at", { ascending: true }).then(must),
    supabase.from("event_types").select("*").order("position").then(must),
    supabase.from("clients").select("*").order("name").then(must),
    supabase.from("booking_settings").select("*").eq("id", 1).single().then(must),
    supabase.rpc("google_connection_status").then(must),
  ]);
  const connection = ((google as { can_send_email: boolean }[] | null) ?? [])[0];
  return {
    bookings: bookings as Booking[],
    types: types as EventType[],
    clients: clients as Client[],
    settings: settings as BookingSettings,
    canSendEmail: Boolean(connection?.can_send_email),
  };
}

export default function MeetingsPage() {
  const { data, reload, error, loading } = useData(load);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<Booking | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const now = new Date().toISOString();
  const rows =
    tab === "upcoming"
      ? data.bookings.filter((b) => b.end_at >= now)
      : data.bookings.filter((b) => b.end_at < now).reverse();

  async function cancel(b: Booking) {
    const note = b.invite_sent ? " They'll get a cancellation email from Google Calendar." : "";
    if (!confirm(`Cancel the meeting with ${b.name}?${note}`)) return;
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
        subtitle="Meetings booked through your booking page, and ones you add yourself."
        actions={
          <>
            <Link href="/settings/booking"><Button variant="secondary">Booking page settings</Button></Link>
            <Button onClick={() => setAdding(true)}>＋ Ad hoc meeting</Button>
          </>
        }
      />
      {notice && (
        <div className={clsx("mb-4 rounded-lg p-3 text-sm", notice.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800")}>
          {notice.text}
        </div>
      )}
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
                  {b.title ?? type?.name ?? "Booking"}
                  {b.source === "ad_hoc" && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">Ad hoc</span>}
                  {b.email && <> · <a className="hover:underline" href={`mailto:${b.email}`}>{b.email}</a></>}
                  {b.phone && <> · <a className="hover:underline" href={`tel:${b.phone}`}>{b.phone}</a></>}
                </div>
                {(b.location_type || b.location) && (
                  <div className="text-slate-500">◎ {b.location ?? LOCATION_LABEL[b.location_type!]}</div>
                )}
                {b.message && <p className="mt-1.5 whitespace-pre-wrap text-slate-600">{b.message}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {b.meet_link && <a className="text-brand-strong hover:underline" href={b.meet_link} target="_blank" rel="noreferrer">Google Meet link</a>}
                  {b.client_id && <Link className="text-brand-strong hover:underline" href={`/clients/${b.client_id}`}>Client record</Link>}
                  {!b.google_event_id && b.status === "confirmed" && <span className="text-amber-700">Not on Google Calendar</span>}
                  {b.confirmation_sent_at && (
                    <span className="text-slate-500">Confirmation sent {format(parseISO(b.confirmation_sent_at), "d MMM, h:mm a")}</span>
                  )}
                  {tab === "upcoming" && b.status === "confirmed" && b.email && data.canSendEmail && (
                    <button className="text-brand-strong hover:underline" onClick={() => setConfirming(b)}>
                      {b.confirmation_sent_at ? "Resend confirmation" : "Send confirmation"}
                    </button>
                  )}
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
      {adding && (
        <AdHocMeetingModal
          clients={data.clients}
          types={data.types}
          settings={data.settings}
          canSendEmail={data.canSendEmail}
          onClose={() => setAdding(false)}
          onCreated={(warnings) => {
            setAdding(false);
            setTab("upcoming");
            setNotice(warnings.length ? { text: warnings.join(" "), ok: false } : { text: "Meeting booked.", ok: true });
            reload();
          }}
        />
      )}
      {confirming && (
        <SendConfirmationModal
          booking={confirming}
          type={data.types.find((t) => t.id === confirming.event_type_id) ?? null}
          settings={data.settings}
          onClose={() => setConfirming(null)}
          onSent={() => {
            setConfirming(null);
            setNotice({ text: `Confirmation emailed to ${confirming.email}.`, ok: true });
            reload();
          }}
        />
      )}
    </div>
  );
}
