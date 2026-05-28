"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="rounded border border-border bg-surface p-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mb-4 text-lg font-bold tracking-widest text-cyan" {...p} />,
          h2: (p) => <h2 className="mt-6 mb-3 text-base font-bold tracking-widest text-cyan" {...p} />,
          h3: (p) => <h3 className="mt-4 mb-2 text-sm font-bold tracking-widest text-purple" {...p} />,
          p:  (p) => <p className="my-2 text-sm leading-relaxed text-text/90" {...p} />,
          ul: (p) => <ul className="my-2 list-disc pl-5 text-sm text-text/90" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal pl-5 text-sm text-text/90" {...p} />,
          li: (p) => <li className="my-1" {...p} />,
          strong: (p) => <strong className="font-bold text-text" {...p} />,
          em:     (p) => <em className="italic text-text/80" {...p} />,
          code:   (p) => <code className="rounded bg-bg px-1 py-0.5 text-[12px] text-yellow" {...p} />,
          a: (p) => (
            <a
              className="text-cyan underline decoration-cyan/40 hover:decoration-cyan"
              target="_blank"
              rel="noreferrer noopener"
              {...p}
            />
          ),
          blockquote: (p) => (
            <blockquote
              className="my-3 border-l-2 border-purple/60 pl-3 text-sm text-text/80 italic"
              {...p}
            />
          ),
          table: (p) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-border bg-bg px-2 py-1 text-left text-cyan" {...p} />,
          td: (p) => <td className="border border-border px-2 py-1" {...p} />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
