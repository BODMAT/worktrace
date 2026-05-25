export type ParsingMode = "full" | "headings" | "meta";

export type ParsingModeMessage =
  | { type: "PARSING_MODE_GET" }
  | { type: "PARSING_MODE_SET"; mode: ParsingMode };

export type ParsingModeResponse =
  | { success: true; mode: ParsingMode }
  | { success: false; error: string };
