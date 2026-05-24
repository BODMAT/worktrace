import type { CreateTrackInput, UpdateTrackInput } from "./schemas/tracks";
import { prisma } from "./db";

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

export class TrackNotFoundError extends Error {
  constructor() {
    super("Track not found");
    this.name = "TrackNotFoundError";
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

export async function endTrackForUser(
  userId: string,
  trackId: string,
  input: UpdateTrackInput,
) {
  // Verify the track belongs to a session owned by this user
  const track = await prisma.track.findFirst({
    where:   { id: trackId, session: { userId } },
    select:  { id: true },
  });
  if (!track) throw new TrackNotFoundError();

  return prisma.track.update({
    where: { id: trackId },
    data:  { endedAt: new Date(input.endedAt) },
  });
}
