"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll, useVelocity } from "framer-motion";
import { TimerField } from "./timer-field";

const GlitchCanvas = dynamic(() => import("./glitch-canvas"), { ssr: false });

const VELOCITY_THRESHOLD = 80;

export function ParallaxBg() {
  const { scrollY } = useScroll();
  const velocity    = useVelocity(scrollY);
  const reduced     = useReducedMotion();
  const intensityRef = useRef(0);

  useMotionValueEvent(velocity, "change", (v) => {
    if (reduced) return;
    const speed = Math.abs(v);
    intensityRef.current = speed > VELOCITY_THRESHOLD
      ? Math.min((speed - VELOCITY_THRESHOLD) / 520, 1)
      : 0;
  });

  if (reduced) return null;

  return (
    <>
      {/* Three.js: dark base + prism wave on scroll */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <GlitchCanvas intensityRef={intensityRef} />
      </div>

      {/* 2D canvas: timer field — green idle, red + downward on scroll */}
      <TimerField />
    </>
  );
}
