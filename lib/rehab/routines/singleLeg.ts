import { Ema, hipMid, LM, stdDev, TORSO, visible, type PoseFrame, type Side } from "../pose";
import type { Settings } from "../settings";
import { BaseRoutine, sec, type RoutineInfo } from "./types";

type Phase = "ready" | "holding" | "waitDown";

interface SideStats {
  holds: number;
  longestMs: number;
  /** Sway (std dev of hip-midpoint X / torso) for each completed hold. */
  sway: number[];
}

const LABEL: Record<Side, string> = { left: "left", right: "right" };
const TITLE: Record<Side, string> = { left: "Left", right: "Right" };
const ANKLES = [LM.leftAnkle, LM.rightAnkle];

export class SingleLegStance extends BaseRoutine {
  readonly info: RoutineInfo;
  private cfg: Settings["singleLeg"];
  // Separate smoothing per measurement, since ankle and knee gaps differ in size.
  private diff: { ankles: Ema; knees: Ema };
  private source: "ankles" | "knees" = "ankles";
  private lifted: Side | null = null;
  private side: Side = "left";
  private phase: Phase = "ready";
  private holdStart = 0;
  private samples: { t: number; x: number }[] = [];
  private stats: Record<Side, SideStats> = {
    left: { holds: 0, longestMs: 0, sway: [] },
    right: { holds: 0, longestMs: 0, sway: [] },
  };
  private now = 0;

  constructor(s: Settings) {
    super(s.flow.messageMs);
    this.cfg = s.singleLeg;
    this.diff = { ankles: new Ema(this.cfg.smoothing), knees: new Ema(this.cfg.smoothing) };
    this.info = {
      id: "singleLeg",
      name: "Single-leg stance",
      goal: "Balance",
      area: "core and balance",
      target: `${this.cfg.holdsPerSide} holds per leg, ${this.cfg.holdSec} s each`,
      instructions: [
        "Stand facing the camera next to a counter, resting one hand on it. Feet in view works best; knees are enough.",
        "Lift your left foot a little off the floor and hold as still as you can.",
        "Put it down when the timer finishes. Then do the same with your right foot.",
      ],
      safety: "Keep a hand on the counter the whole time. A small lift is enough.",
      // Ankles are preferred; without them a lifted leg is detected from knee height.
      required: [...TORSO, LM.leftKnee, LM.rightKnee],
      optional: ANKLES,
      calibration: [],
    };
  }

  update(frame: PoseFrame | null, t: number) {
    this.now = t;
    if (!frame?.torso) {
      // Can't tell if the foot is still up: end the attempt without blaming the user.
      if (this.phase === "holding") this.endAttempt(t, "I lost sight of your feet. Try again when ready");
      this.lifted = null;
      return;
    }

    // Positive when the left ankle (or knee) is higher (smaller y) than the right.
    const ankles = visible(frame, ANKLES);
    const source = ankles ? "ankles" : "knees";
    if (source !== this.source) this.diff[source].reset();
    this.source = source;
    const [l, r] = ankles ? [LM.leftAnkle, LM.rightAnkle] : [LM.leftKnee, LM.rightKnee];
    const d = this.diff[source].update((frame.lm[r].y - frame.lm[l].y) / frame.torso);
    const lift = ankles ? this.cfg.liftThreshold : this.cfg.kneeLiftThreshold;
    const drop = ankles ? this.cfg.dropThreshold : this.cfg.kneeDropThreshold;
    if (this.lifted === null) {
      if (d > lift) this.lifted = "left";
      else if (d < -lift) this.lifted = "right";
    } else if ((this.lifted === "left" ? d : -d) < drop) {
      this.lifted = null;
    }

    if (this.phase === "waitDown") {
      if (this.lifted === null) this.phase = "ready";
      return;
    }
    if (this.phase === "ready") {
      if (this.lifted === this.side) {
        this.phase = "holding";
        this.holdStart = t;
        this.samples = [];
      }
      return;
    }

    // Holding.
    if (this.lifted !== this.side) {
      this.endAttempt(t, "Foot down. Try again when ready");
      return;
    }
    this.samples.push({ t, x: hipMid(frame).x / frame.torso });
    if (t - this.holdStart >= this.cfg.holdSec * 1000) this.completeHold(t);
  }

