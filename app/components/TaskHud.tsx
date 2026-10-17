import type { ReactNode } from "react";

export const HUD_BUTTON =
  "min-h-14 rounded-full bg-lime-400 px-8 text-xl font-semibold text-black shadow-lg transition-colors hover:bg-lime-300 disabled:opacity-60";
export const HUD_BUTTON_SECONDARY =
  "min-h-14 rounded-full bg-white px-8 text-xl font-semibold text-black shadow-lg transition-colors hover:bg-zinc-200 disabled:opacity-60";

interface TaskHudProps {
  step: string;
  title: string;
  description: ReactNode;
  status: ReactNode;
  // Green when the task is actively seeing what it needs.
  statusTone?: "idle" | "active" | "error";
  actions?: ReactNode;
  error?: string | null;
}

const DOT_COLOR = {
  idle: "bg-zinc-400",
  active: "bg-lime-400",
  error: "bg-red-500",
} as const;

/** Task text, status and controls laid over a full-screen camera feed. */
export function TaskHud({
  step,
  title,
  description,
  status,
  statusTone = "idle",
  actions,
  error,
}: TaskHudProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-4 p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <header className="pointer-events-auto max-w-xl rounded-2xl bg-black/60 p-5 backdrop-blur-md sm:p-6">
          <p className="text-lg font-medium uppercase tracking-widest text-lime-400">{step}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-lg leading-7 text-zinc-200 sm:text-xl sm:leading-8">
            {description}
          </p>
        </header>
        <p
          aria-live="polite"
          className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/60 px-5 py-3 text-lg backdrop-blur-md sm:text-xl"
        >
          <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${DOT_COLOR[statusTone]}`} />
          {status}
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        {error ? (
          <p
            role="alert"
            className="pointer-events-auto max-w-xl rounded-xl bg-red-950/90 p-4 text-lg text-red-100"
          >
            {error}
          </p>
        ) : null}
        {actions ? (
          <div className="pointer-events-auto flex flex-wrap justify-center gap-4">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
