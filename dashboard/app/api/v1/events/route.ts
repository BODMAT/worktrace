import { NextRequest, NextResponse } from "next/server";
import {
  createEventForUser,
  listEventsForUser,
  SessionNotFoundError,
} from "@/server/events";
import { CreateEventInput, EventListFilters } from "@/server/schemas/events";
import { withCors, corsPreflight } from "@/server/cors";
import { requireUser, UnauthorizedError } from "@/server/jwt";
import { apiError } from "@/server/api-error";

export const GET = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return apiError("UNAUTHORIZED", err.message, 401);
    }
    throw err;
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = EventListFilters.safeParse(params);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Validation failed", 400);
  }

  const page = await listEventsForUser(user.id, parsed.data);
  return NextResponse.json(page);
});

export const POST = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return apiError("UNAUTHORIZED", err.message, 401);
    }
    throw err;
  }

  const body = await req.json();
  const parsed = CreateEventInput.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Validation failed", 400);
  }

  try {
    const event = await createEventForUser(user.id, parsed.data);
    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return apiError("NOT_FOUND", "Session not found", 404);
    }
    throw err;
  }
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
