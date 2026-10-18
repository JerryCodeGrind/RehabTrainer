"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { basicPlan, planFor, planStore, savePlan, setPlanOwner } from "@/lib/rehab/plan";
import { prefsStore, setPrefs } from "@/lib/rehab/prefs";
import { syncAccount, syncSession } from "@/lib/rehab/sync";
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
import { SignInScreen } from "../auth/SignInScreen";
import { AssistantPanel } from "../shell/AssistantPanel";
import { AppShell, type Account, type NavKey } from "../shell/AppShell";
import { EhrUploadScreen, OnboardingScreen } from "./EhrUploadScreen";
import { FallGuard } from "./FallGuard";
import { RoutineScreen, type RoutineResult } from "./RoutineScreen";
import {
  BodyScreen,
  BreakScreen,
  FinishScreen,
  OverviewScreen,
  ProfileScreen,
  ProgressScreen,
  RehabilitationScreen,
  SessionCompleteScreen,
} from "./screens";
import { AppSkeleton } from "./skeletons";
import { usePoseSource } from "./usePoseSource";

type ScreenState =
  | { name: NavKey }
  | { name: "profile" }
  | { name: "upload" }
  | { name: "routine"; id: RoutineId; note?: string; run: number }
  | { name: "finish"; recordId: string }
  | { name: "break"; fromId: RoutineId; hard: boolean }
  | { name: "complete" };

const noopSubscribe = () => () => {};

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

