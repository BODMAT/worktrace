"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

export function LogoutButton() {
  const router      = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          queryClient.clear();
          router.replace("/login");
          router.refresh();
        }
      }}
      title="Sign out"
      aria-label="Sign out"
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-border bg-surface text-base text-muted transition-all hover:border-pink hover:bg-pink/10 hover:text-pink hover:shadow-[0_0_8px_color-mix(in_srgb,var(--c-pink)_30%,transparent)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {pending ? "…" : "⎋"}
    </button>
  );
}
