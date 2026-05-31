import { NextRequest, NextResponse } from "next/server";
import { createTrackForUser, SessionNotFoundError } from "@/server/tracks";
import { CreateTrackInput } from "@/server/schemas/tracks";
import { withCors, corsPreflight } from "@/server/cors";
import { requireUser, UnauthorizedError } from "@/server/jwt";
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

  const body = await req.json();
  const parsed = CreateTrackInput.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Validation failed", 400);
  }

  try {
    const track = await createTrackForUser(user.id, parsed.data);
    return NextResponse.json(track, { status: 201 });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return apiError("NOT_FOUND", "Session not found", 404);
    }
    throw err;
  }
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
