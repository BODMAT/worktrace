import { NextRequest, NextResponse } from "next/server";
import { getEventStatsForUser } from "@/server/events";
import { EventStatsFilters } from "@/server/schemas/events";
import { withCors, corsPreflight } from "@/server/cors";
import { requireUser, UnauthorizedError } from "@/server/jwt";
import { apiError } from "@/server/api-error";

export const GET = withCors(async (req) => {
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return apiError("UNAUTHORIZED", err.message, 401);
    }
    throw err;
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = EventStatsFilters.safeParse(params);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Validation failed", 400);
  }

  const stats = await getEventStatsForUser(user.id, parsed.data);
  return NextResponse.json(stats);
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
