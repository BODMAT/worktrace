export type EventDTO = {
  id:        string;
  sessionId: string;
  url:       string;
  title:     string;
  content:   string | null;
  tags:      string[];
  timestamp: string;
};
