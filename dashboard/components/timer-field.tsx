"use client";

import { useEffect, useRef } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll, useVelocity } from "framer-motion";

// ─── Config ───────────────────────────────────────────────────────────────────

const COUNT            = 85;
const BASE_FONT        = 11;    // px — sizes range 0.6× – 1.5×
const SCROLL_THRESHOLD = 80;    // px/s before effects kick in
const REVERSE_SPEED    = 45;    // ms subtracted per real-ms when scrolling fast

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(Math.abs(ms)));
  const h  = Math.floor(total / 3_600_000);
  const m  = Math.floor((total % 3_600_000) / 60_000);
  const s  = Math.floor((total % 60_000) / 1_000);
  const cs = Math.floor((total % 1_000) / 10);
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

interface T {
  x:    number;   // px
  y:    number;   // px (drifts with scroll)
  size: number;   // font scale 0.6–1.5
  ms:   number;   // current timer value in ms
  driftX: number; // gentle horizontal drift
  driftY: number; // gentle vertical drift (natural)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TimerField() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const timersRef  = useRef<T[]>([]);
  const velRef     = useRef(0);
  const rafRef     = useRef(0);
  const reduced    = useReducedMotion();

  const { scrollY } = useScroll();
  const velocity    = useVelocity(scrollY);

  useMotionValueEvent(velocity, "change", (v) => { velRef.current = v; });

  // Init timers after canvas mounts so we have window dimensions
  useEffect(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    timersRef.current = Array.from({ length: COUNT }, () => ({
      x:      Math.random() * W,
      y:      Math.random() * H,
      size:   0.6 + Math.random() * 0.9,
      ms:     Math.random() * 5_400_000,   // 0–90 min spread
      driftX: (Math.random() - 0.5) * 0.05,
      driftY: (Math.random() - 0.5) * 0.06,
    }));
  }, []);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let last = performance.now();

    const c = canvas; // stable reference for closures

    function resize() {
      c.width  = window.innerWidth;
      c.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function draw(now: number) {
      const dt = Math.min(now - last, 50);
      last = now;

      const speed     = Math.abs(velRef.current);
      const intensity = Math.max(0, Math.min((speed - SCROLL_THRESHOLD) / 520, 1));
      const scrolling = speed > SCROLL_THRESHOLD;

      ctx.clearRect(0, 0, c.width, c.height);

      for (const t of timersRef.current) {
        // ── Time value ──────────────────────────────────────────────────────
        if (scrolling) {
          t.ms -= dt * (1 + intensity * REVERSE_SPEED);  // reverse + accelerate
          if (t.ms < 0) t.ms = 5_400_000;
        } else {
          t.ms += dt;                                     // normal forward tick
          if (t.ms > 5_400_000) t.ms = 0;
        }

        // ── Position ────────────────────────────────────────────────────────
        t.x += t.driftX;
        // natural drift + downward parallax proportional to depth (size)
        t.y += t.driftY + intensity * t.size * 2.2;

        // wrap
        if (t.x < -80)             t.x = c.width  + 60;
        if (t.x > c.width  + 80)  t.x = -60;
        if (t.y < -20)             t.y = c.height + 10;
        if (t.y > c.height + 20)  t.y = -10;

        // ── Style ───────────────────────────────────────────────────────────
        const fontSize = Math.round(BASE_FONT * t.size);

        if (scrolling) {
          // Aggressive red — brighter/stronger with intensity
          const g = Math.round((1 - intensity) * 40);
          const a = 0.45 + intensity * 0.50;
          ctx.fillStyle   = `rgba(255, ${g}, 30, ${a})`;
          ctx.shadowColor = `rgba(255, 0, 70, ${intensity * 0.9})`;
          ctx.shadowBlur  = 4 + intensity * 12;
        } else {
          // Default green — dim, subtle
          const a = 0.15 + t.size * 0.10;
          ctx.fillStyle   = `rgba(0, 229, 176, ${a})`;
          ctx.shadowColor = "rgba(0, 229, 176, 0.25)";
          ctx.shadowBlur  = 2;
        }

        ctx.font      = `${fontSize}px "Courier New", monospace`;
        ctx.fillText(fmt(t.ms), t.x, t.y);
      }

      ctx.shadowBlur = 0;
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden
    />
  );
}
