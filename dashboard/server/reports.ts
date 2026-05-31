import type { GenerateReportInput } from "./schemas/reports";
import type { GenerateReportResponse } from "@/types/report";
import { buildReportContext } from "./report-context";
import { getDecryptedGroqApiKey } from "./user-settings";
import { resolveRange } from "./range";
import {
  groqChat,
  getDefaultModel,
  GroqAuthError,
  GroqContextLimitError,
  GroqRateLimitError,
  GroqTimeoutError,
  GroqUpstreamError,
} from "./groq";

const SYSTEM_PROMPT = `Role: senior productivity coach analyzing a developer's work session log.

You will receive a structured context about the user's activity:
sessions, events (urls/titles/tags), and music listening with productivity correlation.

Output a single Markdown report with these sections in order:
1. ## Overview — 2–3 sentence summary of the range.
2. ## Focus areas — bullets: top domains and top tags with brief interpretation.
3. ## Sessions — short narrative across the major sessions (limit to top 5 by duration).
4. ## Music & productivity — IF music data is present: which artists/tracks correlated with higher events/min, vs lower. Avoid clickbait causality — call it "correlation in this range".
5. ## Highlights — 3–5 most interesting events (by content or unusual tags).
6. ## Recommendations — 2–4 concrete suggestions based on visible patterns (e.g. "you spent 2h on Stack Overflow tagged 'prisma' — consider docs bookmark"). Skip if data is too sparse.

Rules:
- Be specific. Quote concrete numbers and names from the context, never invent.
- If detailLevel >= 2, acknowledge that detail was aggregated and avoid per-event commentary.
- No preamble like "Here is the report"; start directly with "## Overview".
- Keep total length ≤ 600 words.`;

export class MissingApiKeyError extends Error {
  constructor() {
    super("No Groq API key configured");
    this.name = "MissingApiKeyError";
  }
}

export type { ResolvedRange } from "./range";

export async function generateReport(
  userId: string,
  input:  GenerateReportInput,
): Promise<GenerateReportResponse> {
  const { from, to, label } = await resolveRange(input, userId);
  const ctx                 = await buildReportContext(userId, from, to, label);

  const userKey = await getDecryptedGroqApiKey(userId);
  const apiKey  = userKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const userPrompt =
    `detailLevel: ${ctx.level}\n` +
    `estimatedContextTokens: ${ctx.estimatedTokens}\n\n` +
    ctx.markdown;

  const markdown = await groqChat({
    apiKey,
    system: SYSTEM_PROMPT,
    user:   userPrompt,
  });

  return {
    markdown,
    range:                { from: from.toISOString(), to: to.toISOString(), label },
    contextLevel:         ctx.level,
    estimatedInputTokens: ctx.estimatedTokens,
    model:                getDefaultModel(),
  };
}

export { GroqAuthError, GroqContextLimitError, GroqRateLimitError, GroqTimeoutError, GroqUpstreamError };
