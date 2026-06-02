"use client";

import type { EventDTO } from "@/types/event";
import { useClientLocalized } from "./use-client-localized";
import { motion } from "framer-motion";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function utcShort(iso: string): string {
  return iso.slice(0, 16).replace("T", " ") + " UTC";
}

function localShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year:   "numeric",
    month:  "short",
    day:    "2-digit",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export function EventCard({ event }: { event: EventDTO }) {
  const time = useClientLocalized(event.timestamp, utcShort, localShort);

  return (
    <motion.article
      className="flex flex-col gap-2 rounded border border-border bg-surface p-3 transition-colors hover:border-purple/60"
      whileHover={{ scale: 1.012, transition: { duration: 0.15 } }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <a
          href={event.url}
          target="_blank"
          rel="noreferrer noopener"
          className="cursor-pointer truncate text-sm font-bold text-text transition-colors hover:text-cyan"
          title={event.title}
        >
          {event.title}
        </a>
        <time
          className="shrink-0 text-[10px] text-muted"
          dateTime={event.timestamp}
        >
          {time}
        </time>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span className="text-purple">⟶</span>
        <span className="truncate">{hostnameOf(event.url)}</span>
      </div>

      {event.content ? (
        <p className="line-clamp-2 text-xs text-text/80">{event.content}</p>
      ) : null}

      {event.tags.length ? (
        <div className="flex flex-wrap gap-1">
          {event.tags.map((t) => (
            <span
              key={t}
              className="rounded border border-cyan/40 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-cyan"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </motion.article>
  );
}
