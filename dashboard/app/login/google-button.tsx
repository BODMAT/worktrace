"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function GoogleLoginButton({ clientId }: { clientId: string }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const router    = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tryInit = () => {
      if (!window.google?.accounts.id || !buttonRef.current) return false;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback:  async ({ credential }) => {
          setError(null);
          try {
            const res = await fetch("/api/auth/google", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ googleToken: credential }),
            });
            if (!res.ok) {
              const data: unknown = await res.json().catch(() => ({}));
              const msg = isErrorBody(data) ? data.error : "Login failed";
              setError(typeof msg === "string" ? msg : "Login failed");
              return;
            }
            router.replace("/dashboard");
            router.refresh();
          } catch {
            setError("Network error, please try again.");
          }
        },
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        type:  "standard",
        theme: "outline",
        size:  "large",
        text:  "signin_with",
        shape: "pill",
      });
      return true;
    };

    if (tryInit()) return;
    const interval = window.setInterval(() => { if (tryInit()) window.clearInterval(interval); }, 100);
    return () => window.clearInterval(interval);
  }, [clientId, router]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={buttonRef} />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function isErrorBody(v: unknown): v is { error: unknown } {
  return typeof v === "object" && v !== null && "error" in v;
}
