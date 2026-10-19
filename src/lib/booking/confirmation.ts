import { formatInTimeZone } from "date-fns-tz";
import type { Booking, BookingSettings, EventType } from "@/lib/types";
import { formatAnswers, type Answer } from "@/lib/booking/questions";

// Confirmation emails: template placeholders, "Add to calendar" links, the
// .ics file and the raw MIME message. Pure, so the dashboard can preview it.

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "client_name", label: "Client's full name" },
  { key: "first_name", label: "Client's first name" },
  { key: "company", label: "Client's company" },
  { key: "meeting_type", label: "Meeting type or title" },
  { key: "date", label: "e.g. Tuesday 21 October 2026" },
  { key: "time", label: "Start time, e.g. 2:30 pm" },
  { key: "end_time", label: "End time" },
  { key: "timezone", label: "e.g. AEDT" },
  { key: "duration", label: "e.g. 30 minutes" },
  { key: "location", label: "Meet link, phone or address" },
  { key: "meeting_link", label: "Google Meet link (if any)" },
  { key: "details", label: "Details or agenda" },
  { key: "answers", label: "Their answers to your questions" },
  { key: "owner_name", label: "Your name" },
];

export type MeetingInfo = {
  clientName: string;
  company?: string | null;
  title: string;
  start: Date;
  end: Date;
  timezone: string;
  location?: string | null;
  meetLink?: string | null;
  details?: string | null;
  answers?: Answer[] | null;
  ownerName: string;
};

/** What the booking looks like to the client, in their timezone (or yours for ad hoc meetings). */
export function meetingInfo(booking: Booking, type: EventType | null, settings: BookingSettings): MeetingInfo {
  return {
    clientName: booking.name,
    company: booking.company,
    title: booking.title || type?.name || "Meeting",
    start: new Date(booking.start_at),
    end: new Date(booking.end_at),
    timezone: booking.timezone || settings.timezone,
    location: booking.meet_link ? `Google Meet: ${booking.meet_link}` : booking.location,
    meetLink: booking.meet_link,
    details: booking.message,
    answers: booking.answers,
    ownerName: settings.owner_name,
  };
}

function tzLabel(date: Date, timezone: string) {
  const part = new Intl.DateTimeFormat("en-AU", { timeZone: timezone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timezone;
}

function durationLabel(minutes: number) {
  if (minutes < 60 || minutes % 60 !== 0) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h} hour${h > 1 ? "s" : ""} ${m} minutes` : `${m} minutes`;
  }
  const h = minutes / 60;
  return `${h} hour${h > 1 ? "s" : ""}`;
}

export function meetingVars(m: MeetingInfo): Record<string, string> {
  const time = (d: Date) => formatInTimeZone(d, m.timezone, "h:mm aaa");
  return {
    client_name: m.clientName,
    first_name: m.clientName.trim().split(/\s+/)[0] ?? "",
    company: m.company ?? "",
    meeting_type: m.title,
    date: formatInTimeZone(m.start, m.timezone, "EEEE d MMMM yyyy"),
    time: time(m.start),
    end_time: time(m.end),
    timezone: tzLabel(m.start, m.timezone),
    duration: durationLabel(Math.round((m.end.getTime() - m.start.getTime()) / 60_000)),
    location: m.location || "To be confirmed",
    meeting_link: m.meetLink ?? "",
    details: m.details ?? "",
    answers: formatAnswers(m.answers),
    owner_name: m.ownerName,
  };
}

/** Fills {{placeholders}}; unknown ones are left as typed so mistakes are visible. */
export function renderTemplate(template: string, vars: Record<string, string>) {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => (key in vars ? vars[key] : match))
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export type CalendarLinks = { google: string; outlook: string; office365: string; ics: string };

export function calendarLinks(m: MeetingInfo, icsUrl: string): CalendarLinks {
  const title = `${m.title} with ${m.ownerName}`;
  const body = [m.details, m.meetLink && `Join: ${m.meetLink}`].filter(Boolean).join("\n\n");
  const location = m.location ?? "";
  const google = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(m.start)}/${stamp(m.end)}`,
    details: body,
    location,
  });
  const outlook = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: m.start.toISOString(),
    enddt: m.end.toISOString(),
    body,
    location,
  });
  return {
    google: `https://calendar.google.com/calendar/render?${google}`,
    outlook: `https://outlook.live.com/calendar/0/action/compose?${outlook}`,
    office365: `https://outlook.office.com/calendar/0/action/compose?${outlook}`,
    ics: icsUrl,
  };
}

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
}

