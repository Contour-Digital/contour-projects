"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanCode, isSixDigitCode } from "@/lib/twoFactor";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/brand/Logo";
import { CodeInput } from "@/components/auth/CodeInput";
import { TotpSetup } from "@/components/auth/TotpSetup";

// Second step of signing in. Asks for a code from the authenticator app, or
// sets one up the first time. The middleware keeps every dashboard page
// behind this until a code has been accepted.
export default function TwoFactorPage() {
  const router = useRouter();
  const [factorIds, setFactorIds] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createClient()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (error) return setError(error.message);
        setFactorIds(data.totp.map((f) => f.id));
      });
  }, []);

  function finish() {
    router.replace("/projects");
    router.refresh();
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorIds?.length) return;
    if (!isSixDigitCode(code)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // With more than one device set up, the code may come from any of them.
    for (const factorId of factorIds) {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: cleanCode(code) });
      if (!error) return finish();
    }
    setBusy(false);
    setError("That code didn't match. Try the newest code from your authenticator app.");
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const settingUp = factorIds !== null && factorIds.length === 0;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <Logo className="h-8" />
          <h1 className="mt-6 text-xl font-semibold text-brand-navy">
            {settingUp ? "Set up two-factor sign-in" : "Two-factor sign-in"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {settingUp
              ? "The dashboard needs a code from an authenticator app as well as your password. Set it up once and you'll be asked for a code each time you sign in."
              : "Enter the code from your authenticator app."}
          </p>
        </div>

        {factorIds === null ? (
          error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-slate-500">Loading…</p>
        ) : settingUp ? (
          <TotpSetup onDone={finish} />
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <CodeInput value={code} onChange={setCode} autoFocus />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="w-full" disabled={busy}>{busy ? "Checking…" : "Continue"}</Button>
          </form>
        )}

        <button type="button" onClick={signOut} className="text-sm text-slate-500 underline hover:text-slate-800">
          Sign out
        </button>
      </div>
    </main>
  );
}
