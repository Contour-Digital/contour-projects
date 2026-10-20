"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/settings/stages", label: "Stages & automations" },
  { href: "/settings/booking", label: "Booking page" },
  { href: "/settings/security", label: "Security" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto mb-6 flex max-w-4xl gap-1 overflow-x-auto border-b border-slate-200 text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={clsx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2",
            pathname.startsWith(tab.href) ? "border-brand font-medium text-brand-navy" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
