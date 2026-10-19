"use client";

import { useMemo, useState } from "react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { meetingVars } from "@/lib/booking/confirmation";
import { LOCATIONS } from "@/lib/booking/locations";
import type { BookingSettings, Client, EventType, LocationType } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { EmailEditor } from "./EmailEditor";

const NEW = "__new";
const OTHER = "__other";

export function AdHocMeetingModal({
  clients,
  types,
  settings,
  canSendEmail,
  onClose,
  onCreated,
}: {
  clients: Client[];
  types: EventType[];
  settings: BookingSettings;
  canSendEmail: boolean;
  onClose: () => void;
  onCreated: (warnings: string[]) => void;
}) {
  const activeClients = useMemo(
    () => clients.filter((c) => !c.offboarded_at).sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );
  const firstType = types.find((t) => t.active) ?? types[0];

  const [who, setWho] = useState<string>("");
  const [person, setPerson] = useState({ name: "", email: "", phone: "", company: "" });
  const [saveAsClient, setSaveAsClient] = useState(true);
  const [typeId, setTypeId] = useState<string>(firstType?.id ?? OTHER);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(firstType?.duration_minutes ?? 30);
  const [locationType, setLocationType] = useState<LocationType>(firstType?.location_type ?? "google_meet");
  const [locationDetail, setLocationDetail] = useState(firstType?.location_detail ?? "");
  const [date, setDate] = useState(() => formatInTimeZone(new Date(), settings.timezone, "yyyy-MM-dd"));
  const [time, setTime] = useState("10:00");
  const [details, setDetails] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [sendConfirmation, setSendConfirmation] = useState(canSendEmail);
  const [email, setEmail] = useState({ subject: settings.confirmation_subject, body: settings.confirmation_body });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const type = types.find((t) => t.id === typeId) ?? null;
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim());

  function pickClient(id: string) {
    setWho(id);
    const c = activeClients.find((x) => x.id === id);
    setPerson(c ? { name: c.name, email: c.email ?? "", phone: c.phone ?? "", company: c.company ?? "" } : { name: "", email: "", phone: "", company: "" });
  }

  function pickType(id: string) {
    setTypeId(id);
    const t = types.find((x) => x.id === id);
    if (t) {
      setDuration(t.duration_minutes);
      setLocationType(t.location_type);
      setLocationDetail(t.location_detail ?? "");
    }
  }

  const previewVars = useMemo(() => {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)
      ? fromZonedTime(`${date}T${time}:00`, settings.timezone)
      : new Date();
    const meet = locationType === "google_meet";
    return meetingVars({
      clientName: person.name || "Client name",
      company: person.company,
      title: type?.name ?? (title || "Meeting"),
      start,
      end: new Date(start.getTime() + (Number(duration) || 30) * 60_000),
      timezone: settings.timezone,
      location: meet
        ? "Google Meet: (link added when sent)"
        : locationType === "phone"
          ? `Phone call${person.phone ? `: ${settings.owner_name} will call ${person.phone}` : ""}`
          : locationDetail,
      meetLink: meet ? "(Google Meet link added when sent)" : null,
      details,
      ownerName: settings.owner_name,
    });
  }, [date, time, duration, locationType, locationDetail, person, type, title, details, settings]);

  async function submit(e: React.FormEvent | null, force = false) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: who && who !== NEW ? who : null,
        saveAsClient: who === NEW && saveAsClient,
        ...person,
        eventTypeId: type?.id ?? null,
        title: type ? undefined : title,
        durationMinutes: Number(duration),
        locationType,
        locationDetail,
        date,
        time,
        details,
        sendInvite: sendInvite && hasEmail,
        sendConfirmation: sendConfirmation && hasEmail && canSendEmail,
        subject: email.subject,
        body: email.body,
        force,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409 && json.conflict) {
      if (confirm(`${json.error} Book it anyway?`)) return submit(null, true);
      return;
    }
    if (!res.ok) return setError(json.error ?? "Could not save the meeting.");
    onCreated(json.warnings ?? []);
  }

  return (
    <Modal title="Ad hoc meeting" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Book any time, even outside your booking page hours. Times are in {settings.timezone}.
        </p>

        <Field label="With">
          <select className="input" required value={who} onChange={(e) => pickClient(e.target.value)}>
            <option value="" disabled>Choose a client…</option>
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</option>
            ))}
            <option value={NEW}>Someone new…</option>
          </select>
        </Field>

        {who && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input className="input" required value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} />
            </Field>
            <Field label="Email" hint={who !== NEW && !person.email ? "No email on file. Add one to send an invite." : undefined}>
              <input className="input" type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" type="tel" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
            </Field>
            <Field label="Company">
              <input className="input" value={person.company} onChange={(e) => setPerson({ ...person, company: e.target.value })} />
            </Field>
            {who === NEW && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" className="accent-brand" checked={saveAsClient} onChange={(e) => setSaveAsClient(e.target.checked)} />
                Save them as a client
              </label>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Meeting type">
            <select className="input" value={typeId} onChange={(e) => pickType(e.target.value)}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value={OTHER}>Other…</option>
            </select>
          </Field>
          {!type ? (
            <Field label="Meeting name">
              <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Website handover" />
            </Field>
          ) : (
            <span className="hidden sm:block" />
          )}
          <Field label="Date">
            <input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time">
              <input className="input" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Length (min)">
              <input className="input" type="number" min="5" max="720" step="5" required value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Where">
            <select className="input" value={locationType} onChange={(e) => setLocationType(e.target.value as LocationType)}>
              {Object.entries(LOCATIONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          {(locationType === "in_person" || locationType === "custom") && (
            <Field label="Address or details">
              <input className="input" value={locationDetail} onChange={(e) => setLocationDetail(e.target.value)} />
            </Field>
          )}
        </div>

        <Field label="Details" hint="Agenda or notes. Shared with the client in the invite and confirmation.">
          <textarea className="input min-h-[80px]" value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>

        <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-brand" disabled={!hasEmail} checked={sendInvite && hasEmail} onChange={(e) => setSendInvite(e.target.checked)} />
            Send {person.name || "them"} a Google Calendar invite
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-brand"
              disabled={!hasEmail || !canSendEmail}
              checked={sendConfirmation && hasEmail && canSendEmail}
              onChange={(e) => setSendConfirmation(e.target.checked)}
            />
            Send a confirmation email
          </label>
          {!hasEmail && <p className="text-xs text-slate-500">Add an email address to send an invite or confirmation.</p>}
          {hasEmail && !canSendEmail && (
            <p className="text-xs text-amber-700">To send confirmation emails, reconnect Google in Settings, Booking page.</p>
          )}
          {!sendInvite && <p className="text-xs text-slate-500">Without an invite, the meeting still goes on your calendar.</p>}
        </div>

        {sendConfirmation && hasEmail && canSendEmail && (
          <EmailEditor subject={email.subject} body={email.body} onChange={setEmail} previewVars={previewVars} />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !who}>{busy ? "Booking…" : "Book meeting"}</Button>
        </div>
      </form>
    </Modal>
  );
}
