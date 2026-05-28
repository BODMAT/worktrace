import type { GenerateReportResponse, RangePreset } from "@/types/report";
import type { UserSettingsView } from "@/server/user-settings";

export type GenerateInput = {
  range: RangePreset;
  from?: string;
  to?:   string;
};

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
    return `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function generateReport(input: GenerateInput): Promise<GenerateReportResponse> {
  const res = await fetch("/api/v1/reports/generate", {
    method:      "POST",
    headers:     { "Content-Type": "application/json" },
    credentials: "include",
    body:        JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as GenerateReportResponse;
}

export async function getApiKeyStatus(): Promise<UserSettingsView> {
  const res = await fetch("/api/v1/user/settings", { credentials: "include" });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as UserSettingsView;
}

export async function saveApiKey(key: string | null): Promise<UserSettingsView> {
  const res = await fetch("/api/v1/user/settings", {
    method:      "PUT",
    headers:     { "Content-Type": "application/json" },
    credentials: "include",
    body:        JSON.stringify({ groqApiKey: key }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as UserSettingsView;
}
