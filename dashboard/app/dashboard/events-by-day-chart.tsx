"use client";

import { Line } from "react-chartjs-2";
import type { DayBucket } from "@/types/event";

function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00.000Z");
  const end   = new Date(to   + "T00:00:00.000Z");
  for (const cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
    out.push(cur.toISOString().slice(0, 10));
  }
  return out;
}

function fillGaps(byDay: DayBucket[]): DayBucket[] {
  if (byDay.length === 0) return [];
  const present = new Map(byDay.map((b) => [b.date, b.count]));
  const labels = rangeDays(byDay[0].date, byDay[byDay.length - 1].date);
  return labels.map((date) => ({ date, count: present.get(date) ?? 0 }));
}

export function EventsByDayChart({ byDay }: { byDay: DayBucket[] }) {
  const filled = fillGaps(byDay);

  if (filled.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded border border-border bg-surface text-[10px] tracking-widest text-muted">
        NO EVENTS TO CHART
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded border border-border bg-surface p-4">
      <div className="mb-3 text-[10px] font-bold tracking-widest text-muted">
        EVENTS PER DAY
      </div>
      <div className="flex flex-1 items-center">
        <div className="h-40 w-full">
          <Line
          data={{
            labels:   filled.map((d) => d.date.slice(5)),
            datasets: [
              {
                data:                 filled.map((d) => d.count),
                borderColor:          "#00e5b0",
                backgroundColor:      "rgba(0, 229, 176, 0.15)",
                pointBackgroundColor: "#00e5b0",
                pointRadius:          3,
                tension:              0.3,
                fill:                 true,
              },
            ],
          }}
          options={{
            responsive:          true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } },
            scales: {
              x: {
                ticks: { color: "#3e3e60", font: { size: 9, family: "Courier New" } },
                grid:  { color: "rgba(28, 28, 56, 0.5)" },
              },
              y: {
                beginAtZero: true,
                ticks: {
                  color:    "#3e3e60",
                  font:     { size: 9, family: "Courier New" },
                  precision: 0,
                  stepSize:  1,
                },
                grid: { color: "rgba(28, 28, 56, 0.5)" },
              },
            },
          }}
          />
        </div>
      </div>
    </div>
  );
}
