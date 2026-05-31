import { NextRequest, NextResponse } from "next/server";
import { createSessionForUser } from "@/server/sessions";
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

  const session = await createSessionForUser(user.id);
  return NextResponse.json(session, { status: 201 });
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
