"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import type { GestureState } from "@/lib/rehab/gesture";
import { missingPhrase, RoutineRunner, type RunnerView } from "@/lib/rehab/runner";
import type { RoutineId, Summary } from "@/lib/rehab/routines/types";
import { SETTINGS } from "@/lib/rehab/settings";
import { playBeep, playConfirm, playRep, playSuccess, unlockAudio } from "@/lib/rehab/sound";
import {
  ArrowLeft, ArrowRight, Camera, CameraOff, Check, ChevronDown, Hand, ShieldAlert, SlidersHorizontal, Square, ThumbsUp,
  TriangleAlert, X,
} from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_STOP, BTN_TERTIARY, GoalChip, ProgressBar, Spinner } from "./ui";
import type { GestureDiag, PoseSource } from "./usePoseSource";

export interface RoutineResult {
  routineId: RoutineId;
  startedAt: string;
  durationMs: number;
  summary: Summary;
}

interface Props {
  id: RoutineId;
  source: PoseSource;
  debug: boolean;
  onToggleDebug: () => void;
  /** e.g. "Marching already done today, skipping to Walk out and back". */
  note?: string;
  onFinished: (result: RoutineResult) => void;
  onHome: () => void;
}

// Re-render the live UI at most this often; rep changes and sounds render immediately.
const RENDER_MS = 100;

