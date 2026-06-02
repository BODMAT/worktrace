"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { GenerateReportResponse, RangePreset } from "@/types/report";
import type { UserSettingsView } from "@/server/user-settings";
import {
  generateReport,
  getApiKeyStatus,
  type GenerateInput,
} from "./reports-client";
import { MarkdownView } from "./markdown-view";
import { ApiKeyModal } from "./api-key-modal";
import { useToast } from "@/components/toast";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today",     label: "TODAY"        },
  { value: "yesterday", label: "YESTERDAY"    },
  { value: "last_7d",   label: "LAST 7 DAYS"  },
  { value: "last_30d",  label: "LAST 30 DAYS" },
  { value: "all_time",  label: "ALL TIME"     },
  { value: "custom",    label: "CUSTOM"       },
];

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error";   message: string }
  | { kind: "success"; result: GenerateReportResponse; createdAt: string };

// ─── localStorage cache ───────────────────────────────────────────────────────

type CachedReport = { result: GenerateReportResponse; createdAt: string };

function reportCacheKey(email: string, range: RangePreset, from: string, to: string): string {
  const u = email.toLowerCase().trim();
  return range === "custom"
    ? `wt:report:${u}:custom:${from}:${to}`
    : `wt:report:${u}:${range}`;
}

function loadCache(key: string): CachedReport | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CachedReport) : null;
  } catch { return null; }
}

function saveCache(key: string, data: CachedReport): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    if (err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      throw err; // let caller notify the user
    }
    // other DOMExceptions are unexpected — swallow silently
  }
}

function fmtCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function downloadMarkdown(markdown: string, rangeLabel: string): void {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const slug = rangeLabel.toLowerCase().replace(/\s+/g, "-");
  const ymd  = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `worktrace-report-${slug}-${ymd}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportForm({ userEmail }: { userEmail: string }) {
  const toast = useToast();
  const [range,     setRange]     = useState<RangePreset>("last_7d");
  const [from,      setFrom]      = useState<string>("");
  const [to,        setTo]        = useState<string>(todayISO());
  // Lazy init: read localStorage for the default range before first render
  const [status, setStatus] = useState<Status>(() => {
    try {
      const cached = loadCache(reportCacheKey(userEmail, "last_7d", "", ""));
      if (cached) return { kind: "success", result: cached.result, createdAt: cached.createdAt };
    } catch { /* localStorage unavailable (SSR guard) */ }
    return { kind: "idle" };
  });
  const [apiKey,    setApiKey]    = useState<UserSettingsView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getApiKeyStatus()
      .then((v) => { if (!cancelled) setApiKey(v); })
      .catch(() => { if (!cancelled) setApiKey({ hasGroqApiKey: false, last4: null }); });
    return () => { cancelled = true; };
  }, []);

  // Range button click — load cache in the event handler (not in an effect)
  function handleRangeChange(newRange: RangePreset) {
    setRange(newRange);
    if (newRange === "custom") return;
    const cached = loadCache(reportCacheKey(userEmail, newRange, "", ""));
    setStatus(cached
      ? { kind: "success", result: cached.result, createdAt: cached.createdAt }
      : { kind: "idle" });
  }

  // Custom date changes — check cache when both dates are present
  function handleFromChange(newFrom: string) {
    setFrom(newFrom);
    if (!newFrom || !to) { setStatus({ kind: "idle" }); return; }
    const cached = loadCache(reportCacheKey(userEmail, "custom", newFrom, to));
    setStatus(cached
      ? { kind: "success", result: cached.result, createdAt: cached.createdAt }
      : { kind: "idle" });
  }

  function handleToChange(newTo: string) {
    setTo(newTo);
    if (!from || !newTo) { setStatus({ kind: "idle" }); return; }
    const cached = loadCache(reportCacheKey(userEmail, "custom", from, newTo));
    setStatus(cached
      ? { kind: "success", result: cached.result, createdAt: cached.createdAt }
      : { kind: "idle" });
  }

  const isCustom = range === "custom";
  const isBusy   = status.kind === "loading";

  async function handleGenerate() {
    setStatus({ kind: "loading" });
    const input: GenerateInput = { range };
    if (isCustom) {
      if (!from || !to) {
        setStatus({ kind: "error", message: "Pick a from and to date for the custom range." });
        return;
      }
      input.from = new Date(`${from}T00:00:00.000Z`).toISOString();
      input.to   = new Date(`${to}T23:59:59.999Z`).toISOString();
    }
    try {
      const result = await generateReport(input);
      const createdAt = new Date().toISOString();
      try {
        saveCache(reportCacheKey(userEmail, range, from, to), { result, createdAt });
      } catch {
        toast.error("Report generated but couldn't be cached — browser storage is full.");
      }
      setStatus({ kind: "success", result, createdAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate report";
      setStatus({ kind: "error", message });
      toast.error(message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[10px] font-bold tracking-widest text-muted">RANGE</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-widest text-muted">
              {apiKey === null
                ? "…"
                : apiKey.hasGroqApiKey
                  ? <>USING YOUR KEY (••••{apiKey.last4 ?? "????"})</>
                  : "USING SHARED DEFAULT KEY"}
            </span>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="cursor-pointer rounded border border-border px-2.5 py-1 text-[10px] font-bold tracking-widest text-muted transition-colors hover:border-purple hover:text-text"
            >
              ⚙ API KEY
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handleRangeChange(p.value)}
              disabled={isBusy}
              className={
                "cursor-pointer rounded border px-3 py-1.5 text-[10px] font-bold tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
                (range === p.value
                  ? "border-cyan bg-cyan/10 text-cyan"
                  : "border-border text-muted hover:border-purple/60 hover:text-text")
              }
            >
              {p.label}
            </button>
          ))}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {status.kind === "success" ? (
              <button
                type="button"
                onClick={() => downloadMarkdown(status.result.markdown, status.result.range.label)}
                className="cursor-pointer rounded border border-cyan px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan transition-colors hover:bg-cyan/10"
              >
                DOWNLOAD .MD
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isBusy}
              className="cursor-pointer rounded border border-purple bg-purple/10 px-4 py-1.5 text-[10px] font-bold tracking-widest text-purple transition-colors hover:bg-purple/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? "GENERATING…" : "GENERATE REPORT"}
            </button>
          </div>
        </div>

        {isCustom ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CustomField label="FROM">
              <input
                type="date"
                value={from}
                max={to || todayISO()}
                onChange={(e) => handleFromChange(e.target.value)}
                disabled={isBusy}
                className={INPUT_CLASS}
              />
            </CustomField>
            <CustomField label="TO">
              <input
                type="date"
                value={to}
                min={from || undefined}
                max={todayISO()}
                onChange={(e) => handleToChange(e.target.value)}
                disabled={isBusy}
                className={INPUT_CLASS}
              />
            </CustomField>
          </div>
        ) : null}
      </section>

      {status.kind === "loading" ? <LoadingPanel /> : null}
      {status.kind === "error"   ? <ErrorPanel message={status.message} onRetry={handleGenerate} /> : null}
      {status.kind === "success" ? <ResultPanel result={status.result} createdAt={status.createdAt} /> : null}

      {apiKey ? (
        <ApiKeyModal
          open={modalOpen}
          status={apiKey}
          onClose={() => setModalOpen(false)}
          onSaved={(next) => setApiKey(next)}
        />
      ) : null}
    </div>
  );
}

const INPUT_CLASS =
  "rounded border border-border bg-bg px-2 py-1.5 text-xs text-text " +
  "outline-none transition-colors hover:border-purple/60 focus:border-purple " +
  "disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]";

function CustomField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold tracking-widest text-muted">{label}</span>
      {children}
    </label>
  );
}

function LoadingPanel() {
  return (
    <div className="overflow-hidden rounded border border-cyan/20 bg-surface">
      {/* Layer A — scanning bar */}
      <div className="relative h-0.5 overflow-hidden bg-border">
        <motion.div
          className="absolute inset-y-0 w-1/3 bg-linear-to-r from-transparent via-cyan to-transparent"
          animate={{ x: ["-100%", "400%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="flex flex-col items-center gap-4 p-8">
        {/* Layer B — dot wave */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block h-1.5 w-1.5 rounded-full bg-cyan"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -5, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
            />
          ))}
        </div>

        {/* Layer C — text */}
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-[10px] font-bold tracking-[0.2em] text-cyan/80">
            ASKING THE MODEL
          </span>
          <span className="text-[10px] text-muted">typically 10–30 seconds</span>
        </div>
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded border border-pink/40 bg-surface px-4 py-6 text-center">
      <p className="text-xs text-pink">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer rounded border border-pink/40 px-3 py-1.5 text-[10px] font-bold tracking-widest text-pink transition-colors hover:bg-pink/10"
      >
        RETRY
      </button>
    </div>
  );
}

function ResultPanel({ result, createdAt }: { result: GenerateReportResponse; createdAt: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 text-[10px] tracking-widest">
        <span className="rounded border border-border bg-surface px-2.5 py-1 text-muted">
          RANGE <span className="ml-1 text-cyan">{result.range.label.toUpperCase()}</span>
        </span>
        <span className="rounded border border-border bg-surface px-2.5 py-1 text-muted">
          DETAIL <span className="ml-1 text-cyan">{result.contextLevel}</span>
        </span>
        <span className="rounded border border-border bg-surface px-2.5 py-1 text-muted">
          ~{result.estimatedInputTokens.toLocaleString()} TOKENS
        </span>
        <span className="rounded border border-border bg-surface px-2.5 py-1 text-muted">
          MODEL <span className="ml-1 text-purple">{result.model}</span>
        </span>
        <span className="rounded border border-border bg-surface px-2.5 py-1 text-muted">
          GENERATED <span className="ml-1 text-muted/70">{fmtCreatedAt(createdAt)}</span>
        </span>
      </div>
      <MarkdownView markdown={result.markdown} />
    </div>
  );
}
