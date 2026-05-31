"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastVariant = "error" | "success";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  error: (message: string) => void;
  success: (message: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const MAX_TOASTS  = 3;
const DISMISS_MS  = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = ++counter.current;
      setToasts((prev) => {
        const next = [...prev, { id, message, variant }];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
      setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    error:   (msg) => push(msg, "error"),
    success: (msg) => push(msg, "success"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={
            "pointer-events-auto flex items-start gap-3 rounded border px-4 py-3 text-xs shadow-lg " +
            (t.variant === "error"
              ? "border-pink/40 bg-surface text-pink"
              : "border-cyan/40 bg-surface text-cyan")
          }
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="mt-0.5 shrink-0 cursor-pointer opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
