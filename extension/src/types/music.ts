export interface TrackInfo {
  title:      string;
  artist:     string;
  source:     "youtube-music" | "soundcloud";
  capturedAt: string; // ISO 8601
}

export type MusicMessage =
  | { type: "TRACK_CAPTURED";  payload: TrackInfo }
  | { type: "TRACK_GET_CURRENT" };

export type MusicResponse =
  | { success: true;  track: TrackInfo | null }
  | { success: false; error: string };

// Sent background → content script to pull the current track on demand
// (handles SW race condition: content script ran before SW was active)
export type MusicTabMessage = { type: "TRACK_REQUEST" };
