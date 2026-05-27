import { Prisma } from "@/generated/prisma/client";
import type {
  CreateEventInput,
  EventListFilters,
  EventStatsFilters,
} from "./schemas/events";
import type { EventDTO, EventStats } from "@/types/event";
import { prisma } from "./db";

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

export async function createEventForUser(
  userId: string,
  input: CreateEventInput,
) {
  const session = await prisma.session.findFirst({
    where:  { id: input.sessionId, userId },
    select: { id: true },
  });
  if (!session) throw new SessionNotFoundError();

  return prisma.event.create({ data: input });
}

export type EventsPage = {
  events:     EventDTO[];
  nextCursor: string | null;
};

export async function listEventsForUser(
  userId:  string,
  filters: EventListFilters,
): Promise<EventsPage> {
  const timestamp: Prisma.DateTimeFilter = {};
  if (filters.from) timestamp.gte = filters.from;
  if (filters.to)   timestamp.lte = filters.to;

  const limit = filters.limit ?? 50;

  const rows = await prisma.event.findMany({
    where: {
      session: { userId },
      ...(Object.keys(timestamp).length ? { timestamp } : {}),
      ...(filters.tags.length ? { tags: { hasEvery: filters.tags } } : {}),
    },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take:    limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    events: page.map((r) => ({
      id:        r.id,
      sessionId: r.sessionId,
      url:       r.url,
      title:     r.title,
      content:   r.content,
      tags:      r.tags,
      timestamp: r.timestamp.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

const MIN_DATE = new Date("1970-01-01T00:00:00.000Z");
const MAX_DATE = new Date("9999-12-31T23:59:59.999Z");

export async function getEventStatsForUser(
  userId:  string,
  filters: EventStatsFilters,
): Promise<EventStats> {
  const from = filters.from ?? MIN_DATE;
  const to   = filters.to   ?? MAX_DATE;
  const tags = filters.tags;

  const tagsFilter = tags.length
    ? Prisma.sql`AND e.tags @> ${tags}::text[]`
    : Prisma.empty;

  const [byDayRows, topTagRows] = await Promise.all([
    prisma.$queryRaw<{ day: Date; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc('day', e."timestamp") AS day, COUNT(*) AS count
      FROM "Event" e
      JOIN "Session" s ON s.id = e."sessionId"
      WHERE s."userId" = ${userId}
        AND e."timestamp" >= ${from}
        AND e."timestamp" <= ${to}
        ${tagsFilter}
      GROUP BY day
      ORDER BY day ASC
    `),
    prisma.$queryRaw<{ tag: string; count: bigint }[]>(Prisma.sql`
      SELECT tag, COUNT(*)::bigint AS count
      FROM (
        SELECT unnest(e.tags) AS tag
        FROM "Event" e
        JOIN "Session" s ON s.id = e."sessionId"
        WHERE s."userId" = ${userId}
          AND e."timestamp" >= ${from}
          AND e."timestamp" <= ${to}
          ${tagsFilter}
      ) t
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 7
    `),
  ]);

  return {
    byDay:   byDayRows.map((r) => ({
      date:  r.day.toISOString().slice(0, 10),
      count: Number(r.count),
    })),
    topTags: topTagRows.map((r) => ({ tag: r.tag, count: Number(r.count) })),
  };
}
