"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Renders a stable server-snapshot during SSR, swaps to the client-snapshot after hydration.
// Designed for locale-/timezone-dependent values that would otherwise mismatch between server and client.
export function useClientLocalized<T>(
  iso:           string,
  getServerSnap: (iso: string) => T,
  getClientSnap: (iso: string) => T,
): T {
  return useSyncExternalStore(
    subscribe,
    () => getClientSnap(iso),
    () => getServerSnap(iso),
  );
}
