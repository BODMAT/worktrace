import { NextRequest, NextResponse } from "next/server";
import { endSessionForUser, SessionNotFoundError } from "@/server/sessions";
import { SessionIdParam } from "@/server/schemas/sessions";
import { withCors, corsPreflight } from "@/server/cors";
import { requireUser, UnauthorizedError } from "@/server/jwt";
import { apiError } from "@/server/api-error";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return withCors(async (r) => {
    let user;
    try {
      user = await requireUser(r);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return apiError("UNAUTHORIZED", err.message, 401);
      }
      throw err;
    }

    const params = await ctx.params;
    const parsed = SessionIdParam.safeParse(params);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }

    try {
      const session = await endSessionForUser(user.id, parsed.data.id);
      return NextResponse.json(session, { status: 200 });
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        return apiError("NOT_FOUND", "Session not found", 404);
      }
      throw err;
    }
  })(req);
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
