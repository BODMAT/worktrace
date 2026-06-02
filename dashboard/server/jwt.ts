import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "@/server/cookies";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface JwtPayload {
  sub:   string;
  email: string;
}

function isPayload(v: unknown): v is JwtPayload {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r["sub"] === "string" && typeof r["email"] === "string";
}

function getSecretKey(): Uint8Array {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  let payload: unknown;
  try {
    const result = await jwtVerify(token, getSecretKey());
    payload = result.payload;
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
  if (!isPayload(payload)) throw new UnauthorizedError("Invalid token payload");
  return payload;
}

function extractToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const t = header.slice("Bearer ".length).trim();
    if (t) return t;
  }
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export async function requireUser(req: NextRequest): Promise<{ id: string; email: string }> {
  const token = extractToken(req);
  if (!token) throw new UnauthorizedError("Missing authentication credentials");
  const payload = await verifyJwt(token);
  return { id: payload.sub, email: payload.email };
}
