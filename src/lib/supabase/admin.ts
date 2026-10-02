import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS: only use in server code for the public
// booking flow and the Google connection, never with user-supplied filters
// you haven't validated.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
