import { NextResponse, type NextRequest } from "next/server";
import { requireTeam } from "@/lib/auth";
import { sendConfirmation } from "@/lib/booking/sendConfirmation";

/** Sends (or resends) a meeting's confirmation email, optionally with an edited subject and body. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeam();
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { subject?: unknown; body?: unknown };
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

  try {
    await sendConfirmation(id, { subject: text(body.subject, 300), body: text(body.body, 10_000) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not send the email." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
