import Link from "next/link";
import { loadActiveEventTypes, loadSettings } from "@/lib/booking/server";
import { Logo } from "@/components/brand/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book a time" };

export default async function BookIndex() {
  const [types, settings] = await Promise.all([loadActiveEventTypes(), loadSettings()]);
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Logo className="mb-8 h-8" />
      <div className="text-sm font-medium text-slate-500">{settings.owner_name}</div>
      <h1 className="mt-1 text-2xl font-semibold">Book a time</h1>
      <ul className="mt-6 space-y-3">
        {types.map((t) => (
          <li key={t.id}>
            <Link href={`/book/${t.slug}`} className="card flex items-center gap-4 p-4 transition hover:shadow-md">
              <span className="h-10 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="text-sm text-slate-500">{t.duration_minutes} minutes</div>
              </div>
              <span className="ml-auto text-slate-400">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
