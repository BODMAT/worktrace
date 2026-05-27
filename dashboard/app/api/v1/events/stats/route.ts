import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEventStatsForUser } from "@/server/events";
import { EventStatsFilters } from "@/server/schemas/events";
import { withCors, corsPreflight } from "@/server/cors";
import { requireUser, UnauthorizedError } from "@/server/jwt";

export const GET = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = EventStatsFilters.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const stats = await getEventStatsForUser(user.id, parsed.data);
  return NextResponse.json(stats);
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
