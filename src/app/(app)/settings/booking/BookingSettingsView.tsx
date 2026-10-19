"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { must, useData } from "@/lib/useData";
import type { BookingSettings, EventType, LocationType, RepeatingRule, TimeRange, WeeklyHours } from "@/lib/types";
import { hoursForDate } from "@/lib/booking/availability";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { LOCATIONS, LOCATION_TYPES, locationDetail, offeredLocations } from "@/lib/booking/locations";
import { ConfirmationEmailForm } from "@/components/meetings/ConfirmationEmailForm";
import { QUESTION_TYPES, cleanQuestions, hasOptions, type Question, type QuestionType } from "@/lib/booking/questions";

const DAYS: { key: keyof WeeklyHours; label: string }[] = [
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
  { key: "7", label: "Sunday" },
];

const GOOGLE_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Google connected.", ok: true },
  cancelled: { text: "Google connection was cancelled.", ok: false },
  "bad-state": { text: "That Google sign-in link expired. Please try again.", ok: false },
  error: { text: "Google connection failed. Check the client ID, secret and redirect URI, then try again.", ok: false },
  "not-configured": { text: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the app's environment first (see README).", ok: false },
};

async function load() {
  const supabase = createClient();
  const [settings, types, google] = await Promise.all([
    supabase.from("booking_settings").select("*").eq("id", 1).single().then(must),
    supabase.from("event_types").select("*").order("position").then(must),
    supabase.rpc("google_connection_status").then(must),
  ]);
  return {
    settings: settings as BookingSettings,
    types: types as EventType[],
    google: ((google as { email: string | null; connected_at: string; can_send_email: boolean }[]) ?? [])[0] ?? null,
  };
}

export function BookingSettingsView(props: { googleConfigured: boolean; siteUrl: string }) {
  return (
    <Suspense>
      <View {...props} />
    </Suspense>
  );
}

