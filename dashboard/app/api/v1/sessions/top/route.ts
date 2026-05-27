import { NextRequest, NextResponse } from "next/server";
import { getTopSessionsForUser } from "@/server/sessions";
import { withCors, corsPreflight } from "@/server/cors";
import { requireUser, UnauthorizedError } from "@/server/jwt";

export const GET = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const sessions = await getTopSessionsForUser(user.id, 3);
  return NextResponse.json({ sessions });
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
