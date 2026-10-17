// Drives one routine through its phases: ready → countdown → calibration →
// tracking → done. Plain TypeScript, no React, so it can run in the Node
// simulation. The routine screen calls onFrame() every frame and renders snapshot().

import { JOINT_NAMES, visible, type PoseFrame } from "./pose";
import { createRoutine } from "./routines/index";
import type { LiveView, Progress, Routine, RoutineEvent, RoutineId, Summary } from "./routines/types";
import type { Settings } from "./settings";

export type Phase = "ready" | "countdown" | "calibrating" | "tracking" | "done";
export type RunnerEvent = RoutineEvent | "complete";

export const CANT_SEE = "I can't see your whole body. Step back so your feet are in view.";

export interface JointStatus {
  id: number;
  name: string;
  ok: boolean;
  optional: boolean;
}

/** Missing joints as a phrase, e.g. "knees or left ankle" (both sides of a joint become a plural). */
export function missingPhrase(missing: string[], joiner = "or"): string {
  const counts = new Map<string, number>();
  for (const n of missing) {
    const g = n.replace(/^(left|right) /i, "").toLowerCase();
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const plural = (g: string) => (g === "foot" ? "feet" : `${g}s`);
  const groups = [...counts].map(([g, n]) => (n > 1 ? plural(g) : g));
  return groups.length > 1 ? `${groups.slice(0, -1).join(", ")} ${joiner} ${groups.at(-1)}` : (groups[0] ?? "");
}

/** "I can't see your knees…" naming the missing joint groups, so people know what to fix. */
export function cantSeeMessage(missing: string[]): string {
  if (!missing.length) return CANT_SEE;
  const low = missing.some((g) => /knee|ankle|heel|foot|hip/i.test(g));
  return `I can't see your ${missingPhrase(missing)}. ${low ? "Step back, or place the camera lower." : "Step back a little."}`;
}

export interface RunnerView {
  phase: Phase;
  countdown: number;
  calibration: { prompt: string; step: number; steps: number; stage: "prep" | "sampling"; remaining: number } | null;
  inView: boolean;
  /** Required (and optional) joints with live visibility, for the framing check. */
  joints: JointStatus[];
  /** Mid-rep or mid-hold, so auto-framing holds its zoom. */
  inRep: boolean;
  feedback: string;
  progress: Progress;
  live: LiveView;
  debug: Record<string, string | number>;
}

export class RoutineRunner {
  routine: Routine;
  phase: Phase = "ready";
  private phaseStart = 0;
  private calStep = 0;
  private calSampledMs = 0;
  private calLastT: number | null = null;
  private samples: PoseFrame[][] = [];
  private inView = false;
  private lastFrame: PoseFrame | null = null;
  private now = 0;
  private trackingStart = 0;
  finishedAt = 0;
  startedAtIso = "";

  private id: RoutineId;
  private settings: Settings;

  constructor(id: RoutineId, settings: Settings) {
    this.id = id;
    this.settings = settings;
    this.routine = createRoutine(id, settings);
  }

  start(t: number) {
    this.routine = createRoutine(this.id, this.settings);
    this.phase = "countdown";
    this.phaseStart = t;
    this.samples = [];
    this.calStep = 0;
    this.startedAtIso = new Date().toISOString();
  }

  stop() {
    this.phase = "ready";
  }

  get durationMs() {
    return (this.phase === "done" ? this.finishedAt : this.now) - this.trackingStart;
  }

  /** `frame` is null when no person is detected. Returns sounds to play. */
  onFrame(frame: PoseFrame | null, t: number): RunnerEvent[] {
    this.now = t;
    const info = this.routine.info;
    this.lastFrame = frame;
    this.inView = !!frame && visible(frame, info.required);
    const usable = this.inView ? frame : null;
    const flow = this.settings.flow;

    if (this.phase === "countdown" && t - this.phaseStart >= flow.countdownMs) {
      this.phase = info.calibration.length ? "calibrating" : "tracking";
      this.phaseStart = t;
      this.calLastT = null;
      this.calSampledMs = 0;
      if (this.phase === "tracking") this.beginTracking(t);
    }

    if (this.phase === "calibrating") {
      const dt = this.calLastT === null ? 0 : t - this.calLastT;
      this.calLastT = t;
      if (t - this.phaseStart >= flow.calibrationPrepMs && usable) {
        // Sample only while visible, so the step waits for the person.
        (this.samples[this.calStep] ??= []).push(usable);
        this.calSampledMs += dt;
      }
      if (this.calSampledMs >= flow.calibrationSampleMs) {
        this.calStep++;
        this.phaseStart = t;
        this.calSampledMs = 0;
        if (this.calStep >= info.calibration.length) {
          this.routine.calibrate(this.samples);
          this.phase = "tracking";
          this.beginTracking(t);
        }
      }
    }

    if (this.phase === "tracking") {
      this.routine.update(usable, t);
      const events: RunnerEvent[] = this.routine.drainEvents();
      if (this.routine.isComplete()) {
        this.phase = "done";
        this.finishedAt = t;
        events.push("complete");
      }
      return events;
    }
    return [];
  }

  private beginTracking(t: number) {
    this.trackingStart = t;
    this.routine.drainEvents();
  }

  summary(): Summary {
    return this.routine.getSummary();
  }

  snapshot(): RunnerView {
    const t = this.now;
    const info = this.routine.info;
    const flow = this.settings.flow;
    let calibration: RunnerView["calibration"] = null;
    if (this.phase === "calibrating") {
      const prep = t - this.phaseStart < flow.calibrationPrepMs;
      calibration = {
        prompt: info.calibration[this.calStep]?.prompt ?? "",
        step: this.calStep + 1,
        steps: info.calibration.length,
        stage: prep ? "prep" : "sampling",
        remaining: prep
          ? (flow.calibrationPrepMs - (t - this.phaseStart)) / 1000
          : (flow.calibrationSampleMs - this.calSampledMs) / 1000,
      };
    }
    const tracking = this.phase === "tracking";
    const f = this.lastFrame;
    const joint = (id: number, optional: boolean): JointStatus => ({
      id,
      name: JOINT_NAMES[id] ?? `Point ${id}`,
      ok: !!f && visible(f, [id]),
      optional,
    });
    const joints = [...info.required.map((id) => joint(id, false)), ...(info.optional ?? []).map((id) => joint(id, true))];
    const missing = joints.filter((j) => !j.ok && !j.optional).map((j) => j.name);
    return {
      phase: this.phase,
      countdown: Math.max(1, Math.ceil((flow.countdownMs - (t - this.phaseStart)) / 1000)),
      calibration,
      inView: this.inView,
      joints,
      inRep: tracking && this.routine.inRep(),
      feedback:
        (tracking || this.phase === "calibrating") && !this.inView
          ? (info.lostMessage ?? cantSeeMessage(missing))
          : tracking
            ? this.routine.getFeedback(t)
            : "",
      progress: this.routine.getProgress(),
      live: tracking ? this.routine.getLive(t) : {},
      debug: { phase: this.phase, "in view": String(this.inView), ...this.routine.getDebug() },
    };
  }
}
