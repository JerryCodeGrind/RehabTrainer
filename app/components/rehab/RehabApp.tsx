"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ROUTINE_ORDER, routineInfo } from "@/lib/rehab/routines/index";
import type { RoutineId } from "@/lib/rehab/routines/types";
import { SETTINGS } from "@/lib/rehab/settings";
import {
  completedToday,
  saveSession,
  sessionStore,
  setFeeling,
  streak as countStreak,
  todayTotalMs,
  type SessionRecord,
} from "@/lib/rehab/storage";
import { RoutineScreen, type RoutineResult } from "./RoutineScreen";
import { BreakScreen, FinishScreen, HomeScreen, ProgressScreen, SessionCompleteScreen } from "./screens";
import { usePoseSource } from "./usePoseSource";

type ScreenState =
  | { name: "home" }
  | { name: "progress" }
  | { name: "routine"; id: RoutineId; note?: string; run: number }
  | { name: "finish"; recordId: string }
  | { name: "break"; fromId: RoutineId; hard: boolean }
  | { name: "complete" };

const noopSubscribe = () => () => {};

/** Next routine after `from` in session order that isn't done today, plus the ones skipped on the way. */
function planNext(from: RoutineId | null, done: Set<RoutineId>) {
  const later = from === null ? ROUTINE_ORDER : ROUTINE_ORDER.slice(ROUTINE_ORDER.indexOf(from) + 1);
  const next = later.find((id) => !done.has(id)) ?? null;
  const skipped = next ? later.slice(0, later.indexOf(next)) : [];
  const name = (id: RoutineId) => routineInfo(id, SETTINGS).name;
  const note =
    next && skipped.length && from !== null
      ? `${skipped.map(name).join(" and ")} already done today, skipping to ${name(next)}`
      : undefined;
  return { next, note };
}

export default function RehabApp() {
  const source = usePoseSource();
  const sessions = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  // Dates depend on the viewer's clock and storage, so only compute them in the browser.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [screen, setScreen] = useState<ScreenState>({ name: "home" });
  const [debug, setDebug] = useState(false);
  const [run, setRun] = useState(0);

  const { doneToday, streak, totalMs } = useMemo(
    () =>
      hydrated
        ? { doneToday: completedToday(sessions), streak: countStreak(sessions), totalMs: todayTotalMs(sessions) }
        : { doneToday: new Set<RoutineId>(), streak: 0, totalMs: 0 },
    [sessions, hydrated],
  );

  const openRoutine = (id: RoutineId, note?: string) => {
    setRun((r) => r + 1);
    setScreen({ name: "routine", id, note, run: run + 1 });
  };

  const goNext = (from: RoutineId | null) => {
    const { next, note } = planNext(from, doneToday);
    if (next) openRoutine(next, note);
    else setScreen({ name: "complete" });
  };

  const home = () => setScreen({ name: "home" });
  const toggleDebug = useCallback(() => setDebug((d) => !d), []);

  const finished = (r: RoutineResult) => {
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      routineId: r.routineId,
      startedAt: r.startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Math.round(r.durationMs),
      reps: r.summary.reps,
      target: r.summary.target,
      metrics: r.summary.metrics,
      data: r.summary.data,
    };
    saveSession(record);
    setScreen({ name: "finish", recordId: record.id });
  };

  let content;
  switch (screen.name) {
    case "home":
      content = (
        <HomeScreen
          doneToday={doneToday}
          streak={streak}
          demo={source.demo}
          onDemo={source.setDemo}
          onOpen={(id) => openRoutine(id)}
          onStartSession={() => goNext(null)}
          onProgress={() => setScreen({ name: "progress" })}
        />
      );
      break;
    case "progress":
      content = <ProgressScreen sessions={sessions} onHome={home} />;
      break;
    case "routine":
      content = (
        <RoutineScreen
          key={screen.run}
          id={screen.id}
          note={screen.note}
          source={source}
          debug={debug}
          onToggleDebug={toggleDebug}
          onFinished={finished}
          onHome={home}
        />
      );
      break;
    case "finish": {
      const record = sessions.find((s) => s.id === screen.recordId);
      if (!record) {
        content = null;
        break;
      }
      content = (
        <FinishScreen
          record={record}
          nextId={planNext(record.routineId, doneToday).next}
          onFeeling={(f) => setFeeling(record.id, f)}
          onNext={() => goNext(record.routineId)}
          onBreak={() => setScreen({ name: "break", fromId: record.routineId, hard: record.feeling === "hard" })}
          onAgain={() => openRoutine(record.routineId)}
          onHome={home}
        />
      );
      break;
    }
    case "break":
      content = (
        <BreakScreen
          hard={screen.hard}
          nextId={planNext(screen.fromId, doneToday).next}
          onContinue={() => goNext(screen.fromId)}
          onHome={home}
        />
      );
      break;
    case "complete":
      content = <SessionCompleteScreen doneToday={doneToday} totalMs={totalMs} streak={streak} onHome={home} />;
      break;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-white">
      {source.demo ? (
        <p className="bg-lime-400 px-4 py-2 text-center text-lg font-bold text-black">Demo mode: keyboard controls, no camera</p>
      ) : null}
      {content}
    </div>
  );
}
