"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { DEMO_KEYS } from "@/lib/rehab/demo";
import type { GestureState } from "@/lib/rehab/gesture";
import { missingPhrase, RoutineRunner, type RunnerView } from "@/lib/rehab/runner";
import type { RoutineId, Summary } from "@/lib/rehab/routines/types";
import { SETTINGS } from "@/lib/rehab/settings";
import { playBeep, playConfirm, playRep, playSuccess, unlockAudio } from "@/lib/rehab/sound";
import { BTN_GHOST, BTN_PRIMARY, BTN_STOP, GoalChip, ProgressBar } from "./ui";
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
    ensureCamera, resetDemo, subscribe, demo, status, error, videoRef, canvasRef,
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
    if (!demo) void ensureCamera();
  }, [demo, ensureCamera]);
  useEffect(() => resetDemo(), [resetDemo]);
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


  const cameraReady = demo || status === "ready";
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
  const stop = () => {
    runner.stop();
    setView(runner.snapshot());
  };

  const active = view.phase !== "ready" && view.phase !== "done";
  // Gesture checks run whenever this screen is waiting and the setting is on,
  // even with a red framing check (the hook also needs a person in view).
  const gestureOn = gestureStart && view.phase === "ready" && cameraReady;
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
                ? "Move so the joints listed below turn green"
                : gestureStart
                  ? "Ready! 👍 Thumbs up or ✋ raise your hand to start"
                  : "Ready! Press Start when you are";

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6">
      {/* Small screens: keep the name and a way home visible above the video. */}
      <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
        <p className="text-2xl font-bold">{info.name}</p>
        {!active ? (
          <button onClick={onHome} className={BTN_GHOST}>
            ← Home
          </button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
        {/* Left (wide): video, status bar, meters and the Start / Stop button. */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* The canvas shows the (auto-framed) camera picture and skeleton. The video
              element only feeds it, so it stays in the page but invisible. */}
          <div
            className="relative mx-auto max-h-[62vh] w-full overflow-hidden rounded-3xl bg-zinc-900"
            style={{ aspectRatio: aspect }}
          >
            <video ref={videoRef} className="pointer-events-none absolute inset-0 h-full w-full opacity-0" playsInline muted />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100 object-contain" />

            {!demo && status !== "ready" ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-2xl">
                {status === "error" ? (
                  <div className="flex flex-col items-center gap-4">
                    <p role="alert" className="text-red-200">{error}</p>
                    <button onClick={() => void ensureCamera()} className={BTN_PRIMARY}>Try again</button>
                  </div>
                ) : (
                  <p>Starting camera…</p>
                )}
              </div>
            ) : null}

            {view.phase === "countdown" ? (
              <Overlay>
                <p className="text-3xl font-semibold">Get ready</p>
                <p className="text-[10rem] font-bold leading-none tabular-nums" aria-live="assertive">{view.countdown}</p>
              </Overlay>
            ) : null}

            {view.calibration ? (
              <Overlay>
                <p className="text-2xl text-zinc-300">
                  Setting up · step {view.calibration.step} of {view.calibration.steps}
                </p>
                <p className="text-4xl font-bold sm:text-5xl" aria-live="assertive">{view.calibration.prompt}</p>
                <p className="text-2xl tabular-nums">
                  {!view.inView
                    ? view.feedback
                    : view.calibration.stage === "prep"
                      ? `Starting in ${Math.ceil(view.calibration.remaining)}…`
                      : `Hold still… ${Math.max(0, view.calibration.remaining).toFixed(1)} s`}
                </p>
              </Overlay>
            ) : null}

            {view.phase === "tracking" && !view.inView ? (
              <div className="absolute inset-x-0 top-0 bg-amber-400 p-4 text-center text-2xl font-bold text-black" role="alert">
                {view.feedback}
              </div>
            ) : null}

            {holding ? (
              <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
                <ProgressRing progress={gesture.progress} icon={gesture.kind === "raise" ? "✋" : "👍"} />
              </div>
            ) : null}

            {almostReady && !canStart ? (
              <div className="absolute inset-x-0 top-0 bg-amber-400 p-4 text-center text-2xl font-bold text-black" role="alert">
                {almostReady}
              </div>
            ) : null}
          </div>

          {/* Status bar: big enough to read from a few metres away. */}
          <section aria-label="Status" className="flex flex-col gap-3 rounded-3xl bg-zinc-900 p-4 sm:p-5">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
              <div className="shrink-0 text-center">
                <p className="text-7xl font-bold leading-none tabular-nums sm:text-8xl" aria-live="polite">
                  {view.progress.label}
                </p>
                {view.progress.detail ? <p className="mt-2 text-xl text-zinc-300">{view.progress.detail}</p> : null}
              </div>
              <p
                className="flex min-h-20 flex-1 items-center justify-center rounded-2xl bg-zinc-800 p-4 text-center text-3xl font-semibold leading-snug sm:text-4xl"
                aria-live="polite"
              >
                {statusText}
              </p>
            </div>
            <ProgressBar value={view.progress.done / view.progress.target} />
          </section>

          {/* Meters and the Start / Stop button. */}
          {view.phase === "ready" ? (
            <div className="flex flex-col gap-4">
              <FramingCheck view={view} cameraReady={cameraReady} />
              <StartButton
                onClick={start}
                disabled={!canStart}
                gesture={gestureStart}
                progress={gestureOn ? gesture.progress : 0}
                label={cameraReady ? "Get in view to start" : "Starting camera…"}
              />
              {gestureOn && !gesture.handVisible ? (
                <p className="text-center text-2xl text-zinc-200" aria-live="polite">Raise your hand and give a thumbs-up.</p>
              ) : null}
              {gestureStart && gestureError ? (
                <p className="text-center text-xl text-amber-200">Thumbs-up detection isn&apos;t available right now. Raise your hand or click the button instead.</p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <LivePanel view={view} />
              <button onClick={stop} className={BTN_STOP}>
                Stop
              </button>
            </div>
          )}
        </div>

        {/* Right (narrow): what to do, safety, then settings and debug. */}
        <aside className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{info.name}</h1>
              <GoalChip goal={info.goal} />
            </div>
            <p className="text-xl text-zinc-300">Target: {info.target}</p>
            {!active ? (
              <button onClick={onHome} className={`${BTN_GHOST} hidden self-start lg:block`}>
                ← Home
              </button>
            ) : null}
          </header>

          {note ? <p className="rounded-2xl bg-sky-950 p-4 text-xl text-sky-100">{note}</p> : null}
          {info.note ? (
            <p className="rounded-2xl border-2 border-sky-300 bg-sky-950 p-4 text-xl text-sky-50">{info.note}</p>
          ) : null}

          <ol className="flex list-decimal flex-col gap-3 pl-7 text-xl leading-snug">
            {info.instructions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="rounded-2xl border-2 border-amber-400 bg-amber-950 p-4 text-xl leading-snug text-amber-50">
            <strong>Safety: </strong>
            {info.safety}
          </p>
          {view.phase === "ready" ? <SetupTips /> : null}

          <details
            open={settingsOpen}
            onToggle={(e) => setSettingsOpen(e.currentTarget.open)}
            className="rounded-2xl bg-zinc-900 p-4"
          >
            <summary className="cursor-pointer text-xl font-bold">Settings and debug</summary>
            <div className="mt-4 flex flex-col gap-3">
              <button
                onClick={() => setAutoFrame(!autoFrame)}
                className={BTN_GHOST}
                aria-pressed={autoFrame}
                title={info.fullFrame ? "This exercise always shows the full camera view" : "Zoom and follow you automatically"}
              >
                Auto-frame {autoFrame ? "on" : "off"}
              </button>
              <button onClick={() => setGestureStart(!gestureStart)} className={BTN_GHOST} aria-pressed={gestureStart}>
                Gesture start {gestureStart ? "on" : "off"}
              </button>
              <button onClick={toggleDebug} className={BTN_GHOST} aria-pressed={debug}>
                Debug {debug ? "on" : "off"}
              </button>
              {debug ? (
                <>
                  <p className="text-base text-zinc-400">
                    Gesture logs go to the browser console, prefixed with <code>[gesture]</code>.
                  </p>
                  <dl className="rounded-xl bg-black/60 p-3 font-mono text-sm leading-6">
                    {Object.entries(debugRows).map(([k, v]) => (
                      <div key={k} className="flex flex-wrap gap-x-3">
                        <dt className="text-zinc-400">{k}</dt>
                        <dd className="text-lime-300">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <GestureDebugPanel subscribe={subscribeGestureDiag} />
                </>
              ) : null}
            </div>
          </details>

          {demo ? (
            <details open className="rounded-2xl bg-zinc-900 p-4 text-lg">
              <summary className="cursor-pointer text-xl font-bold text-lime-400">Demo mode keys</summary>
              <ul className="mt-3 flex flex-col gap-1">
                {DEMO_KEYS.map((k) => (
                  <li key={k.key}>
                    <kbd className="rounded bg-zinc-700 px-2 py-0.5 font-mono">{k.key}</kbd> {k.action}
                  </li>
                ))}
                <li>
                  <kbd className="rounded bg-zinc-700 px-2 py-0.5 font-mono">`</kbd> Debug
                </li>
              </ul>
            </details>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center">
      {children}
    </div>
  );
}

/**
 * Start button. With thumbs-up start on, a ring traces its outline as the
 * gesture is held; clicking still works as a fallback.
 */
function StartButton({ onClick, disabled, gesture, progress, label }: { onClick: () => void; disabled: boolean; gesture: boolean; progress: number; label: string }) {
  return (
    <div className="relative">
      <button onClick={onClick} disabled={disabled} className={`${BTN_PRIMARY} flex min-h-24 w-full flex-col items-center justify-center py-3`}>
        {disabled ? (
          <span className="text-4xl">{label}</span>
        ) : gesture ? (
          <>
            <span className="text-3xl">👍 Thumbs up or ✋ raise your hand to start</span>
            <span className="text-xl font-semibold">or click here</span>
          </>
        ) : (
          <span className="text-4xl">Start Exercise</span>
        )}
      </button>
      {progress > 0 ? (
        <svg className="pointer-events-none absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] overflow-visible" aria-hidden>
          <rect width="100%" height="100%" rx="24" fill="none" stroke="white" strokeWidth="6" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} />
        </svg>
      ) : null}
      <span className="sr-only" aria-live="polite">{progress > 0 ? `Starting: ${Math.round(progress * 100)}%` : ""}</span>
    </div>
  );
}

/** Gesture icon with a filling ring, shown on the video while the gesture is held. */
function ProgressRing({ progress, icon }: { progress: number; icon: string }) {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-black/60">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="8" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="#a3e635" strokeWidth="8" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} />
      </svg>
      <span className="text-7xl">{icon}</span>
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
  const ok = (s: string) => (s.startsWith("running") ? "text-lime-300" : "text-amber-300");
  return (
    <section aria-label="Gesture diagnostics" className="rounded-2xl bg-zinc-900 p-4 font-mono text-base leading-7">
      <h2 className="mb-2 font-sans text-xl font-bold">Start gesture diagnostics</h2>
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
                className="h-40 w-auto rounded-lg border border-zinc-600 bg-black"
              />
              <figcaption className="text-sm text-zinc-400">{img.label} · as sent, not mirrored</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Required joints with green / red indicators; optional ones are marked as such. */
function FramingCheck({ view, cameraReady }: { view: RunnerView; cameraReady: boolean }) {
  return (
    <section aria-label="Framing check" className="rounded-2xl bg-zinc-900 p-4">
      <h2 className="mb-3 text-2xl font-bold">
        Framing check {view.inView && cameraReady ? <span className="text-lime-300">✓ Ready</span> : null}
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-xl">
        {view.joints.map((j) => (
          <li key={j.id} className="flex items-center gap-3">
            <span
              aria-hidden
              className={`inline-block h-5 w-5 shrink-0 rounded-full ${j.ok ? "bg-lime-400" : j.optional ? "bg-zinc-500" : "bg-red-500"}`}
            />
            <span>
              {j.name}
              <span className="sr-only">{j.ok ? ": visible" : ": not visible"}</span>
              {j.optional ? <span className="text-zinc-400"> (optional)</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SetupTips() {
  return (
    <details className="rounded-2xl bg-zinc-900 p-4 text-xl leading-snug">
      <summary className="cursor-pointer font-bold">Can&apos;t get in view? Setup tips</summary>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-6">
        <li>Place the camera lower: around waist height, or on a chair.</li>
        <li>Tilt the screen back slightly so it points up at you.</li>
        <li>On a phone or tablet, turn it upright (portrait) to fit your full height.</li>
        <li>Auto-frame zooms in for you, so you don&apos;t need to fill the picture yourself.</li>
      </ul>
    </details>
  );
}

function LivePanel({ view }: { view: RunnerView }) {
  const { bars, timer, sway } = view.live;
  return (
    <>
      {bars?.map((b) => (
        <ProgressBar key={b.label} label={b.label} value={b.value} target={b.target} />
      ))}
      {timer ? (
        <div className="rounded-2xl bg-zinc-900 p-4">
          <p className="text-xl font-semibold">{timer.label}</p>
          <p className="text-6xl font-bold tabular-nums">
            {timer.seconds.toFixed(0)} <span className="text-3xl text-zinc-400">/ {timer.target} s</span>
          </p>
          <ProgressBar value={timer.seconds / timer.target} />
        </div>
      ) : null}
      {sway ? (
        <div>
          <p className="mb-2 text-xl font-semibold">
            Sway: <span className={["text-lime-300", "text-yellow-300", "text-red-300"][sway.level]}>{sway.label}</span>
          </p>
          <div className="h-4 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full ${["bg-lime-400", "bg-yellow-400", "bg-red-500"][sway.level]}`}
              style={{ width: `${sway.value * 100}%` }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
