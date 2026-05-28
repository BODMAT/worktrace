import { z } from "zod";

export const SetApiKeyInput = z.object({
  groqApiKey: z
    .union([z.string().min(8, "API key looks too short").max(512), z.null()]),
});

export type SetApiKeyInput = z.infer<typeof SetApiKeyInput>;
