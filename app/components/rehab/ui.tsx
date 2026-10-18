import type { ReactNode } from "react";
import type { Goal } from "@/lib/rehab/routines/types";

// Large, high-contrast controls: users may be older or have limited vision.
export const BTN_PRIMARY =
  "min-h-16 rounded-2xl bg-lime-400 px-8 text-2xl font-bold text-black shadow-lg transition-colors hover:bg-lime-300 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-50";
export const BTN_SECONDARY =
  "min-h-16 rounded-2xl bg-white px-8 text-2xl font-bold text-black shadow-lg transition-colors hover:bg-zinc-200 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-lime-400 disabled:opacity-50";
export const BTN_GHOST =
  "min-h-14 rounded-2xl border-2 border-zinc-500 px-6 text-xl font-semibold text-white transition-colors hover:border-white hover:bg-zinc-800 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-lime-400";
export const BTN_STOP =
  "min-h-16 rounded-2xl bg-red-600 px-8 text-2xl font-bold text-white shadow-lg transition-colors hover:bg-red-500 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white";

// Compact controls for the dashboard pages; exercise screens keep the large ones above.
export const BTN_PRIMARY_SM =
  "min-h-12 rounded-xl bg-lime-400 px-5 text-lg font-semibold text-black transition-colors hover:bg-lime-300 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50";
export const BTN_GHOST_SM =
  "min-h-11 rounded-xl border border-zinc-600 px-4 text-base font-semibold text-white transition-colors hover:border-white hover:bg-zinc-800 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-lime-400 disabled:opacity-50";

const GOAL_COLOR: Record<Goal, string> = {
  Strength: "bg-orange-300 text-black",
  Mobility: "bg-sky-300 text-black",
  Endurance: "bg-violet-300 text-black",
  Balance: "bg-yellow-300 text-black",
  Flexibility: "bg-pink-300 text-black",
};

export function GoalChip({ goal }: { goal: Goal }) {
  return (
    <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-bold ${GOAL_COLOR[goal]}`}>{goal}</span>
  );
}

export function ProgressBar({ value, target, label }: { value: number; target?: number; label?: string }) {
  return (
    <div>
      {label ? <p className="mb-2 text-xl font-semibold">{label}</p> : null}
      <div className="relative h-8 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-lime-400 transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
        {target !== undefined && target < 1 ? (
          <div className="absolute inset-y-0 w-1.5 bg-white" style={{ left: `${target * 100}%` }} title="Target" />
        ) : null}
      </div>
    </div>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 sm:px-10 sm:py-10">{children}</main>;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60} s` : `${s} s`;
}
