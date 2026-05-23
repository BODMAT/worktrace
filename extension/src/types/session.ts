export interface Session {
  id: string;
  dbSessionId: string | null; // CUID returned by POST /api/v1/sessions, null until first sync
  startedAt: number; // Unix ms
  totalActiveMs: number; // accumulated active time
  pausedAt: number | null; // null = active, number = paused since
}

// Returned by SESSION_GET_STATE — includes computed elapsed
export interface SessionState extends Session {
  elapsedMs: number;
}

export type SessionMessage =
  | { type: "SESSION_START" }
  | { type: "SESSION_STOP" }
  | { type: "SESSION_GET_STATE" }
  | { type: "SESSION_PAUSE" }
  | { type: "SESSION_RESUME" }
  | { type: "NOTE_ADD"; text: string; tags: string[] };

export type SessionResponse =
  | { success: true; session: SessionState | null }
  | { success: true }
  | { success: false; error: string };
