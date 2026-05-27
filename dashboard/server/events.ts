import type { Prisma } from "@/generated/prisma/client";
import type { CreateEventInput, EventListFilters } from "./schemas/events";
import type { EventDTO } from "@/types/event";
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
