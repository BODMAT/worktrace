import { z } from "zod";
import type { EventDTO, EventStats, TopSession } from "@/types/event";

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

export const topSessionsQueryKey = ["top-sessions"] as const;

// ─── Response schemas ─────────────────────────────────────────────────────────

const EventDtoSchema: z.ZodType<EventDTO> = z.object({
  id:        z.string(),
  sessionId: z.string(),
  url:       z.string(),
  title:     z.string(),
  content:   z.string().nullable(),
  tags:      z.array(z.string()),
  timestamp: z.string(),
});

const EventsPageSchema: z.ZodType<EventsPage> = z.object({
  events:     z.array(EventDtoSchema),
  nextCursor: z.string().nullable(),
});

const EventStatsSchema: z.ZodType<EventStats> = z.object({
  byDay:   z.array(z.object({ date: z.string(), count: z.number() })),
  topTags: z.array(z.object({ tag:  z.string(), count: z.number() })),
});

const TopSessionSchema: z.ZodType<TopSession> = z.object({
  id:             z.string(),
  startedAt:      z.string(),
  endedAt:        z.string().nullable(),
  totalSeconds:   z.number(),
  topHost:        z.string().nullable(),
  topHostSeconds: z.number(),
});

const TopSessionsResponse = z.object({ sessions: z.array(TopSessionSchema) });

// ─── URL builders ─────────────────────────────────────────────────────────────

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

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Request failed: ${url} → ${res.status}`);
  return res.json();
}

export async function fetchEventsPage(
  filters: FeedFilters,
  cursor:  string | null,
): Promise<EventsPage> {
  return EventsPageSchema.parse(await getJson(buildEventsUrl(filters, cursor)));
}

export async function fetchEventStats(filters: FeedFilters): Promise<EventStats> {
  return EventStatsSchema.parse(await getJson(buildStatsUrl(filters)));
}

export async function fetchTopSessions(): Promise<TopSession[]> {
  const parsed = TopSessionsResponse.parse(await getJson("/api/v1/sessions/top"));
  return parsed.sessions;
}
