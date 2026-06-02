"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const ITEMS: { href: string; label: string }[] = [
  { href: "/dashboard",         label: "FEED"    },
  { href: "/dashboard/reports", label: "REPORTS" },
  { href: "/dashboard/music",   label: "MUSIC"   },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 text-[10px] font-bold tracking-widest sm:flex">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "relative rounded px-2.5 py-1 transition-colors " +
              (active ? "text-cyan" : "text-muted hover:text-text")
            }
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 rounded bg-cyan/10"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
