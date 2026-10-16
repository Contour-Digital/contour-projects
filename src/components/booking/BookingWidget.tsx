"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export type PublicEventType = {
  slug: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  location_type: "google_meet" | "phone" | "in_person" | "custom";
  location_detail: string | null;
  color: string;
};

type Confirmation = { start: string; end: string; meetLink: string | null; location?: string };

const LOCATION_LABEL = {
  google_meet: "Google Meet video call",
  phone: "Phone call",
  in_person: "In person",
  custom: "",
};

export function BookingWidget({ eventType, ownerName, embedded }: { eventType: PublicEventType; ownerName: string; embedded?: boolean }) {
  // Empty until the browser tells us the visitor's timezone.
  const [tz, setTz] = useState("");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [days, setDays] = useState<Record<string, string[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  // Tell the parent page how tall we are, so the embed never scrolls.
  useEffect(() => {
    if (!embedded || !rootRef.current) return;
    // Measure our own box, not the document: the document is never shorter than the iframe.
    const post = () =>
      rootRef.current &&
      window.parent.postMessage(
        { type: "contour-booking:height", slug: eventType.slug, height: rootRef.current.getBoundingClientRect().height + 2 },
        "*"
      );
    const ro = new ResizeObserver(post);
    ro.observe(rootRef.current);
    post();
    return () => ro.disconnect();
  }, [embedded, eventType.slug]);

  useEffect(() => {
    if (!tz) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const monthStart = format(month, "yyyy-MM-dd");
    const from = monthStart < today ? today : monthStart;
    const to = format(endOfMonth(month), "yyyy-MM-dd");
    if (from > to) return setDays({});
    let cancelled = false;
    setLoadingSlots(true);
    setLoadError(null);
    fetch(`/api/availability?${new URLSearchParams({ slug: eventType.slug, from, to, tz })}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Could not load times");
        if (!cancelled) setDays(json.days);
      })
      .catch((e) => !cancelled && setLoadError(e.message))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [eventType.slug, month, tz, refreshKey]);

  const grid = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }),
    [month]
  );
  const thisMonth = startOfMonth(new Date());
  const timezones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return tz && !all.includes(tz) ? [tz, ...all] : all;
  }, [tz]);

  const location = eventType.location_type === "custom" || eventType.location_type === "in_person"
    ? eventType.location_detail || LOCATION_LABEL[eventType.location_type]
    : LOCATION_LABEL[eventType.location_type];

  return (
    <div ref={rootRef} className={clsx("mx-auto w-full max-w-3xl", !embedded && "card overflow-hidden")}>
      <div className="grid md:grid-cols-[260px_1fr]">
        <aside className="border-b border-slate-200 p-6 md:border-b-0 md:border-r">
          <div className="text-sm font-medium text-slate-500">{ownerName}</div>
          <h1 className="mt-1 text-xl font-semibold">{eventType.name}</h1>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>◷ {eventType.duration_minutes} minutes</li>
            {location && <li>◎ {location}</li>}
            {slot && (
              <li className="font-medium text-slate-800">
                ▣ {formatInTimeZone(parseISO(slot), tz, "EEEE d MMMM, h:mm a")}
              </li>
            )}
          </ul>
          {eventType.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{eventType.description}</p>}
        </aside>

        <div className="p-6">
          {confirmation ? (
            <Confirmed confirmation={confirmation} tz={tz} eventName={eventType.name} />
          ) : slot ? (
            <DetailsForm
              eventType={eventType}
              slot={slot}
              tz={tz}
              onBack={() => setSlot(null)}
              onBooked={setConfirmation}
              onTaken={() => {
                setSlot(null);
                setRefreshKey((k) => k + 1);
              }}
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_180px]">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">{format(month, "MMMM yyyy")}</h2>
                  <div className="flex gap-1">
                    <button
                      className="rounded-full px-2.5 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      disabled={month <= thisMonth}
                      onClick={() => setMonth(addMonths(month, -1))}
                      aria-label="Previous month"
                    >
                      ‹
                    </button>
                    <button className="rounded-full px-2.5 py-1 text-slate-500 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
                      ›
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d} className="py-1">{d}</div>
                  ))}
                </div>
                <div className={clsx("grid grid-cols-7 gap-1", loadingSlots && "animate-pulse")}>
                  {grid.map((d) => {
                    const key = format(d, "yyyy-MM-dd");
                    const available = isSameMonth(d, month) && (days[key]?.length ?? 0) > 0;
                    return (
                      <button
                        key={key}
                        disabled={!available}
                        onClick={() => setDate(key)}
                        className={clsx(
                          "aspect-square rounded-full text-sm transition",
                          !isSameMonth(d, month) && "invisible",
                          available ? "font-semibold hover:opacity-80" : "text-slate-300",
                          date === key && "text-white"
                        )}
                        style={
                          available
                            ? date === key
                              ? { backgroundColor: eventType.color }
                              : { backgroundColor: `${eventType.color}1a`, color: eventType.color }
                            : undefined
                        }
                      >
                        {format(d, "d")}
                      </button>
                    );
                  })}
                </div>
                {loadError && <p className="mt-3 text-sm text-red-600">{loadError}</p>}
                {!loadingSlots && !loadError && Object.keys(days).length === 0 && (
                  <p className="mt-3 text-sm text-slate-500">No times left this month. Try the next one.</p>
                )}
                <label className="mt-4 block text-xs text-slate-500">
                  Times shown in
                  <select className="ml-1 rounded border-0 bg-transparent p-0 text-xs font-medium text-slate-700" value={tz} onChange={(e) => setTz(e.target.value)}>
                    {timezones.map((z) => (
                      <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                {date ? (
                  <>
                    <h3 className="mb-3 text-sm font-medium">{format(parseISO(date), "EEEE d MMM")}</h3>
                    <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto pr-1">
                      {(days[date] ?? []).map((s) => (
                        <button
                          key={s}
                          onClick={() => setSlot(s)}
                          className="rounded-lg border py-2 text-sm font-semibold transition hover:text-white"
                          style={{ borderColor: eventType.color, color: eventType.color }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = eventType.color)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                        >
                          {formatInTimeZone(parseISO(s), tz, "h:mm a")}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Pick a day to see available times.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailsForm({
  eventType,
  slot,
  tz,
  onBack,
  onBooked,
  onTaken,
}: {
  eventType: PublicEventType;
  slot: string;
  tz: string;
  onBack: () => void;
  onBooked: (c: Confirmation) => void;
  onTaken: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "", website: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsPhone = eventType.location_type === "phone";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, slug: eventType.slug, start: slot, tz }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409) {
      alert(json.error);
      return onTaken();
    }
    if (!res.ok) return setError(json.error ?? "Something went wrong.");
    onBooked(json);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">← Back</button>
      <h2 className="font-semibold">Your details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Name *</span>
          <input className="input" required autoComplete="name" value={form.name} onChange={set("name")} />
        </label>
        <label className="block">
          <span className="label">Email *</span>
          <input className="input" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        </label>
        <label className="block">
          <span className="label">Phone{needsPhone ? " *" : ""}</span>
          <input className="input" type="tel" required={needsPhone} autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </label>
        <label className="block">
          <span className="label">Business name</span>
          <input className="input" autoComplete="organization" value={form.company} onChange={set("company")} />
        </label>
      </div>
      <label className="block">
        <span className="label">Anything we should know?</span>
        <textarea className="input min-h-[90px]" value={form.message} onChange={set("message")} placeholder="Tell us a little about your project" />
      </label>
      {/* Honeypot for bots; hidden from people and screen readers. */}
      <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set("website")} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={busy}
        className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: eventType.color }}
      >
        {busy ? "Booking…" : `Book ${formatInTimeZone(parseISO(slot), tz, "EEE d MMM, h:mm a")}`}
      </button>
    </form>
  );
}

function Confirmed({ confirmation, tz, eventName }: { confirmation: Confirmation; tz: string; eventName: string }) {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>
      <h2 className="mt-4 text-lg font-semibold">You&apos;re booked in</h2>
      <p className="mt-2 text-sm text-slate-600">
        {eventName} on {formatInTimeZone(parseISO(confirmation.start), tz, "EEEE d MMMM 'at' h:mm a")} ({tz.replace(/_/g, " ")}).
      </p>
      <p className="mt-1 text-sm text-slate-500">A calendar invite is on its way to your inbox.</p>
      {confirmation.meetLink && (
        <a href={confirmation.meetLink} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-medium text-brand-strong hover:underline">
          Google Meet link
        </a>
      )}
      {confirmation.location && !confirmation.meetLink && <p className="mt-3 text-sm text-slate-600">{confirmation.location}</p>}
    </div>
  );
}
