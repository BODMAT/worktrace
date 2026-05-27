"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TopSession } from "@/types/event";
import { fetchTopSessions, topSessionsQueryKey } from "./feed-shared";

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0 && m === 0) return `${total}s`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

function localDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day:   "2-digit",
  });
}

const subscribe = () => () => {};

function useLocalDay(iso: string): string {
  return useSyncExternalStore(
    subscribe,
    () => localDay(iso),
    () => utcDay(iso),
  );
}

export function TopSessions() {
  const { data, isLoading, isError } = useQuery({
    queryKey:  topSessionsQueryKey,
    queryFn:   fetchTopSessions,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="h-full min-h-52 animate-pulse rounded border border-border bg-surface" />;
  }

  if (isError || !data) {
    return (
      <div className="flex h-full min-h-52 items-center justify-center rounded border border-pink/40 bg-surface text-[10px] tracking-widest text-pink">
        FAILED TO LOAD SESSIONS
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-52 items-center justify-center rounded border border-border bg-surface text-[10px] tracking-widest text-muted">
        NO SESSIONS YET
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded border border-border bg-surface p-4">
      <div className="mb-3 text-[10px] font-bold tracking-widest text-muted">
        TOP 3 SESSIONS
      </div>
      <ul className="flex flex-col gap-2">
        {data.map((session) => (
          <li key={session.id}>
            <SessionRow session={session} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionRow({ session }: { session: TopSession }) {
  const day = useLocalDay(session.startedAt);
  const isActive = session.endedAt === null;

  const ratio = session.totalSeconds > 0
    ? Math.min(1, session.topHostSeconds / session.totalSeconds)
    : 0;

  return (
    <div className="flex flex-col gap-1 rounded border border-border/50 bg-bg px-2 py-1.5 transition-colors hover:border-purple/60">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className={isActive ? "text-cyan" : "text-muted"}
            title={isActive ? "Active session" : "Ended session"}
          >
            ●
          </span>
          <span className="font-bold text-text">{day}</span>
        </div>
        <span className="text-[11px] font-bold text-cyan tabular-nums">
          {formatDuration(session.totalSeconds)}
        </span>
      </div>

      {session.topHost ? (
        <>
          <div className="flex items-baseline justify-between gap-2 pl-3">
            <span className="truncate text-[10px] text-muted" title={session.topHost}>
              ⟶ {session.topHost}
            </span>
            <span className="shrink-0 text-[10px] text-purple tabular-nums">
              {formatDuration(session.topHostSeconds)}
            </span>
          </div>
          <div className="ml-3 h-1 overflow-hidden rounded-sm bg-border">
            <div
              className="h-full bg-purple"
              style={{ width: `${(ratio * 100).toFixed(1)}%` }}
            />
          </div>
        </>
      ) : (
        <div className="pl-3 text-[10px] text-muted">no parsed pages</div>
      )}
    </div>
  );
}
