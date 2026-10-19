"use client";

import { useMemo, useState } from "react";
import { meetingInfo, meetingVars } from "@/lib/booking/confirmation";
import type { Booking, BookingSettings, EventType } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmailEditor } from "./EmailEditor";

export function SendConfirmationModal({
  booking,
  type,
  settings,
  onClose,
  onSent,
}: {
  booking: Booking;
  type: EventType | null;
  settings: BookingSettings;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState({ subject: settings.confirmation_subject, body: settings.confirmation_body });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const previewVars = useMemo(() => meetingVars(meetingInfo(booking, type, settings)), [booking, type, settings]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bookings/${booking.id}/confirmation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(email),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not send the email.");
    onSent();
  }

  return (
    <Modal title={`Confirmation email to ${booking.name}`} onClose={onClose} wide>
      <form onSubmit={send} className="space-y-4">
        <p className="text-sm text-slate-500">To {booking.email}</p>
        <EmailEditor subject={email.subject} body={email.body} onChange={setEmail} previewVars={previewVars} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy}>{busy ? "Sending…" : "Send email"}</Button>
        </div>
      </form>
    </Modal>
  );
}
