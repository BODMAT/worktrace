import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { endSessionForUser, SessionNotFoundError } from "@/server/sessions";
import { SessionIdParam } from "@/server/schemas/sessions";
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

    const params = await ctx.params;
    const parsed = SessionIdParam.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
    }

    try {
      const session = await endSessionForUser(user.id, parsed.data.id);
      return NextResponse.json(session, { status: 200 });
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      throw err;
    }
  })(req);
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
