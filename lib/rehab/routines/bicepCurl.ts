import { ARMS, arm, median, TORSO, type PoseFrame, type Side } from "../pose";
import type { Settings } from "../settings";
import { RepRoutine, sides } from "./reps";
import type { RoutineInfo } from "./types";

/** (wristY - elbowY) / torso: positive with the wrist below the elbow. */
function wristBelowElbow(f: PoseFrame, side: Side): number | null {
  if (!f.torso) return null;
  const a = arm(side);
  return (f.lm[a.wrist].y - f.lm[a.elbow].y) / f.torso;
}

/** (elbowY - shoulderY) / torso: how far the elbow hangs below the shoulder. */
function elbowDrop(f: PoseFrame, side: Side): number | null {
  if (!f.torso) return null;
  const a = arm(side);
  return (f.lm[a.elbow].y - f.lm[a.shoulder].y) / f.torso;
}

/** Bicep curls: bend the elbows to bring the hands up toward the shoulders. Counted per arm. */
export class BicepCurl extends RepRoutine {
  readonly info: RoutineInfo;
  protected readonly cues = { up: "Bend your elbows to bring your hands up", down: "Lower your hands slowly" };
  private cfg: Settings["bicepCurl"];
  private forearm: Record<Side, number>;
  private elbowRest: Record<Side, number | null> = { left: null, right: null };

  constructor(s: Settings) {
    super(s.flow.messageMs, s.bicepCurl, sides("arm"), s.bicepCurl.targetPerSide);
    this.cfg = s.bicepCurl;
    this.forearm = { left: this.cfg.defaultForearm, right: this.cfg.defaultForearm };
    this.info = {
      id: "bicepCurl",
      name: "Bicep curls",
      goal: "Strength",
      area: "upper body",
      target: `${this.cfg.targetPerSide} per arm`,
      instructions: [
        "Sit or stand facing the camera, arms straight down by your sides, palms forward.",
        "Keeping your elbows by your sides, bend them to bring your hands up toward your shoulders.",
        "Lower slowly. Hold a light water bottle in each hand if that's comfortable.",
      ],
      safety: "Keep your back still and don't swing your arms. Stop if your elbow or shoulder hurts.",
      required: [...TORSO, ...ARMS],
      calibration: [{ prompt: "Arms straight down by your sides" }],
    };
  }

  calibrate(samples: PoseFrame[][]) {
    for (const side of ["left", "right"] as const) {
      const w = (samples[0] ?? []).map((f) => wristBelowElbow(f, side)).filter((x): x is number => x !== null);
      if (w.length && median(w) > 0.15) this.forearm[side] = median(w);
      const e = (samples[0] ?? []).map((f) => elbowDrop(f, side)).filter((x): x is number => x !== null);
      if (e.length) this.elbowRest[side] = median(e);
    }
  }

  protected fault(f: PoseFrame) {
    for (const side of ["left", "right"] as const) {
      const rest = this.elbowRest[side];
      const now = elbowDrop(f, side);
      if (rest !== null && now !== null && rest - now > this.cfg.elbowDrift) return "Keep your elbows down by your sides";
    }
    return null;
  }

  protected measure(f: PoseFrame, key: string) {
    const side = key as Side;
    const w = wristBelowElbow(f, side);
    // 0 with the arm hanging, 1 with the wrist level with the elbow, more above it.
    return w === null ? null : (this.forearm[side] - w) / this.forearm[side];
  }
}
