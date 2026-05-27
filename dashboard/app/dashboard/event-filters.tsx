"use client";

import { DEFAULT_FILTERS, type FeedFilters } from "./feed-shared";

type Props = {
  value:    FeedFilters;
  onChange: (next: FeedFilters) => void;
};

export function EventFilters({ value, onChange }: Props) {
  const set = <K extends keyof FeedFilters>(k: K, v: FeedFilters[K]) =>
    onChange({ ...value, [k]: v });

  const isDirty = value.from !== "" || value.to !== "" || value.tags !== "";

  return (
    <section className="grid grid-cols-1 gap-3 rounded border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_2fr_auto]">
      <Field label="FROM">
        <input
          type="date"
          value={value.from}
          onChange={(e) => set("from", e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-purple"
        />
      </Field>
      <Field label="TO">
        <input
          type="date"
          value={value.to}
          onChange={(e) => set("to", e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-purple"
        />
      </Field>
      <Field label="TAGS">
        <input
          type="text"
          value={value.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="react, typescript"
          className="rounded border border-border bg-bg px-2 py-1.5 text-xs text-text placeholder:text-muted outline-none focus:border-purple"
        />
      </Field>
      <div className="flex items-end">
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          disabled={!isDirty}
          className="rounded border border-muted px-3 py-1.5 text-[10px] font-bold tracking-widest text-muted transition-colors enabled:hover:border-pink enabled:hover:text-pink disabled:opacity-30"
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
