import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEvent } from "@/server/events";
import { CreateEventInput } from "@/server/schemas/events";
import { withCors, corsPreflight } from "@/server/cors";

export const POST = withCors(async (req) => {
  const body = await req.json();
  const parsed = CreateEventInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const event = await createEvent(parsed.data);
  return NextResponse.json(event, { status: 201 });
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
