"use client";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import type { TopArtist } from "@/types/music-stats";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function fmtMin(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return s > 0 ? `${String(m)}m ${String(s)}s` : `${String(m)}m`;
}

export function TopArtistsChart({ artists }: { artists: TopArtist[] }) {
  if (artists.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded border border-border bg-surface text-[10px] tracking-widest text-muted">
        NO ARTISTS IN RANGE
      </div>
    );
  }

  const sorted = [...artists].sort((a, b) => b.listenedMs - a.listenedMs).slice(0, 12);

  return (
    <div className="flex flex-col rounded border border-border bg-surface p-4">
      <div className="mb-3 text-[10px] font-bold tracking-widest text-muted">
        TOP ARTISTS BY LISTENING TIME
      </div>
      <div style={{ height: `${Math.max(sorted.length * 28, 160)}px` }}>
        <Bar
          data={{
            labels: sorted.map((a) => a.artist),
            datasets: [
              {
                data:            sorted.map((a) => Math.round(a.listenedMs / 60000)),
                backgroundColor: "#00e5b0",
                borderColor:     "#00e5b0",
                borderWidth:     0,
                borderRadius:    2,
              },
            ],
          }}
          options={{
            indexAxis:           "y",
            responsive:          true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const artist = sorted[ctx.dataIndex];
                    return artist ? ` ${fmtMin(artist.listenedMs)} · ${String(artist.trackCount)} track${artist.trackCount !== 1 ? "s" : ""}` : "";
                  },
                },
              },
            },
            scales: {
              x: {
                ticks: { color: "#3e3e60", font: { size: 9, family: "Courier New" } },
                grid:  { color: "rgba(28, 28, 56, 0.5)" },
                title: { display: true, text: "minutes", color: "#3e3e60", font: { size: 9, family: "Courier New" } },
              },
              y: {
                ticks: { color: "#c8d0f0", font: { size: 9, family: "Courier New" } },
                grid:  { display: false },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
