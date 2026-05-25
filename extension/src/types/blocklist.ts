export type BlocklistMessage =
  | { type: "BLOCKLIST_GET" }
  | { type: "BLOCKLIST_ADD"; domain: string }
  | { type: "BLOCKLIST_REMOVE"; domain: string };

export type BlocklistResponse =
  | { success: true; domains: string[] }
  | { success: true }
  | { success: false; error: string };
