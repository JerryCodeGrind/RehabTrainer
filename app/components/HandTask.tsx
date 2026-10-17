"use client";

import { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";
import { HUD_BUTTON, HUD_BUTTON_SECONDARY, TaskHud } from "./TaskHud";

// Keep the WASM version in sync with @mediapipe/tasks-vision in package.json.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

type Status = "idle" | "loading" | "running" | "error";
type Hand = "Right" | "Left";

export default function HandTask() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // Bumped on each Start / Try again click to (re)run the setup effect.
  const [attempt, setAttempt] = useState(0);
  // Which hand this step accepts. The ref is what the detection loop reads.
  const [hand, setHand] = useState<Hand>("Right");
  const handRef = useRef<Hand>("Right");
  const [handInView, setHandInView] = useState(false);

  useEffect(() => {
    if (attempt === 0) return;

    let cancelled = false;
    let rafId = 0;
    let landmarker: HandLandmarker | null = null;
    let stream: MediaStream | null = null;

    async function start() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          // Look for both so the right one isn't missed when the other hand is in view.
          numHands: 2,
        });

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
        if (cancelled) return;

        const video = videoRef.current!;
        const canvas = canvasRef.current!;
        video.srcObject = stream;
        await video.play();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d")!;
        const draw = new DrawingUtils(ctx);
        let lastTime = -1;
        let lastInView = false;

        setStatus("running");

        const loop = () => {
          if (cancelled || !landmarker) return;
          if (video.currentTime !== lastTime) {
            lastTime = video.currentTime;
            const result = landmarker.detectForVideo(video, performance.now());
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // MediaPipe assumes a mirrored (selfie) image, which cancels out the
            // camera's own left/right flip, so its labels match the user's hands.
            const index = result.handedness.findIndex(
              (h) => h[0]?.categoryName === handRef.current,
            );
            const inView = index !== -1;
            if (inView !== lastInView) {
              lastInView = inView;
              setHandInView(inView);
            }

            if (inView) {
              const landmarks = result.landmarks[index];
              draw.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                color: "#22d3ee",
                lineWidth: 4,
              });
              draw.drawLandmarks(landmarks, {
                color: "#f43f5e",
                fillColor: "#ffffff",
                lineWidth: 2,
                radius: 4,
              });
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
      stream?.getTracks().forEach((t) => t.stop());
      landmarker?.close();
    };
  }, [attempt]);

  const chooseHand = (next: Hand) => {
    handRef.current = next;
    setHand(next);
  };

  const begin = () => {
    setError(null);
    setStatus("loading");
    setAttempt((a) => a + 1);
  };

  const statusText =
    status === "running"
      ? `${hand === "Right" ? "Show your RIGHT hand" : "Now show your LEFT hand"}${
          handInView ? " · detected" : ""
        }`
      : status === "loading"
        ? "Loading hand model and camera…"
        : status === "error"
          ? "Couldn't start"
          : "Camera off";

  return (
    <>
      {/* Full-screen camera. Mirror both layers so it behaves like a selfie view;
          both use object-cover on the same intrinsic size, so they stay aligned. */}
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
        step="Task 2"
        title="Hand Tracking"
        description="Hold each hand up to the camera so the ship can track it."
        status={statusText}
        statusTone={
          status === "error" ? "error" : status === "running" && handInView ? "active" : "idle"
        }
        error={status === "error" ? error : null}
        actions={
          status === "running" ? (
            <button
              onClick={() => chooseHand(hand === "Right" ? "Left" : "Right")}
              className={HUD_BUTTON_SECONDARY}
            >
              {hand === "Right" ? "Next: left hand" : "Back to right hand"}
            </button>
          ) : status === "loading" ? null : (
            <button onClick={begin} className={HUD_BUTTON}>
              {status === "error" ? "Try again" : "Start Task 2"}
            </button>
          )
        }
      />
    </>
  );
}
