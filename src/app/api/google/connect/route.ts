import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { googleAuthUrl, googleConfigured, siteUrl } from "@/lib/google";
import { requireTeam } from "@/lib/auth";

export async function GET() {
  const denied = await requireTeam();
  if (denied) return denied;
  if (!googleConfigured()) {
    return NextResponse.redirect(`${siteUrl()}/settings/booking?google=not-configured`);
  }
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(googleAuthUrl(state));
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: siteUrl().startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google",
  });
  return res;
}
