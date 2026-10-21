export const TWO_FACTOR_PATH = "/two-factor";

/**
 * Where a signed-in user should be sent, or null to let the request through.
 * Every dashboard page needs a session verified with an authenticator code
 * (Supabase's "aal2"); the two-factor page itself is for sessions that aren't yet.
 */
export function twoFactorRedirect(path: string, currentLevel: string | null | undefined): string | null {
  const verified = currentLevel === "aal2";
  const onTwoFactor = path === TWO_FACTOR_PATH;
  if (!verified && !onTwoFactor) return TWO_FACTOR_PATH;
  if (verified && onTwoFactor) return "/projects";
  return null;
}

/** Strips spaces so "123 456" from an authenticator app is accepted. */
export function cleanCode(code: string) {
  return code.replace(/\s+/g, "");
}

export function isSixDigitCode(code: string) {
  return /^\d{6}$/.test(cleanCode(code));
}
