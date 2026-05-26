import { NextResponse } from "next/server";
import { SESSION_COOKIE, clearedCookieOptions } from "@/server/cookies";

export function POST() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(SESSION_COOKIE, "", clearedCookieOptions());
  return res;
}
