"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/** A row that opens to reveal its content, with the height animated. Closed by default. */
export function Expander({ label, meta, children }: { label: string; meta?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="press group flex min-h-16 w-full items-center justify-between gap-4 rounded-[var(--radius-control)] px-1 text-left text-lg font-semibold text-ink hover:shadow-none"
      >
        {label}
        <span className="flex items-center gap-3 text-sm font-normal text-ink-2">
          {meta}
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-bg-2 transition-transform duration-300 ease-out ${open ? "rotate-180 bg-brand-tint text-brand" : ""}`}
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </span>
        </span>
      </button>
      <div id={id} className="expand" data-open={open} inert={!open}>
        <div>
          <div className="pt-2 pb-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
