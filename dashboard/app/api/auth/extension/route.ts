import { NextRequest, NextResponse } from "next/server";
import { withCors, corsPreflight } from "@/server/cors";
import { ExtensionAuthInput } from "@/server/schemas/auth";
import { authenticateExtensionUser } from "@/server/auth";

export const POST = withCors(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ExtensionAuthInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  try {
    const token = await authenticateExtensionUser(parsed.data.googleToken);
    return NextResponse.json({ token }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
