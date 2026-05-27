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

const LIST_CAP = 200;

export async function listEventsForUser(
  userId: string,
  filters: EventListFilters,
): Promise<EventDTO[]> {
  const timestamp: Prisma.DateTimeFilter = {};
  if (filters.from) timestamp.gte = filters.from;
  if (filters.to)   timestamp.lte = filters.to;

  const rows = await prisma.event.findMany({
    where: {
      session: { userId },
      ...(Object.keys(timestamp).length ? { timestamp } : {}),
      ...(filters.tags.length ? { tags: { hasEvery: filters.tags } } : {}),
    },
    orderBy: { timestamp: "desc" },
    take:    LIST_CAP,
  });

  return rows.map((r) => ({
    id:        r.id,
    sessionId: r.sessionId,
    url:       r.url,
    title:     r.title,
    content:   r.content,
    tags:      r.tags,
    timestamp: r.timestamp.toISOString(),
  }));
}
