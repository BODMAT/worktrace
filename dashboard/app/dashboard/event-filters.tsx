"use client";

import { DEFAULT_FILTERS, type FeedFilters } from "./feed-shared";

type Props = {
  value:    FeedFilters;
  onChange: (next: FeedFilters) => void;
};

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const INPUT_CLASS =
  "rounded border border-border bg-bg px-2 py-1.5 text-xs text-text " +
  "outline-none transition-colors hover:border-purple/60 focus:border-purple " +
  "[color-scheme:dark]";

export function EventFilters({ value, onChange }: Props) {
  const set = <K extends keyof FeedFilters>(k: K, v: FeedFilters[K]) =>
    onChange({ ...value, [k]: v });

  const today    = todayISO();
  const isDirty  = value.from !== "" || value.to !== "" || value.tags !== "";

  return (
    <section className="grid grid-cols-1 gap-3 rounded border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_2fr_auto]">
      <Field label="FROM">
        <input
          type="date"
          value={value.from}
          max={value.to || today}
          onChange={(e) => set("from", e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="TO">
        <input
          type="date"
          value={value.to}
          min={value.from || undefined}
          max={today}
          onChange={(e) => set("to", e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="TAGS">
        <input
          type="text"
          value={value.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="react, typescript"
          className={INPUT_CLASS + " placeholder:text-muted"}
        />
      </Field>
      <div className="flex items-end">
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          disabled={!isDirty}
          className="cursor-pointer rounded border border-muted px-3 py-1.5 text-[10px] font-bold tracking-widest text-muted transition-colors enabled:hover:border-pink enabled:hover:text-pink disabled:cursor-not-allowed disabled:opacity-30"
        >
          CLEAR
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold tracking-widest text-muted">{label}</span>
      {children}
    </label>
  );
}
