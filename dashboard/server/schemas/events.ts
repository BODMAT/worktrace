import { z } from "zod";
import { EventUncheckedCreateInputObjectZodSchema } from "@/generated/zod/schemas/objects/EventUncheckedCreateInput.schema";

export const CreateEventInput = EventUncheckedCreateInputObjectZodSchema
  .omit({ id: true, createdAt: true })
  .extend({
    sessionId: z.string().regex(/^c[a-z0-9]{24}$/, "must be a CUID"),
    url: z.url(),
    title: z.string().min(1),
  });

export type CreateEventInput = z.infer<typeof CreateEventInput>;

const tagsSchema = z
  .string()
  .optional()
  .transform((s) =>
    (s ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );

export const EventListFilters = z.object({
  from:   z.coerce.date().optional(),
  to:     z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional().default(30),
  tags:   tagsSchema,
});

export type EventListFilters = z.infer<typeof EventListFilters>;

export const EventStatsFilters = z.object({
  from: z.coerce.date().optional(),
  to:   z.coerce.date().optional(),
  tags: tagsSchema,
});

export type EventStatsFilters = z.infer<typeof EventStatsFilters>;
