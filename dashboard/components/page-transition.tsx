"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ORDER: Record<string, number> = {
  "/dashboard":         0,
  "/dashboard/reports": 1,
  "/dashboard/music":   2,
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced  = useReducedMotion();

  // getDerivedStateFromProps pattern: call setState during render (not in an effect).
  // React re-runs the render synchronously with updated state, so the entering
  // motion.div always mounts with the correct direction in its `initial` prop.
  const [nav, setNav] = useState({ prevPath: pathname, dir: 0 });

  if (nav.prevPath !== pathname) {
    const prev = NAV_ORDER[nav.prevPath] ?? 0;
    const curr = NAV_ORDER[pathname]    ?? 0;
    setNav({ prevPath: pathname, dir: curr >= prev ? 1 : -1 });
  }

  const dir = nav.dir;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={reduced ? false : { opacity: 0, x: dir * 36, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={reduced ? {} : { opacity: 0, x: dir * -36, scale: 0.97 }}
        transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex-1"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
