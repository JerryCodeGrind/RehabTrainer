import { ARMS, arm, dist, jointAngle, median, TORSO, type PoseFrame, type Side } from "../pose";
import type { Settings } from "../settings";
import { RepRoutine, sides } from "./reps";
import type { RoutineInfo } from "./types";

/** (shoulderY - wristY) / torso: how far the wrist is above the shoulder. */
function wristAbove(f: PoseFrame, side: Side): number | null {
  if (!f.torso) return null;
  const a = arm(side);
  return (f.lm[a.shoulder].y - f.lm[a.wrist].y) / f.torso;
}

/** Overhead press: from hands by the shoulders, push straight up until the arms are straight. Counted per arm. */
export class OverheadPress extends RepRoutine {
  readonly info: RoutineInfo;
  protected readonly cues = { up: "Push your hands straight up", down: "Bring your hands back to your shoulders" };
  private cfg: Settings["overheadPress"];
  private start: Record<Side, number>;
  private top: Record<Side, number>;

  constructor(s: Settings) {
    super(s.flow.messageMs, s.overheadPress, sides("arm"), s.overheadPress.targetPerSide);
    this.cfg = s.overheadPress;
    this.start = { left: this.cfg.defaultStart, right: this.cfg.defaultStart };
    this.top = { left: this.cfg.defaultTop, right: this.cfg.defaultTop };
    this.info = {
      id: "overheadPress",
      name: "Overhead press",
      goal: "Strength",
      area: "upper body",
      target: `${this.cfg.targetPerSide} per arm`,
      instructions: [
        "Sit tall facing the camera with your hands up by your shoulders, elbows bent and out to the sides.",
        "Push both hands straight up until your arms are straight above your head.",
        "Bring them back down to your shoulders slowly.",
      ],
      safety: "Skip this after shoulder surgery unless your care team has cleared it. Don't arch your back.",
      required: [...TORSO, ...ARMS],
      calibration: [{ prompt: "Hands up by your shoulders, elbows bent" }],
    };
  }

  calibrate(samples: PoseFrame[][]) {
    for (const side of ["left", "right"] as const) {
      const frames = (samples[0] ?? []).filter((f) => f.torso);
      const h = frames.map((f) => wristAbove(f, side)).filter((x): x is number => x !== null);
      const a = arm(side);
      // Arm length from the bent-arm start: upper arm plus forearm.
      const len = frames.map((f) => (dist(f.lm[a.shoulder], f.lm[a.elbow]) + dist(f.lm[a.elbow], f.lm[a.wrist])) / f.torso!);
      if (!h.length || !len.length) continue;
      const start = median(h);
      const top = median(len) * this.cfg.reachOfArm;
      if (top - start > 0.3) {
        this.start[side] = start;
        this.top[side] = top;
      }
    }
  }

  protected measure(f: PoseFrame, key: string) {
    const side = key as Side;
    const h = wristAbove(f, side);
    if (h === null) return null;
    const p = (h - this.start[side]) / (this.top[side] - this.start[side]);
    // Only a straight arm reaches the top.
    const a = arm(side);
    const straight = jointAngle(f.lm[a.shoulder], f.lm[a.elbow], f.lm[a.wrist]) >= this.cfg.straightElbowDeg;
    return straight ? p : Math.min(p, this.cfg.up - 0.05);
  }
}
