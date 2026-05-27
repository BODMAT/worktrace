"use client";

import { useState } from "react";
import { DEFAULT_FILTERS, type FeedFilters } from "./feed-shared";
import { EventFilters } from "./event-filters";
import { EventFeed } from "./event-feed";
import { Charts } from "./charts";

export function FeedRoot() {
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS);

  return (
    <div className="flex flex-col gap-4">
      <EventFilters value={filters} onChange={setFilters} />
      <Charts filters={filters} />
      <EventFeed filters={filters} onClearFilters={() => setFilters(DEFAULT_FILTERS)} />
    </div>
  );
}
