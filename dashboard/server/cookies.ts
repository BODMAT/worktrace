export const SESSION_COOKIE = "wt_session";

function parseDurationSeconds(raw: string): number {
  const m = /^(\d+)\s*([smhdw])?$/.exec(raw.trim());
  if (!m) throw new Error(`Invalid duration: ${raw}`);
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return n * multipliers[unit];
}

function jwtMaxAgeSeconds(): number {
  return parseDurationSeconds(process.env.JWT_EXPIRES_IN ?? "7d");
}

type CookieOptions = {
  httpOnly: true;
  secure:   boolean;
  sameSite: "lax";
  path:     "/";
  maxAge:   number;
};

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   jwtMaxAgeSeconds(),
  };
}

export function clearedCookieOptions(): CookieOptions {
  return { ...sessionCookieOptions(), maxAge: 0 };
}
