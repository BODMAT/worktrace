export type EventDTO = {
  id:        string;
  sessionId: string;
  url:       string;
  title:     string;
  content:   string | null;
  tags:      string[];
  timestamp: string;
};

export type DayBucket = { date: string; count: number };
export type TagCount  = { tag: string; count: number };

export type EventStats = {
  byDay:   DayBucket[];
  topTags: TagCount[];
};
