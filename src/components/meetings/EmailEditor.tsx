"use client";

import { useRef } from "react";
import { EMAIL_LOGO_PATH, PLACEHOLDERS, renderTemplate } from "@/lib/booking/confirmation";
import { Field } from "@/components/ui/Field";

/** Subject and body with {{placeholder}} buttons and a live preview. */
export function EmailEditor({
  subject,
  body,
  onChange,
  previewVars,
}: {
  subject: string;
  body: string;
  onChange: (next: { subject: string; body: string }) => void;
  previewVars: Record<string, string>;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<"subject" | "body">("body");

  function insert(key: string) {
    const token = `{{${key}}}`;
    const target = lastFocused.current === "subject" ? subjectRef.current : bodyRef.current;
    const value = lastFocused.current === "subject" ? subject : body;
    const at = target?.selectionStart ?? value.length;
    const end = target?.selectionEnd ?? at;
    const next = value.slice(0, at) + token + value.slice(end);
    onChange(lastFocused.current === "subject" ? { subject: next, body } : { subject, body: next });
    requestAnimationFrame(() => {
      target?.focus();
      target?.setSelectionRange(at + token.length, at + token.length);
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Subject">
        <input
          ref={subjectRef}
          className="input"
          value={subject}
          onFocus={() => (lastFocused.current = "subject")}
          onChange={(e) => onChange({ subject: e.target.value, body })}
        />
      </Field>
      <Field label="Message">
        <textarea
          ref={bodyRef}
          className="input min-h-[220px] font-mono text-[13px]"
          value={body}
          onFocus={() => (lastFocused.current = "body")}
          onChange={(e) => onChange({ subject, body: e.target.value })}
        />
      </Field>
      <div>
        <span className="label">Insert</span>
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.label}
              onClick={() => insert(p.key)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700 hover:border-brand hover:bg-white"
            >
              {`{{${p.key}}}`}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Preview</div>
        <div className="font-semibold">{renderTemplate(subject, previewVars)}</div>
        <p className="mt-2 whitespace-pre-wrap text-slate-700">{renderTemplate(body, previewVars)}</p>
        <div className="mt-3 text-xs font-semibold text-slate-600">Add to your calendar</div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-600">
          {["Google Calendar", "Outlook.com", "Outlook (work or school)", "Apple Calendar / other"].map((l) => (
            <span key={l} className="rounded-md border border-slate-300 bg-white px-2 py-1">{l}</span>
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={EMAIL_LOGO_PATH} alt="Contour Digital" width={150} height={24} className="mt-5 border-t border-slate-200 pt-3" style={{ width: 150, height: "auto", boxSizing: "content-box" }} />
        <p className="mt-2 text-xs text-slate-500">An .ics calendar file is attached too. Sent from your connected Google account.</p>
      </div>
    </div>
  );
}
