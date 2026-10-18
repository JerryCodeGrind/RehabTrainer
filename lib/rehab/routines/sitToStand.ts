import { clamp, Ema, LM, mean, median, TORSO, type PoseFrame } from "../pose";
import type { Settings } from "../settings";
import { BaseRoutine, sec, type RoutineInfo } from "./types";

type State = "start" | "down" | "up";

/** Average over both legs of (kneeY - hipY) / torsoLength. Small when seated
 * (thighs point at the camera), close to 1 when standing. */
function thighDrop(f: PoseFrame): number | null {
  if (!f.torso) return null;
  const l = f.lm[LM.leftKnee].y - f.lm[LM.leftHip].y;
  const r = f.lm[LM.rightKnee].y - f.lm[LM.rightHip].y;
  return (l + r) / 2 / f.torso;
}

export class SitToStand extends BaseRoutine {
  readonly info: RoutineInfo;
  private cfg: Settings["sitToStand"];
  private seated: number;
  private standing: number;
  private calibrated = false;
  private value: Ema;
  private raw: number | null = null;
  // "start" waits for the first sit, so the user isn't counted for sitting
  // down after the standing calibration.
  private state: State = "start";
  private reps = 0;
  private leftTopAt: number | null = null;
  private descents: number[] = [];
  private fastDescents = 0;

  constructor(s: Settings) {
    super(s.flow.messageMs);
    this.cfg = s.sitToStand;
    this.seated = this.cfg.defaultSeated;
    this.standing = this.cfg.defaultStanding;
    this.value = new Ema(this.cfg.smoothing);
    this.info = {
      id: "sitToStand",
      name: "Sit-to-stand",
      goal: "Strength",
      area: "legs",
      target: `${this.cfg.targetReps} reps`,
      instructions: [
        "Sit on a sturdy chair with arms, facing the camera, feet flat. Your hips and knees need to be in view; your feet don't.",
        "Lean forward slightly and push through your legs to stand up tall.",
        "Sit back down slowly, with control.",
        "Use the chair arms if you need to.",
      ],
      safety: "Put the chair against a wall so it can't slide. Stop if you feel dizzy or have sharp pain.",
      required: [...TORSO, LM.leftKnee, LM.rightKnee],
      calibration: [{ prompt: "Sit down and hold still" }, { prompt: "Stand up tall and hold still" }],
    };
  }

  calibrate(samples: PoseFrame[][]) {
    const avg = (frames: PoseFrame[] = []) =>
      median(frames.map(thighDrop).filter((v): v is number => v !== null));
    const seated = avg(samples[0]);
    const standing = avg(samples[1]);
    if (samples[0]?.length && samples[1]?.length && standing - seated >= this.cfg.minCalibrationRange) {
      this.seated = seated;
      this.standing = standing;
      this.calibrated = true;
    }
  }

  update(frame: PoseFrame | null, t: number) {
    const drop = frame ? thighDrop(frame) : null;
    if (drop === null) {
      // Lost sight mid-descent: don't time a sit-down we didn't fully see.
      this.leftTopAt = null;
      return;
    }
    this.raw = drop;
    const v = this.value.update(clamp((drop - this.seated) / (this.standing - this.seated), -0.2, 1.2));
    const { upThreshold: up, downThreshold: down } = this.cfg;

    if (this.state === "start") {
      if (v < down) this.state = "down";
    } else if (this.state === "down") {
      if (v > up) this.state = "up";
    } else {
      // "up": time the sit-down from leaving the top threshold.
      if (v > up) this.leftTopAt = null;
      else if (this.leftTopAt === null) this.leftTopAt = t;
      if (v < down) {
        this.state = "down";
        this.reps++;
        this.emit("rep");
        if (this.leftTopAt !== null) {
          const descent = (t - this.leftTopAt) / 1000;
          this.descents.push(descent);
          if (descent < this.cfg.minDescentSec) {
            this.fastDescents++;
            this.say("Sit down slowly, with control", t);
          } else {
            this.say(`Nice and controlled. ${this.reps} done!`, t);
          }
        }
        this.leftTopAt = null;
      }
    }
  }

  protected statusMessage() {
    if (this.state === "start") return "Sit down to begin";
    if (this.state === "down") return "Stand up tall";
    return "Now sit down slowly";
  }

  inRep() {
    return this.state === "up";
  }

  isComplete() {
    return this.reps >= this.cfg.targetReps;
  }

  getProgress() {
    return { done: this.reps, target: this.cfg.targetReps, label: `${this.reps} / ${this.cfg.targetReps}` };
  }

  getLive() {
    return {
      bars: [{ label: "Sit → Stand", value: clamp(this.value.value ?? 0, 0, 1), target: this.cfg.upThreshold }],
    };
  }

  getSummary() {
    const avg = mean(this.descents);
    return {
      reps: this.reps,
      target: this.cfg.targetReps,
      metrics: [
        { label: "Average sit-down time", value: this.descents.length ? sec(avg * 1000) : "–" },
        { label: "Fast sit-downs (under " + this.cfg.minDescentSec + " s)", value: String(this.fastDescents) },
      ],
      data: { descentsSec: this.descents, avgDescentSec: avg, seated: this.seated, standing: this.standing, calibrated: this.calibrated },
    };
  }

  getDebug() {
    return {
      state: this.state,
      "raw (knee-hip)/torso": this.raw?.toFixed(3) ?? "–",
      "normalized 0..1": this.value.value?.toFixed(3) ?? "–",
      seated: this.seated.toFixed(3),
      standing: this.standing.toFixed(3),
      calibrated: String(this.calibrated),
      "descent timer": this.leftTopAt === null ? "–" : "running",
    };
  }
}
