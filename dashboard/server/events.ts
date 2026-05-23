import type { CreateEventInput } from "./schemas/events";
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
