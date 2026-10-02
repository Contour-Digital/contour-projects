import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeAndStore, siteUrl } from "@/lib/google";
import { requireTeam } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const denied = await requireTeam();
  if (denied) return denied;

  const back = (status: string) => {
    const res = NextResponse.redirect(`${siteUrl()}/settings/booking?google=${status}`);
    res.cookies.delete({ name: "google_oauth_state", path: "/api/google" });
    return res;
  };

  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  const code = searchParams.get("code");
  if (!state || state !== request.cookies.get("google_oauth_state")?.value) return back("bad-state");
  if (!code) return back("cancelled");

  try {
    await exchangeCodeAndStore(code);
    return back("connected");
  } catch (err) {
    console.error(err);
    return back("error");
  }
}
