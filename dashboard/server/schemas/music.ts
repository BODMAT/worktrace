import { z } from "zod";

export const MusicStatsQuery = z.object({
  range: z.enum(["today", "yesterday", "last_7d", "last_30d", "all_time"]).default("last_7d"),
  from:  z.coerce.date().optional(),
  to:    z.coerce.date().optional(),
});

export type MusicStatsQuery = z.infer<typeof MusicStatsQuery>;
