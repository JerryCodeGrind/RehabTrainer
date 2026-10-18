/** rupert mark: a bent knee drawn as one continuous line, inside a soft square. */
export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-brand)" />
      <path d="M11 7.5v8.5l7 3.5v5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11" cy="16" r="2.1" fill="var(--color-cream)" />
      <circle cx="18" cy="19.5" r="2.1" fill="var(--color-sky)" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark className={compact ? "h-7 w-7" : "h-8 w-8"} />
      <span className={`font-semibold tracking-tight text-ink ${compact ? "text-base" : "text-lg"}`}>rupert</span>
    </span>
  );
}
