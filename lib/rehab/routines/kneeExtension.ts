import { leg, LM, median, TORSO, type PoseFrame, type Side } from "../pose";
import type { Settings } from "../settings";
import { RepRoutine, sides } from "./reps";
import type { RoutineInfo } from "./types";

/** (ankleY - kneeY) / torso: about a shin length with the foot on the floor, near 0 with the leg straight out. */
function shinDrop(f: PoseFrame, side: Side): number | null {
  if (!f.torso) return null;
  const l = leg(side);
  return (f.lm[l.ankle].y - f.lm[l.knee].y) / f.torso;
}

/** Seated knee extension: straighten one knee to lift the foot, then lower it. Counted per leg. */
export class KneeExtension extends RepRoutine {
  readonly info: RoutineInfo;
  protected readonly cues = { up: "Straighten one knee to lift your foot", down: "Lower your foot slowly" };
  private cfg: Settings["kneeExtension"];
  private rest: Record<Side, number>;

  constructor(s: Settings) {
    super(s.flow.messageMs, s.kneeExtension, sides("leg"), s.kneeExtension.targetPerSide);
    this.cfg = s.kneeExtension;
    this.rest = { left: this.cfg.defaultShin, right: this.cfg.defaultShin };
    this.info = {
      id: "kneeExtension",
      name: "Seated knee extensions",
      goal: "Strength",
      area: "legs",
      target: `${this.cfg.targetPerSide} per leg`,
      instructions: [
        "Sit on a sturdy chair facing the camera, back against the chair, feet flat.",
        "Straighten one knee to lift your foot until your leg is out in front of you.",
        "Hold for a moment, then lower your foot slowly. Switch legs whenever you like.",
      ],
      safety: "Keep your back against the chair. Stop if your knee hurts.",
      required: [...TORSO, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle],
      calibration: [{ prompt: "Sit with both feet flat on the floor" }],
    };
  }

  calibrate(samples: PoseFrame[][]) {
    for (const side of ["left", "right"] as const) {
      const v = (samples[0] ?? []).map((f) => shinDrop(f, side)).filter((x): x is number => x !== null);
      if (v.length && median(v) > this.cfg.minShin) this.rest[side] = median(v);
    }
  }

  protected fault(f: PoseFrame) {
    if (!f.torso) return null;
    const knee = (f.lm[LM.leftKnee].y + f.lm[LM.rightKnee].y) / 2;
    const hip = (f.lm[LM.leftHip].y + f.lm[LM.rightHip].y) / 2;
    return (knee - hip) / f.torso > this.cfg.standingKneeDrop ? "Sit down on a chair for this one" : null;
  }

  protected measure(f: PoseFrame, key: string) {
    const side = key as Side;
    const d = shinDrop(f, side);
    return d === null ? null : (this.rest[side] - d) / this.rest[side];
  }

  protected extraData() {
    return { restShin: this.rest };
  }
}
