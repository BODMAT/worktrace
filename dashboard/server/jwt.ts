import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

interface JwtPayload {
  sub:   string;
  email: string;
}

function isPayload(v: unknown): v is JwtPayload {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r["sub"] === "string" && typeof r["email"] === "string";
}

export function requireUser(req: NextRequest): { id: string; email: string } {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new UnauthorizedError("Empty bearer token");

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");

  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
  if (!isPayload(decoded)) throw new UnauthorizedError("Invalid token payload");

  return { id: decoded.sub, email: decoded.email };
}
