"use client";

import { useMonsterStream } from "@/lib/roboflow/useMonsterStream";
import { MonsterCamera } from "./MonsterCamera";
import { HUD_BUTTON, TaskHud } from "./TaskHud";

const STATUS_TEXT = {
  idle: "Scanner offline",
  starting: "Connecting to ship sensors…",
  live: "Scanning",
  error: "Scanner error",
} as const;

/** Task 1: find the anomalies (Monster cans) with the live camera. */
export function AnomalyScanner() {
  const { videoRef, status, frame, error, start, stop } = useMonsterStream();
  const running = status === "starting" || status === "live";
  const count = frame?.detections.length ?? 0;

  return (
    <>
      <MonsterCamera videoRef={videoRef} frame={frame} />
      <TaskHud
        step="Task 1"
        title="Clear the anomalies"
        description="Stray cans are floating around the ship. Hold one up to the camera to scan it, then put it in the bin."
        status={
          status === "live"
            ? `${STATUS_TEXT.live} · ${count} anomal${count === 1 ? "y" : "ies"} in view`
            : STATUS_TEXT[status]
        }
        statusTone={status === "error" ? "error" : status === "live" && count > 0 ? "active" : "idle"}
        error={error}
        actions={
          <button
            type="button"
            onClick={running ? stop : start}
            disabled={status === "starting"}
            className={HUD_BUTTON}
          >
            {running ? "Stop scan" : "Start scan"}
          </button>
        }
      />
    </>
  );
}
