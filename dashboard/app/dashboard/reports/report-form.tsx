"use client";

import { useEffect, useState } from "react";
import type { GenerateReportResponse, RangePreset } from "@/types/report";
import type { UserSettingsView } from "@/server/user-settings";
import {
  generateReport,
  getApiKeyStatus,
  type GenerateInput,
} from "./reports-client";
import { MarkdownView } from "./markdown-view";
import { ApiKeyModal } from "./api-key-modal";

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
  | { kind: "success"; result: GenerateReportResponse };

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

export function ReportForm() {
  const [range,     setRange]     = useState<RangePreset>("last_7d");
  const [from,      setFrom]      = useState<string>("");
  const [to,        setTo]        = useState<string>(todayISO());
  const [status,    setStatus]    = useState<Status>({ kind: "idle" });
  const [apiKey,    setApiKey]    = useState<UserSettingsView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getApiKeyStatus()
      .then((v) => { if (!cancelled) setApiKey(v); })
      .catch(() => { if (!cancelled) setApiKey({ hasGroqApiKey: false, last4: null }); });
    return () => { cancelled = true; };
  }, []);

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
      setStatus({ kind: "success", result });
    } catch (err) {
      setStatus({
        kind:    "error",
        message: err instanceof Error ? err.message : "Failed to generate report",
      });
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
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setRange(p.value)}
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
        </div>

        {isCustom ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CustomField label="FROM">
              <input
                type="date"
                value={from}
                max={to || todayISO()}
                onChange={(e) => setFrom(e.target.value)}
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
                onChange={(e) => setTo(e.target.value)}
                disabled={isBusy}
                className={INPUT_CLASS}
              />
            </CustomField>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isBusy}
            className="cursor-pointer rounded border border-purple bg-purple/10 px-4 py-2 text-[11px] font-bold tracking-widest text-purple transition-colors hover:bg-purple/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? "GENERATING…" : "▶ GENERATE REPORT"}
          </button>
          {status.kind === "success" ? (
            <>
              <button
                type="button"
                onClick={() => downloadMarkdown(status.result.markdown, status.result.range.label)}
                className="cursor-pointer rounded border border-cyan px-3 py-2 text-[10px] font-bold tracking-widest text-cyan transition-colors hover:bg-cyan/10"
              >
                ↓ DOWNLOAD .MD
              </button>
              <button
                type="button"
                onClick={() => setStatus({ kind: "idle" })}
                className="cursor-pointer rounded border border-muted px-3 py-2 text-[10px] font-bold tracking-widest text-muted transition-colors hover:border-pink hover:text-pink"
              >
                🔁 NEW REPORT
              </button>
            </>
          ) : null}
        </div>
      </section>

      {status.kind === "loading" ? <LoadingPanel /> : null}
      {status.kind === "error"   ? <ErrorPanel message={status.message} onRetry={handleGenerate} /> : null}
      {status.kind === "success" ? <ResultPanel result={status.result} /> : null}

      {modalOpen && apiKey ? (
        <ApiKeyModal
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
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="h-1 animate-pulse bg-cyan" />
      <div className="p-6 text-center text-xs text-muted">
        Asking the model… this typically takes 10–30 seconds.
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

function ResultPanel({ result }: { result: GenerateReportResponse }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-[10px] tracking-widest text-muted">
        <span>RANGE: <span className="text-cyan">{result.range.label.toUpperCase()}</span></span>
        <span>·</span>
        <span>DETAIL LEVEL: <span className="text-cyan">{result.contextLevel}</span></span>
        <span>·</span>
        <span>~{result.estimatedInputTokens.toLocaleString()} INPUT TOKENS</span>
        <span>·</span>
        <span>MODEL: <span className="text-purple">{result.model}</span></span>
      </div>
      <MarkdownView markdown={result.markdown} />
    </div>
  );
}
