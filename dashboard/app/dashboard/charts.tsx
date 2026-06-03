"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";
import {
  fetchEventStats,
  statsQueryKey,
  type FeedFilters,
} from "./feed-shared";
import { EventsByDayChart } from "./events-by-day-chart";
import { TopTagsChart } from "./top-tags-chart";
import { AnimatePresence, motion } from "framer-motion";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
);

export function Charts({ filters }: { filters: FeedFilters }) {
  const { data, isLoading, isError } = useQuery({
    queryKey:        statsQueryKey(filters),
    queryFn:         () => fetchEventStats(filters),
    placeholderData:  keepPreviousData,
    staleTime:        30_000,
    refetchInterval:  30_000,
  });

  if (isLoading) {
    return (
      <>
        <div className="h-52 animate-pulse rounded border border-border bg-surface" />
        <div className="h-52 animate-pulse rounded border border-border bg-surface" />
      </>
    );
  }

  if (isError || !data) {
    return (
      <div className="col-span-full rounded border border-pink/40 bg-surface px-4 py-6 text-center text-[10px] tracking-widest text-pink">
        FAILED TO LOAD CHART DATA
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="charts"
        className="contents"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        <EventsByDayChart byDay={data.byDay} />
        <TopTagsChart top={data.topTags} />
      </motion.div>
    </AnimatePresence>
  );
}