function View({ googleConfigured, siteUrl }: { googleConfigured: boolean; siteUrl: string }) {
  const params = useSearchParams();
  const { data, reload, error, loading } = useData(load);
  const [editingType, setEditingType] = useState<Partial<EventType> | null>(null);

  if (error) return <p className="text-red-600">{error}</p>;
  if (loading || !data) return <p className="text-slate-500">Loading…</p>;

  const flash = GOOGLE_MESSAGES[params.get("google") ?? ""];
  const embedScript = `${siteUrl}/embed.js`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Booking page" subtitle="Let people book time with you, straight into Google Calendar." />

      {flash && (
        <div className={`rounded-lg p-3 text-sm ${flash.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>{flash.text}</div>
      )}

      <section className="card p-5">
        <h2 className="font-semibold">1. Google Calendar</h2>
        <p className="mt-1 text-sm text-slate-500">
          Busy times on your calendar are hidden from the booking page, and every booking is added to it with an invite emailed to the person who booked.
          Confirmation emails are sent from this Google account too.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {data.google ? (
            <>
              <span className="rounded-full bg-green-50 px-3 py-1 text-sm text-green-800">
                ● Connected{data.google.email ? ` as ${data.google.email}` : ""} since {format(parseISO(data.google.connected_at), "d MMM yyyy")}
              </span>
              {!data.google.can_send_email && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">Can&apos;t send emails yet: reconnect and allow it</span>
              )}
              <a href="/api/google/connect"><Button variant={data.google.can_send_email ? "secondary" : "primary"} size="sm">Reconnect</Button></a>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (!confirm("Disconnect Google Calendar? Bookings will still be saved here but won't reach your calendar.")) return;
                  await fetch("/api/google/disconnect", { method: "POST" });
                  reload();
                }}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">Not connected</span>
              <a href="/api/google/connect"><Button disabled={!googleConfigured}>Connect Google Calendar</Button></a>
              {!googleConfigured && <span className="text-xs text-slate-500">Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README).</span>}
            </>
          )}
        </div>
      </section>

      <AvailabilityForm settings={data.settings} onSaved={reload} />

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">3. Meeting types</h2>
          <Button size="sm" onClick={() => setEditingType({ duration_minutes: 30, location_type: "google_meet", location_types: ["google_meet"], active: true, color: "#0098ff" })}>
            ＋ Add meeting type
          </Button>
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {data.types.map((t) => {
            const link = `${siteUrl}/book/${t.slug}`;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {t.name} <span className="font-normal text-slate-500">· {t.duration_minutes} min · {offeredLocations(t).map((l) => LOCATIONS[l].split(" (")[0]).join(", ")}</span>
                    {!t.active && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Hidden</span>}
                  </div>
                  <a className="truncate text-xs text-brand-strong hover:underline" href={link} target="_blank" rel="noreferrer">{link}</a>
                </div>
                <CopyButton text={link} label="Copy link" />
                <Button size="sm" variant="secondary" onClick={() => setEditingType(t)}>Edit</Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">4. Put it on your website</h2>
        <p className="mt-1 text-sm text-slate-500">
          Paste this where you want the booking calendar to appear (in Duda, use an HTML/embed widget). It resizes itself to fit.
        </p>
        {data.types.filter((t) => t.active).map((t) => {
          const snippet = `<div data-contour-booking="${t.slug}"></div>\n<script src="${embedScript}" async></script>`;
          return (
            <div key={t.id} className="mt-4">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{t.name}</span>
                <CopyButton text={snippet} label="Copy embed code" />
              </div>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{snippet}</pre>
            </div>
          );
        })}
        <p className="mt-4 text-xs text-slate-500">
          Prefer a plain iframe? Use <code className="rounded bg-slate-100 px-1">{`<iframe src="${siteUrl}/embed/discovery-call" style="width:100%;height:720px;border:0"></iframe>`}</code>.
          Or link a button straight to the booking page.
        </p>
      </section>

      <ConfirmationEmailForm settings={data.settings} canSend={Boolean(data.google?.can_send_email)} connectedEmail={data.google?.email} onSaved={reload} />

      {editingType && (
        <EventTypeModal
          initial={editingType}
          onClose={() => setEditingType(null)}
          onSaved={() => {
            setEditingType(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function AvailabilityForm({ settings, onSaved }: { settings: BookingSettings; onSaved: () => void }) {
  const [form, setForm] = useState<BookingSettings>({
    ...settings,
    availability_mode: settings.availability_mode ?? "weekly",
    repeating_hours: settings.repeating_hours ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const timezones = supported.includes(form.timezone) ? supported : [form.timezone, ...supported];

  function setDay(day: keyof WeeklyHours, ranges: WeeklyHours[keyof WeeklyHours]) {
    setForm({ ...form, weekly_hours: { ...form.weekly_hours, [day]: ranges } });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.availability_mode === "repeating" && form.repeating_hours.length === 0) {
      return alert("Add at least one start date, or switch back to weekly hours.");
    }
    setSaving(true);
    // The confirmation email has its own form; don't overwrite it with a stale copy.
    const { id: _id, confirmation_enabled: _e, confirmation_subject: _s, confirmation_body: _b, confirmation_from_email: _f, confirmation_from_name: _n, ...patch } = form;
    const { error } = await createClient().from("booking_settings").update(patch).eq("id", 1);
    setSaving(false);
    if (error) return alert(error.message);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  }

  return (
    <form onSubmit={save} className="card space-y-5 p-5">
      <h2 className="font-semibold">2. When people can book</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name shown on booking page">
          <input className="input" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
        </Field>
        <Field label="Your timezone">
          <select className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-3">
        <span className="label">Available hours</span>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
          {([
            ["weekly", "Weekly hours"],
            ["repeating", "Repeat from a date"],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`rounded-md px-3 py-1.5 ${form.availability_mode === mode ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setForm({ ...form, availability_mode: mode })}
            >
              {label}
            </button>
          ))}
        </div>

        {form.availability_mode === "repeating" ? (
          <RepeatingEditor rules={form.repeating_hours} onChange={(repeating_hours) => setForm({ ...form, repeating_hours })} settings={form} />
        ) : (
          <div className="space-y-2">
            {DAYS.map(({ key, label }) => {
              const ranges = form.weekly_hours[key] ?? [];
              const on = ranges.length > 0;
              return (
                <div key={key} className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex w-32 items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-brand"
                      checked={on}
                      onChange={(e) => setDay(key, e.target.checked ? [{ start: "09:00", end: "17:00" }] : [])}
                    />
                    {label}
                  </label>
                  {on ? <RangesEditor ranges={ranges} onChange={(r) => setDay(key, r)} /> : <span className="text-slate-400">Unavailable</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Minimum notice (hours)">
          <input className="input" type="number" min="0" value={form.min_notice_hours} onChange={(e) => setForm({ ...form, min_notice_hours: Number(e.target.value) })} />
        </Field>
        <Field label="Book up to (days ahead)">
          <input className="input" type="number" min="1" value={form.max_days_ahead} onChange={(e) => setForm({ ...form, max_days_ahead: Number(e.target.value) })} />
        </Field>
        <Field label="Buffer between (min)">
          <input className="input" type="number" min="0" value={form.buffer_minutes} onChange={(e) => setForm({ ...form, buffer_minutes: Number(e.target.value) })} />
        </Field>
        <Field label="Start times every (min)">
          <select className="input" value={form.slot_interval_minutes} onChange={(e) => setForm({ ...form, slot_interval_minutes: Number(e.target.value) })}>
            {[15, 20, 30, 60].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Google calendar ID" hint="Leave as 'primary' unless you book into a different calendar.">
        <input className="input" value={form.calendar_id} onChange={(e) => setForm({ ...form, calendar_id: e.target.value })} />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-green-700">Saved</span>}
        <Button disabled={saving}>{saving ? "Saving…" : "Save availability"}</Button>
      </div>
    </form>
  );
}

function RangesEditor({ ranges, onChange }: { ranges: TimeRange[]; onChange: (ranges: TimeRange[]) => void }) {
  return (
    <>
      {ranges.map((r, i) => (
        <span key={i} className="flex items-center gap-1">
          <input
            type="time"
            className="input w-36 py-1"
            value={r.start}
            onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
          />
          –
          <input
            type="time"
            className="input w-36 py-1"
            value={r.end}
            onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
          />
          {ranges.length > 1 && (
            <button type="button" className="px-1 text-slate-400 hover:text-red-600" onClick={() => onChange(ranges.filter((_, j) => j !== i))}>
              ✕
            </button>
          )}
        </span>
      ))}
      <button type="button" className="text-xs text-brand-strong hover:underline" onClick={() => onChange([...ranges, { start: "13:00", end: "17:00" }])}>
        + split hours
      </button>
    </>
  );
}

/** Start dates that each repeat every N days, e.g. 19/10/2026, 9-5, every 8 days. */
function RepeatingEditor({ rules, onChange, settings }: { rules: RepeatingRule[]; onChange: (rules: RepeatingRule[]) => void; settings: BookingSettings }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const update = (i: number, patch: Partial<RepeatingRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // The next few days with hours, so the pattern can be checked at a glance.
  const upcoming: string[] = [];
  for (let d = parseISO(today), n = 0; n < 90 && upcoming.length < 6; d = addDays(d, 1), n++) {
    const date = format(d, "yyyy-MM-dd");
    if (hoursForDate(settings, date).length) upcoming.push(format(d, "EEE d MMM"));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Pick a date, set your hours that day, and how often it repeats. Add more dates to build a rotating pattern, for example two days on in every 8-day cycle.
      </p>
      {rules.map((rule, i) => (
        <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <label className="flex items-center gap-2">
            From
            <input type="date" className="input w-40 py-1" required value={rule.start_date} onChange={(e) => update(i, { start_date: e.target.value })} />
          </label>
          <label className="flex items-center gap-2">
            repeat every
            <input
              type="number"
              className="input w-20 py-1"
              min="1"
              max="365"
              required
              value={rule.every_days}
              onChange={(e) => update(i, { every_days: Number(e.target.value) })}
            />
            days
          </label>
          <RangesEditor ranges={rule.hours} onChange={(hours) => update(i, { hours })} />
          <button type="button" className="ml-auto text-xs text-slate-400 hover:text-red-600" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm text-brand-strong hover:underline"
        onClick={() => onChange([...rules, { start_date: today, every_days: 7, hours: [{ start: "09:00", end: "17:00" }] }])}
      >
        + Add start date
      </button>
      {rules.length > 0 && (
        <p className="text-xs text-slate-500">{upcoming.length ? `Next available: ${upcoming.join(", ")}` : "No available days in the next 90 days."}</p>
      )}
    </div>
  );
}

function EventTypeModal({ initial, onClose, onSaved }: { initial: Partial<EventType>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<EventType>>(initial);
  const [questions, setQuestions] = useState<Question[]>(initial.questions ?? []);
  const [where, setWhere] = useState<LocationType[]>(() =>
    offeredLocations({ location_type: "google_meet", location_detail: null, ...initial })
  );
  const [details, setDetails] = useState<Partial<Record<LocationType, string>>>(() =>
    Object.fromEntries(
      LOCATION_TYPES.map((l) => [l, locationDetail({ location_type: "google_meet", location_detail: null, ...initial }, l) ?? ""])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (where.length === 0) return setError("Tick at least one place this meeting can happen.");
    const cleaned = cleanQuestions(questions);
    if ("error" in cleaned) return setError(cleaned.error);
    const location_details = Object.fromEntries(
      where.filter((l) => l === "in_person" || l === "custom").flatMap((l) => (details[l]?.trim() ? [[l, details[l]!.trim()]] : []))
    );
    const row = {
      name: form.name?.trim() ?? "",
      slug: slugify(form.slug || form.name || ""),
      description: form.description?.trim() || null,
      duration_minutes: Number(form.duration_minutes) || 30,
      location_types: where,
      location_details,
      // The first ticked location, for anything that still reads a single location.
      location_type: where[0],
      location_detail: location_details[where[0]] ?? null,
      questions: cleaned.questions,
      color: form.color ?? "#0098ff",
      active: form.active ?? true,
    };
    const { error } = form.id
      ? await supabase.from("event_types").update(row).eq("id", form.id)
      : await supabase.from("event_types").insert(row);
    if (error) return setError(error.code === "23505" ? "That link name is already used." : error.message);
    onSaved();
  }

  return (
    <Modal title={form.id ? "Edit meeting type" : "New meeting type"} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Name">
          <input className="input" required value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Website consultation" />
        </Field>
        <Field label="Link" hint={`/book/${slugify(form.slug || form.name || "") || "…"}`}>
          <input className="input" value={form.slug ?? ""} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Leave blank to use the name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Length (minutes)">
            <input className="input" type="number" min="5" max="480" step="5" value={form.duration_minutes ?? 30} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
          </Field>
          <Field label="Colour">
            <input className="input h-[38px] p-1" type="color" value={form.color ?? "#0098ff"} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </Field>
        </div>
        <fieldset>
          <legend className="label">Where</legend>
          <p className="text-xs text-slate-500">Tick every option you offer. If you tick more than one, the client chooses when they book.</p>
          <div className="mt-2 space-y-2">
            {LOCATION_TYPES.map((l) => {
              const on = where.includes(l);
              return (
                <div key={l}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-brand"
                      checked={on}
                      onChange={(e) => setWhere(e.target.checked ? LOCATION_TYPES.filter((x) => x === l || where.includes(x)) : where.filter((x) => x !== l))}
                    />
                    {LOCATIONS[l]}
                  </label>
                  {on && (l === "in_person" || l === "custom") && (
                    <input
                      className="input mt-1.5 ml-6 w-[calc(100%-1.5rem)]"
                      value={details[l] ?? ""}
                      onChange={(e) => setDetails({ ...details, [l]: e.target.value })}
                      placeholder={l === "in_person" ? "Address" : "Details shown to the client"}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
        <Field label="Description (shown on the booking page)">
          <textarea className="input min-h-[70px]" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <QuestionsEditor questions={questions} onChange={setQuestions} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-brand" checked={form.active ?? true} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Bookable
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-between gap-2 pt-2">
          {form.id ? (
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (!confirm("Delete this meeting type? Existing bookings are kept.")) return;
                await supabase.from("event_types").delete().eq("id", form.id!);
                onSaved();
              }}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button>Save</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function QuestionsEditor({ questions, onChange }: { questions: Question[]; onChange: (q: Question[]) => void }) {
  const update = (i: number, patch: Partial<Question>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, by: number) => {
    const next = [...questions];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  const add = () =>
    onChange([...questions, { id: crypto.randomUUID().slice(0, 8), label: "", type: "short_text", options: [], required: false }]);

  return (
    <fieldset>
      <legend className="label">Questions for the client</legend>
      <p className="text-xs text-slate-500">Asked on the booking page before they confirm. Their answers are saved with the booking.</p>
      <div className="mt-2 space-y-2">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={q.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="e.g. What does your business do?"
                aria-label="Question"
              />
              <select
                className="input w-auto"
                value={q.type}
                onChange={(e) => update(i, { type: e.target.value as QuestionType })}
                aria-label="Answer type"
              >
                {Object.entries(QUESTION_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {hasOptions(q.type) && (
              <textarea
                className="input mt-2 min-h-[70px]"
                value={q.options.join("\n")}
                onChange={(e) => update(i, { options: e.target.value.split("\n") })}
                placeholder={"One choice per line, e.g.\nWebsite\nSEO\nBranding"}
                aria-label="Choices"
              />
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-brand" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />
                Required
              </label>
              <span className="flex-1" />
              <button type="button" className="text-slate-500 hover:text-slate-800 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button type="button" className="text-slate-500 hover:text-slate-800 disabled:opacity-30" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button type="button" className="text-red-600 hover:underline" onClick={() => onChange(questions.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={add}>＋ Add question</Button>
    </fieldset>
  );
}
