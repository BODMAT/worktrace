import type { ParsingMode } from "../types/parsing";

const PARSING_MODE_KEY = "parsingMode";

/** Reads the stored parsing mode; returns "full" if not yet set. */
export async function getParsingMode(): Promise<ParsingMode> {
  const r = await chrome.storage.local.get(PARSING_MODE_KEY);
  return (r[PARSING_MODE_KEY] as ParsingMode | undefined) ?? "full";
}

/** Persists the chosen parsing mode to chrome.storage.local. */
export async function setParsingMode(mode: ParsingMode): Promise<void> {
  await chrome.storage.local.set({ [PARSING_MODE_KEY]: mode });
}
