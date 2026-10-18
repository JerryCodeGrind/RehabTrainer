import { ARMS, LM, median, TORSO, type PoseFrame } from "../pose";
import type { Settings } from "../settings";
import { RepRoutine } from "./reps";
import type { RoutineInfo } from "./types";

/** Wrist-to-wrist distance across the body, in torso lengths. */
function wristGap(f: PoseFrame): number | null {
  if (!f.torso) return null;
  return Math.abs(f.lm[LM.leftWrist].x - f.lm[LM.rightWrist].x) / f.torso;
}

/** Arm openers: arms out in front, then open them wide to the sides, squeezing the shoulder blades. */
export class ArmOpeners extends RepRoutine {
  readonly info: RoutineInfo;
  protected readonly cues = { up: "Open your arms wide to the sides", down: "Bring your hands back together in front" };
  private cfg: Settings["armOpeners"];
  private closed: number;
  private open: number;
  private calibrated = false;

  constructor(s: Settings) {
    super(s.flow.messageMs, s.armOpeners, [{ key: "both", label: "Arms" }], s.armOpeners.targetReps);
    this.cfg = s.armOpeners;
    this.closed = this.cfg.defaultClosed;
    this.open = this.cfg.defaultOpen;
    this.info = {
      id: "armOpeners",
      name: "Arm openers",
      goal: "Mobility",
      area: "upper body",
      target: `${this.cfg.targetReps} reps`,
      instructions: [
        "Sit or stand tall facing the camera. Hold your arms straight out in front at shoulder height, hands together.",
        "Open your arms wide out to the sides, squeezing your shoulder blades together.",
        "Bring your hands back together in front, slowly.",
      ],
      safety: "Keep your arms at shoulder height or lower, and move slowly.",
      required: [...TORSO, ...ARMS],
      calibration: [{ prompt: "Arms straight out in front, hands together" }, { prompt: "Now open your arms wide to the sides" }],
    };
  }

  calibrate(samples: PoseFrame[][]) {
    const at = (i: number) => (samples[i] ?? []).map(wristGap).filter((x): x is number => x !== null);
    const closed = at(0);
    const open = at(1);
    if (!closed.length || !open.length) return;
    const c = median(closed);
    const o = median(open);
    if (o - c >= this.cfg.minCalibrationRange) {
      this.closed = c;
      this.open = o;
      this.calibrated = true;
    }
  }

  protected fault(f: PoseFrame) {
    if (!f.torso) return null;
    const shoulder = (f.lm[LM.leftShoulder].y + f.lm[LM.rightShoulder].y) / 2;
    const wrists = (f.lm[LM.leftWrist].y + f.lm[LM.rightWrist].y) / 2;
    return Math.abs(wrists - shoulder) / f.torso > this.cfg.maxHeightOffset ? "Keep your arms at shoulder height" : null;
  }

  protected measure(f: PoseFrame) {
    const g = wristGap(f);
    return g === null ? null : (g - this.closed) / (this.open - this.closed);
  }

  protected extraData() {
    return { closed: this.closed, open: this.open, calibrated: this.calibrated };
  }
}
