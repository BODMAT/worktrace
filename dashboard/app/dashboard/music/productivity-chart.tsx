"use client";

import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import type { ProductivityRow } from "@/types/music-stats";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export function ProductivityChart({ rows }: { rows: ProductivityRow[] }) {
  const withActivity = rows.filter((r) => r.perMin > 0);

  if (withActivity.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded border border-border bg-surface text-[10px] tracking-widest text-muted">
        NO PRODUCTIVITY DATA IN RANGE
      </div>
    );
  }

  const labels = withActivity.map((r) => `${r.title} / ${r.artist}`);

  return (
    <div className="flex flex-col rounded border border-border bg-surface p-4">
      <div className="mb-1 text-[10px] font-bold tracking-widest text-muted">
        PRODUCTIVITY CORRELATION
      </div>
      <div className="mb-3 text-[9px] tracking-widest text-muted">
        events / min while track was active
      </div>
      <div style={{ height: `${Math.max(withActivity.length * 28, 160)}px` }}>
        <Bar
          data={{
            labels,
            datasets: [
              {
                data:            withActivity.map((r) => Math.round(r.perMin * 100) / 100),
                backgroundColor: "#a855f7",
                borderColor:     "#a855f7",
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
                    const r = withActivity[ctx.dataIndex];
                    return r
                      ? ` ${r.perMin.toFixed(2)} events/min · ${r.minutes.toFixed(1)} min listened · ${String(r.events)} events`
                      : "";
                  },
                },
              },
            },
            scales: {
              x: {
                ticks: { color: "#3e3e60", font: { size: 9, family: "Courier New" } },
                grid:  { color: "rgba(28, 28, 56, 0.5)" },
                title: { display: true, text: "events / min", color: "#3e3e60", font: { size: 9, family: "Courier New" } },
              },
              y: {
                ticks: {
                  color:    "#c8d0f0",
                  font:     { size: 9, family: "Courier New" },
                  callback: (_, i) => {
                    const label = labels[i] ?? "";
                    return label.length > 30 ? `${label.slice(0, 28)}…` : label;
                  },
                },
                grid: { display: false },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
