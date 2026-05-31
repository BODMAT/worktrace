import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/jwt";
import { withCors, corsPreflight } from "@/server/cors";
import { SetApiKeyInput } from "@/server/schemas/user-settings";
import { getUserSettingsView, setGroqApiKey } from "@/server/user-settings";
import { apiError } from "@/server/api-error";

export const GET = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return apiError("UNAUTHORIZED", err.message, 401);
    }
    throw err;
  }
  const view = await getUserSettingsView(user.id);
  return NextResponse.json(view);
});

export const PUT = withCors(async (req) => {
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

  const parsed = SetApiKeyInput.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Validation failed", 400);
  }

  const view = await setGroqApiKey(user.id, parsed.data.groqApiKey);
  return NextResponse.json(view);
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
