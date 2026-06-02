"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

type Menu = null | "account" | "delete-confirm";

const backdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: { duration: 0.2 },
};

const panel = {
  initial: { opacity: 0, scale: 0.92, y: 16 },
  animate: { opacity: 1, scale: 1,    y: 0  },
  exit:    { opacity: 0, scale: 0.95, y: 8  },
  transition: { type: "spring" as const, stiffness: 400, damping: 28, mass: 0.8 },
};

// Remove all cached report keys for a given email (or all wt:report:* keys)
function clearReportCache(email: string) {
  try {
    const prefix = `wt:report:${email.toLowerCase().trim()}:`;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* localStorage unavailable */ }
}

export function AccountMenu({ userEmail }: { userEmail: string }) {
  const router      = useRouter();
  const queryClient = useQueryClient();
  const [menu,      setMenu]      = useState<Menu>(null);
  const [pending,   setPending]   = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  // Escape key closes the active modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu === "delete-confirm") setMenu("account");
      else if (menu === "account") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      clearReportCache(userEmail);
    } finally {
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    }
  }

  async function handleDelete() {
    setPending(true);
    setDeleteErr(null);
    try {
      const res = await fetch("/api/auth/delete-account", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      clearReportCache(userEmail);
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : "Failed to delete account");
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMenu("account")}
        title="Account"
        aria-label="Account menu"
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-border bg-surface text-base text-muted transition-all hover:border-pink hover:bg-pink/10 hover:text-pink hover:shadow-[0_0_8px_color-mix(in_srgb,var(--c-pink)_30%,transparent)]"
      >
        ⎋
      </button>

      {createPortal(
        <AnimatePresence mode="wait">

          {/* ── Modal 1: account options ── */}
          {menu === "account" && (
            <>
              <motion.div key="bd-a" {...backdrop}
                className="fixed inset-0 z-50 bg-bg/80 backdrop-blur"
                onMouseDown={() => setMenu(null)}
                aria-hidden
              />
              <motion.div key="p-a" {...panel}
                role="dialog" aria-modal="true" aria-labelledby="account-modal-title"
                className="fixed inset-0 z-50 flex items-center justify-center px-4"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="w-full max-w-sm rounded border border-border bg-surface p-6 shadow-xl">
                  <div className="mb-4 flex items-baseline justify-between">
                    <h2 id="account-modal-title" className="text-sm font-bold tracking-widest text-cyan">
                      ACCOUNT
                    </h2>
                    <button type="button" onClick={() => setMenu(null)}
                      className="cursor-pointer text-muted transition-colors hover:text-pink" aria-label="Close">
                      ✕
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={pending}
                      className="w-full cursor-pointer rounded border border-border px-4 py-2.5 text-[10px] font-bold tracking-widest text-muted transition-colors hover:border-purple/60 hover:text-text disabled:opacity-50"
                    >
                      SIGN OUT
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteErr(null); setMenu("delete-confirm"); }}
                      disabled={pending}
                      className="w-full cursor-pointer rounded border border-pink/40 px-4 py-2.5 text-[10px] font-bold tracking-widest text-pink transition-colors hover:bg-pink/10 disabled:opacity-50"
                    >
                      DELETE ACCOUNT
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}

          {/* ── Modal 2: delete confirmation ── */}
          {menu === "delete-confirm" && (
            <>
              <motion.div key="bd-d" {...backdrop}
                className="fixed inset-0 z-50 bg-bg/80 backdrop-blur"
                onMouseDown={() => setMenu("account")}
                aria-hidden
              />
              <motion.div key="p-d" {...panel}
                role="dialog" aria-modal="true" aria-labelledby="delete-modal-title"
                className="fixed inset-0 z-50 flex items-center justify-center px-4"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="w-full max-w-sm rounded border border-pink/40 bg-surface p-6 shadow-xl">
                  <div className="mb-4 flex items-baseline justify-between">
                    <h2 id="delete-modal-title" className="text-sm font-bold tracking-widest text-pink">
                      DELETE ACCOUNT
                    </h2>
                    <button type="button" onClick={() => setMenu("account")}
                      className="cursor-pointer text-muted transition-colors hover:text-pink" aria-label="Back">
                      ✕
                    </button>
                  </div>

                  <p className="mb-5 text-xs leading-relaxed text-muted">
                    This will <span className="text-pink">permanently delete</span> all your events,
                    sessions, music data, and settings. This action cannot be undone.
                  </p>

                  {deleteErr ? (
                    <p className="mb-3 text-[11px] text-pink">{deleteErr}</p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setMenu("account")}
                      disabled={pending}
                      className="cursor-pointer rounded border border-border px-3 py-1.5 text-[10px] font-bold tracking-widest text-muted transition-colors hover:text-text disabled:opacity-50"
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={pending}
                      className="cursor-pointer rounded border border-pink bg-pink/10 px-4 py-1.5 text-[10px] font-bold tracking-widest text-pink transition-colors hover:bg-pink/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pending ? "DELETING…" : "DELETE EVERYTHING"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}

        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
