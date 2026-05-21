export interface Session {
  id: string;
  startedAt: number; // Unix ms
  totalActiveMs: number; // accumulated active time (for future pause support)
}

export type SessionMessage =
  | { type: "SESSION_START" }
  | { type: "SESSION_STOP" }
  | { type: "SESSION_GET_STATE" };

export type SessionResponse =
  | { success: true; session: Session | null }
  | { success: false; error: string };
