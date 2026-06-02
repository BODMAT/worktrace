import { z } from "zod";

const GoogleTokenInput = z.object({
  googleToken: z.string().min(1, "googleToken is required"),
});

export const ExtensionAuthInput = GoogleTokenInput;
export type ExtensionAuthInput = z.infer<typeof ExtensionAuthInput>;

export const WebAuthInput = GoogleTokenInput;
export type WebAuthInput = z.infer<typeof WebAuthInput>;
