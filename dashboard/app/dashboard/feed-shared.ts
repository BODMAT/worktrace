import type { EventDTO } from "@/types/event";

export type FeedFilters = {
  from: string;
  to:   string;
  tags: string;
};

export const DEFAULT_FILTERS: FeedFilters = { from: "", to: "", tags: "" };
export const PAGE_SIZE = 30;

export type EventsPage = {
  events:     EventDTO[];
  nextCursor: string | null;
};

export function eventsQueryKey(filters: FeedFilters) {
  return ["events", filters] as const;
}

export function buildEventsUrl(filters: FeedFilters, cursor: string | null): string {
  const sp = new URLSearchParams();
  if (filters.from) sp.set("from", filters.from);
  if (filters.to)   sp.set("to", filters.to);
  if (filters.tags) sp.set("tags", filters.tags);
  if (cursor)       sp.set("cursor", cursor);
  sp.set("limit", String(PAGE_SIZE));
  return `/api/v1/events?${sp.toString()}`;
}

export async function fetchEventsPage(
  filters: FeedFilters,
  cursor:  string | null,
): Promise<EventsPage> {
  const res = await fetch(buildEventsUrl(filters, cursor), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Failed to load events: ${res.status}`);
  const body: unknown = await res.json();
  if (!isEventsPage(body)) throw new Error("Malformed response");
  return body;
}

function isEventsPage(v: unknown): v is EventsPage {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return Array.isArray(r["events"]) && (r["nextCursor"] === null || typeof r["nextCursor"] === "string");
}
