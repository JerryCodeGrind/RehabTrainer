import { dist, Ema, LM, median, midpoint, TORSO, visible, type PoseFrame } from "../pose";
import type { Settings } from "../settings";
import { BaseRoutine, sec, type RoutineInfo } from "./types";

const ANKLES = [LM.leftAnkle, LM.rightAnkle];

/** Apparent body sizes in this frame: torso length, and shoulder-to-ankle
 * height when the ankles are visible too. Both shrink as the person walks away. */
function sizes(f: PoseFrame): { torso: number | null; height: number | null } {
  if (!f.torso) return { torso: null, height: null };
  const height = visible(f, ANKLES)
    ? dist(midpoint(f.lm[LM.leftShoulder], f.lm[LM.rightShoulder]), midpoint(f.lm[LM.leftAnkle], f.lm[LM.rightAnkle]))
    : null;
  return { torso: f.torso, height };
}

export class WalkOutAndBack extends BaseRoutine {
  readonly info: RoutineInfo;
  private cfg: Settings["walk"];
  private baseTorso: number | null = null;
  private baseHeight: number | null = null;
  private ratio: Ema;
  private source = "–";
  private state: "near" | "far" = "near";
  private lapStart: number | null = null;
  private laps: number[] = [];
  private lastSeen: number | null = null;
  private lost = false;
  private pausedMs = 0;
  private pausedSince: number | null = null;

  constructor(s: Settings) {
    super(s.flow.messageMs);
    this.cfg = s.walk;
    this.ratio = new Ema(this.cfg.smoothing);
    this.info = {
      id: "walk",
      name: "Walk out and back",
      goal: "Endurance",
      area: "legs",
      target: `${this.cfg.targetLaps} laps`,
      instructions: [
        "Clear a straight path in front of the camera, at least 4 big steps long.",
        "Start close to the camera, facing it, with your whole body in view.",
        "Walk straight away from the camera. When you hear the beep, turn around carefully.",
        "Walk back to where you started. Go at your own comfortable pace.",
      ],
      safety: "Use your walking aid if you have one. Move rugs and cords out of the way. Turn slowly.",
      required: TORSO,
      calibration: [{ prompt: "Stand here facing the camera" }],
      fullFrame: true,
      lostMessage: "I can't see you right now. Keep walking and come back into view.",
    };
  }

  calibrate(samples: PoseFrame[][]) {
    const s = (samples[0] ?? []).map(sizes);
    const torsos = s.map((x) => x.torso).filter((v): v is number => v !== null);
    const heights = s.map((x) => x.height).filter((v): v is number => v !== null);
    if (torsos.length) this.baseTorso = median(torsos);
    // Only use full height if the ankles were visible for most of calibration.
    if (heights.length > s.length / 2) this.baseHeight = median(heights);
  }

  update(frame: PoseFrame | null, t: number) {
    if (this.lapStart === null) this.lapStart = t;
    const size = frame ? sizes(frame) : null;
    if (!size?.torso) {
      this.lastSeen ??= t;
      if (!this.lost && t - this.lastSeen > this.cfg.lostTimeoutMs) {
        this.lost = true;
        // Exclude the whole time out of view, not just the part after the timeout.
        this.pausedSince = this.lastSeen;
      }
      return;
    }
    if (this.lost && this.pausedSince !== null) {
      this.pausedMs += t - this.pausedSince;
      this.say("There you are! Carry on walking", t);
    }
    this.lost = false;
    this.pausedSince = null;
    this.lastSeen = t;

    // Compare like with like: full height against its own baseline when we
    // have both, otherwise torso against torso.
    let r: number;
    if (size.height && this.baseHeight) {
      r = size.height / this.baseHeight;
      this.source = "height";
    } else {
      this.baseTorso ??= size.torso;
      r = size.torso / this.baseTorso;
      this.source = "torso";
    }
    const ratio = this.ratio.update(r);

    if (this.state === "near" && ratio < this.cfg.farRatio) {
      this.state = "far";
      this.emit("beep");
      this.say("Turn around and come back", t);
    } else if (this.state === "far" && ratio > this.cfg.backRatio) {
      this.state = "near";
      this.laps.push(t - this.lapStart - this.pausedMs);
      this.lapStart = t;
      this.pausedMs = 0;
      this.emit("rep");
      this.say(this.isComplete() ? "All laps done!" : `Lap ${this.laps.length} done. Walk away again when ready`, t);
    }
  }

  protected statusMessage() {
    if (this.lost) return "I've lost sight of you. Come back into view so I can see you.";
    return this.state === "near" ? "Walk straight away from the camera" : "Walk back toward the camera";
  }

  isComplete() {
    return this.laps.length >= this.cfg.targetLaps;
  }

  getProgress() {
    return { done: this.laps.length, target: this.cfg.targetLaps, label: `${this.laps.length} / ${this.cfg.targetLaps}`, detail: "laps" };
  }

  getLive() {
    // Distance indicator only, with no timer, so speed isn't encouraged.
    const r = this.ratio.value ?? 1;
    const away = Math.min(1, Math.max(0, (1 - r) / (1 - this.cfg.farRatio)));
    return { bars: [{ label: this.state === "near" ? "Distance out" : "Coming back", value: away, target: 1 }] };
  }

  getSummary() {
    const total = this.laps.reduce((s, x) => s + x, 0);
    return {
      reps: this.laps.length,
      target: this.cfg.targetLaps,
      metrics: [
        ...this.laps.map((ms, i) => ({ label: `Lap ${i + 1}`, value: sec(ms) })),
        { label: "Total walking time", value: sec(total) },
        { label: "Fastest lap", value: this.laps.length ? sec(Math.min(...this.laps)) : "–" },
      ],
      data: { lapsMs: this.laps, totalMs: total, baseTorso: this.baseTorso, baseHeight: this.baseHeight },
    };
  }

  getDebug() {
    return {
      state: this.state,
      "size ratio": this.ratio.value?.toFixed(3) ?? "–",
      "size source": this.source,
      "base torso": this.baseTorso?.toFixed(3) ?? "–",
      "base height": this.baseHeight?.toFixed(3) ?? "–",
      lost: String(this.lost),
    };
  }
}
