"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const ITEMS: { href: string; label: string }[] = [
  { href: "/dashboard",         label: "FEED"    },
  { href: "/dashboard/reports", label: "REPORTS" },
  { href: "/dashboard/music",   label: "MUSIC"   },
];

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Burger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-8 w-8 flex-col items-center justify-center gap-1.25 rounded text-muted transition-colors hover:text-text sm:hidden"
      >
        <span
          className="block h-px w-3.75 bg-current transition-all duration-200"
          style={{ transform: open ? "translateY(6px) rotate(45deg)" : "none" }}
        />
        <span
          className="block h-px w-3.75 bg-current transition-all duration-200"
          style={{ opacity: open ? 0 : 1 }}
        />
        <span
          className="block h-px w-3.75 bg-current transition-all duration-200"
          style={{ transform: open ? "translateY(-6px) rotate(-45deg)" : "none" }}
        />
      </button>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Slide-down panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-x-0 top-13 z-50 overflow-hidden border-b border-border bg-bg/95 backdrop-blur sm:hidden"
          >
            <nav className="mx-auto flex max-w-6xl flex-col px-6">
              {ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={
                      "border-b border-border/40 py-3.5 text-[10px] font-bold tracking-widest transition-colors last:border-0 " +
                      (active ? "text-cyan" : "text-muted hover:text-text")
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
