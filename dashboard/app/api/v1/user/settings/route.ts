import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/server/jwt";
import { withCors, corsPreflight } from "@/server/cors";
import { SetApiKeyInput } from "@/server/schemas/user-settings";
import { getUserSettingsView, setGroqApiKey } from "@/server/user-settings";

export const GET = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }
  const view = await getUserSettingsView(user.id);
  return NextResponse.json(view);
});

export const PUT = withCors(async (req) => {
  let user;
  try {
    user = requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SetApiKeyInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const view = await setGroqApiKey(user.id, parsed.data.groqApiKey);
  return NextResponse.json(view);
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
