"use client";

import { useEffect, useRef, useState } from "react";
import type { AlertKind, AlertOutcome, AlertResult } from "@/lib/alert/server";
import { FallDetector, type FallStatus } from "@/lib/fall/detector";
import { syncFall } from "@/lib/rehab/sync";
import type { PoseSource } from "./usePoseSource";

// The alarm waits this long before calling, so "I'm OK" can cancel the call.
const CALL_DELAY_MS = 20_000;

const REASON_TEXT = {
  "on-floor": "Someone went down and hasn't gotten back up.",
  "out-of-frame": "Someone dropped out of view and hasn't come back.",
} as const;

interface AlertState {
  state: "sending" | "ok" | "error";
  text: string;
}

function describeOutcome(label: string, verb: string, outcome: AlertOutcome): string {
  return outcome.ok ? `${label} ${verb} (SID: ${outcome.sid})` : `${label} failed: ${outcome.error}`;
}

/** Call and text ALERT_TO_NUMBER via /api/alert/{kind}; never throws. */
async function postAlert(kind: AlertKind): Promise<AlertState> {
  try {
    const res = await fetch(`/api/alert/${kind}`, { method: "POST" });
    const body = (await res.json().catch(() => null)) as
      | (Partial<AlertResult> & { message?: string })
      | null;
    console.log(`[alert] ${kind}`, res.status, body);
    if (res.ok && body?.call && body.sms) {
      return {
        state: body.call.ok && body.sms.ok ? "ok" : "error",
        text: `${describeOutcome("Call", "placed", body.call)} · ${describeOutcome("Text", "sent", body.sms)}${
          body.trial ? " · Trial account: the text has Twilio's sample wording" : ""
        }`,
      };
    }
    return { state: "error", text: body?.message ?? `Alert failed (HTTP ${res.status})` };
  } catch (err) {
    return { state: "error", text: `Alert failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Fall detection over the app's shared pose stream: a status pill, the alarm
 * screen with beeping, and one call and text to ALERT_TO_NUMBER per alarm,
 * unless "I'm OK" is pressed during the countdown before the call.
 * It only watches while `active` (an exercise is on screen, with the camera on);
 * it doesn't open the camera itself. An alarm that's already going off stays up
 * until "I'm OK", whatever the screen.
 */
export function FallGuard({ source, active }: { source: PoseSource; active: boolean }) {
  const { subscribe, ensureCamera, status, aspect } = source;
  // Set to null to start over ("I'm OK"); the next frame makes a fresh one.
  const detectorRef = useRef<FallDetector | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [fall, setFall] = useState<FallStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [testAlert, setTestAlert] = useState<AlertState | null>(null);
  const [fallAlert, setFallAlert] = useState<AlertState | null>(null);
  // When the alarm's call goes out (Date.now() ms), unless "I'm OK" cancels it first.
  const [callAt, setCallAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    detectorRef.current = null;
    // Off between exercises. A stale status isn't shown (`current` needs `running`),
    // and the next exercise starts a fresh detector; only an alarm carries over.
    if (!active) return;
    let last: FallStatus | null = null;
    return subscribe((frame, t) => {
      detectorRef.current ??= new FallDetector(aspect);
      const next = detectorRef.current.update(t, frame?.draw ?? null);

      // The alarm starts the countdown to the call; the fall is recorded either way.
      if (next.phase === "fallen" && last?.phase !== "fallen") {
        const t = Date.now();
        setNow(t);
        setCallAt(t + CALL_DELAY_MS);
        setFallAlert(null);
        syncFall(next.reason);
      }

      // Only re-render when something visible changes.
      if (next.phase !== last?.phase || next.reason !== last.reason || next.personInView !== last.personInView) {
        last = next;
        setFall(next);
      }
    });
  }, [subscribe, aspect, active]);

  const running = active && status === "ready";

  // Detection pauses when the tab is hidden, so keep the screen awake and say so.
  useEffect(() => {
    if (!running) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;

    const acquire = async () => {
      if (!("wakeLock" in navigator) || lock) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (done) void next.release();
        else {
          lock = next;
          next.addEventListener("release", () => {
            if (lock === next) lock = null;
          });
        }
      } catch {
        // Not allowed (e.g. battery saver); detection still runs while visible.
      }
    };
    const onVisibility = () => {
      const isHidden = document.visibilityState === "hidden";
      setHidden(isHidden);
      if (!isHidden) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, [running]);

  const current = running ? fall : null;
  // Not tied to `running`: the alarm stays up even if the camera goes off.
  const alarming = fall?.phase === "fallen";

  // Beep until someone presses "I'm OK". Browsers allow the sound once the
  // page has had a click or key press.
  useEffect(() => {
    if (!alarming) return;
    const audio = (audioRef.current ??= new AudioContext());
    void audio.resume();
    const beep = () => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.4);
    };
    beep();
    const id = setInterval(beep, 800);
    return () => clearInterval(id);
  }, [alarming]);

  // Count down, then call and text the contact. "I'm OK" clears callAt, which stops this.
  useEffect(() => {
    if (callAt === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t < callAt) return;
      clearInterval(id);
      setCallAt(null);
      setFallAlert({ state: "sending", text: "Alerting your contact…" });
      void postAlert("fall").then(setFallAlert);
    }, 250);
    return () => clearInterval(id);
  }, [callAt]);

  useEffect(
    () => () => {
      void audioRef.current?.close();
      audioRef.current = null;
    },
    [],
  );

  const dismiss = () => {
    setCallAt(null); // Cancels the call if it hasn't gone out yet.
    detectorRef.current = null;
    setFall(null);
  };
  const secondsLeft = callAt === null ? null : Math.max(0, Math.ceil((callAt - now) / 1000));

  const sendTestAlert = async () => {
    setTestAlert({ state: "sending", text: "Sending test alert…" });
    setTestAlert(await postAlert("test"));
  };

  const statusText =
    status === "error"
      ? "Fall detection off: camera unavailable"
      : !running
        ? "Starting fall detection…"
        : hidden
          ? "Fall detection paused: keep this tab visible"
          : current?.phase === "down"
            ? "Person down…"
            : current?.personInView
              ? "Fall detection on · person in view"
              : "Fall detection on";
  const dot =
    status === "error" || hidden || current?.phase === "down"
      ? "bg-red-500"
      : current?.personInView
        ? "bg-lime-400"
        : "bg-zinc-400";

  return (
    <>
      {/* The status pill (and test alert) only show during exercises. */}
      <div className={`pointer-events-none fixed right-4 bottom-4 z-40 max-w-md flex-col items-end gap-2 ${active ? "flex" : "hidden"}`}>
        {testAlert ? (
          <p
            role="status"
            className={`pointer-events-auto rounded-xl bg-black/80 px-3 py-2 text-sm backdrop-blur ${
              testAlert.state === "error" ? "text-red-300" : "text-zinc-100"
            }`}
          >
            {testAlert.text}
          </p>
        ) : null}
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/80 py-1.5 pr-1.5 pl-4 text-sm text-white shadow-lg backdrop-blur">
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
          <span aria-live="polite">{statusText}</span>
          {status === "error" ? (
            <button type="button" onClick={() => void ensureCamera()} className="rounded-full bg-white px-3 py-1.5 font-semibold text-black hover:bg-zinc-200">
              Try again
            </button>
          ) : null}
          <button
            type="button"
            onClick={sendTestAlert}
            disabled={testAlert?.state === "sending"}
            className="rounded-full bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25 disabled:opacity-60"
          >
            Test alert
          </button>
        </div>
      </div>

      {alarming ? (
        <div
          role="alertdialog"
          aria-labelledby="fall-alarm-title"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-red-700/95 p-8 text-center text-white"
        >
          <h2 id="fall-alarm-title" className="text-5xl font-bold tracking-tight sm:text-7xl">
            Fall detected
          </h2>
          <p className="max-w-xl text-2xl text-red-50">
            {fall?.reason ? REASON_TEXT[fall.reason] : null}
          </p>
          {secondsLeft !== null ? (
            <p role="status" className="max-w-2xl text-2xl text-red-50">
              Calling your contact in <span className="font-bold tabular-nums">{secondsLeft} s</span>.
              <br />
              Press <span className="font-bold">I&apos;m OK</span> if you don&apos;t need help.
            </p>
          ) : fallAlert ? (
            <p role="status" className="max-w-2xl text-xl text-red-50">
              {fallAlert.state === "ok" ? "Your contact has been called and texted." : fallAlert.text}
            </p>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            autoFocus
            className="min-h-20 rounded-full bg-white px-12 text-3xl font-semibold text-black shadow-lg hover:bg-zinc-200"
          >
            I&apos;m OK
          </button>
        </div>
      ) : null}
    </>
  );
}