// RFC 5545 wants lines of at most 75 octets, continued with a leading space.
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let n = 75;
    while (Buffer.byteLength(rest.slice(0, n)) > 75) n--;
    out.push(rest.slice(0, n));
    rest = " " + rest.slice(n);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(m: MeetingInfo & { uid: string; organizerEmail?: string | null; now?: Date }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Contour Digital//Projects//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${m.uid}`,
    `DTSTAMP:${stamp(m.now ?? new Date())}`,
    `DTSTART:${stamp(m.start)}`,
    `DTEND:${stamp(m.end)}`,
    `SUMMARY:${icsEscape(`${m.title} with ${m.ownerName}`)}`,
    m.details || m.meetLink
      ? `DESCRIPTION:${icsEscape([m.details, m.meetLink && `Join: ${m.meetLink}`].filter(Boolean).join("\n\n"))}`
      : null,
    m.location ? `LOCATION:${icsEscape(m.location)}` : null,
    m.meetLink ? `URL:${m.meetLink}` : null,
    m.organizerEmail ? `ORGANIZER;CN=${icsEscape(m.ownerName)}:mailto:${m.organizerEmail}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => Boolean(l));
  return lines.map(fold).join("\r\n") + "\r\n";
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function linkify(escaped: string) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#0098ff">${url}</a>`);
}

export function emailText(body: string, links: CalendarLinks) {
  return `${body}\n\nAdd to your calendar:\nGoogle: ${links.google}\nOutlook: ${links.outlook}\nOutlook (work or school): ${links.office365}\nApple and others: ${links.ics}\n`;
}

export function emailHtml(body: string, links: CalendarLinks) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 6px 8px 0;padding:8px 14px;border:1px solid #cbd5e1;border-radius:8px;color:#0f172a;text-decoration:none;font-size:14px">${label}</a>`;
  return `<!doctype html><html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a"><div style="max-width:560px">${paragraphs}<p style="margin:20px 0 8px;font-weight:bold">Add to your calendar</p><div>${button(links.google, "Google Calendar")}${button(links.outlook, "Outlook.com")}${button(links.office365, "Outlook (work or school)")}${button(links.ics, "Apple Calendar / other")}</div></div></body></html>`;
}

function encodeHeader(s: string) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;
}

function b64Lines(s: string) {
  return Buffer.from(s).toString("base64").replace(/.{76}(?=.)/g, "$&\r\n");
}

/** A multipart email (text, HTML, .ics attachment) ready for Gmail's send API. */
export function buildMime(opts: {
  from: { name: string; email: string };
  to: { name: string; email: string };
  subject: string;
  text: string;
  html: string;
  ics: string;
  boundary?: string;
}) {
  const mixed = opts.boundary ?? `mixed_${Math.random().toString(36).slice(2)}`;
  const alt = `alt_${mixed}`;
  const addr = (a: { name: string; email: string }) => `${encodeHeader(a.name.replace(/["\r\n]/g, ""))} <${a.email}>`;
  return [
    `From: ${addr(opts.from)}`,
    `To: ${addr(opts.to)}`,
    `Subject: ${encodeHeader(opts.subject.replace(/[\r\n]+/g, " "))}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(opts.text),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(opts.html),
    `--${alt}--`,
    `--${mixed}`,
    'Content-Type: text/calendar; charset=UTF-8; method=PUBLISH; name="invite.ics"',
    'Content-Disposition: attachment; filename="invite.ics"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(opts.ics),
    `--${mixed}--`,
    "",
  ].join("\r\n");
}
