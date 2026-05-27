import type { EventDTO, EventStats } from "@/types/event";

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

export function statsQueryKey(filters: FeedFilters) {
  return ["event-stats", filters] as const;
}

function applyFilters(sp: URLSearchParams, filters: FeedFilters): void {
  if (filters.from) sp.set("from", filters.from);
  if (filters.to)   sp.set("to", filters.to);
  if (filters.tags) sp.set("tags", filters.tags);
}

export function buildEventsUrl(filters: FeedFilters, cursor: string | null): string {
  const sp = new URLSearchParams();
  applyFilters(sp, filters);
  if (cursor) sp.set("cursor", cursor);
  sp.set("limit", String(PAGE_SIZE));
  return `/api/v1/events?${sp.toString()}`;
}

export function buildStatsUrl(filters: FeedFilters): string {
  const sp = new URLSearchParams();
  applyFilters(sp, filters);
  const qs = sp.toString();
  return qs ? `/api/v1/events/stats?${qs}` : "/api/v1/events/stats";
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

export async function fetchEventStats(filters: FeedFilters): Promise<EventStats> {
  const res = await fetch(buildStatsUrl(filters), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Failed to load stats: ${res.status}`);
  const body: unknown = await res.json();
  if (!isEventStats(body)) throw new Error("Malformed stats response");
  return body;
}

function isEventsPage(v: unknown): v is EventsPage {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return Array.isArray(r["events"]) && (r["nextCursor"] === null || typeof r["nextCursor"] === "string");
}

function isEventStats(v: unknown): v is EventStats {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return Array.isArray(r["byDay"]) && Array.isArray(r["topTags"]);
}
