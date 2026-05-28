"use client";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import type { HourBucket } from "@/types/music-stats";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) =>
  `${String(h).padStart(2, "0")}:00`,
);

export function HourlyChart({ buckets }: { buckets: HourBucket[] }) {
  const sorted = [...buckets].sort((a, b) => a.hour - b.hour);
  const hasData = sorted.some((b) => b.listenedMs > 0 || b.eventCount > 0);

  if (!hasData) {
    return (
      <div className="flex h-52 items-center justify-center rounded border border-border bg-surface text-[10px] tracking-widest text-muted">
        NO HOURLY DATA IN RANGE
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded border border-border bg-surface p-4">
      <div className="mb-3 text-[10px] font-bold tracking-widest text-muted">
        HOURLY ACTIVITY PATTERN
      </div>
      <div className="h-52">
        <Bar
          data={{
            labels: HOUR_LABELS,
            datasets: [
              {
                label:           "listening (min)",
                data:            sorted.map((b) => Math.round(b.listenedMs / 60000)),
                backgroundColor: "rgba(0, 229, 176, 0.7)",
                borderColor:     "#00e5b0",
                borderWidth:     1,
                borderRadius:    2,
              },
              {
                label:           "events",
                data:            sorted.map((b) => b.eventCount),
                backgroundColor: "rgba(168, 85, 247, 0.7)",
                borderColor:     "#a855f7",
                borderWidth:     1,
                borderRadius:    2,
              },
            ],
          }}
          options={{
            responsive:          true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "top",
                align:    "end",
                labels:   { color: "#c8d0f0", font: { size: 9, family: "Courier New" }, boxWidth: 12 },
              },
              tooltip: { mode: "index", intersect: false },
            },
            scales: {
              x: {
                ticks: { color: "#3e3e60", font: { size: 8, family: "Courier New" }, maxRotation: 45 },
                grid:  { color: "rgba(28, 28, 56, 0.5)" },
              },
              y: {
                beginAtZero: true,
                ticks: { color: "#3e3e60", font: { size: 9, family: "Courier New" }, precision: 0 },
                grid:  { color: "rgba(28, 28, 56, 0.5)" },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
