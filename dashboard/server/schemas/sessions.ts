import { z } from "zod";

export const SessionIdParam = z.object({
  id: z.string().regex(/^c[a-z0-9]{24}$/, "must be a CUID"),
});

export type SessionIdParam = z.infer<typeof SessionIdParam>;
