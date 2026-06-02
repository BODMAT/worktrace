import type { CreateTrackInput, UpdateTrackInput } from "./schemas/tracks";
import { prisma } from "./db";

export async function closeStaleTracksForClosedSessions(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "Track" t
    SET    "endedAt" = s."endedAt"
    FROM   "Session" s
    WHERE  t."sessionId" = s.id
      AND  t."endedAt"   IS NULL
      AND  s."endedAt"   IS NOT NULL
  `;
}

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

  // Upsert by [sessionId, artist, title] — same song in same session
  // gets a single record; capturedAt stays from first detection.
  return prisma.track.upsert({
    where: {
      sessionId_artist_title: {
        sessionId: input.sessionId,
        artist:    input.artist,
        title:     input.title,
      },
    },
    create: {
      sessionId: input.sessionId,
      artist:    input.artist,
      title:     input.title,
    },
    update: {
      // Reset endedAt on re-play so the record stays "open"
      endedAt: null,
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
    data:  {
      endedAt:    new Date(input.endedAt),
      listenedMs: { increment: input.listenedMs },
    },
  });
}
