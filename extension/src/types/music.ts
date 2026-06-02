export interface TrackInfo {
  title:        string;
  artist:       string;
  source:       "youtube-music" | "soundcloud";
  capturedAt:   string; // ISO 8601
  playbackTime: string; // current playback position from DOM (e.g. "1:23" or "94.5")
                        // changes every ~1s when playing, stays constant on pause
                        // empty string if the player bar is not yet rendered
}

export type MusicMessage =
  | { type: "TRACK_CAPTURED";  payload: TrackInfo }
  | { type: "TRACK_GET_CURRENT" }
  | { type: "TRACK_STOP" };

export type MusicResponse =
  | { success: true;  track: TrackInfo | null }
  | { success: false; error: string };

// Sent background → content script to pull the current track on demand
// (handles SW race condition: content script ran before SW was active)
export type MusicTabMessage = { type: "TRACK_REQUEST" };
