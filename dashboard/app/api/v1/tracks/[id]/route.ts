import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { endTrackForUser, TrackNotFoundError } from "@/server/tracks";
import { UpdateTrackInput } from "@/server/schemas/tracks";
import { withCors, corsPreflight } from "@/server/cors";
import { requireUser, UnauthorizedError } from "@/server/jwt";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return withCors(async (r) => {
    let user;
    try {
      user = requireUser(r);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return NextResponse.json({ error: err.message }, { status: 401 });
      }
      throw err;
    }

    const { id } = await ctx.params;

    const body = await r.json();
    const parsed = UpdateTrackInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
    }

    try {
      const track = await endTrackForUser(user.id, id, parsed.data);
      return NextResponse.json(track, { status: 200 });
    } catch (err) {
      if (err instanceof TrackNotFoundError) {
        return NextResponse.json({ error: "Track not found" }, { status: 404 });
      }
      throw err;
    }
  })(req);
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
