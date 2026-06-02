import { NextRequest, NextResponse } from "next/server";
import { withCors, corsPreflight } from "@/server/cors";
import { ExtensionAuthInput } from "@/server/schemas/auth";
import { authenticateGoogleUser } from "@/server/auth";
import { apiError } from "@/server/api-error";

export const POST = withCors(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = ExtensionAuthInput.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Validation failed", 400);
  }

  try {
    const token = await authenticateGoogleUser(parsed.data.googleToken);
    return NextResponse.json({ token }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return apiError("UNAUTHORIZED", message, 401);
  }
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
