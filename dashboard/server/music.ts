import { Prisma } from "@/generated/prisma/client";
import type { TopArtist, TopTrack, ProductivityRow, HourBucket } from "@/types/music-stats";
import { prisma } from "./db";

const MAX_TOP_ARTISTS = 15;
const MAX_TOP_TRACKS  = 20;
const MAX_PRODUCTIVITY = 10;

export async function getTopArtists(
  userId: string,
  from:   Date,
  to:     Date,
): Promise<TopArtist[]> {
  const rows = await prisma.track.groupBy({
    by:    ["artist"],
    where: { session: { userId }, capturedAt: { gte: from, lte: to } },
    _sum:  { listenedMs: true },
    _count: { title: true },
    orderBy: { _sum: { listenedMs: "desc" } },
    take: MAX_TOP_ARTISTS,
  });
  return rows.map((r) => ({
    artist:     r.artist,
    listenedMs: r._sum.listenedMs ?? 0,
    trackCount: r._count.title,
  }));
}

export async function getTopTracks(
  userId: string,
  from:   Date,
  to:     Date,
): Promise<TopTrack[]> {
  const rows = await prisma.track.findMany({
    where:   { session: { userId }, capturedAt: { gte: from, lte: to } },
    select:  { artist: true, title: true, listenedMs: true },
    orderBy: { listenedMs: "desc" },
    take:    MAX_TOP_TRACKS,
  });
  return rows;
}

export async function getMusicProductivity(
  userId: string,
  from:   Date,
  to:     Date,
): Promise<ProductivityRow[]> {
  return prisma.$queryRaw<ProductivityRow[]>(Prisma.sql`
    WITH track_windows AS (
      SELECT
        t.artist,
        t.title,
        t."listenedMs",
        t."capturedAt",
        COALESCE(t."endedAt", NOW()) AS effective_end
      FROM "Track" t
      JOIN "Session" s ON s.id = t."sessionId"
      WHERE s."userId" = ${userId}
        AND t."capturedAt" >= ${from}
        AND t."capturedAt" <= ${to}
        AND t."listenedMs" >= 60000
    ),
    user_events AS (
      SELECT e."timestamp"
      FROM "Event" e
      JOIN "Session" s ON s.id = e."sessionId"
      WHERE s."userId" = ${userId}
        AND e."timestamp" >= ${from}
        AND e."timestamp" <= ${to}
    )
    SELECT
      tw.artist,
      tw.title,
      (tw."listenedMs" / 60000.0)::float                                   AS minutes,
      COUNT(ue."timestamp")::int                                           AS events,
      (COUNT(ue."timestamp")::float / (tw."listenedMs" / 60000.0))::float  AS "perMin"
    FROM track_windows tw
    LEFT JOIN user_events ue
      ON ue."timestamp" >= tw."capturedAt"
     AND ue."timestamp" <= tw.effective_end
    GROUP BY tw.artist, tw.title, tw."listenedMs"
    ORDER BY "perMin" DESC NULLS LAST
    LIMIT ${MAX_PRODUCTIVITY}
  `);
}

export async function getHourlyPattern(
  userId: string,
  from:   Date,
  to:     Date,
): Promise<HourBucket[]> {
  // Two separate raw queries — tracks per hour + events per hour.
  // Results merged in JS to guarantee a full 0–23 grid.
  const [trackRows, eventRows] = await Promise.all([
    prisma.$queryRaw<{ hour: number; listenedMs: number }[]>(Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM t."capturedAt")::int AS hour,
        SUM(t."listenedMs")::int               AS "listenedMs"
      FROM "Track" t
      JOIN "Session" s ON s.id = t."sessionId"
      WHERE s."userId" = ${userId}
        AND t."capturedAt" >= ${from}
        AND t."capturedAt" <= ${to}
      GROUP BY hour
      ORDER BY hour
    `),
    prisma.$queryRaw<{ hour: number; eventCount: number }[]>(Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM e."timestamp")::int AS hour,
        COUNT(*)::int                         AS "eventCount"
      FROM "Event" e
      JOIN "Session" s ON s.id = e."sessionId"
      WHERE s."userId" = ${userId}
        AND e."timestamp" >= ${from}
        AND e."timestamp" <= ${to}
      GROUP BY hour
      ORDER BY hour
    `),
  ]);

  const listenMap = new Map(trackRows.map((r) => [r.hour, r.listenedMs]));
  const eventMap  = new Map(eventRows.map((r) => [r.hour, r.eventCount]));

  return Array.from({ length: 24 }, (_, h) => ({
    hour:       h,
    listenedMs: listenMap.get(h) ?? 0,
    eventCount: eventMap.get(h)  ?? 0,
  }));
}

export async function getMusicTotals(
  userId: string,
  from:   Date,
  to:     Date,
): Promise<{ totalListenedMs: number; totalArtists: number; totalTracks: number }> {
  const [agg, artistCount] = await Promise.all([
    prisma.track.aggregate({
      where: { session: { userId }, capturedAt: { gte: from, lte: to } },
      _sum:   { listenedMs: true },
      _count: { id: true },
    }),
    prisma.track.findMany({
      where:   { session: { userId }, capturedAt: { gte: from, lte: to } },
      select:  { artist: true },
      distinct: ["artist"],
    }),
  ]);
  return {
    totalListenedMs: agg._sum.listenedMs  ?? 0,
    totalTracks:     agg._count.id,
    totalArtists:    artistCount.length,
  };
}
