import { z } from "zod";

// Derived manually — Track model has only artist, title, sessionId as required input.
// capturedAt is @default(now()) in Prisma; id is @default(cuid()) — never sent by client.
export const CreateTrackInput = z.object({
  sessionId: z.string().regex(/^c[a-z0-9]{24}$/, "must be a CUID"),
  artist:    z.string().min(1),
  title:     z.string().min(1),
});

export type CreateTrackInput = z.infer<typeof CreateTrackInput>;

// PATCH — only endedAt can be updated after creation
export const UpdateTrackInput = z.object({
  endedAt: z.string().datetime(),
});

export type UpdateTrackInput = z.infer<typeof UpdateTrackInput>;
