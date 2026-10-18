"use client";

import { IconBodyScan, IconHistory, IconHome } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AccountFooter } from "../dashboard/AccountFooter";
import { Sidebar, type NavItem } from "../dashboard/Sidebar";
import { planStore } from "@/lib/rehab/plan";
import { syncSession } from "@/lib/rehab/sync";
import { routineInfo } from "@/lib/rehab/routines/index";
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
import { EhrUploadScreen } from "./EhrUploadScreen";
import { ExerciseHistory } from "./ExerciseHistory";
import { FallGuard } from "./FallGuard";
import { MyHealth } from "./MyHealth";
import { RoutineScreen, type RoutineResult } from "./RoutineScreen";
import { BreakScreen, FinishScreen, HomeScreen, SessionCompleteScreen } from "./screens";
import { Screen } from "./ui";
import { usePoseSource } from "./usePoseSource";

type ScreenState =
  | { name: "home" }
  | { name: "upload" }
  | { name: "health" | "history" }
  | { name: "routine"; id: RoutineId; note?: string; run: number }
  | { name: "finish"; recordId: string }
  | { name: "break"; fromId: RoutineId; hard: boolean }
  | { name: "complete" };

const noopSubscribe = () => () => {};

type Section = "today" | "health" | "history";
const NAV: NavItem<Section>[] = [
  { id: "today", label: "Today", icon: IconHome },
  { id: "health", label: "Health", icon: IconBodyScan },
  { id: "history", label: "History", icon: IconHistory },
];

/** Next routine in today's plan after `from` that isn't done today, plus the ones skipped on the way. */
function planNext(order: RoutineId[], from: RoutineId | null, done: Set<RoutineId>) {
  const later = from === null ? order : order.slice(order.indexOf(from) + 1);
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
  const { videoRef } = source;
  const sessions = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  // Today's exercises, chosen from the uploaded health record; null until one is uploaded.
  const plan = useSyncExternalStore(planStore.subscribe, planStore.getSnapshot, planStore.getServerSnapshot);
  const order = plan?.routines ?? [];
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
    const { next, note } = planNext(order, from, doneToday);
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
    syncSession(record, plan?.planId);
    setScreen({ name: "finish", recordId: record.id });
  };

  let content;
  // Plans and dates live in browser storage, so render nothing until hydrated.
  if (!hydrated) content = null;
  else if (screen.name === "health")
    content = (
      <Screen>
        <h1 className="text-5xl font-bold tracking-tight">Health</h1>
        <MyHealth onStartRoutine={(id) => openRoutine(id)} />
      </Screen>
    );
  else if (screen.name === "history")
    content = (
      <Screen>
        <h1 className="text-5xl font-bold tracking-tight">History</h1>
        <ExerciseHistory />
      </Screen>
    );
  // New accounts start on the health record upload, until a plan exists.
  else if (!plan) content = <EhrUploadScreen onDone={home} />;
  else switch (screen.name) {
    case "upload":
      content = <EhrUploadScreen onDone={home} onCancel={home} />;
      break;
    case "home":
      content = (
        <HomeScreen
          plan={plan}
          onNewRecord={() => setScreen({ name: "upload" })}
          doneToday={doneToday}
          streak={streak}
          onOpen={(id) => openRoutine(id)}
          onStartSession={() => goNext(null)}
        />
      );
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
          nextId={planNext(order, record.routineId, doneToday).next}
          onFeeling={(f) => {
            setFeeling(record.id, f);
            syncSession({ ...record, feeling: f }, plan?.planId);
          }}
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
          nextId={planNext(order, screen.fromId, doneToday).next}
          onContinue={() => goNext(screen.fromId)}
          onHome={home}
        />
      );
      break;
    case "complete":
      content = <SessionCompleteScreen routines={order} doneToday={doneToday} totalMs={totalMs} streak={streak} onHome={home} />;
      break;
  }

  // The camera, pose tracking and fall detection only run during an exercise.
  const exercising = hydrated && plan !== null && screen.name === "routine";
  const { releaseCamera } = source;
  useEffect(() => {
    if (!exercising) releaseCamera();
  }, [exercising, releaseCamera]);

  const section: Section = screen.name === "health" || screen.name === "history" ? screen.name : "today";
  const navigate = (to: Section) => setScreen(to === "today" ? { name: "home" } : { name: to });

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-950 text-white md:flex-row">
      <Sidebar
        items={NAV}
        active={section}
        onSelect={navigate}
        footer={(open) => <AccountFooter open={open} />}
      />
      <div className="min-w-0 flex-1">{content}</div>
      {/* The camera feed for pose tracking, kept mounted so the stream survives screen
          changes; it's only on during exercises. Routine screens draw it through their canvas. */}
      <video ref={videoRef} className="pointer-events-none fixed top-0 left-0 h-px w-px opacity-0" playsInline muted />
      <FallGuard source={source} active={exercising} />
    </div>
  );
}
