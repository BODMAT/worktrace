"use client";

import { useEffect, useMemo, useRef } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { EventCard } from "./event-card";
import {
  eventsQueryKey,
  fetchEventsPage,
  type FeedFilters,
} from "./feed-shared";

type Props = {
  filters:        FeedFilters;
  onClearFilters: () => void;
};

export function EventFeed({ filters, onClearFilters }: Props) {
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useInfiniteQuery({
    queryKey:         eventsQueryKey(filters),
    queryFn:          ({ pageParam }) => fetchEventsPage(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData:  keepPreviousData,
    staleTime:        30_000,
  });

  const events = useMemo(
    () => data?.pages.flatMap((p) => p.events) ?? [],
    [data],
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <FeedSkeleton />;
  if (isError)   return <ErrorState onRetry={() => refetch()} />;
  if (events.length === 0) return <EmptyState onClear={onClearFilters} />;

  return (
    <>
      <ul className="flex flex-col gap-3" aria-busy={isFetching}>
        {events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>

      {hasNextPage ? (
        <div
          ref={sentinelRef}
          className="flex justify-center py-4 text-[10px] tracking-widest text-muted"
        >
          {isFetchingNextPage ? "LOADING…" : "SCROLL TO LOAD MORE"}
        </div>
      ) : (
        <div className="flex justify-center py-4 text-[10px] tracking-widest text-muted">
          END OF FEED
        </div>
      )}
    </>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded border border-border bg-surface"
        />
      ))}
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded border border-border bg-surface px-4 py-10 text-center">
      <p className="text-xs text-muted">No events match the current filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer text-[10px] font-bold tracking-widest text-purple transition-colors hover:text-cyan"
      >
        CLEAR FILTERS
      </button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded border border-pink/40 bg-surface px-4 py-10 text-center">
      <p className="text-xs text-pink">Failed to load events.</p>
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer rounded border border-pink/40 px-3 py-1.5 text-[10px] font-bold tracking-widest text-pink transition-colors hover:bg-pink/10"
      >
        RETRY
      </button>
    </div>
  );
}
