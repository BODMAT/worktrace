"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string }[] = [
  { href: "/dashboard",         label: "FEED"    },
  { href: "/dashboard/reports", label: "REPORTS" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-[10px] font-bold tracking-widest">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "rounded px-2.5 py-1 transition-colors " +
              (active
                ? "bg-cyan/10 text-cyan"
                : "text-muted hover:text-text")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
