"use client";

import { Doughnut } from "react-chartjs-2";
import type { TagCount } from "@/types/event";

const PALETTE = ["#00e5b0", "#7c3aff", "#f0d000", "#ff0070", "#3e9bff", "#ff8a00", "#a0e000"];

export function TopTagsChart({ top }: { top: TagCount[] }) {
  if (top.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded border border-border bg-surface text-[10px] tracking-widest text-muted">
        NO TAGS IN RANGE
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded border border-border bg-surface p-4">
      <div className="mb-3 text-[10px] font-bold tracking-widest text-muted">
        TOP TAGS
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="h-40 w-full max-w-[320px]">
          <Doughnut
            data={{
              labels:   top.map((t) => t.tag),
              datasets: [
                {
                  data:            top.map((t) => t.count),
                  backgroundColor: top.map((_, i) => PALETTE[i % PALETTE.length]),
                  borderColor:     "#0f0f20",
                  borderWidth:     2,
                },
              ],
            }}
            options={{
              responsive:          true,
              maintainAspectRatio: false,
              cutout:              "60%",
              plugins: {
                legend: {
                  position: "right",
                  labels: {
                    color:    "#c8d0f0",
                    font:     { size: 10, family: "Courier New" },
                    boxWidth: 12,
                  },
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
