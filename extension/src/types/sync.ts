export type SyncMessage = { type: "SYNC_GET_STATUS" };

export type SyncResponse =
  | {
      success:      true;
      lastSyncedAt: number | null;
      lastError:    string | null;
      queueSize:    number;
    }
  | { success: false; error: string };
