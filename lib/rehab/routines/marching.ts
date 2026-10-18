import { clamp, Ema, leg, LM, mean, median, TORSO, type PoseFrame, type Side } from "../pose";
import type { Settings } from "../settings";
import { BaseRoutine, pct, type RoutineInfo } from "./types";

/** (hipY - kneeY) / torsoLength for one side. Negative when the knee is below
 * the hip (resting is about -0.8 to -1); 0 when the knee is level with the hip. */
function kneeHeight(f: PoseFrame, side: Side): number | null {
  if (!f.torso) return null;
  const l = leg(side);
  return (f.lm[l.hip].y - f.lm[l.knee].y) / f.torso;
}

interface SideState {
  rest: number;
  height: Ema;
  progress: number;
  up: boolean;
  peak: number;
  peaks: number[];
}

const DEFAULT_REST = -0.85;

export class Marching extends BaseRoutine {
  readonly info: RoutineInfo;
  private cfg: Settings["marching"];
  private sides: Record<Side, SideState>;

  constructor(s: Settings) {
    super(s.flow.messageMs);
    this.cfg = s.marching;
    const side = (): SideState => ({ rest: DEFAULT_REST, height: new Ema(this.cfg.smoothing), progress: 0, up: false, peak: 0, peaks: [] });
    this.sides = { left: side(), right: side() };
    this.info = {
      id: "marching",
      name: "Marching in place",
      goal: "Mobility",
      area: "legs",
      target: `${this.cfg.targetLiftsPerSide} lifts per leg`,
      instructions: [
        "Stand facing the camera next to a counter or sturdy chair, holding on with one hand. Only your knees need to be in view, not your feet.",
        "Lift one knee up toward hip height, then put the foot down gently.",
        "Switch legs and keep a slow, steady rhythm.",
      ],
      safety: "Always hold on to support. Lift only as high as is comfortable.",
      required: [...TORSO, LM.leftKnee, LM.rightKnee],
      calibration: [{ prompt: "Stand still on both feet" }],
    };
  }

  calibrate(samples: PoseFrame[][]) {
    for (const side of ["left", "right"] as const) {
      const hs = (samples[0] ?? []).map((f) => kneeHeight(f, side)).filter((v): v is number => v !== null);
      // Ignore implausible values (knee already raised during calibration).
      if (hs.length && median(hs) < -0.3) this.sides[side].rest = median(hs);
    }
  }

  update(frame: PoseFrame | null, t: number) {
    if (!frame) return;
    for (const side of ["left", "right"] as const) {
      const s = this.sides[side];
      const h = kneeHeight(frame, side);
      if (h === null) continue;
      // Fraction of the way from resting height (0) to hip height (1).
      s.progress = 1 - s.height.update(h) / s.rest;
      if (!s.up && s.progress > this.cfg.liftFraction) {
        s.up = true;
        s.peak = s.progress;
      } else if (s.up) {
        s.peak = Math.max(s.peak, s.progress);
        if (s.progress < this.cfg.returnFraction) {
          s.up = false;
          if (s.peaks.length < this.cfg.targetLiftsPerSide) {
            s.peaks.push(s.peak);
            this.emit("rep");
            this.afterLift(side, t);
          }
        }
      }
    }
  }

  private afterLift(side: Side, t: number) {
    const target = this.cfg.targetLiftsPerSide;
    const l = this.sides.left.peaks;
    const r = this.sides.right.peaks;
    if (l.length >= target && r.length < target) return this.say("Left leg done. Keep going with your right knee", t);
    if (r.length >= target && l.length < target) return this.say("Right leg done. Keep going with your left knee", t);
    if (l.length >= 2 && r.length >= 2) {
      const gap = mean(l) - mean(r);
      if (gap > this.cfg.imbalanceWarning) return this.say("Try lifting your right knee a little higher", t);
      if (-gap > this.cfg.imbalanceWarning) return this.say("Try lifting your left knee a little higher", t);
    }
    this.say(`Good ${side} lift: ${pct(this.sides[side].peak)} of hip height`, t);
  }

  protected statusMessage() {
    const l = this.sides.left;
    const r = this.sides.right;
    if (l.up || r.up) return "Now lower your foot gently";
    if (l.peaks.length < r.peaks.length) return "Lift your left knee";
    if (r.peaks.length < l.peaks.length) return "Lift your right knee";
    return "Lift one knee toward hip height";
  }

  inRep() {
    return this.sides.left.up || this.sides.right.up;
  }

  isComplete() {
    const t = this.cfg.targetLiftsPerSide;
    return this.sides.left.peaks.length >= t && this.sides.right.peaks.length >= t;
  }

  getProgress() {
    const t = this.cfg.targetLiftsPerSide;
    const l = this.sides.left.peaks.length;
    const r = this.sides.right.peaks.length;
    return { done: l + r, target: 2 * t, label: `${l + r} / ${2 * t}`, detail: `Left ${l} / ${t} · Right ${r} / ${t}` };
  }

  getLive() {
    // Bars run from resting (0) to hip height (1), with the lift threshold as the target line.
    return {
      bars: (["left", "right"] as const).map((side) => ({
        label: side === "left" ? "Left knee" : "Right knee",
        value: clamp(this.sides[side].progress, 0, 1),
        target: this.cfg.liftFraction,
      })),
    };
  }

  getSummary() {
    const l = this.sides.left.peaks;
    const r = this.sides.right.peaks;
    const avg = (xs: number[]) => (xs.length ? pct(mean(xs)) : "–");
    const gap = mean(l) - mean(r);
    const comparison =
      !l.length || !r.length
        ? "–"
        : Math.abs(gap) < 0.05
          ? "Even on both sides"
          : `${gap > 0 ? "Left" : "Right"} higher by ${pct(Math.abs(gap))}`;
    return {
      reps: l.length + r.length,
      target: 2 * this.cfg.targetLiftsPerSide,
      metrics: [
        { label: "Lifts (left / right)", value: `${l.length} / ${r.length}` },
        { label: "Average knee height, left", value: avg(l) },
        { label: "Average knee height, right", value: avg(r) },
        { label: "Left vs. right", value: comparison },
        { label: "Highest lift", value: l.length || r.length ? pct(Math.max(...l, ...r)) : "–" },
      ],
      data: { peaksLeft: l, peaksRight: r, restLeft: this.sides.left.rest, restRight: this.sides.right.rest },
    };
  }

  getDebug() {
    const d: Record<string, string | number> = {};
    for (const side of ["left", "right"] as const) {
      const s = this.sides[side];
      d[`${side} (hip-knee)/torso`] = s.height.value?.toFixed(3) ?? "–";
      d[`${side} rest`] = s.rest.toFixed(3);
      d[`${side} progress`] = s.progress.toFixed(2);
      d[`${side} state`] = s.up ? "up" : "down";
    }
    return d;
  }
}
