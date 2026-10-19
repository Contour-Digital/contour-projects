import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/book", "/embed", "/api/availability", "/api/book", "/api/calendar", "/embed.js"];

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

// Without this, a deploy missing its environment variables fails every request
// with Vercel's generic MIDDLEWARE_INVOCATION_FAILED error.
function setupNeeded(missing: string[]) {
  const items = missing.map((name) => `<li><code>${name}</code></li>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup needed</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5"><h1>Almost there</h1><p>These environment variables aren't set on this deployment:</p><ul>${items}</ul><p>Add them in Vercel under Project Settings, Environment Variables, then redeploy.</p></body>`;
  return new NextResponse(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}

// Refreshes the Supabase session on every request and sends signed-out users
// to /login, except on the public booking pages.
export async function updateSession(request: NextRequest) {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) return setupNeeded(missing);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
  if (isPublic) return response;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