export function RoutineScreen({ id, source, debug, onToggleDebug, note, onFinished, onHome }: Props) {
  const [runner] = useState(() => new RoutineRunner(id, SETTINGS));
  const [view, setView] = useState<RunnerView>(() => runner.snapshot());
  const lastRender = useRef(0);
  const info = runner.routine.info;
  const {
    ensureCamera, subscribe, status, error, canvasRef,
    autoFrame, setAutoFrame, setFramingHint, getZoom, aspect,
    gestureStart, setGestureStart, gestureError, setGestureActive, subscribeGesture, subscribeGestureDiag, setGestureLogging,
  } = source;
  const [gesture, setGesture] = useState<GestureState>({ progress: 0, handVisible: false, fired: false, kind: null });
  // Settings and debug start collapsed, unless debug is already on.
  const [settingsOpen, setSettingsOpen] = useState(debug);
  // Debug toggle (button or backtick key); turning it on also opens its section.
  const toggleDebug = () => {
    if (!debug) setSettingsOpen(true);
    onToggleDebug();
  };
  const onDebugKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "`") toggleDebug();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onDebugKey(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Shown when a start gesture comes in while the framing check is still red.
  const [almostReady, setAlmostReady] = useState<string | null>(null);

  // Show the live preview as soon as the screen opens, so people can get in position.
  useEffect(() => {
    void ensureCamera();
  }, [ensureCamera]);
  // Leave framing unlocked and zoomable for whatever screen comes next.
  useEffect(() => () => setFramingHint({ fullFrame: false, lock: false }), [setFramingHint]);

  const onFrame = useEffectEvent((frame: Parameters<typeof runner.onFrame>[0], t: number) => {
    const before = runner.routine.getProgress().done;
    const events = runner.onFrame(frame, t);
    // Hold the zoom steady mid-rep; the walk needs the whole frame.
    setFramingHint({ fullFrame: !!info.fullFrame, lock: runner.phase === "tracking" && runner.routine.inRep() });
    for (const e of events) {
      if (e === "rep") playRep();
      if (e === "beep") playBeep();
      if (e === "complete") playSuccess();
    }
    if (events.includes("complete")) {
      onFinished({ routineId: id, startedAt: runner.startedAtIso, durationMs: runner.durationMs, summary: runner.summary() });
      return;
    }
    if (events.length || runner.routine.getProgress().done !== before || t - lastRender.current > RENDER_MS) {
      lastRender.current = t;
      setView(runner.snapshot());
    }
  });

  useEffect(() => subscribe((frame, t) => onFrame(frame, t)), [subscribe]);


  const cameraReady = status === "ready";
  // Framing check: Start only unlocks once every required joint is visible.
  const canStart = cameraReady && view.inView;

  const start = () => {
    if (runner.phase !== "ready") return;
    unlockAudio();
    runner.start(performance.now());
    setView(runner.snapshot());
  };

  // Start gestures run only while this screen waits to start, so exercise
  // movements can't trigger anything. A red framing check still blocks the start.
  const onGesture = useEffectEvent((state: GestureState) => {
    setGesture(state);
    if (state.fired && debug) {
      console.log("[gesture] 7 screen received fire", { phase: runner.phase, canStart, cameraReady, inView: view.inView });
    }
    if (!state.fired || runner.phase !== "ready") return;
    if (!canStart) {
      const missing = view.joints.filter((j) => !j.ok && !j.optional).map((j) => j.name);
      setAlmostReady(
        missing.length
          ? `Almost ready — step back so your ${missingPhrase(missing, "and")} ${missing.length > 1 ? "are" : "is"} in view`
          : "Almost ready — the camera is still starting",
      );
      return;
    }
    unlockAudio();
    playConfirm();
    start();
  });
  useEffect(() => subscribeGesture((s) => onGesture(s)), [subscribeGesture]);
  useEffect(() => {
    setGestureLogging(debug);
  }, [debug, setGestureLogging]);
  useEffect(() => {
    if (!almostReady) return;
    const id = setTimeout(() => setAlmostReady(null), 4000);
    return () => clearTimeout(id);
  }, [almostReady]);
  // A set stopped after counting began: offer to save what was done, or discard it.
  const [stopped, setStopped] = useState<RoutineResult | null>(null);
  const stop = () => {
    if (runner.phase === "tracking") {
      setStopped({ routineId: id, startedAt: runner.startedAtIso, durationMs: runner.durationMs, summary: runner.summary() });
    }
    runner.stop();
    setView(runner.snapshot());
  };

  const active = view.phase !== "ready" && view.phase !== "done";
  // Gesture checks run whenever this screen is waiting and the setting is on,
  // even with a red framing check (the hook also needs a person in view).
  const gestureOn = gestureStart && view.phase === "ready" && cameraReady && !stopped;
  const gestureOffReason = !gestureStart ? "setting off" : view.phase !== "ready" ? "exercise already started" : "camera not ready";
  useEffect(() => {
    setGestureActive(gestureOn, gestureOffReason);
  }, [gestureOn, gestureOffReason, setGestureActive]);
  useEffect(() => () => setGestureActive(false), [setGestureActive]);
  const holding = gestureOn && gesture.progress > 0;
  const debugRows = { ...view.debug, zoom: `${getZoom().toFixed(2)}×${info.fullFrame ? " (full frame)" : ""}` };

  // Status bar text under the video: what to do right now.
  const statusText =
    view.phase === "tracking"
      ? view.feedback
      : view.phase === "countdown"
        ? "Get ready…"
        : view.phase !== "ready"
          ? "Setting up…"
          : almostReady && !canStart
            ? almostReady
            : !cameraReady
              ? "Starting camera…"
              : !view.inView
                ? "move until every joint below shows a check"
                : gestureStart
                  ? "ready. give a thumbs-up or raise your hand to start"
                  : "ready. press start when you are";

  const phaseLabel = PHASES.find((p) => p.key === view.phase)?.label ?? view.phase;
  const zoom = getZoom();
  const tracking = view.phase === "tracking";

  if (stopped) {
    const { reps, target } = stopped.summary;
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="stopped-title" className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-16 pb-28">
        <h1 id="stopped-title" className="text-page font-semibold tracking-tight text-ink">
          stopped at {reps} of {target}
        </h1>
        <p className="text-base text-ink-2">
          save this set to your history, or discard it and start {info.name.toLowerCase()} again.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" autoFocus onClick={() => onFinished(stopped)} className={BTN_PRIMARY}>
            save {reps} of {target}
          </button>
          <button type="button" onClick={() => setStopped(null)} className={BTN_SECONDARY}>
            discard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pt-4 pb-28 sm:px-6 lg:px-10 lg:pt-6 lg:pb-12">
      {/* Header: a way back (until the exercise starts), the exercise, and the current stage. */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          {!active ? (
            <button onClick={onHome} className={`${BTN_TERTIARY} -ml-2`} aria-label="back">
              <ArrowLeft className="h-5 w-5" aria-hidden /> <span className="max-sm:hidden">back</span>
            </button>
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{info.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-2">
              <GoalChip goal={info.goal} />
              <span>target: {info.target}</span>
            </p>
          </div>
        </div>
        <ol className="hidden items-center gap-2 text-sm md:flex" aria-label="exercise stages">
          {PHASES.map((p, i) => {
            const at = PHASES.findIndex((q) => q.key === view.phase);
            const state = i < at ? "past" : i === at ? "now" : "next";
            return (
              <li key={p.key} className="flex items-center gap-2" aria-current={state === "now" ? "step" : undefined}>
                {i > 0 ? <span aria-hidden className="h-px w-4 bg-line-strong" /> : null}
                <span
                  className={`rounded-full px-2.5 py-1 ${
                    state === "now" ? "bg-brand-tint font-semibold text-brand" : state === "past" ? "text-ink-2" : "text-ink-3"
                  }`}
                >
                  {p.label}
                </span>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)] lg:gap-10">
        {/* Left (wide): camera, status, meters and the start / stop button. */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* The canvas shows the (auto-framed) camera picture and skeleton, drawn from
              the app's shared, invisible video element (see RehabApp). */}
          <div
            className="relative mx-auto max-h-[64vh] w-full overflow-hidden rounded-[var(--radius-panel)] bg-[#1d2a31]"
            style={{ aspectRatio: aspect }}
          >
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100 object-contain" />
            {/* Readout: input source, stage and zoom, all real values. */}
            <div aria-hidden className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full bg-[#1d2a31]/70 px-3 py-1 text-xs text-white/85">
              <span className={`h-2 w-2 rounded-full ${cameraReady ? (tracking ? "bg-sky" : "bg-sage") : "bg-white/40"}`} />
              {cameraReady ? "camera on" : "no camera"} · {phaseLabel}
            </div>
            {autoFrame && !info.fullFrame && cameraReady ? (
              <div aria-hidden className="num pointer-events-none absolute top-3 right-3 rounded-full bg-[#1d2a31]/70 px-3 py-1 text-xs text-white/70">
                zoom {zoom.toFixed(1)}×
              </div>
            ) : null}

            {status !== "ready" ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                {status === "error" ? (
                  <div className="flex max-w-md flex-col items-center gap-4 rounded-[var(--radius-panel)] bg-surface p-6">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-tint text-danger">
                      <CameraOff className="h-5 w-5" aria-hidden />
                    </span>
                    <p role="alert" className="text-base leading-relaxed text-ink">{error}</p>
                    <button onClick={() => void ensureCamera()} className={BTN_PRIMARY}>try again</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-white/85">
                    <Spinner className="h-6 w-6" />
                    <p className="text-base">starting camera…</p>
                  </div>
                )}
              </div>
            ) : null}

            {view.phase === "countdown" ? (
              <Overlay>
                <p className="text-base text-white/85">get ready</p>
                <p className="num text-[7rem] leading-none font-semibold text-white" aria-live="assertive">{view.countdown}</p>
              </Overlay>
            ) : null}

            {view.calibration ? (
              <Overlay>
                <p className="text-sm text-white/80">
                  setting up · step {view.calibration.step} of {view.calibration.steps}
                </p>
                <p className="max-w-xl text-2xl font-semibold text-white sm:text-4xl" aria-live="assertive">{view.calibration.prompt}</p>
                <p className="num text-lg text-sky">
                  {!view.inView
                    ? view.feedback
                    : view.calibration.stage === "prep"
                      ? `starting in ${Math.ceil(view.calibration.remaining)}…`
                      : `hold still… ${Math.max(0, view.calibration.remaining).toFixed(1)} s`}
                </p>
              </Overlay>
            ) : null}

            {(tracking && !view.inView) || (almostReady && !canStart) ? (
              <div className="absolute inset-x-3 top-3 flex items-center justify-center gap-2 rounded-[var(--radius-button)] bg-warn-tint px-4 py-3 text-center text-base font-semibold text-ink" role="alert">
                <TriangleAlert className="h-5 w-5 shrink-0 text-warn" aria-hidden />
                {tracking && !view.inView ? view.feedback : almostReady}
              </div>
            ) : null}

            {holding ? (
              <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
                <ProgressRing progress={gesture.progress} kind={gesture.kind} />
              </div>
            ) : null}
          </div>

          {/* Status: big enough to read from a few metres away. */}
          <section aria-label="status" className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-stretch sm:gap-8">
              <div className="flex shrink-0 flex-col items-center justify-center sm:items-start">
                <p className="num text-7xl leading-none font-semibold text-ink sm:text-8xl" aria-live="polite">
                  {view.progress.label}
                </p>
                {view.progress.detail ? <p className="mt-2 text-base text-ink-2">{view.progress.detail}</p> : null}
              </div>
              <p
                className={`flex min-h-20 flex-1 items-center justify-center border-line px-2 text-center text-2xl leading-snug font-semibold sm:justify-start sm:border-l sm:pl-8 sm:text-left sm:text-3xl ${
                  tracking ? "text-brand" : "text-ink"
                }`}
                aria-live="polite"
              >
                {statusText}
              </p>
            </div>
            <RepTrack done={view.progress.done} target={view.progress.target} />
          </section>

          {/* Meters and the start / stop button. */}
          {view.phase === "ready" ? (
            <div className="flex flex-col gap-5">
              <FramingCheck view={view} cameraReady={cameraReady} />
              <StartButton
                onClick={start}
                disabled={!canStart}
                gesture={gestureStart}
                progress={gestureOn ? gesture.progress : 0}
                label={cameraReady ? "get in view to start" : "starting camera…"}
              />
              {gestureOn && !gesture.handVisible ? (
                <p className="text-center text-lg text-ink-2" aria-live="polite">raise your hand and give a thumbs-up.</p>
              ) : null}
              {gestureStart && gestureError ? (
                <p className="rounded-[var(--radius-button)] bg-warn-tint px-4 py-3 text-base text-ink">
                  thumbs-up detection isn&apos;t available right now. raise your hand or click the button instead.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <LivePanel view={view} />
              <button onClick={stop} className={BTN_STOP}>
                <Square className="h-4 w-4 fill-current" aria-hidden /> stop
              </button>
            </div>
          )}
        </div>

        {/* Right (narrow): what to do, safety, then settings and debug. */}
        <aside className="flex min-w-0 flex-col gap-7">
          {note ? <p className="rounded-[var(--radius-button)] bg-sky-tint px-4 py-3 text-base text-ink">{note}</p> : null}
          {info.note ? <p className="rounded-[var(--radius-button)] bg-sky-tint px-4 py-3 text-base leading-relaxed text-ink">{info.note}</p> : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-ink">how to do it</h2>
            <ol className="flex flex-col divide-y divide-line">
              {info.instructions.map((s, i) => (
                <li key={s} className="grid grid-cols-[2rem_1fr] py-3 text-base leading-relaxed text-ink first:pt-0">
                  <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-bg-2 text-xs text-ink-2">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </section>

          <div className="flex gap-3 rounded-[var(--radius-button)] bg-warn-tint px-4 py-4 text-base leading-relaxed text-ink">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
            <p>
              <strong className="font-semibold">safety: </strong>
              {info.safety}
            </p>
          </div>
          {view.phase === "ready" ? <SetupTips /> : null}

          <details
            open={settingsOpen}
            onToggle={(e) => setSettingsOpen(e.currentTarget.open)}
            className="group border-t border-line pt-5"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-ink-2 hover:text-ink">
              <span className="flex items-center gap-2.5">
                <SlidersHorizontal className="h-4 w-4" aria-hidden /> settings and debug
              </span>
              <ChevronDown className="h-4 w-4 transition-transform duration-150 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-3 flex flex-col gap-1">
              <Toggle
                on={autoFrame}
                onClick={() => setAutoFrame(!autoFrame)}
                label="auto-frame"
                hint={info.fullFrame ? "this exercise always shows the full camera view" : "zoom and follow you automatically"}
              />
              <Toggle on={gestureStart} onClick={() => setGestureStart(!gestureStart)} label="gesture start" hint="a thumbs-up or raised hand starts the exercise" />
              <Toggle on={debug} onClick={toggleDebug} label="debug" hint="raw measurements and gesture diagnostics" />
              {debug ? (
                <>
                  <p className="mt-2 text-sm text-ink-2">
                    gesture logs go to the browser console, prefixed with <code>[gesture]</code>.
                  </p>
                  <dl className="rounded-[var(--radius-control)] border border-line bg-bg p-3 font-mono text-sm leading-6">
                    {Object.entries(debugRows).map(([k, v]) => (
                      <div key={k} className="flex flex-wrap gap-x-3">
                        <dt className="text-ink-3">{k}</dt>
                        <dd className="text-brand">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <GestureDebugPanel subscribe={subscribeGestureDiag} />
                </>
              ) : null}
            </div>
          </details>

        </aside>
      </div>
    </div>
  );
}

const PHASES: { key: RunnerView["phase"]; label: string }[] = [
  { key: "ready", label: "ready" },
  { key: "countdown", label: "countdown" },
  { key: "calibrating", label: "setup" },
  { key: "tracking", label: "tracking" },
  { key: "done", label: "done" },
];

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#1d2a31]/55 p-6 text-center">{children}</div>
  );
}

/** Reps as discrete marks when there are few of them, otherwise a continuous track. */
function RepTrack({ done, target }: { done: number; target: number }) {
  const value = target ? done / target : 0;
  if (!Number.isInteger(target) || target < 2 || target > 24) return <ProgressBar value={value} />;
  return (
    <div className="flex gap-1.5" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={target} aria-label="progress">
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={`h-2 flex-1 rounded-full transition-colors duration-200 ${i < Math.floor(done) ? "bg-sage" : "bg-bg-2"}`} />
      ))}
    </div>
  );
}

function Toggle({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex min-h-14 items-center justify-between gap-4 rounded-[var(--radius-control)] px-2 text-left transition-colors duration-150 hover:bg-bg-2"
    >
      <span className="flex flex-col">
        <span className="text-base text-ink">{label}</span>
        <span className="text-sm text-ink-2">{hint}</span>
      </span>
      <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150 ${on ? "bg-brand" : "bg-line-strong"}`}>
        <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-150 ${on ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

/**
 * Start button. With thumbs-up start on, a ring traces its outline as the
 * gesture is held; clicking still works as a fallback.
 */
function StartButton({ onClick, disabled, gesture, progress, label }: { onClick: () => void; disabled: boolean; gesture: boolean; progress: number; label: string }) {
  return (
    <div className="relative">
      <button onClick={onClick} disabled={disabled} className={`${BTN_PRIMARY} flex min-h-20 w-full flex-col items-center justify-center gap-1 py-3`}>
        {disabled ? (
          <span className="text-xl">{label}</span>
        ) : gesture ? (
          <>
            <span className="flex items-center gap-3 text-xl">
              <ThumbsUp className="h-6 w-6" aria-hidden /> thumbs up or raise your hand to start <Hand className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-sm font-medium opacity-80">or click here</span>
          </>
        ) : (
          <span className="flex items-center gap-2 text-xl">
            start exercise <ArrowRight className="h-5 w-5" aria-hidden />
          </span>
        )}
      </button>
      {progress > 0 ? (
        <svg className="pointer-events-none absolute -inset-1.5 h-[calc(100%+0.75rem)] w-[calc(100%+0.75rem)] overflow-visible" aria-hidden>
          <rect width="100%" height="100%" rx="14" fill="none" stroke="var(--color-sky)" strokeWidth="3" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} />
        </svg>
      ) : null}
      <span className="sr-only" aria-live="polite">{progress > 0 ? `starting: ${Math.round(progress * 100)}%` : ""}</span>
    </div>
  );
}

/** Gesture icon with a filling ring, shown on the video while the gesture is held. */
function ProgressRing({ progress, kind }: { progress: number; kind: GestureState["kind"] }) {
  const Icon = kind === "raise" ? Hand : ThumbsUp;
  return (
    <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-[#1d2a31]/70">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="4" />
        <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-sky)" strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} />
      </svg>
      <Icon className="h-14 w-14 text-white" aria-hidden />
    </div>
  );
}

/**
 * Debug view of the start-gesture pipeline: whether each check runs (and why
 * not), the exact images sent to the recognizer, what it found, and the hold timers.
 */
function GestureDebugPanel({ subscribe }: { subscribe: (fn: (d: GestureDiag) => void) => () => void }) {
  const [diag, setDiag] = useState<GestureDiag | null>(null);
  const thumbs = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(
    () =>
      subscribe((d) => {
        setDiag(d);
        // Copy the recognizer's input canvases now, before the next check overwrites them.
        d.images.forEach((img, i) => {
          const out = thumbs.current[i];
          if (!out) return;
          out.width = img.canvas.width;
          out.height = img.canvas.height;
          out.getContext("2d")?.drawImage(img.canvas, 0, 0);
        });
      }),
    [subscribe],
  );
  if (!diag) return null;
  const t = diag.trigger;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const ok = (s: string) => (s.startsWith("running") ? "text-sage-ink" : "text-warn");
  return (
    <section aria-label="Gesture diagnostics" className="rounded-[var(--radius-control)] border border-line bg-bg p-4 font-mono text-sm leading-7 text-ink-2">
      <h2 className="mb-2 font-sans text-base font-medium text-ink">Start gesture diagnostics</h2>
      <p>
        Thumbs-up recognizer: <span className={ok(diag.recognizer)}>{diag.recognizer}</span>
      </p>
      <p>
        Raise-hand check: <span className={ok(diag.raiseHand)}>{diag.raiseHand}</span>
        {diag.raiseHand === "running" ? <span> · raised: {diag.raised ?? "none"}</span> : null}
      </p>
      {diag.hands.length ? (
        <ul className="mt-1">
          {diag.hands.map((h) => (
            <li key={h.source}>
              {h.source}: {h.detected ? "hand found" : "no hand"}
              {h.top ? ` · top: ${h.top} ${h.topScore.toFixed(2)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1">
        Hold: thumb {pct(t.thumbProgress)} · raise {pct(t.raiseProgress)} · weak streak {t.softStreak} · grace{" "}
        {t.graceLeftMs === null ? "–" : `${Math.round(t.graceLeftMs)} ms left`} · cooldown{" "}
        {t.cooldownLeftMs > 0 ? `${(t.cooldownLeftMs / 1000).toFixed(1)} s` : "–"}
      </p>
      {diag.images.length ? (
        <div className="mt-3 flex flex-wrap gap-4">
          {diag.images.map((img, i) => (
            <figure key={img.label} className="flex flex-col gap-1">
              <canvas
                ref={(el) => {
                  thumbs.current[i] = el;
                }}
                className="h-40 w-auto rounded-[6px] border border-line-strong bg-ink"
              />
              <figcaption className="text-xs text-ink-3">{img.label} · as sent, not mirrored</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Required joints with visible / missing markers (icon and text, not colour alone); optional ones are marked as such. */
function FramingCheck({ view, cameraReady }: { view: RunnerView; cameraReady: boolean }) {
  const missing = view.joints.filter((j) => !j.ok && !j.optional).length;
  const ready = view.inView && cameraReady;
  return (
    <section aria-label="framing check" className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-line bg-surface p-5">
      <h2 className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-ink">framing check</span>
        <span className={`flex items-center gap-1.5 text-sm font-semibold ${ready ? "text-sage-ink" : "text-warn"}`}>
          {ready ? <Check className="h-4 w-4" aria-hidden /> : null}
          {ready ? "ready" : !cameraReady ? "waiting for the camera" : `${missing} not in view`}
        </span>
      </h2>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-base sm:grid-cols-3">
        {view.joints.map((j) => (
          <li key={j.id} className={`flex items-center gap-2.5 ${j.optional && !j.ok ? "text-ink-3" : "text-ink"}`}>
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                j.ok ? "bg-sage-tint text-sage-ink" : j.optional ? "bg-bg-2 text-ink-3" : "bg-danger-tint text-danger"
              }`}
            >
              {j.ok ? <Check className="h-3.5 w-3.5" /> : j.optional ? null : <X className="h-3.5 w-3.5" />}
            </span>
            <span>
              {j.name}
              <span className="sr-only">{j.ok ? ": visible" : ": not visible"}</span>
              {j.optional ? <span className="text-ink-3"> (optional)</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SetupTips() {
  return (
    <details className="group border-t border-line pt-5 text-base leading-relaxed">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink-2 hover:text-ink">
        <span className="flex items-center gap-2.5">
          <Camera className="h-4 w-4" aria-hidden /> can&apos;t get in view? setup tips
        </span>
        <ChevronDown className="h-4 w-4 transition-transform duration-150 group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-ink-2 marker:text-ink-3">
        <li>place the camera lower: around waist height, or on a chair.</li>
        <li>tilt the screen back slightly so it points up at you.</li>
        <li>on a phone or tablet, turn it upright (portrait) to fit your full height.</li>
        <li>auto-frame zooms in for you, so you don&apos;t need to fill the picture yourself.</li>
      </ul>
    </details>
  );
}

const SWAY_TEXT = ["text-sage-ink", "text-warn", "text-danger"];
const SWAY_BG = ["bg-sage", "bg-[#d9a441]", "bg-danger"];

function LivePanel({ view }: { view: RunnerView }) {
  const { bars, timer, sway } = view.live;
  return (
    <>
      {bars?.map((b) => (
        <ProgressBar key={b.label} label={b.label} value={b.value} target={b.target} />
      ))}
      {timer ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-5">
          <p className="text-base text-ink-2">{timer.label}</p>
          <p className="num text-6xl font-semibold text-ink">
            {timer.seconds.toFixed(0)} <span className="text-2xl font-normal text-ink-3">/ {timer.target} s</span>
          </p>
          <ProgressBar value={timer.seconds / timer.target} />
        </div>
      ) : null}
      {sway ? (
        <div>
          <p className="mb-2 flex items-baseline justify-between text-base">
            <span className="text-ink">sway</span>
            <span className={`font-semibold ${SWAY_TEXT[sway.level]}`}>{sway.label}</span>
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-bg-2">
            <div className={`h-full rounded-full transition-[width] duration-150 ${SWAY_BG[sway.level]}`} style={{ width: `${sway.value * 100}%` }} />
          </div>
        </div>
      ) : null}
    </>
  );
}
