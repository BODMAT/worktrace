import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/server/jwt";
import { SESSION_COOKIE, clearedCookieOptions } from "@/server/cookies";

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};

export async function proxy(req: NextRequest) {
  const token  = req.cookies.get(SESSION_COOKIE)?.value;
  const isAuth = token ? await isValid(token) : false;

  const onLogin = req.nextUrl.pathname === "/login";

  if (onLogin && isAuth) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (!onLogin && !isAuth) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    if (token) res.cookies.set(SESSION_COOKIE, "", clearedCookieOptions());
    return res;
  }

  return NextResponse.next();
}

async function isValid(token: string): Promise<boolean> {
  try {
    await verifyJwt(token);
    return true;
  } catch {
    return false;
  }
}
