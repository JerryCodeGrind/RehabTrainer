import { arm, dist, jointAngle, LM, TORSO, type PoseFrame, type Side } from "../pose";
import type { Settings } from "../settings";
import { RepRoutine } from "./reps";
import type { RoutineInfo } from "./types";

/** The arm nearer the camera (better visibility), or null if neither can be seen. */
function nearArm(f: PoseFrame): Side | null {
  const vis = (side: Side) => {
    const a = arm(side);
    return Math.min(f.lm[a.shoulder].v, f.lm[a.elbow].v, f.lm[a.wrist].v);
  };
  const l = vis("left");
  const r = vis("right");
  const best = Math.max(l, r);
  if (best <= f.minVisibility) return null;
  return l >= r ? "left" : "right";
}

/** Wall push-ups, filmed side-on: bend the elbows to lean in toward the wall, then push back. */
export class WallPushup extends RepRoutine {
  readonly info: RoutineInfo;
  protected readonly cues = { up: "Bend your elbows to lean toward the wall", down: "Push back until your arms are straight" };
  private cfg: Settings["wallPushup"];
  private deepest = 180;

  constructor(s: Settings) {
    super(s.flow.messageMs, s.wallPushup, [{ key: "both", label: "Arms" }], s.wallPushup.targetReps);
    this.cfg = s.wallPushup;
    this.info = {
      id: "wallPushup",
      name: "Wall push-ups",
      goal: "Strength",
      area: "upper body",
      target: `${this.cfg.targetReps} reps`,
      instructions: [
        "Stand an arm's length from a wall with the camera to your side, so it sees you side-on.",
        "Put your hands flat on the wall at shoulder height, a little wider than your shoulders.",
        "Bend your elbows to bring your chest toward the wall, keeping your body straight, then push back.",
      ],
      safety: "Keep your feet planted and your body in a straight line. Use a wall, not a door.",
      required: [...TORSO],
      calibration: [],
      lostMessage: "I can't see your arm. Turn side-on with the camera at your side.",
    };
  }

  protected fault(f: PoseFrame) {
    if (!f.torso) return null;
    const ratio = dist(f.lm[LM.leftShoulder], f.lm[LM.rightShoulder]) / f.torso;
    if (ratio > this.cfg.sideViewMaxShoulderRatio) return "Turn side-on to the camera";
    return nearArm(f) ? null : "Turn so the camera can see your arm";
  }

  protected measure(f: PoseFrame) {
    const side = nearArm(f);
    if (!side) return null;
    const a = arm(side);
    const angle = jointAngle(f.lm[a.shoulder], f.lm[a.elbow], f.lm[a.wrist]);
    this.deepest = Math.min(this.deepest, angle);
    return (this.cfg.straightDeg - angle) / (this.cfg.straightDeg - this.cfg.bentDeg);
  }

  protected extraMetrics() {
    return [{ label: "Deepest elbow bend", value: this.deepest < 180 ? `${Math.round(this.deepest)}°` : "–" }];
  }
}
