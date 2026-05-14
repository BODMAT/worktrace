import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGIN_PATTERN.test(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}

export function withCors(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
    const res = await handler(req);
    const headers = corsHeaders(req.headers.get("origin"));
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return res;
  };
}

export function corsPreflight(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}
