import { median, TORSO, trunkLean, type PoseFrame } from "../pose";
import type { Settings } from "../settings";
import { RepRoutine } from "./reps";
import type { RoutineInfo } from "./types";

/** Trunk side bends, seated or standing: lean to one side, back to the middle, then the other. Counted per side. */
export class SideBend extends RepRoutine {
  readonly info: RoutineInfo;
  protected readonly cues = { up: "Lean slowly to one side", down: "Come back to the middle" };
  private cfg: Settings["sideBend"];
  private rest = 0;

  constructor(s: Settings) {
    super(s.flow.messageMs, s.sideBend, [
      { key: "left", label: "Left side" },
      { key: "right", label: "Right side" },
    ], s.sideBend.targetPerSide);
    this.cfg = s.sideBend;
    this.info = {
      id: "sideBend",
      name: "Trunk side bends",
      goal: "Mobility",
      area: "core and balance",
      target: `${this.cfg.targetPerSide} per side`,
      instructions: [
        "Sit tall on a chair or stand facing the camera, arms relaxed by your sides.",
        "Lean slowly to one side, sliding your hand down toward your knee.",
        "Come back to the middle, then lean to the other side.",
      ],
      safety: "Move slowly and only as far as is comfortable. Don't twist.",
      required: [...TORSO],
      calibration: [{ prompt: "Sit or stand tall and still" }],
    };
  }

  calibrate(samples: PoseFrame[][]) {
    const v = (samples[0] ?? []).map(trunkLean);
    if (v.length) this.rest = median(v);
  }

  protected measure(f: PoseFrame, key: string) {
    const lean = trunkLean(f) - this.rest;
    return ((key === "left" ? lean : -lean) / this.cfg.fullDeg);
  }
}
