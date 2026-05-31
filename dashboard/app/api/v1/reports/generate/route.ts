import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/jwt";
import { withCors, corsPreflight } from "@/server/cors";
import { GenerateReportInput } from "@/server/schemas/reports";
import {
  generateReport,
  MissingApiKeyError,
  GroqAuthError,
  GroqContextLimitError,
  GroqTimeoutError,
  GroqUpstreamError,
} from "@/server/reports";
import { apiError } from "@/server/api-error";

export const POST = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return apiError("UNAUTHORIZED", err.message, 401);
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = GenerateReportInput.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Validation failed", 400);
  }

  try {
    const result = await generateReport(user.id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return apiError("SERVER_ERROR", "No Groq API key configured. Add your own via the API KEY button.", 503);
    }
    if (err instanceof GroqContextLimitError) {
      return apiError("SERVER_ERROR", err.message, 422);
    }
    if (err instanceof GroqAuthError) {
      return apiError("SERVER_ERROR", "Groq rejected the API key. Clear it in settings or set a valid key.", 402);
    }
    if (err instanceof GroqTimeoutError) {
      return apiError("SERVER_ERROR", "AI request timed out. Try again in a moment.", 504);
    }
    if (err instanceof GroqUpstreamError) {
      console.error("[reports] upstream error", err);
      return apiError("SERVER_ERROR", "AI provider unavailable. Try again later.", 502);
    }
    throw err;
  }
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
