import { type NextRequest, NextResponse } from "next/server";
import { closeStaleSessions } from "@/server/sessions";
import { closeStaleTracksForClosedSessions } from "@/server/tracks";

const STALE_THRESHOLD_MINUTES = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { closed, deleted } = await closeStaleSessions(STALE_THRESHOLD_MINUTES);
  const tracksFixed = await closeStaleTracksForClosedSessions();

  return NextResponse.json({ closed, deleted, tracksFixed });
}
