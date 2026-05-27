"use client";

import { useState } from "react";
import { DEFAULT_FILTERS, type FeedFilters } from "./feed-shared";
import { EventFilters } from "./event-filters";
import { EventFeed } from "./event-feed";
import { Charts } from "./charts";
import { TopSessions } from "./top-sessions";

export function FeedRoot() {
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS);

  return (
    <div className="flex flex-col gap-4">
      <EventFilters value={filters} onChange={setFilters} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Charts filters={filters} />
        <TopSessions />
      </div>

      <EventFeed filters={filters} onClearFilters={() => setFilters(DEFAULT_FILTERS)} />
    </div>
  );
}
