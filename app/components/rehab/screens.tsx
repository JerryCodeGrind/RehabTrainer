"use client";

import { ArrowRight, Check, FileText, LifeBuoy, LogOut, PersonStanding, Play, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CarePlan } from "@/lib/rehab/plan";
import { ROUTINE_ORDER, routineInfo } from "@/lib/rehab/routines/index";
import type { RoutineId } from "@/lib/rehab/routines/types";
import { SETTINGS } from "@/lib/rehab/settings";
import { dayKey, type Feeling, type SessionRecord } from "@/lib/rehab/storage";
import { BodyExplorer } from "../body/BodyExplorer";
import { Expander } from "../motion/Expander";
import { Reveal } from "../motion/Reveal";
import type { Account } from "../shell/AppShell";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_TERTIARY, formatDuration, PageHeader, Screen } from "./ui";

const info = (id: RoutineId) => routineInfo(id, SETTINGS);
const nameOf = (id: RoutineId) => info(id).name;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const FEELING_LABEL: Record<Feeling, string> = { easy: "easy", right: "just right", hard: "hard" };

/** Days with at least one finished exercise in the `n` days before `now`. */
function activeDays(sessions: SessionRecord[], n: number, now: number) {
  const since = now - n * 86_400_000;
  return new Set(sessions.filter((s) => new Date(s.finishedAt).getTime() >= since).map((s) => dayKey(new Date(s.finishedAt)))).size;
}

/** A big number with a one- or two-word label. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dd className="num text-[2rem] leading-none font-semibold text-ink">{value}</dd>
      <dt className="text-sm text-ink-2">{label}</dt>
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

export function OverviewScreen({
  account,
  plan,
  sessions,
  doneToday,
  streak,
  onStartSession,
  onOpen,
  onUpload,
  onNavigate,
}: {
  account: Account | null;
  plan: CarePlan | null;
  sessions: SessionRecord[];
  doneToday: Set<RoutineId>;
  streak: number;
  onStartSession: () => void;
  onOpen: (id: RoutineId) => void;
  onUpload: () => void;
  onNavigate: (to: "rehab" | "progress" | "body") => void;
}) {
  const [now] = useState(() => Date.now());
  const first = account?.name?.split(" ")[0];
  const routines = plan?.routines ?? [];
  const count = routines.filter((id) => doneToday.has(id)).length;
  const allDone = routines.length > 0 && count === routines.length;
  const nextId = routines.find((id) => !doneToday.has(id)) ?? null;

  return (
    <Screen>
      <PageHeader title={first ? `hi, ${first}` : "today"} />

      {plan && routines.length ? (
        <section aria-label="today's plan" className="flex flex-col gap-6 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-8">
          <div className="flex items-end justify-between gap-4">
            <p className="num text-[3.5rem] leading-none font-semibold text-ink">
              {count}
              <span className="text-ink-3">/{routines.length}</span>
            </p>
            {!allDone ? (
              <button type="button" onClick={onStartSession} className={`${BTN_PRIMARY} min-h-14 px-6`}>
                <Play className="h-4 w-4 fill-current" aria-hidden /> {count ? "continue" : "start"}
              </button>
            ) : (
              <span className="flex h-12 w-12 animate-pop items-center justify-center rounded-full bg-sage-tint text-sage-ink" aria-label="all done">
                <Check className="h-6 w-6" aria-hidden />
              </span>
            )}
          </div>
          <div className="flex gap-1.5" aria-hidden>
            {routines.map((id) => (
              <span key={id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-2">
                <span className={`block h-full rounded-full bg-sage transition-[width] duration-700 ease-out ${doneToday.has(id) ? "w-full" : "w-0"}`} />
              </span>
            ))}
          </div>
          <ol className="-mx-2 flex flex-col">
            {routines.map((id) => {
              const done = doneToday.has(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onOpen(id)}
                    className="press group flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-button)] px-2 text-left hover:bg-bg hover:shadow-none"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                        done ? "bg-sage-tint text-sage-ink" : id === nextId ? "bg-brand text-white" : "border border-line-strong"
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" aria-label="done" /> : id === nextId ? <Play className="h-3 w-3 fill-current" aria-label="next" /> : null}
                    </span>
                    <span className={`flex-1 text-base ${done ? "text-ink-2" : "font-semibold text-ink"}`}>{nameOf(id)}</span>
                    <ArrowRight className="nudge h-4 w-4 text-ink-3 group-hover:text-brand" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section aria-label="no plan" className="flex flex-col items-start gap-5 rounded-[var(--radius-panel)] border border-dashed border-line-strong p-6 sm:p-8">
          <p className="text-section font-semibold text-ink">{plan ? "nothing planned today" : "no plan yet"}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onUpload} className={BTN_PRIMARY}>
              <FileText className="h-4 w-4" aria-hidden /> add health record
            </button>
            <button type="button" onClick={() => onNavigate("rehab")} className={BTN_SECONDARY}>
              exercises
            </button>
          </div>
        </section>
      )}

      <Reveal>
        <dl className="grid grid-cols-3 gap-6 border-y border-line py-7">
          <Figure label="day streak" value={String(streak)} />
          <Figure label="days this week" value={String(activeDays(sessions, 7, now))} />
          <Figure label="all time" value={String(sessions.length)} />
        </dl>
      </Reveal>

      <Reveal delay={80} className="grid gap-3 sm:grid-cols-2">
        <Tile icon={<PersonStanding className="h-5 w-5" aria-hidden />} label="my body" onClick={() => onNavigate("body")} />
        <Tile icon={<ArrowRight className="h-5 w-5 -rotate-45" aria-hidden />} label="progress" onClick={() => onNavigate("progress")} />
      </Reveal>
    </Screen>
  );
}

/** A large tappable link tile. */
function Tile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press group flex min-h-20 items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-line bg-surface px-5 text-left text-ink"
    >
      <span className="flex items-center gap-3 text-lg font-semibold">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cream text-brand transition-transform duration-300 group-hover:scale-110">
          {icon}
        </span>
        {label}
      </span>
      <ArrowRight className="nudge h-5 w-5 text-ink-3 group-hover:text-brand" aria-hidden />
    </button>
  );
}

