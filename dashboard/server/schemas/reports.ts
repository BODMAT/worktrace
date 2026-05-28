import { z } from "zod";

const RangePreset = z.enum([
  "today",
  "yesterday",
  "last_7d",
  "last_30d",
  "all_time",
  "custom",
]);

export const GenerateReportInput = z
  .object({
    range: RangePreset,
    from:  z.coerce.date().optional(),
    to:    z.coerce.date().optional(),
  })
  .refine((d) => d.range !== "custom" || (d.from && d.to), {
    message: "custom range requires both from and to",
    path:    ["from"],
  })
  .refine((d) => !d.from || !d.to || d.from <= d.to, {
    message: "from must be on or before to",
    path:    ["from"],
  });

export type GenerateReportInput = z.infer<typeof GenerateReportInput>;
