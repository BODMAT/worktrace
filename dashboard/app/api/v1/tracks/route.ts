import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createTrackForUser, SessionNotFoundError } from "@/server/tracks";
import { CreateTrackInput } from "@/server/schemas/tracks";
import { withCors, corsPreflight } from "@/server/cors";
import { requireUser, UnauthorizedError } from "@/server/jwt";

export const POST = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const body = await req.json();
  const parsed = CreateTrackInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  try {
    const track = await createTrackForUser(user.id, parsed.data);
    return NextResponse.json(track, { status: 201 });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    throw err;
  }
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