export default function RehabApp({ googleConfigured, authError }: { googleConfigured: boolean; authError: string | null }) {
  const source = usePoseSource();
  const { videoRef } = source;
  const auth = useSession();
  const session = auth.data;
  // With Google sign-in unconfigured there's no session to wait for.
  const status = googleConfigured ? auth.status : "unauthenticated";
  const allSessions = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  const storedPlan = useSyncExternalStore(planStore.subscribe, planStore.getSnapshot, planStore.getServerSnapshot);
  const prefs = useSyncExternalStore(prefsStore.subscribe, prefsStore.getSnapshot, prefsStore.getServerSnapshot);
  // Dates depend on the viewer's clock and storage, so only compute them in the browser.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [screen, setScreen] = useState<ScreenState>({ name: "overview" });
  // The destination a routine was opened from, so "back" returns there.
  const [origin, setOrigin] = useState<NavKey>("overview");
  const [debug, setDebug] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const [run, setRun] = useState(0);

  const signedIn = status === "authenticated";
  // Device-only use is offered only while Google sign-in isn't configured.
  const deviceOnly = !googleConfigured && prefs.deviceOnly;
  // Once per account per visit, move anything saved anonymously on this device
  // onto the account, then load the account's history from the database.
  const accountId = signedIn ? (session?.user as { id?: string } | undefined)?.id : undefined;
  // Today's exercises, from this person's own health record (or the basic five);
  // null until they upload one or choose the basics. Never someone else's plan.
  const owner = accountId ?? (deviceOnly ? "device" : null);
  useEffect(() => setPlanOwner(owner), [owner]);
  const plan = planFor(storedPlan, owner);
  // This person's sets only; on a shared browser, other accounts' sets stay hidden.
  const sessions = useMemo(() => allSessions.filter((s) => (s.owner ?? owner) === owner), [allSessions, owner]);

  const { doneToday, streak, totalMs } = useMemo(
    () =>
      hydrated
        ? { doneToday: completedToday(sessions), streak: countStreak(sessions), totalMs: todayTotalMs(sessions) }
        : { doneToday: new Set<RoutineId>(), streak: 0, totalMs: 0 },
    [sessions, hydrated],
  );
  const order = plan?.routines ?? [];
  const claimed = useRef<string | null>(null);
  useEffect(() => {
    if (accountId && claimed.current !== accountId) {
      claimed.current = accountId;
      void syncAccount(accountId);
    }
  }, [accountId]);

  const account: Account | null = signedIn && session
    ? { name: session.user?.name ?? null, email: session.user?.email ?? null, image: session.user?.image ?? null }
    : null;

  const openRoutine = (id: RoutineId, note?: string) => {
    // The live exercise needs the whole screen: no help panel over the camera view.
    setHelpOpen(false);
    if (screen.name === "overview" || screen.name === "rehab" || screen.name === "progress" || screen.name === "body") setOrigin(screen.name);
    setRun((r) => r + 1);
    setScreen({ name: "routine", id, note, run: run + 1 });
  };

  const goNext = (from: RoutineId | null) => {
    if (!order.length) {
      setScreen({ name: origin });
      return;
    }
    const { next, note } = planNext(order, from, doneToday);
    if (next) openRoutine(next, note);
    else setScreen({ name: "complete" });
  };

  // Each screen opens at its top, not at the previous screen's scroll position.
  const screenKey = screen.name === "routine" ? `routine-${screen.run}` : screen.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

  const overview = () => setScreen({ name: "overview" });
  const toggleDebug = useCallback(() => setDebug((d) => !d), []);

  const finished = (r: RoutineResult) => {
    const record: SessionRecord = {
      owner: owner ?? "device",
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

  const doSignOut = signedIn ? () => void signOut({ callbackUrl: "/" }) : undefined;

  // Gates: loading → sign in → first-time health record → the app.
  let gate: "loading" | "signin" | "onboarding" | null = null;
  if (!hydrated || status === "loading") gate = "loading";
  else if (!signedIn && !deviceOnly) gate = "signin";
  else if (!plan) gate = "onboarding";

  let content = null;
  if (gate === "loading") content = <AppSkeleton />;
  else if (gate === "signin")
    content = (
      <SignInScreen
        googleConfigured={googleConfigured}
        error={authError}
        onContinueWithoutAccount={() => setPrefs({ deviceOnly: true })}
      />
    );
  else if (gate === "onboarding")
    content = <OnboardingScreen signedIn={signedIn} onDone={overview} onSkip={() => {
          savePlan(basicPlan());
          overview();
        }} />;
  else
    switch (screen.name) {
      case "overview":
        content = (
          <OverviewScreen
            account={account}
            plan={plan}
            sessions={sessions}
            doneToday={doneToday}
            streak={streak}
            onStartSession={() => goNext(null)}
            onOpen={(id) => openRoutine(id)}
            onUpload={() => setScreen({ name: "upload" })}
            onNavigate={(to) => setScreen({ name: to })}
          />
        );
        break;
      case "rehab":
        content = (
          <RehabilitationScreen
            plan={plan}
            onUpload={() => setScreen({ name: "upload" })}
            doneToday={doneToday}
            onOpen={(id) => openRoutine(id)}
            onStartSession={() => goNext(null)}
          />
        );
        break;
      case "progress":
        content = <ProgressScreen sessions={sessions} onNavigate={(to) => setScreen({ name: to })} />;
        break;
      case "body":
        content = <BodyScreen plan={plan} sessions={sessions} onOpen={(id) => openRoutine(id)} />;
        break;
      case "profile":
        content = (
          <ProfileScreen
            account={account}
            plan={plan}
            onUpload={() => setScreen({ name: "upload" })}
            onHelp={() => setHelpOpen(true)}
            onSignOut={doSignOut}
          />
        );
        break;
      case "upload":
        content = <EhrUploadScreen onDone={overview} onCancel={overview} />;
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
            onHome={() => setScreen({ name: origin })}
          />
        );
        break;
      case "finish": {
        const record = sessions.find((s) => s.id === screen.recordId);
        if (!record) break;
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
            onHome={overview}
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
            onHome={overview}
          />
        );
        break;
      case "complete":
        content = <SessionCompleteScreen routines={order} doneToday={doneToday} totalMs={totalMs} streak={streak} onHome={overview} />;
        break;
    }

  const exercising = gate === null && screen.name === "routine";
  const { releaseCamera } = source;
  useEffect(() => {
    if (!exercising) releaseCamera();
  }, [exercising, releaseCamera]);

  const nav: NavKey | null =
    screen.name === "overview" || screen.name === "rehab" || screen.name === "progress" || screen.name === "body" ? screen.name : null;

  // The camera feed for pose tracking stays mounted so the stream survives screen
  // changes, but the camera, pose tracking and fall detection only run during an
  // exercise. Routine screens draw it through their canvas.
  const camera = (
    <>
      <video ref={videoRef} className="pointer-events-none fixed top-0 left-0 h-px w-px opacity-0" playsInline muted />
      <FallGuard source={source} active={exercising} />
    </>
  );

  if (gate) {
    return (
      <div className="relative flex min-h-full flex-1 flex-col bg-bg">
        {content}
        {camera}
      </div>
    );
  }

  return (
    <AppShell
      current={nav}
      focus={screen.name === "routine"}
      onNavigate={(key) => setScreen({ name: key })}
      onProfile={() => setScreen({ name: "profile" })}
      profileActive={screen.name === "profile"}
      onHelp={() => setHelpOpen((o) => !o)}
      helpOpen={helpOpen}
      onSignOut={doSignOut}
      account={account}
    >
      <div key={screenKey} className="flex flex-1 animate-screen-in flex-col">
        {content}
      </div>
      <AssistantPanel open={helpOpen && screen.name !== "routine"} onClose={closeHelp} />
      {camera}
    </AppShell>
  );
}
