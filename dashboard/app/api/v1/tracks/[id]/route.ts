import { NextRequest, NextResponse } from "next/server";
import { endTrackForUser, TrackNotFoundError } from "@/server/tracks";
import { UpdateTrackInput } from "@/server/schemas/tracks";
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
      user = requireUser(r);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return apiError("UNAUTHORIZED", err.message, 401);
      }
      throw err;
    }

    const { id } = await ctx.params;

    const body = await r.json();
    const parsed = UpdateTrackInput.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }

    try {
      const track = await endTrackForUser(user.id, id, parsed.data);
      return NextResponse.json(track, { status: 200 });
    } catch (err) {
      if (err instanceof TrackNotFoundError) {
        return apiError("NOT_FOUND", "Track not found", 404);
      }
      throw err;
    }
  })(req);
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
