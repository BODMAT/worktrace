// Wire shape for queued events — matches dashboard's CreateEventInput
// (minus sessionId, which is attached at flush time from local Session.dbSessionId)
export interface PendingEvent {
  url:       string;       // must satisfy z.url() (worktrace://note/... for notes)
  title:     string;       // min 1 char
  content:   string | null;
  tags:      string[];
  timestamp: string;       // ISO 8601
}
