import { z } from "zod";

export const ExtensionAuthInput = z.object({
  googleToken: z.string().min(1, "googleToken is required"),
});
export type ExtensionAuthInput = z.infer<typeof ExtensionAuthInput>;
