"use client";

import { useEffect, useState } from "react";
import { ROUTINE_ORDER, routineInfo } from "@/lib/rehab/routines/index";
import type { RoutineId } from "@/lib/rehab/routines/types";
import { SETTINGS } from "@/lib/rehab/settings";
import type { Feeling, SessionRecord } from "@/lib/rehab/storage";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, formatDuration, GoalChip, Screen } from "./ui";

const info = (id: RoutineId) => routineInfo(id, SETTINGS);

export function HomeScreen({
  doneToday,
  streak,
  demo,
  onDemo,
  onOpen,
  onStartSession,
  onProgress,
}: {
  doneToday: Set<RoutineId>;
  streak: number;
  demo: boolean;
  onDemo: (on: boolean) => void;
  onOpen: (id: RoutineId) => void;
  onStartSession: () => void;
  onProgress: () => void;
}) {
  const count = ROUTINE_ORDER.filter((id) => doneToday.has(id)).length;
  return (
    <Screen>
      <header className="flex flex-col gap-3">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">Home Rehab</h1>
        <p className="text-2xl text-zinc-300">
          {count} of {ROUTINE_ORDER.length} exercises done today
          {" · "}
          <span className="font-semibold text-lime-300">
            {streak} day{streak === 1 ? "" : "s"} in a row
          </span>
        </p>
      </header>

      <div className="flex flex-wrap gap-4">
        <button onClick={onStartSession} className={BTN_PRIMARY}>
          {count === 0 ? "Start today's session" : count < ROUTINE_ORDER.length ? "Continue today's session" : "Today's session is done ✓"}
        </button>
        <button onClick={onProgress} className={BTN_SECONDARY}>
          Progress
        </button>
      </div>

      <ul className="grid gap-5 md:grid-cols-2">
        {ROUTINE_ORDER.map((id, i) => {
          const r = info(id);
          const done = doneToday.has(id);
          return (
            <li key={id}>
              <button
                onClick={() => onOpen(id)}
                className={`flex h-full w-full flex-col gap-3 rounded-3xl border-4 p-6 text-left transition-colors hover:bg-zinc-800 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-lime-400 ${
                  done ? "border-lime-400 bg-zinc-900" : "border-zinc-700 bg-zinc-900"
                }`}
              >
                <span className="text-xl text-zinc-400">Exercise {i + 1}</span>
                <span className="text-3xl font-bold">{r.name}</span>
                <span className="flex flex-wrap items-center gap-3">
                  <GoalChip goal={r.goal} />
                  <span className="text-xl text-zinc-200">{r.target}</span>
                </span>
                <span className={`text-2xl font-semibold ${done ? "text-lime-300" : "text-zinc-400"}`}>
                  {done ? "✓ Done today" : "Not done yet today"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <label className="flex cursor-pointer items-center gap-4 self-start rounded-2xl bg-zinc-900 p-4 text-xl">
        <input type="checkbox" checked={demo} onChange={(e) => onDemo(e.target.checked)} className="h-7 w-7 accent-lime-400" />
        Demo mode: test with the keyboard instead of the camera
      </label>
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
  doneToday,
  totalMs,
  streak,
  onHome,
}: {
  doneToday: Set<RoutineId>;
  totalMs: number;
  streak: number;
  onHome: () => void;
}) {
  const all = ROUTINE_ORDER.every((id) => doneToday.has(id));
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
        {ROUTINE_ORDER.map((id) => (
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

const FEELING_LABEL: Record<Feeling, string> = { easy: "Easy", right: "Just right", hard: "Hard" };

export function ProgressScreen({ sessions, onHome }: { sessions: SessionRecord[]; onHome: () => void }) {
  return (
    <Screen>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-5xl font-bold tracking-tight">Progress</h1>
        <button onClick={onHome} className={BTN_GHOST}>← Home</button>
      </header>
      {ROUTINE_ORDER.map((id) => {
        const recent = sessions.filter((s) => s.routineId === id).slice(-5).reverse();
        return (
          <section key={id} className="rounded-3xl bg-zinc-900 p-6">
            <h2 className="flex flex-wrap items-center gap-3 text-3xl font-bold">
              {info(id).name} <GoalChip goal={info(id).goal} />
            </h2>
            {recent.length === 0 ? (
              <p className="mt-3 text-xl text-zinc-400">No sessions yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col divide-y divide-zinc-700">
                {recent.map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 py-3 text-xl">
                    <span className="font-semibold">
                      {new Date(s.finishedAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="text-zinc-300">
                      {s.reps} of {s.target} · {formatDuration(s.durationMs)}
                      {s.feeling ? ` · felt ${FEELING_LABEL[s.feeling].toLowerCase()}` : ""}
                    </span>
                    <span className="text-lg text-zinc-400">
                      {s.metrics.slice(0, 3).map((m) => `${m.label}: ${m.value}`).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </Screen>
  );
}
