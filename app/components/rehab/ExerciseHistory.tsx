"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { routineInfo } from "@/lib/rehab/routines/index";
import { SETTINGS } from "@/lib/rehab/settings";
import { dayKey, sessionStore, type Feeling, type SessionRecord } from "@/lib/rehab/storage";
import { ProgressChart } from "./ProgressChart";
import { BTN_GHOST, formatDuration } from "./ui";

/** Days counted in the totals. */
const DAYS = 14;
/** Past sessions listed before "Show all". */
const LIST_LIMIT = 20;
const FEELING_LABEL: Record<Feeling, string> = { easy: "easy", right: "just right", hard: "hard" };

interface Day {
  date: Date;
  sessions: SessionRecord[];
}

/** The last `count` calendar days, oldest first, with the sessions finished on each. */
function lastDays(sessions: SessionRecord[], count: number, now = new Date()): Day[] {
  const byDay = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    const key = dayKey(new Date(s.finishedAt));
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - i));
    return { date, sessions: byDay.get(dayKey(date)) ?? [] };
  });
}

const name = (s: SessionRecord) => routineInfo(s.routineId, SETTINGS).name;

/** The History page: totals for the last 2 weeks, progress per exercise, and every past session with its measurements. */
export function ExerciseHistory() {
  const sessions = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  const days = useMemo(() => lastDays(sessions, DAYS), [sessions]);
  const past = useMemo(() => [...sessions].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)), [sessions]);
  const [showAll, setShowAll] = useState(false);

  const recent = days.flatMap((d) => d.sessions);
  const totalMin = Math.round(recent.reduce((sum, s) => sum + s.durationMs, 0) / 60_000);

  if (!sessions.length) {
    return <p className="text-2xl text-zinc-300">No exercises yet. Finish one and it shows up here.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Exercises" value={recent.length} />
        <Stat label="Active days" value={days.filter((d) => d.sessions.length).length} />
        <Stat label="Minutes" value={totalMin} />
      </dl>

      <ProgressChart sessions={sessions} />

      <section aria-labelledby="past-exercises" className="flex flex-col gap-3">
        <h3 id="past-exercises" className="text-2xl font-bold">Past exercises</h3>
        <ul className="flex flex-col divide-y divide-zinc-800">
          {(showAll ? past : past.slice(0, LIST_LIMIT)).map((s) => (
            <li key={s.id} className="flex flex-col gap-1 py-3">
              <span className="flex flex-wrap items-baseline justify-between gap-x-4 text-xl">
                <span className="font-semibold">{name(s)}</span>
                <span className="text-lg text-zinc-400">
                  {new Date(s.finishedAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
              <span className="text-lg text-zinc-300">
                {s.reps} of {s.target} · {formatDuration(s.durationMs)}
                {s.feeling ? ` · felt ${FEELING_LABEL[s.feeling]}` : ""}
              </span>
              {s.metrics.length ? (
                <span className="text-base text-zinc-400">{s.metrics.slice(0, 3).map((m) => `${m.label}: ${m.value}`).join(" · ")}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {past.length > LIST_LIMIT ? (
          <button onClick={() => setShowAll((v) => !v)} className={`${BTN_GHOST} self-start`}>
            {showAll ? "Show fewer" : `Show all ${past.length}`}
          </button>
        ) : null}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse gap-1 rounded-2xl bg-zinc-900 p-4">
      <dt className="text-base text-zinc-400 sm:text-lg">{label}</dt>
      <dd className="text-4xl font-semibold">{value.toLocaleString()}</dd>
    </div>
  );
}
