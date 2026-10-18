import { hipMid, median, shoulderMid, TORSO, type PoseFrame } from "../pose";
import type { Settings } from "../settings";
import { RepRoutine } from "./reps";
import type { RoutineInfo } from "./types";

/** Height of the upper body (mean of shoulder and hip midpoints) in torso lengths; larger = higher. */
function bodyHeight(f: PoseFrame): number | null {
  if (!f.torso) return null;
  return -(shoulderMid(f).y + hipMid(f).y) / 2 / f.torso;
}

/** Standing heel raises: rise onto the balls of the feet and lower. The whole body rises, so the feet needn't be in view. */
export class HeelRaise extends RepRoutine {
  readonly info: RoutineInfo;
  protected readonly cues = { up: "Rise up onto your toes", down: "Lower your heels slowly" };
  private cfg: Settings["heelRaise"];
  private base: number | null = null;

  constructor(s: Settings) {
    super(s.flow.messageMs, s.heelRaise, [{ key: "both", label: "Heels" }], s.heelRaise.targetReps);
    this.cfg = s.heelRaise;
    this.info = {
      id: "heelRaise",
      name: "Heel raises",
      goal: "Strength",
      area: "legs",
      target: `${this.cfg.targetReps} reps`,
      instructions: [
        "Stand facing the camera with both hands on a counter or the back of a sturdy chair.",
        "Rise up onto the balls of your feet as high as is comfortable.",
        "Lower your heels slowly back to the floor.",
      ],
      safety: "Hold on with both hands the whole time. Stop if you feel dizzy.",
      required: [...TORSO],
      calibration: [{ prompt: "Stand tall on flat feet, holding on" }],
    };
  }

  calibrate(samples: PoseFrame[][]) {
    const v = (samples[0] ?? []).map(bodyHeight).filter((x): x is number => x !== null);
    if (v.length) this.base = median(v);
  }

  protected measure(f: PoseFrame) {
    const h = bodyHeight(f);
    if (h === null) return null;
    // Without calibration, the first measured frame is the baseline.
    this.base ??= h;
    return (h - this.base) / this.cfg.fullRise;
  }

  protected extraData() {
    return { baseline: this.base };
  }
}
