import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/current-user";
import { requireUser, UnauthorizedError } from "@/server/jwt";
import { withCors, corsPreflight } from "@/server/cors";
import { MusicStatsQuery } from "@/server/schemas/music";
import { resolveRange } from "@/server/range";
import {
  getTopArtists,
  getTopTracks,
  getMusicProductivity,
  getHourlyPattern,
  getMusicTotals,
} from "@/server/music";
import type { MusicStats } from "@/types/music-stats";

export const GET = withCors(async (req: NextRequest) => {
  // Cookie auth (dashboard) — fallback to Bearer (extension)
  let userId: string;
  try {
    const cookie = await getCurrentUser();
    if (cookie) {
      userId = cookie.id;
    } else {
      userId = requireUser(req).id;
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = MusicStatsQuery.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query params" }, { status: 400 });
  }

  const { from, to, label } = await resolveRange(
    { range: parsed.data.range, from: parsed.data.from, to: parsed.data.to },
    userId,
  );

  const [topArtists, topTracks, productivity, hourlyPattern, totals] = await Promise.all([
    getTopArtists(userId, from, to),
    getTopTracks(userId, from, to),
    getMusicProductivity(userId, from, to),
    getHourlyPattern(userId, from, to),
    getMusicTotals(userId, from, to),
  ]);

  const body: MusicStats = {
    topArtists,
    topTracks,
    productivity,
    hourlyPattern,
    totalListenedMs: totals.totalListenedMs,
    totalArtists:    totals.totalArtists,
    totalTracks:     totals.totalTracks,
    range:           { from: from.toISOString(), to: to.toISOString(), label },
  };

  return NextResponse.json(body);
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
