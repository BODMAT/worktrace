"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider, useToast } from "@/components/toast";

function QueryProviderInner({ children }: { children: React.ReactNode }) {
  const toast = useToast();

  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    return client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        const { error } = event.action;
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }, [client, toast]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <QueryProviderInner>{children}</QueryProviderInner>
    </ToastProvider>
  );
}
