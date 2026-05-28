import type { RangePreset } from "@/types/report";
import { prisma } from "./db";

export type { RangePreset };

export type RangeInput = {
  range: RangePreset;
  from?: Date | null;
  to?:   Date | null;
};

export type ResolvedRange = { from: Date; to: Date; label: string };

export async function resolveRange(
  input:  RangeInput,
  userId: string,
): Promise<ResolvedRange> {
  const now = new Date();

  switch (input.range) {
    case "today":
      return { from: startOfDay(now), to: now, label: "today" };

    case "yesterday": {
      const y = shiftDays(now, -1);
      return { from: startOfDay(y), to: endOfDay(y), label: "yesterday" };
    }

    case "last_7d":
      return { from: shiftDays(now, -7), to: now, label: "last 7 days" };

    case "last_30d":
      return { from: shiftDays(now, -30), to: now, label: "last 30 days" };

    case "all_time": {
      const first = await prisma.session.findFirst({
        where:   { userId },
        select:  { startedAt: true },
        orderBy: { startedAt: "asc" },
      });
      const from = first?.startedAt ?? shiftDays(now, -1);
      return { from, to: now, label: "all time" };
    }

    case "custom":
      if (!input.from || !input.to) {
        throw new Error("custom range requires both from and to");
      }
      return { from: input.from, to: input.to, label: "custom range" };
  }
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

export function shiftDays(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
}
