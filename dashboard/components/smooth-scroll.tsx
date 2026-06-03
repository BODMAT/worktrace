"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ReactLenis, useLenis } from "lenis/react";
import type { LenisOptions } from "lenis";

const OPTIONS: LenisOptions = {
  duration:    1.4,
  easing:      (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
};

function LenisResizer() {
  const lenis = useLenis();
  const pathname = usePathname();

  useEffect(() => {
    lenis?.scrollTo(0, { immediate: true });
    lenis?.resize();
  }, [lenis, pathname]);

  // Recalculate scroll height when lazy-loaded content (charts, data) changes
  // body height. html { height: 100% } is fixed at viewport — observe body instead.
  useEffect(() => {
    if (!lenis) return;
    const ro = new ResizeObserver(() => lenis.resize());
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [lenis]);

  return null;
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis root options={OPTIONS}>
      <LenisResizer />
      {children}
    </ReactLenis>
  );
}
