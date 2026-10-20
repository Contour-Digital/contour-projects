"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cleanCode, isSixDigitCode } from "@/lib/twoFactor";
import { Button } from "@/components/ui/Button";
import { CodeInput } from "@/components/auth/CodeInput";

type Enrolment = { factorId: string; qrCode: string; secret: string };

// Supabase hands back the QR code as raw SVG behind a data: prefix. Encoding
// it means characters like "#" in the SVG can't cut the image short.
function svgDataUrl(qrCode: string) {
  const svg = qrCode.startsWith("data:") ? qrCode.slice(qrCode.indexOf(",") + 1) : qrCode;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Adds an authenticator app: shows a QR code to scan, then checks the first
 * code from the app. The new device only counts once that code is accepted.
 */
export function TotpSetup({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // React runs effects twice in development; one enrolment is enough.
    if (started.current) return;
    started.current = true;
    (async () => {
      const supabase = createClient();
      // A setup that was abandoned part way leaves an unverified factor behind.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Contour Digital",
        friendlyName: `Authenticator app ${new Date().toISOString()}`,
      });
      if (error) return setError(error.message);
      setEnrolment({ factorId: data.id, qrCode: svgDataUrl(data.totp.qr_code), secret: data.totp.secret });
    })();
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolment) return;
    if (!isSixDigitCode(code)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code: cleanCode(code) });
    setBusy(false);
    if (error) return setError("That code didn't match. Check the time on your phone is set automatically and try the newest code.");
    onDone();
  }

  if (!enrolment) {
    return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-slate-500">Preparing your QR code…</p>;
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password or similar).</li>
        <li>Add an account and scan this QR code.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrolment.qrCode} alt="QR code for your authenticator app" className="mx-auto h-48 w-48 rounded-lg border border-slate-200 bg-white p-2" />
      <div className="text-center text-xs text-slate-500">
        {showSecret ? (
          <p>
            Can&apos;t scan it? Enter this key instead:
            <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 font-mono text-slate-800">{enrolment.secret}</code>
          </p>
        ) : (
          <button type="button" className="underline hover:text-slate-800" onClick={() => setShowSecret(true)}>
            Can&apos;t scan it? Show the setup key
          </button>
        )}
      </div>
      <CodeInput value={code} onChange={setCode} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy}>{busy ? "Checking…" : "Turn on"}</Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
