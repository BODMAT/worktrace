import { NextRequest, NextResponse } from "next/server";
import { createEvent } from "@/server/events";
import { CreateEventInput } from "@/server/schemas/events";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateEventInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const event = await createEvent(parsed.data);
  return NextResponse.json(event, { status: 201 });
}
