"use client";

import { useEffect, useRef, useState } from "react";
import { DrawingUtils, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { AlertKind, AlertOutcome, AlertResult } from "@/lib/alert/server";
import { FallDetector, type FallStatus } from "@/lib/fall/detector";
import { HUD_BUTTON, HUD_BUTTON_SECONDARY, TaskHud } from "./TaskHud";

// Keep the WASM version in sync with @mediapipe/tasks-vision in package.json.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
// If the camera drops out (unplugged, OS sleep), reconnect after this long.
const RECONNECT_MS = 3000;

type Status = "idle" | "loading" | "running" | "error";

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

/** Always-on fall monitor: pose tracking plus rule-based fall detection. */
export default function FallMonitor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Set to null to start over ("I'm OK"); the loop makes a fresh one.
  const detectorRef = useRef<FallDetector | null>(null);
  // Created on the Start click so the browser lets the alarm play.
  const audioRef = useRef<AudioContext | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // Bumped on Start / reconnect to (re)run the setup effect; 0 means stopped.
  const [attempt, setAttempt] = useState(0);
  const [fall, setFall] = useState<FallStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  // Result of the last "Test Alert" press, and of the alert for the current fall.
  const [testAlert, setTestAlert] = useState<AlertState | null>(null);
  const [fallAlert, setFallAlert] = useState<AlertState | null>(null);

  useEffect(() => {
    if (attempt === 0) return;

    let cancelled = false;
    let rafId = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let landmarker: PoseLandmarker | null = null;
    let stream: MediaStream | null = null;

    async function start() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
          // Stricter than the 0.5 defaults, to cut down on bodies seen in clutter.
          minPoseDetectionConfidence: 0.6,
          minPosePresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
        if (cancelled) return;

        // Keep running through camera hiccups instead of silently going blind.
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (cancelled) return;
          setError("Camera disconnected. Reconnecting…");
          setStatus("error");
          reconnectTimer = setTimeout(() => setAttempt((a) => a + 1), RECONNECT_MS);
        });

        const video = videoRef.current!;
        const canvas = canvasRef.current!;
        video.srcObject = stream;
        await video.play();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d")!;
        const draw = new DrawingUtils(ctx);
        const aspect = video.videoWidth / video.videoHeight;
        detectorRef.current = null;
        let lastTime = -1;
        let last: FallStatus | null = null;

        setError(null);
        setStatus("running");

        const loop = () => {
          if (cancelled || !landmarker) return;
          if (video.currentTime !== lastTime) {
            lastTime = video.currentTime;
            const now = performance.now();
            const pose = landmarker.detectForVideo(video, now).landmarks[0];
            detectorRef.current ??= new FallDetector(aspect);
            const next = detectorRef.current.update(now, pose);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Only once the detector accepts it as a person, so false detections don't flash.
            if (pose && next.personInView) {
              const color = next.phase === "watching" ? "#22d3ee" : "#f43f5e";
              draw.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, { color, lineWidth: 4 });
              draw.drawLandmarks(pose, { color, fillColor: "#ffffff", lineWidth: 1, radius: 3 });
            }

            // Call and text the contact once, when the alarm goes off.
            if (next.phase === "fallen" && last?.phase !== "fallen") {
              setFallAlert({ state: "sending", text: "Alerting your contact…" });
              void postAlert("fall").then(setFallAlert);
            }

            // Only re-render when something visible changes.
            if (
              next.phase !== last?.phase ||
              next.reason !== last.reason ||
              next.personInView !== last.personInView
            ) {
              last = next;
              setFall(next);
            }
          }
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(reconnectTimer);
      stream?.getTracks().forEach((t) => t.stop());
      landmarker?.close();
    };
  }, [attempt]);

  // Detection pauses when the tab is hidden, so keep the screen awake and say so.
  useEffect(() => {
    if (status !== "running") return;
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
        // Not allowed (e.g. battery saver); the monitor still runs while visible.
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
  }, [status]);

  const alarming = fall?.phase === "fallen";
  const alerting = alarming || fall?.phase === "down";

  // Beep until someone presses "I'm OK".
  useEffect(() => {
    const audio = audioRef.current;
    if (!alarming || !audio) return;
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

  useEffect(
    () => () => {
      void audioRef.current?.close();
      audioRef.current = null;
    },
    [],
  );

  const begin = () => {
    audioRef.current ??= new AudioContext();
    void audioRef.current.resume();
    setError(null);
    setFall(null);
    setStatus("loading");
    setAttempt((a) => a + 1);
  };

  const stop = () => {
    setAttempt(0);
    setFall(null);
    setStatus("idle");
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const dismiss = () => {
    detectorRef.current = null;
    setFall(null);
  };

  const sendTestAlert = async () => {
    setTestAlert({ state: "sending", text: "Sending test alert…" });
    setTestAlert(await postAlert("test"));
  };

  const statusText =
    status === "running"
      ? hidden
        ? "Paused: keep this tab visible"
        : fall?.phase === "down"
          ? "Person down…"
          : fall?.phase === "fallen"
            ? "Fall detected"
            : fall?.personInView
              ? "Watching · person in view"
              : "Watching · no one in view"
      : status === "loading"
        ? "Loading pose model and camera…"
        : status === "error"
          ? "Monitor stopped"
          : "Camera off";

  return (
    <>
      {/* Full-screen mirrored camera; both layers use object-cover on the same
          intrinsic size, so the skeleton stays aligned with the video. */}
      <div className="absolute inset-0 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        />
      </div>

      <TaskHud
        step="Safety"
        title="Fall monitor"
        description="Keep this page open and visible. If someone falls and stays down, or drops out of the bottom of the view, an alarm sounds."
        status={statusText}
        statusTone={
          status === "error" || (status === "running" && (hidden || alerting))
            ? "error"
            : status === "running" && fall?.personInView
              ? "active"
              : "idle"
        }
        error={status === "error" ? error : null}
        actions={
          <>
            {status === "running" ? (
              <button type="button" onClick={stop} className={HUD_BUTTON_SECONDARY}>
                Stop monitoring
              </button>
            ) : status === "loading" ? null : (
              <button type="button" onClick={begin} className={HUD_BUTTON}>
                {status === "error" ? "Try again" : "Start monitoring"}
              </button>
            )}
            <button
              type="button"
              onClick={sendTestAlert}
              disabled={testAlert?.state === "sending"}
              className={HUD_BUTTON_SECONDARY}
            >
              Test Alert
            </button>
            {testAlert ? (
              <p
                role="status"
                className={`basis-full rounded-xl bg-black/60 px-4 py-2 text-center text-lg backdrop-blur-md ${
                  testAlert.state === "error" ? "text-red-300" : "text-zinc-100"
                }`}
              >
                {testAlert.text}
              </p>
            ) : null}
          </>
        }
      />

      {alarming ? (
        <div
          role="alertdialog"
          aria-labelledby="fall-alarm-title"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-red-700/95 p-8 text-center"
        >
          <h2 id="fall-alarm-title" className="text-5xl font-bold tracking-tight sm:text-7xl">
            Fall detected
          </h2>
          <p className="max-w-xl text-2xl text-red-50">
            {fall?.reason ? REASON_TEXT[fall.reason] : null}
          </p>
          {fallAlert ? (
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
