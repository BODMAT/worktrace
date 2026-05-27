import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/server/cookies";
import { verifyJwt } from "@/server/jwt";
import { listEventsForUser } from "@/server/events";
import { DEFAULT_FILTERS, PAGE_SIZE, eventsQueryKey } from "./feed-shared";
import { EventFeed } from "./event-feed";

export default async function DashboardPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  let userId: string;
  try {
    ({ sub: userId } = await verifyJwt(token));
  } catch {
    redirect("/login");
  }

  const qc = new QueryClient();
  await qc.prefetchInfiniteQuery({
    queryKey: eventsQueryKey(DEFAULT_FILTERS),
    queryFn:  () =>
      listEventsForUser(userId, { tags: [], limit: PAGE_SIZE }),
    initialPageParam: null as string | null,
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-base font-bold tracking-widest text-cyan">EVENT FEED</h1>
      </div>

      <HydrationBoundary state={dehydrate(qc)}>
        <EventFeed />
      </HydrationBoundary>
    </div>
  );
}
