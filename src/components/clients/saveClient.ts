import { createClient } from "@/lib/supabase/client";
import type { ClientInput, DomainLoginInput } from "@/components/clients/ClientForm";

/**
 * Creates or updates a client, then saves its domain login through the
 * encrypted store. A saved login is removed if the domain is no longer external.
 * Returns the client id, or an error message.
 */
export async function saveClient(
  id: string | null,
  values: ClientInput,
  login: DomainLoginInput,
  hadLogin = false
): Promise<{ id: string } | { error: string }> {
  const supabase = createClient();
  const res = id
    ? await supabase.from("clients").update(values).eq("id", id).select("id").single()
    : await supabase.from("clients").insert(values).select("id").single();
  if (res.error) return { error: res.error.message };
  const clientId = res.data.id as string;

  if (login) {
    const { error } = await supabase.rpc("save_domain_login", {
      p_client_id: clientId,
      p_username: login.username,
      p_password: login.password,
    });
    if (error) return { error: `Client saved, but the domain login wasn't: ${error.message}` };
  } else if (hadLogin && values.domain_location !== "external") {
    const { error } = await supabase.rpc("remove_domain_login", { p_client_id: clientId });
    if (error) return { error: `Client saved, but the old domain login wasn't removed: ${error.message}` };
  }
  return { id: clientId };
}
