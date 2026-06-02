"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MusicStats } from "@/types/music-stats";
import { TopArtistsChart } from "./top-artists-chart";
import { ProductivityChart } from "./productivity-chart";
import { HourlyChart } from "./hourly-chart";

type Preset = "today" | "yesterday" | "last_7d" | "last_30d" | "all_time";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today",     label: "TODAY"        },
  { value: "yesterday", label: "YESTERDAY"    },
  { value: "last_7d",   label: "LAST 7 DAYS"  },
  { value: "last_30d",  label: "LAST 30 DAYS" },
  { value: "all_time",  label: "ALL TIME"     },
];

async function fetchMusicStats(range: Preset): Promise<MusicStats> {
  const res = await fetch(`/api/v1/music/stats?range=${range}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<MusicStats>;
}

function useCountUp(target: number): number {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    const controls = animate(from, target, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [target]);
  return display;
}

function fmtListened(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${String(m)}m`;
  return `${String(h)}h ${String(m)}m`;
}

export function MusicClient() {
  const [range, setRange] = useState<Preset>("last_7d");

  const { data, isLoading, isError, error } = useQuery({
    queryKey:        ["music-stats", range],
    queryFn:         () => fetchMusicStats(range),
    placeholderData: keepPreviousData,
    staleTime:       60_000,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Range picker */}
      <section className="rounded border border-border bg-surface p-4">
        <div className="mb-3 text-[10px] font-bold tracking-widest text-muted">RANGE</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setRange(p.value)}
              disabled={isLoading}
              className={
                "cursor-pointer rounded border px-3 py-1.5 text-[10px] font-bold tracking-widest transition-colors disabled:opacity-50 " +
                (range === p.value
                  ? "border-cyan bg-cyan/10 text-cyan"
                  : "border-border text-muted hover:border-purple/60 hover:text-text")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {isLoading && !data ? <SkeletonGrid /> : null}

      {isError ? (
        <div className="rounded border border-pink/40 bg-surface px-4 py-6 text-center text-xs text-pink">
          {error instanceof Error ? error.message : "Failed to load music data"}
        </div>
      ) : null}

      {data ? (
        <>
          {/* Summary row with count-up */}
          <SummaryRow
            listenedMs={data.totalListenedMs}
            artists={data.totalArtists}
            tracks={data.totalTracks}
          />

          {data.totalTracks === 0 ? (
            <div className="rounded border border-border bg-surface px-4 py-10 text-center text-[10px] tracking-widest text-muted">
              NO MUSIC DATA FOR THIS RANGE
            </div>
          ) : (
            <>
              {/* Top Artists + Productivity side by side on lg */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TopArtistsChart artists={data.topArtists} />
                <ProductivityChart rows={data.productivity} />
              </div>

              {/* Hourly pattern full width */}
              <HourlyChart buckets={data.hourlyPattern} />

              {/* Top Tracks text table */}
              <section className="rounded border border-border bg-surface p-4">
                <div className="mb-3 text-[10px] font-bold tracking-widest text-muted">
                  TOP TRACKS
                </div>
                <div className="flex flex-col gap-1">
                  {data.topTracks.map((t, i) => (
                    <div
                      key={`${t.artist}::${t.title}`}
                      className="flex items-baseline gap-3 py-1 text-xs"
                    >
                      <span className="w-5 shrink-0 text-right text-[10px] text-muted">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-text">
                        {t.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted">
                        {t.artist}
                      </span>
                      <span className="shrink-0 text-[10px] text-cyan">
                        {fmtListened(t.listenedMs)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function SummaryRow({ listenedMs, artists, tracks }: { listenedMs: number; artists: number; tracks: number }) {
  const animArtists = useCountUp(artists);
  const animTracks  = useCountUp(tracks);
  return (
    <div className="flex flex-wrap gap-2 text-[10px] tracking-widest">
      <span className="rounded border border-border bg-surface px-2.5 py-1 text-muted">
        LISTENED <span className="ml-1 text-cyan">{fmtListened(listenedMs)}</span>
      </span>
      <span className="rounded border border-border bg-surface px-2.5 py-1 text-muted">
        ARTISTS <span className="ml-1 text-cyan">{animArtists}</span>
      </span>
      <span className="rounded border border-border bg-surface px-2.5 py-1 text-muted">
        TRACKS <span className="ml-1 text-cyan">{animTracks}</span>
      </span>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-6 w-64 animate-pulse rounded bg-surface" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded border border-border bg-surface" />
        <div className="h-64 animate-pulse rounded border border-border bg-surface" />
      </div>
      <div className="h-52 animate-pulse rounded border border-border bg-surface" />
      <div className="h-40 animate-pulse rounded border border-border bg-surface" />
    </div>
  );
}
