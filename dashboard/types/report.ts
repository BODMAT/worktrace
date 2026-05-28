export type RangePreset =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_30d"
  | "all_time"
  | "custom";

export type ContextLevel = 0 | 1 | 2 | 3;

export type GenerateReportResponse = {
  markdown:             string;
  range:                { from: string; to: string; label: string };
  contextLevel:         ContextLevel;
  estimatedInputTokens: number;
  model:                string;
};
