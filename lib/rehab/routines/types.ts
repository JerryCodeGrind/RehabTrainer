import type { PoseFrame } from "../pose";
import type { Settings } from "../settings";

export type RoutineId =
  | "sitToStand"
  | "marching"
  | "walk"
  | "singleLeg"
  | "stretches"
  | "kneeExtension"
  | "heelRaise"
  | "sideBend"
  | "lateralRaise"
  | "bicepCurl"
  | "overheadPress"
  | "armOpeners"
  | "wallPushup";
/** Where on the body a routine mostly works; groups the exercise list. */
export type Area = "legs" | "core and balance" | "upper body";
export type Goal = "Strength" | "Mobility" | "Endurance" | "Balance" | "Flexibility";

export interface CalibrationStep {
  /** Shown while the user gets into position and while sampling. */
  prompt: string;
}

/** Static description of a routine, used by the screens before it starts. */
export interface RoutineInfo {
  id: RoutineId;
  name: string;
  goal: Goal;
  area: Area;
  /** e.g. "10 reps" or "3 holds per leg, 10 s each". */
  target: string;
  instructions: string[];
  safety: string;
  /** Landmarks that must be visible for the routine to count anything. */
  required: readonly number[];
  calibration: CalibrationStep[];
  /** Used when visible but not needed, e.g. ankles for single-leg stance. */
  optional?: readonly number[];
  /** Replaces the default "I can't see your …" message. */
  lostMessage?: string;
  /** Auto-framing must show the whole camera frame (the walk measures how small you get). */
  fullFrame?: boolean;
  /** Extra note shown on the routine screen, e.g. hip precautions. */
  note?: string;
}

export interface Progress {
  done: number;
  target: number;
  /** Big counter text, e.g. "3 / 10". */
  label: string;
  /** Optional small line under the counter, e.g. "Left 4 · Right 5". */
  detail?: string;
}

/** Routine-specific live visuals, rendered generically by the routine screen. */
export interface LiveView {
  bars?: { label: string; value: number; target: number }[];
  timer?: { label: string; seconds: number; target: number };
  sway?: { value: number; label: string; level: 0 | 1 | 2 };
}

export interface Metric {
  label: string;
  value: string;
}

export interface Summary {
  reps: number;
  target: number;
  metrics: Metric[];
  /** Raw numbers, saved with the session for later analysis. */
  data: Record<string, unknown>;
}

/** Sounds the screen should play: a rep/hold counted, or the walk's far-point beep. */
export type RoutineEvent = "rep" | "beep";

/** Shared interface every routine implements. */
export interface Routine {
  readonly info: RoutineInfo;
  /** Finalize calibration from the frames sampled during each calibration step. */
  calibrate(samples: PoseFrame[][]): void;
  /** Called every frame while tracking. `frame` is null when the required
   * landmarks aren't visible, so counting should pause. */
  update(frame: PoseFrame | null, t: number): void;
  isComplete(): boolean;
  /** True mid-rep or mid-hold, so auto-framing keeps the zoom steady. */
  inRep(): boolean;
  getProgress(): Progress;
  getFeedback(t: number): string;
  getLive(t: number): LiveView;
  getSummary(): Summary;
  /** Raw measurements and state for the on-screen debug panel. */
  getDebug(): Record<string, string | number>;
  /** Events since the last call. */
  drainEvents(): RoutineEvent[];
}

export type RoutineFactory = (settings: Settings) => Routine;

/** Helpers shared by the routine classes. */
export abstract class BaseRoutine implements Routine {
  abstract readonly info: RoutineInfo;
  private events: RoutineEvent[] = [];
  private message: { text: string; until: number } | null = null;

  protected messageMs: number;

  constructor(messageMs: number) {
    this.messageMs = messageMs;
  }

  calibrate(samples: PoseFrame[][]): void {
    void samples;
  }
  abstract update(frame: PoseFrame | null, t: number): void;
  abstract isComplete(): boolean;
  abstract getProgress(): Progress;
  abstract getSummary(): Summary;
  abstract getDebug(): Record<string, string | number>;
  /** Feedback when no one-off message is showing. */
  protected abstract statusMessage(t: number): string;

  getLive(t: number): LiveView {
    void t;
    return {};
  }

  inRep(): boolean {
    return false;
  }

  getFeedback(t: number): string {
    if (this.message && t < this.message.until) return this.message.text;
    return this.statusMessage(t);
  }

  /** True while a one-off message is on screen. */
  protected showing(t: number): boolean {
    return !!this.message && t < this.message.until;
  }

  /** Show a one-off message for a few seconds. */
  protected say(text: string, t: number, ms = this.messageMs) {
    this.message = { text, until: t + ms };
  }

  protected emit(e: RoutineEvent) {
    this.events.push(e);
  }

  drainEvents(): RoutineEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export function sec(ms: number, digits = 1): string {
  return `${(ms / 1000).toFixed(digits)} s`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
