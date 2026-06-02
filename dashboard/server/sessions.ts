import { Prisma } from "@/generated/prisma/client";
import type { TopSession } from "@/types/event";
import { prisma } from "./db";

export async function closeStaleSessions(
  thresholdMinutes: number,
): Promise<{ closed: number; deleted: number }> {
  const { count: deleted } = await prisma.session.deleteMany({
    where: { endedAt: null, events: { none: {} } },
  });

  const closed = await prisma.$executeRaw(Prisma.sql`
    UPDATE "Session" s
    SET    "endedAt" = (SELECT MAX(e."timestamp") FROM "Event" e WHERE e."sessionId" = s.id)
    WHERE  s."endedAt" IS NULL
      AND  (SELECT MAX(e."timestamp") FROM "Event" e WHERE e."sessionId" = s.id)
             < NOW() - (${thresholdMinutes} || ' minutes')::interval
  `);

  return { closed, deleted };
}

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

export function createSessionForUser(userId: string) {
  return prisma.session.create({
    data:   { userId },
    select: { id: true, startedAt: true },
  });
}

export async function endSessionForUser(userId: string, sessionId: string) {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId, endedAt: null },
    data:  { endedAt: new Date() },
  });
  if (result.count === 0) throw new SessionNotFoundError();

  return prisma.session.findUniqueOrThrow({
    where:  { id: sessionId },
    select: { id: true, endedAt: true },
  });
}

// Caps a single event's "attention" at 30 min — prevents long idle gaps inflating totals.
// The final event of a session has no successor → 0s contribution, so total = last − first timestamp.
const EVENT_DURATION_CAP_S = 1800;
const RECENT_WINDOW_DAYS   = 90;

export async function getTopSessionsForUser(
  userId: string,
  limit  = 3,
): Promise<TopSession[]> {
  const rows = await prisma.$queryRaw<{
    id:                string;
    startedAt:         Date;
    endedAt:           Date | null;
    total_seconds:     number;
    top_host:          string | null;
    top_host_seconds:  number;
  }[]>(Prisma.sql`
    WITH event_durations AS (
      SELECT
        e."sessionId",
        substring(e.url FROM '^https?://([^/]+)') AS host,
        LEAST(
          GREATEST(
            COALESCE(
              EXTRACT(EPOCH FROM (
                LEAD(e."timestamp") OVER (PARTITION BY e."sessionId" ORDER BY e."timestamp") - e."timestamp"
              )),
              0
            ),
            0
          ),
          ${EVENT_DURATION_CAP_S}
        ) AS dur_s
      FROM "Event" e
      JOIN "Session" s ON s.id = e."sessionId"
      WHERE s."userId" = ${userId}
        AND e."timestamp" >= NOW() - (${RECENT_WINDOW_DAYS} || ' days')::interval
    ),
    host_totals AS (
      SELECT
        "sessionId",
        host,
        SUM(dur_s) AS host_s
      FROM event_durations
      WHERE host IS NOT NULL
      GROUP BY "sessionId", host
    ),
    session_totals AS (
      SELECT
        "sessionId",
        SUM(dur_s) AS total_s
      FROM event_durations
      GROUP BY "sessionId"
    ),
    top_host_per_session AS (
      SELECT DISTINCT ON ("sessionId")
        "sessionId",
        host        AS top_host,
        host_s      AS top_host_s
      FROM host_totals
      ORDER BY "sessionId", host_s DESC
    )
    SELECT
      s.id,
      s."startedAt"                          AS "startedAt",
      s."endedAt"                            AS "endedAt",
      COALESCE(st.total_s, 0)::float         AS total_seconds,
      th.top_host                            AS top_host,
      COALESCE(th.top_host_s, 0)::float      AS top_host_seconds
    FROM "Session" s
    LEFT JOIN session_totals     st ON st."sessionId" = s.id
    LEFT JOIN top_host_per_session th ON th."sessionId" = s.id
    WHERE s."userId" = ${userId}
      AND COALESCE(st.total_s, 0) > 0
    ORDER BY total_seconds DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id:             r.id,
    startedAt:      r.startedAt.toISOString(),
    endedAt:        r.endedAt ? r.endedAt.toISOString() : null,
    totalSeconds:   Math.round(Number(r.total_seconds)),
    topHost:        r.top_host,
    topHostSeconds: Math.round(Number(r.top_host_seconds)),
  }));
}
