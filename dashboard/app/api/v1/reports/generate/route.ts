import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/server/jwt";
import { withCors, corsPreflight } from "@/server/cors";
import { GenerateReportInput } from "@/server/schemas/reports";
import {
  generateReport,
  MissingApiKeyError,
  GroqAuthError,
  GroqTimeoutError,
  GroqUpstreamError,
} from "@/server/reports";

export const POST = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = GenerateReportInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  try {
    const result = await generateReport(user.id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: "No Groq API key configured. Add your own via the API KEY button." },
        { status: 503 },
      );
    }
    if (err instanceof GroqAuthError) {
      return NextResponse.json(
        { error: "Groq rejected the API key. Clear it in settings or set a valid key." },
        { status: 402 },
      );
    }
    if (err instanceof GroqTimeoutError) {
      return NextResponse.json(
        { error: "AI request timed out. Try again in a moment." },
        { status: 504 },
      );
    }
    if (err instanceof GroqUpstreamError) {
      console.error("[reports] upstream error", err);
      return NextResponse.json(
        { error: "AI provider unavailable. Try again later." },
        { status: 502 },
      );
    }
    throw err;
  }
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
