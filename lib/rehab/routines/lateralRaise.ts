import { ARMS, arm, clamp, jointAngle, median, TORSO, type PoseFrame, type Side } from "../pose";
import type { Settings } from "../settings";
import { RepRoutine, sides } from "./reps";
import type { RoutineInfo } from "./types";

/** Arm angle at the shoulder, between the side of the body and the arm: about 15° hanging, 90° at shoulder height. */
function armAngle(f: PoseFrame, side: Side): number {
  const a = arm(side);
  return jointAngle(f.lm[a.hip], f.lm[a.shoulder], f.lm[a.wrist]);
}

/** Side arm raises: lift straight arms out to the side up to shoulder height. Counted per arm, so one or both arms work. */
export class LateralRaise extends RepRoutine {
  readonly info: RoutineInfo;
  protected readonly cues = { up: "Lift your arms out to the side", down: "Lower them slowly" };
  private cfg: Settings["lateralRaise"];
  private rest: Record<Side, number>;
  private highest = 0;

  constructor(s: Settings) {
    super(s.flow.messageMs, s.lateralRaise, sides("arm"), s.lateralRaise.targetPerSide);
    this.cfg = s.lateralRaise;
    this.rest = { left: this.cfg.restDeg, right: this.cfg.restDeg };
    this.info = {
      id: "lateralRaise",
      name: "Side arm raises",
      goal: "Strength",
      area: "upper body",
      target: `${this.cfg.targetPerSide} per arm`,
      instructions: [
        "Sit or stand facing the camera with your arms by your sides, thumbs forward.",
        "Lift both arms out to the side, elbows nearly straight, up to shoulder height.",
        "Lower them slowly. You can hold a light water bottle in each hand.",
      ],
      safety: "Stop at shoulder height. Skip this after shoulder surgery unless your care team has cleared it.",
      required: [...TORSO, ...ARMS],
      calibration: [{ prompt: "Arms relaxed by your sides" }],
    };
  }

  calibrate(samples: PoseFrame[][]) {
    for (const side of ["left", "right"] as const) {
      const v = (samples[0] ?? []).map((f) => armAngle(f, side));
      if (v.length) this.rest[side] = clamp(median(v), 0, 40);
    }
  }

  protected fault(f: PoseFrame) {
    const top = Math.max(armAngle(f, "left"), armAngle(f, "right"));
    this.highest = Math.max(this.highest, top);
    return top > this.cfg.maxDeg ? "Only lift to shoulder height" : null;
  }

  protected measure(f: PoseFrame, key: string) {
    const side = key as Side;
    return (armAngle(f, side) - this.rest[side]) / (this.cfg.fullDeg - this.rest[side]);
  }

  protected extraMetrics() {
    return [{ label: "Highest arm angle", value: `${Math.round(Math.min(this.highest, 180))}°` }];
  }
}
