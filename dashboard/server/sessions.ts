import { prisma } from "./db";

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
