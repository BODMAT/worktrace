import type { CreateTrackInput } from "./schemas/tracks";
import { prisma } from "./db";

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

export async function createTrackForUser(
  userId: string,
  input: CreateTrackInput,
) {
  // Verify the session belongs to this user before writing
  const session = await prisma.session.findFirst({
    where:  { id: input.sessionId, userId },
    select: { id: true },
  });
  if (!session) throw new SessionNotFoundError();

  return prisma.track.create({
    data: {
      sessionId: input.sessionId,
      artist:    input.artist,
      title:     input.title,
    },
  });
}