function HistoryList({ sessions }: { sessions: SessionRecord[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {sessions.map((s) => (
        <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 py-3">
          <span className="flex flex-col">
            <span className="text-base text-ink">{nameOf(s.routineId)}</span>
            <span className="text-sm text-ink-3">
              {fmtWhen(s.finishedAt)}
              {s.feeling ? ` · ${FEELING_LABEL[s.feeling]}` : ""}
            </span>
          </span>
          <span className="num text-sm text-ink-2">
            {s.reps}/{s.target} · {formatDuration(s.durationMs)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Rehabilitation ──────────────────────────────────────────────────────────

export function RehabilitationScreen({
  plan,
  doneToday,
  onOpen,
  onStartSession,
}: {
  plan: CarePlan | null;
  doneToday: Set<RoutineId>;
  onOpen: (id: RoutineId) => void;
  onStartSession: () => void;
}) {
  const planned = plan?.routines ?? [];
  const hasNext = planned.some((id) => !doneToday.has(id));
  return (
    <Screen>
      <PageHeader
        title="rehabilitation"
        actions={
          <>
            {hasNext ? (
              <button type="button" onClick={onStartSession} className={BTN_PRIMARY}>
                <Play className="h-4 w-4 fill-current" aria-hidden /> start
              </button>
            ) : null}
          </>
        }
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {ROUTINE_ORDER.map((id, i) => {
          const r = info(id);
          const done = doneToday.has(id);
          const inPlan = planned.includes(id);
          return (
            <li key={id}>
              <Reveal delay={i * 60}>
                <button
                  type="button"
                  onClick={() => onOpen(id)}
                  className="press group flex min-h-32 w-full flex-col justify-between gap-6 rounded-[var(--radius-panel)] border border-line bg-surface p-5 text-left"
                >
                  <span className="flex w-full items-start justify-between gap-3">
                    <span className="text-lg font-semibold text-ink">{r.name}</span>
                    {done ? (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage-tint text-sage-ink" aria-label="done today">
                        <Check className="h-4 w-4" aria-hidden />
                      </span>
                    ) : inPlan ? (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sky" aria-label="in today's plan" />
                    ) : null}
                  </span>
                  <span className="flex w-full items-center justify-between text-sm text-ink-2">
                    {r.target}
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-2 text-ink transition-colors duration-200 group-hover:bg-brand group-hover:text-white">
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                    </span>
                  </span>
                </button>
              </Reveal>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}

// ── Progress ────────────────────────────────────────────────────────────────

const CHART_DAYS = 28;

/** Exercises finished per day over the last four weeks, as plain bars that grow in. */
function ActivityChart({ sessions }: { sessions: SessionRecord[] }) {
  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      const k = dayKey(new Date(s.finishedAt));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from({ length: CHART_DAYS }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (CHART_DAYS - 1 - i));
      return { date: d, count: counts.get(dayKey(d)) ?? 0 };
    });
  }, [sessions]);
  const max = Math.max(3, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  const active = days.filter((d) => d.count).length;
  const W = 700;
  const H = 180;
  const PAD_B = 22;
  const bw = W / CHART_DAYS;
  const y = (v: number) => (H - PAD_B) * (1 - v / max) + 4;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`last ${CHART_DAYS} days: ${plural(total, "exercise")} on ${plural(active, "day")}`}>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
        {days.map((d, i) => {
          const isToday = i === CHART_DAYS - 1;
          return (
            <g key={i}>
              {d.count ? (
                <rect
                  x={i * bw + bw * 0.2}
                  y={y(d.count)}
                  width={bw * 0.6}
                  height={y(0) - y(d.count)}
                  rx="4"
                  fill={isToday ? "var(--color-brand)" : "var(--color-sky)"}
                  className="bar-grow"
                  style={{ animationDelay: `${i * 18}ms` }}
                >
                  <title>{`${d.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${d.count}`}</title>
                </rect>
              ) : (
                <circle cx={i * bw + bw / 2} cy={y(0) - 3} r="1.5" fill="var(--color-line-strong)" />
              )}
              {i === 0 || isToday ? (
                <text x={isToday ? W : 0} y={H - 4} textAnchor={isToday ? "end" : "start"} fontSize="11" className="fill-ink-3">
                  {isToday ? "today" : d.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function ProgressScreen({ sessions, onNavigate }: { sessions: SessionRecord[]; onNavigate: (to: "rehab") => void }) {
  const [now] = useState(() => Date.now());
  const history = sessions.slice().reverse();
  const recent = sessions.filter((s) => new Date(s.finishedAt).getTime() >= now - CHART_DAYS * 86_400_000);

  if (!sessions.length) {
    return (
      <Screen>
        <PageHeader title="progress" />
        <div className="flex flex-col items-start gap-5 rounded-[var(--radius-panel)] border border-dashed border-line-strong p-6 sm:p-8">
          <p className="text-section font-semibold text-ink">nothing yet</p>
          <button type="button" onClick={() => onNavigate("rehab")} className={BTN_PRIMARY}>
            <Play className="h-4 w-4 fill-current" aria-hidden /> first exercise
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="progress" />

      <dl className="grid grid-cols-3 gap-6">
        <Figure label="exercises" value={String(recent.length)} />
        <Figure label="active days" value={String(activeDays(sessions, CHART_DAYS, now))} />
        <Figure label="reps" value={String(recent.reduce((n, s) => n + s.reps, 0))} />
      </dl>

      <Reveal>
        <section aria-label="last four weeks" className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-7">
          <p className="text-sm text-ink-2">last 4 weeks</p>
          <ActivityChart sessions={sessions} />
        </section>
      </Reveal>

      <Reveal delay={60}>
        <div className="border-t border-line">
          <Expander label="by exercise">
            <ul className="flex flex-col divide-y divide-line">
              {ROUTINE_ORDER.map((id) => {
                const mine = sessions.filter((s) => s.routineId === id);
                return (
                  <li key={id} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="text-base text-ink">{nameOf(id)}</span>
                    <span className="num text-sm text-ink-2">
                      {mine.length} × · {mine.reduce((n, s) => n + s.reps, 0)} reps{mine.length ? ` · ${fmtDate(mine.at(-1)!.finishedAt)}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Expander>
          <Expander label="history" meta={<span className="num">{sessions.length}</span>}>
            <HistoryList sessions={history} />
          </Expander>
        </div>
      </Reveal>
    </Screen>
  );
}

// ── My body ─────────────────────────────────────────────────────────────────

export function BodyScreen({ plan, sessions, onOpen }: { plan: CarePlan | null; sessions: SessionRecord[]; onOpen: (id: RoutineId) => void }) {
  return (
    <Screen>
      <PageHeader title="my body" />
      <BodyExplorer plan={plan} sessions={sessions} onOpenRoutine={onOpen} />
    </Screen>
  );
}

// ── Profile ─────────────────────────────────────────────────────────────────

export function ProfileScreen({
  account,
  plan,
  onUpload,
  onHelp,
  onSignOut,
}: {
  account: Account | null;
  plan: CarePlan | null;
  onUpload: () => void;
  onHelp: () => void;
  onSignOut?: () => void;
}) {
  return (
    <Screen narrow>
      <PageHeader title={account?.name ?? "this device"} />
      {account?.email ? <p className="keep-case -mt-8 text-sm text-ink-2">{account.email}</p> : null}

      <div className="flex flex-col gap-2">
        <Row icon={<FileText className="h-5 w-5" aria-hidden />} label={plan ? "new health record" : "add health record"} meta={plan ? fmtDate(plan.createdAt) : undefined} onClick={onUpload} />
        <Row icon={<LifeBuoy className="h-5 w-5" aria-hidden />} label="help" onClick={onHelp} />
        {onSignOut ? <Row icon={<LogOut className="h-5 w-5" aria-hidden />} label="sign out" onClick={onSignOut} /> : null}
      </div>

      <div className="border-t border-line">
        <Expander label="privacy">
          <ul className="flex flex-col gap-3 text-sm leading-relaxed text-ink-2">
            <li>history and plan stay in this browser, not your account.</li>
            <li>health records are read on the server and sent to openai; nothing is stored.</li>
            <li>camera video never leaves this browser. fall alerts send no video.</li>
          </ul>
        </Expander>
      </div>
    </Screen>
  );
}

function Row({ icon, label, meta, onClick }: { icon: ReactNode; label: string; meta?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press group flex min-h-16 w-full items-center gap-4 rounded-[var(--radius-panel)] border border-line bg-surface px-5 text-left"
    >
      <span className="text-ink-2 transition-colors duration-200 group-hover:text-brand">{icon}</span>
      <span className="flex-1 text-base font-semibold text-ink">{label}</span>
      {meta ? <span className="text-sm text-ink-3">{meta}</span> : null}
      <ArrowRight className="nudge h-4 w-4 text-ink-3" aria-hidden />
    </button>
  );
}

// ── After an exercise ───────────────────────────────────────────────────────

const FEELINGS: { value: Feeling; label: string }[] = [
  { value: "easy", label: "easy" },
  { value: "right", label: "just right" },
  { value: "hard", label: "hard" },
];

function DoneMark() {
  return (
    <span className="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-sage-tint text-sage-ink">
      <Check className="h-8 w-8" aria-hidden />
    </span>
  );
}

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
    <Screen narrow>
      <header className="flex flex-col items-start gap-5">
        <DoneMark />
        <h1 className="text-page font-semibold tracking-tight text-ink" aria-live="polite">
          {r.name}
        </h1>
      </header>

      <dl className="grid grid-cols-2 gap-6">
        <Figure label="reps" value={`${record.reps}/${record.target}`} />
        <Figure label="time" value={formatDuration(record.durationMs)} />
      </dl>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm text-ink-2">how did it feel?</legend>
        <div className="grid grid-cols-3 gap-2">
          {FEELINGS.map((f) => {
            const on = record.feeling === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => onFeeling(f.value)}
                aria-pressed={on}
                className={`press flex min-h-14 items-center justify-center gap-2 rounded-[var(--radius-button)] border text-base ${
                  on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink-2 hover:text-ink"
                }`}
              >
                {on ? <Check className="h-4 w-4 animate-pop" aria-hidden /> : null}
                {f.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {record.metrics.length ? (
        <div className="border-t border-line">
          <Expander label="details">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {record.metrics.map((m) => (
                <div key={m.label} className="flex flex-col gap-1">
                  <dt className="text-sm text-ink-2">{m.label}</dt>
                  <dd className="num text-lg text-ink">{m.value}</dd>
                </div>
              ))}
            </dl>
          </Expander>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" onClick={hard ? onBreak : onNext} className={`${BTN_PRIMARY} min-h-14`}>
          {hard ? "take a break" : nextId ? info(nextId).name : "finish"} <ArrowRight className="nudge h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={hard ? onNext : onBreak} className={BTN_SECONDARY}>
          {hard ? (nextId ? info(nextId).name : "finish") : "break"}
        </button>
        <button type="button" onClick={onAgain} className={BTN_TERTIARY} aria-label="do it again">
          <Plus className="h-4 w-4 rotate-45" aria-hidden /> again
        </button>
        <button type="button" onClick={onHome} className={BTN_TERTIARY}>
          done
        </button>
      </div>
    </Screen>
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
  const frac = Math.min(1, seconds / suggested);
  return (
    <Screen narrow>
      <div className="flex flex-col items-center gap-8 py-6 text-center">
        <h1 className="text-page font-semibold tracking-tight text-ink">{hard ? "rest well" : "rest"}</h1>
        <div className="relative h-60 w-60">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-bg-2)" strokeWidth="4" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={rested ? "var(--color-sage)" : "var(--color-sky)"}
              strokeWidth="4"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1 - frac}
              className="transition-[stroke-dashoffset,stroke] duration-500"
            />
          </svg>
          <p className="num absolute inset-0 flex items-center justify-center text-5xl font-semibold text-ink" aria-label={`rested ${seconds} seconds`}>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </p>
        </div>
        <button type="button" onClick={onContinue} className={`${BTN_PRIMARY} min-h-14 px-8`}>
          {nextId ? info(nextId).name : "continue"} <ArrowRight className="nudge h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={onHome} className={BTN_TERTIARY}>
          done for now
        </button>
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
  return (
    <Screen narrow>
      <header className="flex flex-col items-start gap-5">
        <DoneMark />
        <h1 className="text-page font-semibold tracking-tight text-ink">done for today</h1>
      </header>
      <ul className="flex flex-wrap gap-2">
        {routines.map((id, i) => {
          const ok = doneToday.has(id);
          return (
            <li
              key={id}
              className={`flex animate-fade-in items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${ok ? "bg-sage-tint text-sage-ink" : "bg-bg-2 text-ink-3"}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              {ok ? <Check className="h-3.5 w-3.5" aria-label="done" /> : null}
              {nameOf(id)}
            </li>
          );
        })}
      </ul>
      <dl className="grid grid-cols-2 gap-6">
        <Figure label="today" value={formatDuration(totalMs)} />
        <Figure label="day streak" value={String(streak)} />
      </dl>
      <button type="button" onClick={onHome} className={`${BTN_PRIMARY} min-h-14 self-start px-8`}>
        done
      </button>
    </Screen>
  );
}