  private endAttempt(t: number, message: string) {
    const s = this.stats[this.side];
    s.longestMs = Math.max(s.longestMs, t - this.holdStart);
    this.phase = "ready";
    this.say(message, t);
  }

  private completeHold(t: number) {
    const s = this.stats[this.side];
    s.holds++;
    s.longestMs = Math.max(s.longestMs, t - this.holdStart);
    s.sway.push(stdDev(this.samples.map((p) => p.x)));
    this.phase = "waitDown";
    this.emit("rep");
    if (s.holds >= this.cfg.holdsPerSide && this.side === "left") {
      this.side = "right";
      this.say("Left side done! Put your foot down. Now lift your right foot", t, 5000);
    } else if (!this.isComplete()) {
      this.say("Great hold! Put your foot down and rest a moment", t);
    }
  }

  protected statusMessage() {
    if (this.phase === "holding") return `Hold it… keep your ${LABEL[this.side]} foot up`;
    if (this.phase === "waitDown") return "Put your foot down";
    if (this.lifted && this.lifted !== this.side)
      return `That's your ${LABEL[this.lifted]} foot. Lift your ${LABEL[this.side]} foot`;
    return `Lift your ${LABEL[this.side]} foot`;
  }

  inRep() {
    return this.phase === "holding";
  }

  isComplete() {
    return this.stats.left.holds >= this.cfg.holdsPerSide && this.stats.right.holds >= this.cfg.holdsPerSide;
  }

  getProgress() {
    const n = this.cfg.holdsPerSide;
    const { left: l, right: r } = this.stats;
    return { done: l.holds + r.holds, target: 2 * n, label: `${l.holds + r.holds} / ${2 * n}`, detail: `Left ${l.holds} / ${n} · Right ${r.holds} / ${n} holds` };
  }

  private liveSway(t: number): number {
    return stdDev(this.samples.filter((p) => t - p.t <= this.cfg.swayWindowMs).map((p) => p.x));
  }

  getLive(t: number) {
    if (this.phase !== "holding") {
      return { timer: { label: `${TITLE[this.side]} foot hold`, seconds: 0, target: this.cfg.holdSec } };
    }
    const sway = this.liveSway(t);
    const level = sway > this.cfg.swayHigh ? 2 : sway > this.cfg.swaySome ? 1 : 0;
    return {
      timer: { label: `${TITLE[this.side]} foot hold`, seconds: (t - this.holdStart) / 1000, target: this.cfg.holdSec },
      sway: { value: Math.min(1, sway / (this.cfg.swayHigh * 1.5)), label: ["Steady", "A little sway", "Lots of sway"][level], level: level as 0 | 1 | 2 },
    };
  }

  getSummary() {
    const { left: l, right: r } = this.stats;
    const avgSway = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : "–");
    return {
      reps: l.holds + r.holds,
      target: 2 * this.cfg.holdsPerSide,
      metrics: [
        { label: "Holds (left / right)", value: `${l.holds} / ${r.holds}` },
        { label: "Longest hold, left", value: sec(l.longestMs) },
        { label: "Longest hold, right", value: sec(r.longestMs) },
        { label: "Average sway, left (lower is steadier)", value: avgSway(l.sway) },
        { label: "Average sway, right (lower is steadier)", value: avgSway(r.sway) },
      ],
      data: { left: l, right: r },
    };
  }

  getDebug() {
    return {
      phase: this.phase,
      side: this.side,
      "lift measured by": this.source,
      "height diff / torso (+ = left up)": this.diff[this.source].value?.toFixed(3) ?? "–",
      lifted: this.lifted ?? "none",
      "live sway": this.phase === "holding" ? this.liveSway(this.now).toFixed(4) : "–",
    };
  }
}
