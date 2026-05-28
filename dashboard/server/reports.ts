import type { GenerateReportInput } from "./schemas/reports";
import type { GenerateReportResponse } from "@/types/report";
import { prisma } from "./db";
import { buildReportContext } from "./report-context";
import { getDecryptedGroqApiKey } from "./user-settings";
import {
  groqChat,
  getDefaultModel,
  GroqAuthError,
  GroqContextLimitError,
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

export type ResolvedRange = { from: Date; to: Date; label: string };

export async function resolveRange(
  input:  GenerateReportInput,
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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

function shiftDays(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
}

export { GroqAuthError, GroqContextLimitError, GroqTimeoutError, GroqUpstreamError };
