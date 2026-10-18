"use client";

import { useEffect, useState } from "react";
import type { CarePlan } from "@/lib/rehab/plan";
import { routineInfo } from "@/lib/rehab/routines/index";
import type { RoutineId } from "@/lib/rehab/routines/types";
import { SETTINGS } from "@/lib/rehab/settings";
import type { Feeling, SessionRecord } from "@/lib/rehab/storage";
import { BTN_GHOST, BTN_GHOST_SM, BTN_PRIMARY, BTN_PRIMARY_SM, BTN_SECONDARY, formatDuration, GoalChip, Screen } from "./ui";

const info = (id: RoutineId) => routineInfo(id, SETTINGS);

export function HomeScreen({
  plan,
  onNewRecord,
  doneToday,
  streak,
  onOpen,
  onStartSession,
}: {
  plan: CarePlan;
  onNewRecord: () => void;
  doneToday: Set<RoutineId>;
  streak: number;
  onOpen: (id: RoutineId) => void;
  onStartSession: () => void;
}) {
  const routines = plan.routines;
  const count = routines.filter((id) => doneToday.has(id)).length;
  return (
    <Screen>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl font-bold tracking-tight">Today</h1>
        <p className="text-lg text-zinc-400">
          {count} of {routines.length} exercises done
          {" · "}
          <span className="font-semibold text-lime-300">
            {streak} day{streak === 1 ? "" : "s"} in a row
          </span>
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-sm text-zinc-500">Chosen for you from {plan.fileName}</p>
        <p className="text-lg leading-relaxed text-zinc-200">{plan.summary}</p>
        {routines.length === 0 ? (
          <p className="text-lg font-semibold text-yellow-300">
            None of these exercises look right for you today. Check with your care team before exercising.
          </p>
        ) : null}
        <button onClick={onNewRecord} className={`${BTN_GHOST_SM} self-start`}>
          Upload a new health record
        </button>
      </section>

      {routines.length > 0 ? (
        <button onClick={onStartSession} className={`${BTN_PRIMARY_SM} self-start`}>
          {count === 0 ? "Start today's session" : count < routines.length ? "Continue today's session" : "Today's session is done ✓"}
        </button>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2">
        {routines.map((id, i) => {
          const r = info(id);
          const done = doneToday.has(id);
          return (
            <li key={id}>
              <button
                onClick={() => onOpen(id)}
                className={`flex h-full w-full flex-col gap-2 rounded-2xl border-2 p-5 text-left transition-colors hover:bg-zinc-800 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-lime-400 ${
                  done ? "border-lime-400 bg-zinc-900" : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <span className="text-sm text-zinc-500">Exercise {i + 1}</span>
                <span className="text-2xl font-bold">{r.name}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <GoalChip goal={r.goal} />
                  <span className="text-base text-zinc-300">{r.target}</span>
                </span>
                {plan.reasons[id] ? <span className="text-base leading-relaxed text-zinc-400">{plan.reasons[id]}</span> : null}
                <span className={`mt-1 text-base font-semibold ${done ? "text-lime-300" : "text-zinc-500"}`}>
                  {done ? "✓ Done today" : "Not done yet today"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}

const FEELINGS: { value: Feeling; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "right", label: "Just right" },
  { value: "hard", label: "Hard" },
];

export function FinishScreen({
  record,
  nextId,
  onFeeling,
  onNext,
  onBreak,
  onAgain,
  onHome,
}: {
  record: SessionRecord;
  nextId: RoutineId | null;
  onFeeling: (f: Feeling) => void;
  onNext: () => void;
  onBreak: () => void;
  onAgain: () => void;
  onHome: () => void;
}) {
  const r = info(record.routineId);
  const hard = record.feeling === "hard";
  return (
    <Screen>
      <header className="text-center">
        <p className="text-7xl" aria-hidden>🎉</p>
        <h1 className="mt-4 text-5xl font-bold tracking-tight" aria-live="polite">
          Great job! {r.name} complete.
        </h1>
      </header>

      <dl className="grid gap-x-8 gap-y-4 rounded-3xl bg-zinc-900 p-6 text-2xl sm:grid-cols-2">
        <Stat label="Completed" value={`${record.reps} of ${record.target}`} />
        <Stat label="Time taken" value={formatDuration(record.durationMs)} />
        {record.metrics.map((m) => (
          <Stat key={m.label} label={m.label} value={m.value} />
        ))}
      </dl>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-4 text-3xl font-bold">How did that feel?</legend>
        <div className="grid grid-cols-3 gap-4">
          {FEELINGS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFeeling(f.value)}
              aria-pressed={record.feeling === f.value}
              className={`min-h-20 rounded-2xl border-4 text-2xl font-bold transition-colors ${
                record.feeling === f.value ? "border-lime-400 bg-lime-400 text-black" : "border-zinc-600 bg-zinc-900 hover:border-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </fieldset>

      {hard ? (
        <p className="rounded-2xl border-4 border-amber-400 bg-amber-950 p-5 text-2xl font-semibold text-amber-50">
          That was a tough one. Take a break before the next exercise.
        </p>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        {hard ? (
          <>
            <button onClick={onBreak} className={BTN_PRIMARY}>Take a break</button>
            <button onClick={onNext} className={BTN_SECONDARY}>
              {nextId ? `Next: ${info(nextId).name}` : "Finish today's session"}
            </button>
          </>
        ) : (
          <>
            <button onClick={onNext} className={BTN_PRIMARY}>
              {nextId ? `Next: ${info(nextId).name}` : "Finish today's session"}
            </button>
            <button onClick={onBreak} className={BTN_SECONDARY}>Take a break</button>
          </>
        )}
        <button onClick={onAgain} className={BTN_GHOST}>Do it again</button>
        <button onClick={onHome} className={BTN_GHOST}>Back to home</button>
      </div>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xl text-zinc-400">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

export function BreakScreen({ hard, nextId, onContinue, onHome }: { hard: boolean; nextId: RoutineId | null; onContinue: () => void; onHome: () => void }) {
  // Counts up from 0 and never auto-advances: the user decides when they're ready.
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(id);
  }, []);
  const suggested = SETTINGS.flow.suggestedRestSec;
  const rested = seconds >= suggested;
  return (
    <Screen>
      <div className="flex flex-col items-center gap-8 py-8 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Take a break</h1>
        <p className="max-w-2xl text-3xl leading-snug text-zinc-200">
          {hard ? "That was a tough one. " : ""}Rest, have some water, and sit down if you need to.
        </p>
        <p className="text-8xl font-bold tabular-nums" aria-label={`Rested ${seconds} seconds`}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </p>
        <p className={`text-2xl ${rested ? "text-lime-300" : "text-zinc-400"}`}>
          {rested ? "You've had the suggested rest. Take longer if you like." : `Suggested rest: ${suggested} seconds`}
        </p>
        <button onClick={onContinue} className={`${BTN_PRIMARY} min-h-20 text-3xl`}>
          I&apos;m ready, continue{nextId ? ` to ${info(nextId).name}` : ""}
        </button>
        <button onClick={onHome} className={BTN_GHOST}>Back to home</button>
      </div>
    </Screen>
  );
}

export function SessionCompleteScreen({
  routines,
  doneToday,
  totalMs,
  streak,
  onHome,
}: {
  /** Today's plan. */
  routines: RoutineId[];
  doneToday: Set<RoutineId>;
  totalMs: number;
  streak: number;
  onHome: () => void;
}) {
  const all = routines.every((id) => doneToday.has(id));
  return (
    <Screen>
      <header className="text-center">
        <p className="text-7xl" aria-hidden>🏆</p>
        <h1 className="mt-4 text-5xl font-bold tracking-tight">Session complete!</h1>
        <p className="mt-4 text-2xl text-zinc-300">
          {all ? "You did every exercise today. Well done." : "Nice work today. You can come back to the rest any time."}
        </p>
      </header>
      <ul className="flex flex-col gap-3 rounded-3xl bg-zinc-900 p-6 text-2xl">
        {routines.map((id) => (
          <li key={id} className="flex items-center justify-between gap-4">
            <span>{info(id).name}</span>
            <span className={doneToday.has(id) ? "font-bold text-lime-300" : "text-zinc-500"}>
              {doneToday.has(id) ? "✓ Done" : "Not done"}
            </span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-6 text-center text-2xl">
        <div className="rounded-3xl bg-zinc-900 p-6">
          <dt className="text-zinc-400">Exercise time today</dt>
          <dd className="text-4xl font-bold">{formatDuration(totalMs)}</dd>
        </div>
        <div className="rounded-3xl bg-zinc-900 p-6">
          <dt className="text-zinc-400">Streak</dt>
          <dd className="text-4xl font-bold">
            {streak} day{streak === 1 ? "" : "s"}
          </dd>
        </div>
      </dl>
      <button onClick={onHome} className={`${BTN_PRIMARY} self-center`}>
        Back to home
      </button>
    </Screen>
  );
}
