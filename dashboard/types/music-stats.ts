export type TopArtist = {
  artist:      string;
  listenedMs:  number;
  trackCount:  number;
};

export type TopTrack = {
  artist:     string;
  title:      string;
  listenedMs: number;
};

export type ProductivityRow = {
  artist:  string;
  title:   string;
  minutes: number;
  events:  number;
  perMin:  number;
};

export type HourBucket = {
  hour:       number;
  listenedMs: number;
  eventCount: number;
};

export type MusicStats = {
  topArtists:      TopArtist[];
  topTracks:       TopTrack[];
  productivity:    ProductivityRow[];
  hourlyPattern:   HourBucket[];
  totalListenedMs: number;
  totalArtists:    number;
  totalTracks:     number;
  range:           { from: string; to: string; label: string };
};
