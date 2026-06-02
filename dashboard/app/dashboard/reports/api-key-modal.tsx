"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { UserSettingsView } from "@/server/user-settings";
import { saveApiKey } from "./reports-client";

type Props = {
  open:     boolean;
  status:   UserSettingsView;
  onClose:  () => void;
  onSaved:  (next: UserSettingsView) => void;
};

export function ApiKeyModal({ open, status, onClose, onSaved }: Props) {
  const [value, setValue] = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function commit(key: string | null) {
    setBusy(true);
    setError(null);
    try {
      const next = await saveApiKey(key);
      onSaved(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-bg/80 backdrop-blur"
            onMouseDown={onClose}
            aria-hidden
          />

          {/* Panel */}
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-key-modal-title"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.95,  y: 8  }}
            transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.8 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-md rounded border border-border bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-baseline justify-between">
                <h2
                  id="api-key-modal-title"
                  className="text-sm font-bold tracking-widest text-cyan"
                >
                  GROQ API KEY
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer text-muted transition-colors hover:text-pink"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <p className="mb-4 text-xs text-muted">
                {status.hasGroqApiKey
                  ? <>Currently using your own key (••••{status.last4 ?? "????"}). To change, enter a new key below.</>
                  : <>Currently using the shared default key. Paste your own Groq API key to override.</>
                }
              </p>

              <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted">
                NEW KEY
              </label>
              <input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="gsk_…"
                disabled={busy}
                autoComplete="off"
                className="mb-2 w-full rounded border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none transition-colors focus:border-purple disabled:opacity-50"
              />

              {error ? (
                <p className="mb-2 text-[11px] text-pink">{error}</p>
              ) : null}

              <p className="mb-4 text-[10px] text-muted">
                Stored encrypted (AES-256-GCM) and never returned to the browser.
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {status.hasGroqApiKey ? (
                  <button
                    type="button"
                    onClick={() => commit(null)}
                    disabled={busy}
                    className="cursor-pointer rounded border border-pink/60 px-3 py-1.5 text-[10px] font-bold tracking-widest text-pink transition-colors hover:bg-pink/10 disabled:opacity-50"
                  >
                    CLEAR KEY
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="cursor-pointer rounded border border-muted px-3 py-1.5 text-[10px] font-bold tracking-widest text-muted transition-colors hover:text-text disabled:opacity-50"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => commit(value)}
                  disabled={busy || value.trim().length < 8}
                  className="cursor-pointer rounded border border-cyan bg-cyan/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan transition-colors hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "SAVING…" : "SAVE"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
