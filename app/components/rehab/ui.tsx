import type { ReactNode } from "react";
import type { Goal } from "@/lib/rehab/routines/types";

// Buttons: one primary action per view in deep blue; everything else quieter.
// Targets stay large (48px+) because many users are older or have limited vision.
const BTN_BASE =
  "press inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] px-5 text-[0.95rem] font-semibold disabled:cursor-not-allowed";
export const BTN_PRIMARY = `${BTN_BASE} min-h-12 bg-brand text-white hover:bg-brand-hover active:bg-brand-press disabled:bg-disabled disabled:text-ink-3`;
export const BTN_SECONDARY = `${BTN_BASE} min-h-12 border border-line-strong bg-surface text-ink hover:bg-bg-2 active:bg-cream disabled:text-ink-3 disabled:hover:bg-surface`;
export const BTN_TERTIARY = `${BTN_BASE} min-h-11 px-3 font-medium text-ink-2 hover:bg-bg-2 hover:text-ink active:bg-cream disabled:text-ink-3`;
/** Kept for screens that still say "ghost". */
export const BTN_GHOST = BTN_TERTIARY;
export const BTN_STOP = `${BTN_BASE} min-h-14 bg-danger text-white hover:bg-[#9a3a32] active:bg-[#83312a]`;

/** Small spinner for buttons and inline waits. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 animate-spin ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function GoalChip({ goal }: { goal: Goal }) {
  return <span className="text-sm text-ink-2">{goal}</span>;
}

/** Determinate progress: only for values the app actually measures. */
export function ProgressBar({ value, target, label }: { value: number; target?: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      {label ? (
        <p className="mb-2 flex items-baseline justify-between gap-3 text-base text-ink">
          {label}
          <span className="num text-sm text-ink-2">{pct}%</span>
        </p>
      ) : null}
      <div
        className="relative h-2 rounded-full bg-bg-2"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-sky transition-[width] duration-150" style={{ width: `${pct}%` }} />
        {target !== undefined && target < 1 ? (
          <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink" style={{ left: `${target * 100}%` }} title="target" />
        ) : null}
      </div>
    </div>
  );
}

/** Indeterminate progress: work is happening but the app can't say how much is left. */
export function IndeterminateBar({ label }: { label: string }) {
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-bg-2" role="progressbar" aria-label={label} aria-busy>
      <div className="absolute inset-y-0 w-2/5 animate-indeterminate rounded-full bg-sky" />
    </div>
  );
}

/** Content column with a controlled measure. */
export function Screen({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <main
      className={`mx-auto flex w-full flex-col gap-10 px-5 pt-8 pb-28 sm:px-8 lg:px-12 lg:pt-12 lg:pb-16 ${narrow ? "max-w-3xl" : "max-w-[var(--content-max)]"}`}
    >
      {children}
    </main>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-page font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="text-base leading-relaxed text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ title, action, id }: { title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id={id} className="text-section font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}

/** Kept so older call sites still compile; same as SectionTitle with a divider. */
export function SectionHead({ title, children }: { index?: string; title: string; children?: ReactNode }) {
  return (
    <div className="border-b border-line pb-3">
      <SectionTitle title={title} action={children} />
    </div>
  );
}

/** A neutral block standing in for content that is still loading. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse-soft rounded-[var(--radius-control)] bg-bg-2 ${className}`} />;
}

/** Wraps skeletons so assistive tech hears one "loading" instead of many shapes. */
export function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface/60 px-6 py-8">
      {icon ? <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-2 text-xl text-ink-2">{icon}</span> : null}
      <p className="text-lg font-semibold text-ink">{title}</p>
      <p className="max-w-lg text-base leading-relaxed text-ink-2">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return m ? `${m} min ${s % 60} s` : `${s} s`;
}
