import type { ContextLevel } from "@/types/report";
import { prisma } from "./db";
import { getMusicProductivity } from "./music";

// Groq free tier: 12,000 tokens/request. Reserve ~500 for system prompt + ~2,000 for response.
const INPUT_TOKEN_BUDGET = 7_500;
const CHARS_PER_TOKEN    = 4;
const MAX_HIGHLIGHTS     = 20;
const MAX_SESSIONS_SHOWN = 20;
const MAX_TOP_DOMAINS    = 10;
const MAX_TOP_TAGS       = 15;
const CONTENT_PREVIEW    = 300;

type RawEvent = {
  id:        string;
  sessionId: string;
  url:       string;
  title:     string;
  content:   string | null;
  tags:      string[];
  timestamp: Date;
};

type RawSession = {
  id:        string;
  startedAt: Date;
  endedAt:   Date | null;
};

type RawTrack = {
  artist:     string;
  title:      string;
  listenedMs: number;
  capturedAt: Date;
  endedAt:    Date | null;
};

export type ReportContext = {
  markdown:        string;
  level:           ContextLevel;
  estimatedTokens: number;
  eventCount:      number;
  sessionCount:    number;
  trackCount:      number;
};

export async function buildReportContext(
  userId: string,
  from:   Date,
  to:     Date,
  label:  string,
): Promise<ReportContext> {
  const [events, sessions, tracks, musicProd] = await Promise.all([
    prisma.event.findMany({
      where:  { session: { userId }, timestamp: { gte: from, lte: to } },
      select: {
        id: true, sessionId: true, url: true, title: true,
        content: true, tags: true, timestamp: true,
      },
      orderBy: { timestamp: "asc" },
    }),
    prisma.session.findMany({
      where:  { userId, startedAt: { gte: from, lte: to } },
      select: { id: true, startedAt: true, endedAt: true },
      orderBy: { startedAt: "asc" },
    }),
    prisma.track.findMany({
      where:  { session: { userId }, capturedAt: { gte: from, lte: to } },
      select: { artist: true, title: true, listenedMs: true, capturedAt: true, endedAt: true },
    }),
    getMusicProductivity(userId, from, to),
  ]);

  // Try each level until the rendered context fits within the token budget.
  // Level 3 is always fixed-size and acts as the floor.
  for (const level of [0, 1, 2, 3] as ContextLevel[]) {
    const markdown = renderContext({
      level, label, from, to,
      events, sessions, tracks, musicProd,
    });
    const tokens = estimateTokens(markdown);
    if (tokens <= INPUT_TOKEN_BUDGET || level === 3) {
      return {
        markdown,
        level,
        estimatedTokens: tokens,
        eventCount:      events.length,
        sessionCount:    sessions.length,
        trackCount:      tracks.length,
      };
    }
  }
  throw new Error("level 3 must always fit");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

import type { ProductivityRow } from "@/types/music-stats";

type RenderArgs = {
  level:     ContextLevel;
  label:     string;
  from:      Date;
  to:        Date;
  events:    RawEvent[];
  sessions:  RawSession[];
  tracks:    RawTrack[];
  musicProd: ProductivityRow[];
};

function renderContext(a: RenderArgs): string {
  const { level, label, from, to, events, sessions, tracks, musicProd } = a;
  const out: string[] = [];

  out.push("# Range");
  out.push(`${fmtDateTime(from)} → ${fmtDateTime(to)} (${label}), timezone UTC`);
  out.push("");

  const totalWorkMs   = totalWorkTime(sessions, to);
  const activeCount   = sessions.filter((s) => !s.endedAt).length;
  const endedCount    = sessions.length - activeCount;
  const distinctHosts = uniqueHosts(events).length;
  const distinctTagsN = uniqueTags(events).length;

  out.push("# Summary");
  out.push(`- Sessions: ${sessions.length} (${activeCount} active, ${endedCount} ended)`);
  out.push(`- Total session time: ${fmtDuration(totalWorkMs / 1000)}`);
  out.push(`- Events captured: ${events.length}`);
  out.push(`- Distinct domains: ${distinctHosts}`);
  out.push(`- Distinct tags: ${distinctTagsN}`);
  out.push(`- Music tracks logged: ${tracks.length}`);
  out.push("");

  if (level === 3) {
    if (tracks.length > 0) out.push(...renderMusicSection(tracks, musicProd));
    return out.join("\n").trimEnd();
  }

  // Sessions narrative (top N by recency)
  if (sessions.length > 0) {
    out.push("# Sessions");
    const shown = sessions.slice(-MAX_SESSIONS_SHOWN);
    for (const s of shown) {
      const durS = ((s.endedAt ?? to).getTime() - s.startedAt.getTime()) / 1000;
      const top  = topHostsForSession(events, s.id, 1)[0];
      const tail = top ? `, top host: ${top.host} (${top.count} events)` : "";
      out.push(
        `- ${fmtDateTime(s.startedAt)} → ${s.endedAt ? fmtDateTime(s.endedAt) : "active"}` +
        ` (${fmtDuration(durS)})${tail}`,
      );
    }
    if (sessions.length > MAX_SESSIONS_SHOWN) {
      out.push(`- … and ${sessions.length - MAX_SESSIONS_SHOWN} earlier sessions in range`);
    }
    out.push("");
  }

  const tops = topHosts(events, MAX_TOP_DOMAINS);
  if (tops.length > 0) {
    out.push("# Top domains by event count");
    for (const d of tops) out.push(`- ${d.host} — ${d.count} events`);
    out.push("");
  }

  const tagsTop = topTags(events, MAX_TOP_TAGS);
  if (tagsTop.length > 0) {
    out.push("# Top tags");
    out.push(tagsTop.map((t) => `${t.tag} (${t.count})`).join(", "));
    out.push("");
  }

  if (tracks.length > 0) out.push(...renderMusicSection(tracks, musicProd));

  if (level >= 2) {
    const days = bucketByDay(events);
    if (days.length > 0) {
      out.push("# Activity by day");
      for (const d of days) {
        const hosts = d.topHosts.slice(0, 3).map((h) => `${h.host} (${h.count})`).join(", ");
        const tags  = d.topTags.slice(0, 3).map((t) => `${t.tag} (${t.count})`).join(", ");
        out.push(
          `- ${d.date}: ${d.count} events` +
          (hosts ? `; hosts: ${hosts}` : "") +
          (tags  ? `; tags: ${tags}`   : ""),
        );
      }
      out.push("");
    }
    const highlights = pickHighlights(events, MAX_HIGHLIGHTS);
    if (highlights.length > 0) {
      out.push("# Highlights (sample)");
      for (const h of highlights) {
        const t = h.tags.length ? ` — tags: ${h.tags.join(", ")}` : "";
        out.push(`- ${fmtDateTime(h.timestamp)} — "${h.title}" — ${hostOf(h.url)}${t}`);
      }
      out.push("");
    }
    return out.join("\n").trimEnd();
  }

  // Level 0 or 1 — full per-event listing
  out.push("# Events");
  for (const e of events) {
    const t = e.tags.length ? ` — tags: ${e.tags.join(", ")}` : "";
    out.push(`- ${fmtDateTime(e.timestamp)} — "${e.title}" — ${hostOf(e.url)}${t}`);
    if (level === 0 && e.content) {
      const trimmed = e.content.length > CONTENT_PREVIEW
        ? `${e.content.slice(0, CONTENT_PREVIEW)}…`
        : e.content;
      out.push(`  content: "${trimmed.replace(/\s+/g, " ").trim()}"`);
    }
  }
  return out.join("\n").trimEnd();
}

const MAX_TOP_ARTISTS_REPORT = 10;

function renderMusicSection(tracks: RawTrack[], prod: ProductivityRow[]): string[] {
  const out: string[] = [];
  out.push("# Music");

  const byArtist = new Map<string, number>();
  for (const t of tracks) {
    byArtist.set(t.artist, (byArtist.get(t.artist) ?? 0) + t.listenedMs);
  }
  const topArtists = [...byArtist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOP_ARTISTS_REPORT);

  out.push("Top artists by listening time:");
  for (const [artist, ms] of topArtists) {
    out.push(`- ${artist} — ${fmtDuration(ms / 1000)}`);
  }

  if (prod.length > 0) {
    out.push("");
    out.push("Productivity correlation (events per minute while track was active, tracks with ≥1 min listening):");
    for (const p of prod) {
      out.push(
        `- "${p.title}" by ${p.artist} — ${p.perMin.toFixed(2)} events/min ` +
        `over ${p.minutes.toFixed(1)} min (${p.events} events)`,
      );
    }
  }
  out.push("");
  return out;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function fmtDateTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return `${s}s`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function uniqueHosts(events: RawEvent[]): string[] {
  return [...new Set(events.map((e) => hostOf(e.url)))];
}

function uniqueTags(events: RawEvent[]): string[] {
  const set = new Set<string>();
  for (const e of events) for (const t of e.tags) set.add(t);
  return [...set];
}

function topHosts(events: RawEvent[], limit: number) {
  const counts = new Map<string, number>();
  for (const e of events) {
    const h = hostOf(e.url);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([host, count]) => ({ host, count }));
}

function topHostsForSession(events: RawEvent[], sessionId: string, limit: number) {
  return topHosts(events.filter((e) => e.sessionId === sessionId), limit);
}

function topTags(events: RawEvent[], limit: number) {
  const counts = new Map<string, number>();
  for (const e of events) for (const t of e.tags) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function bucketByDay(events: RawEvent[]) {
  const map = new Map<string, RawEvent[]>();
  for (const e of events) {
    const day = e.timestamp.toISOString().slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, items]) => ({
      date,
      count:    items.length,
      topHosts: topHosts(items, 5),
      topTags:  topTags(items, 5),
    }));
}

function pickHighlights(events: RawEvent[], n: number): RawEvent[] {
  const withContent = events
    .filter((e) => !!e.content?.trim())
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, n);
  if (withContent.length >= n) return withContent;

  const seen = new Set(withContent.map((e) => e.id));
  const rest = events
    .filter((e) => !seen.has(e.id))
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, n - withContent.length);
  return [...withContent, ...rest];
}

function totalWorkTime(sessions: RawSession[], to: Date): number {
  let total = 0;
  for (const s of sessions) {
    const end = s.endedAt ?? to;
    total += end.getTime() - s.startedAt.getTime();
  }
  return total;
}
