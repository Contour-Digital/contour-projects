"use client";

import { useMemo, useState } from "react";
import { addDays } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/client";
import { meetingVars } from "@/lib/booking/confirmation";
import type { BookingSettings } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { EmailEditor } from "./EmailEditor";

/** Example values for previewing a template: tomorrow at 10am, 30 minutes on Meet. */
export function sampleVars(settings: BookingSettings, meetingType = "Discovery call") {
  const day = formatInTimeZone(addDays(new Date(), 1), settings.timezone, "yyyy-MM-dd");
  const start = fromZonedTime(`${day}T10:00:00`, settings.timezone);
  return meetingVars({
    clientName: "Sam Taylor",
    company: "Taylor Plumbing",
    title: meetingType,
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    timezone: settings.timezone,
    location: "Google Meet: https://meet.google.com/abc-defg-hij",
    meetLink: "https://meet.google.com/abc-defg-hij",
    details: "Quick chat about a new website.",
    ownerName: settings.owner_name,
  });
}

export function ConfirmationEmailForm({
  settings,
  canSend,
  connectedEmail,
  onSaved,
}: {
  settings: BookingSettings;
  canSend: boolean;
  connectedEmail?: string | null;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.confirmation_enabled);
  const [email, setEmail] = useState({ subject: settings.confirmation_subject, body: settings.confirmation_body });
  const [fromEmail, setFromEmail] = useState(settings.confirmation_from_email ?? "");
  const [fromName, setFromName] = useState(settings.confirmation_from_name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const preview = useMemo(() => sampleVars(settings), [settings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await createClient()
      .from("booking_settings")
      .update({
        confirmation_enabled: enabled,
        confirmation_subject: email.subject,
        confirmation_body: email.body,
        confirmation_from_email: fromEmail.trim().toLowerCase() || null,
        confirmation_from_name: fromName.trim() || null,
      })
      .eq("id", 1);
    setSaving(false);
    if (error) return alert(error.message);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">5. Confirmation email</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sent from your Google account to the client, with buttons to add the meeting to Google, Outlook or Apple Calendar.
          You can edit it before sending an ad hoc meeting, or resend it from Meetings.
        </p>
      </div>
      {!canSend && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Reconnect Google above and allow sending email, so the app can send these from your address.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-brand" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Email this after every booking made on the booking page
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Send from"
          hint={`Leave blank to use ${connectedEmail ?? "your connected Google address"}. An alias must first be added in Gmail under Settings, Accounts, "Send mail as", or Gmail sends from your main address instead.`}
        >
          <input className="input" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="e.g. bookings@contourdigital.com.au" />
        </Field>
        <Field label="Sender name">
          <input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder={settings.owner_name} />
        </Field>
      </div>
      <EmailEditor subject={email.subject} body={email.body} onChange={setEmail} previewVars={preview} />
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-green-700">Saved</span>}
        <Button disabled={saving}>{saving ? "Saving…" : "Save email"}</Button>
      </div>
    </form>
  );
}
