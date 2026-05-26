import { NextRequest, NextResponse } from "next/server";
import { WebAuthInput } from "@/server/schemas/auth";
import { authenticateGoogleUser } from "@/server/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/cookies";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = WebAuthInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  let token: string;
  try {
    token = await authenticateGoogleUser(parsed.data.googleToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
