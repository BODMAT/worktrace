"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
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
          router.replace("/login");
          router.refresh();
        }
      }}
      title="Sign out"
      className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-base text-muted transition-colors hover:border-pink/40 hover:text-pink disabled:opacity-30"
    >
      {pending ? "…" : "⎋"}
    </button>
  );
}
