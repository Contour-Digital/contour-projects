"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/Logo";

const NAV = [
  { href: "/board", label: "Board", icon: "▦" },
  { href: "/tasks", label: "My tasks", icon: "✓" },
  { href: "/business", label: "Business & Outreach", icon: "✉" },
  { href: "/clients", label: "Clients", icon: "◉" },
  { href: "/bookings", label: "Bookings", icon: "◷" },
  { href: "/settings/stages", label: "Stages & automations", icon: "⚙" },
  { href: "/settings/booking", label: "Booking page", icon: "⌘" },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/") || (href === "/board" && pathname.startsWith("/projects"));

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <Link href="/board" className="block px-5 pb-5 pt-6">
          <Logo className="h-[30px]" />
          <div className="mt-2 text-xs font-medium uppercase tracking-widest text-slate-400">Projects</div>
        </Link>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                isActive(item.href) ? "bg-brand-soft font-medium text-brand-navy shadow-[inset_3px_0_0_theme(colors.brand.DEFAULT)]" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <span className="w-4 text-center opacity-70">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
          <div className="truncate">{email}</div>
          <button onClick={signOut} className="mt-1 text-slate-700 hover:underline">Sign out</button>
        </div>
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <Link href="/board" aria-label="Board">
          <Logo className="h-6" />
        </Link>
        <span className="text-[11px] font-medium uppercase tracking-widest text-slate-400">Projects</span>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white md:hidden">
        {NAV.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", isActive(item.href) ? "text-brand-strong" : "text-slate-500")}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <Link
          href="/settings/stages"
          className={clsx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", pathname.startsWith("/settings") ? "text-brand-strong" : "text-slate-500")}
        >
          <span className="text-base">⚙</span>
          Settings
        </Link>
      </nav>
    </>
  );
}
