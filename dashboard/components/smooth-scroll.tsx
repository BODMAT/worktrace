"use client";

import { ReactLenis } from "lenis/react";
import type { LenisOptions } from "lenis";

const OPTIONS: LenisOptions = {
  duration:    1.4,                                            // inertia length in seconds
  easing:      (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo ease-out
  smoothWheel: true,
};

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  return <ReactLenis root options={OPTIONS}>{children}</ReactLenis>;
}
