import { NextResponse } from "next/server";
import { disconnectGoogle } from "@/lib/google";
import { requireTeam } from "@/lib/auth";

export async function POST() {
  const denied = await requireTeam();
  if (denied) return denied;
  await disconnectGoogle();
  return NextResponse.json({ ok: true });
}
