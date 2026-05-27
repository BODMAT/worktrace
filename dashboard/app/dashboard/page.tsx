import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { getCurrentUser } from "@/server/current-user";
import { getEventStatsForUser, listEventsForUser } from "@/server/events";
import { getTopSessionsForUser } from "@/server/sessions";
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  eventsQueryKey,
  statsQueryKey,
  topSessionsQueryKey,
} from "./feed-shared";
import { FeedRoot } from "./feed-root";

export const metadata: Metadata = {
  title:       "Dashboard",
  description: "Browse captured events, filter by date or tag, and review your top sessions.",
  robots:      { index: false, follow: false },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const qc = new QueryClient();
  await Promise.all([
    qc.prefetchInfiniteQuery({
      queryKey: eventsQueryKey(DEFAULT_FILTERS),
      queryFn:  () =>
        listEventsForUser(user.id, { tags: [], limit: PAGE_SIZE }),
      initialPageParam: null as string | null,
    }),
    qc.prefetchQuery({
      queryKey: statsQueryKey(DEFAULT_FILTERS),
      queryFn:  () => getEventStatsForUser(user.id, { tags: [] }),
    }),
    qc.prefetchQuery({
      queryKey: topSessionsQueryKey,
      queryFn:  () => getTopSessionsForUser(user.id, 3),
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-base font-bold tracking-widest text-cyan">EVENT FEED</h1>
      </div>

      <HydrationBoundary state={dehydrate(qc)}>
        <FeedRoot />
      </HydrationBoundary>
    </div>
  );
}
