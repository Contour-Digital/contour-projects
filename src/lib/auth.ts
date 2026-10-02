import "server-only";
import { NextResponse } from "next/server";
import { isTeamMember } from "@/lib/supabase/server";

/** For API routes: a 403 response if the caller isn't on the team, else null. */
export async function requireTeam() {
  if (await isTeamMember()) return null;
  return NextResponse.json({ error: "Not authorised" }, { status: 403 });
}
