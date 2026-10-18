import { clamp, dist, Ema, hipMid, jointAngle, leg, LM, other, shoulderMid, TORSO, visible, type PoseFrame, type Side } from "../pose";
import type { Settings } from "../settings";
import { BaseRoutine, sec, type RoutineInfo } from "./types";

type Hold = "quad" | "hamstring";
type Kind = Hold | "raise";
interface Step {
  kind: Kind;
  /** For the quad stretch, the bent leg; hamstring, the front leg; raises, the lifting leg. */
  side: Side;
}

const NAME: Record<Kind, string> = {
  quad: "Quad stretch",
  hamstring: "Hamstring stretch",
  raise: "Side leg raises",
};
const ANKLES = [LM.leftAnkle, LM.rightAnkle];
const FEET = [LM.leftHeel, LM.rightHeel, LM.leftFootIndex, LM.rightFootIndex];
const NOSE = 0;

type Cfg = Settings["stretches"];

export interface PoseCheck {
  ok: boolean;
  /** The correction for the first failing check, e.g. "Stand tall". */
  fix: string;
  values: Record<string, number | string>;
}

const up = (s: Side) => s.toUpperCase();

/** Horizontal shoulder-over-hip offset, in torso lengths. */
function torsoLean(f: PoseFrame): number {
  return Math.abs(shoulderMid(f).x - hipMid(f).x) / (f.torso ?? 1);
}

/** Standing quad stretch: one knee bent (heel toward buttock), the other straight, upright, knees level. */
export function checkQuad(f: PoseFrame, side: Side, cfg: Cfg): PoseCheck {
  const L = f.lm;
  const b = leg(side);
  const s = leg(other(side));
  const bent = jointAngle(L[b.hip], L[b.knee], L[b.ankle]);
  const standing = jointAngle(L[s.hip], L[s.knee], L[s.ankle]);
  const lean = torsoLean(f);
  const kneeGap = Math.abs(L[b.knee].y - L[s.knee].y) / (f.torso ?? 1);
  const values = { "bent knee°": Math.round(bent), "standing knee°": Math.round(standing), "torso lean": lean.toFixed(3), "knee height gap": kneeGap.toFixed(3) };
  const q = cfg.quad;
  const fail = (fix: string): PoseCheck => ({ ok: false, fix, values });
  if (bent >= q.bentKneeMaxDeg) {
    // The other knee is the bent one: point them at the right leg.
    if (standing < q.bentKneeMaxDeg) return fail(`Switch legs: bend your ${up(side)} knee`);
    return fail("Bend your knee a little more");
  }
  if (standing < q.standingKneeMinDeg || lean > cfg.maxTorsoLean) return fail("Stand tall");
  if (kneeGap > q.maxKneeHeightGap) return fail("Keep your knees together");
  return { ok: true, fix: "", values };
}

/** Standing hamstring stretch, side-on: front knee straight, hinged at the hips, back knee soft. */
export function checkHamstring(f: PoseFrame, side: Side, cfg: Cfg): PoseCheck {
  const L = f.lm;
  const torso = f.torso ?? 1;
  const h = cfg.hamstring;
  const shoulderRatio = dist(L[LM.leftShoulder], L[LM.rightShoulder]) / torso;
  const values: Record<string, number | string> = { "shoulder width / torso": shoulderRatio.toFixed(2) };
  const fail = (fix: string): PoseCheck => ({ ok: false, fix, values });
  if (shoulderRatio > h.sideViewMaxShoulderRatio) return fail("Turn side-on to the camera");
  if (!visible(f, ANKLES)) return fail("Step back a little so I can see your feet");

  // Facing direction: toes point forward; without feet, the nose is ahead of the shoulders.
  const facing = visible(f, FEET)
    ? Math.sign(L[LM.leftFootIndex].x - L[LM.leftHeel].x + L[LM.rightFootIndex].x - L[LM.rightHeel].x)
    : Math.sign(L[NOSE].x - shoulderMid(f).x);
  const front: Side = (L[LM.leftAnkle].x - L[LM.rightAnkle].x) * (facing || 1) > 0 ? "left" : "right";
  const fr = leg(front);
  const bk = leg(other(front));
  const frontKnee = jointAngle(L[fr.hip], L[fr.knee], L[fr.ankle]);
  const backKnee = jointAngle(L[bk.hip], L[bk.knee], L[bk.ankle]);
  const hinge = jointAngle(shoulderMid(f), hipMid(f), L[fr.knee]);
  Object.assign(values, { "front leg": front, "front knee°": Math.round(frontKnee), "hip hinge°": Math.round(hinge), "back knee°": Math.round(backKnee) });

  if (front !== side) return fail(`Switch legs: put your ${up(side)} heel forward`);
  if (frontKnee < h.frontKneeMinDeg) return fail("Keep your front knee straight");
  if (hinge > h.hingeMaxDeg) return fail("Lean forward from your hips");
  if (hinge < h.hingeMinDeg) return fail("Don't lean too far");
  if (backKnee > h.backKneeMaxDeg) return fail("Bend your back knee slightly");
  if (backKnee < h.backKneeMinDeg) return fail("Straighten your back knee a little");
  return { ok: true, fix: "", values };
}

/** Leg angle from vertical in degrees, positive = out to the side (negative = across the body). */
export function legAngle(f: PoseFrame, side: Side): number {
  const l = leg(side);
  const end = visible(f, [l.ankle]) ? f.lm[l.ankle] : f.lm[l.knee];
  const hip = f.lm[l.hip];
  // The person's left is on the image's right (+x) in the unmirrored camera frame.
  const out = (side === "left" ? 1 : -1) * (end.x - hip.x);
  return (Math.atan2(out, end.y - hip.y) * 180) / Math.PI;
}

/** Torso angle from vertical in degrees. */
export function torsoLeanDeg(f: PoseFrame): number {
  const s = shoulderMid(f);
  const h = hipMid(f);
  return (Math.atan2(Math.abs(s.x - h.x), h.y - s.y) * 180) / Math.PI;
}

export class StandingStretches extends BaseRoutine {
  readonly info: RoutineInfo;
  private cfg: Cfg;
  private steps: Step[] = [];
  private index = 0;
  private heldMs = 0;
  private lastT: number | null = null;
  private check: PoseCheck | null = null;
  private totalCorrectMs = 0;
  private holds: Record<Hold, Record<Side, number>> = { quad: { left: 0, right: 0 }, hamstring: { left: 0, right: 0 } };
  // Side leg raises.
  private angle: Record<Side, Ema>;
  private raiseUp = false;
  private peak = 0;
  private leaned = false;
  private lean = 0;
  private peaks: Record<Side, number[]> = { left: [], right: [] };
  private leaningReps = 0;

  constructor(s: Settings) {
    super(s.flow.messageMs);
    this.cfg = s.stretches;
    const { quad, hamstring, sideRaise, hipPrecautions } = this.cfg;
    this.angle = { left: new Ema(sideRaise.smoothing), right: new Ema(sideRaise.smoothing) };
    // Holds alternate sides (L, R, L, R) so each one starts with a fresh leg.
    const holds = (kind: Hold, n: number) => {
      for (let i = 0; i < n; i++) for (const side of ["left", "right"] as const) this.steps.push({ kind, side });
    };
    holds("quad", quad.holdsPerSide);
    if (!hipPrecautions) holds("hamstring", hamstring.holdsPerSide);
    this.steps.push({ kind: "raise", side: "left" }, { kind: "raise", side: "right" });

    const stretches = hipPrecautions ? "Quad stretch and side leg raises" : "Quad, hamstring and side leg raises";
    this.info = {
      id: "stretches",
      name: "Standing hip and leg stretches",
      goal: "Flexibility",
      area: "legs",
      target: `${stretches}: ${quad.holdSec} s holds, ${sideRaise.repsPerSide} raises per side`,
      instructions: [
        "Hold a counter or sturdy chair for every stretch.",
        "Quad stretch: stand side-on to the camera. Bend one knee to bring your heel toward your bottom. Hold your ankle or use a towel.",
        ...(hipPrecautions
          ? []
          : ["Hamstring stretch: stay side-on. Rest one heel forward, toes up, knee straight. Bend the back knee slightly and lean forward from your hips."]),
        "Side leg raises: face the camera. Lift one straight leg out to the side, then bring it back.",
      ],
      safety: "Move gently: a stretch should pull, not hurt. Never cross your legs or turn your hip inward.",
      required: [...TORSO, LM.leftKnee, LM.rightKnee],
      optional: ANKLES,
      calibration: [],
      note: hipPrecautions
        ? "Hip precautions are on, so the hamstring stretch is skipped. Follow your surgeon's guidance on how far to bend and move your hip."
        : undefined,
    };
  }

  private get step(): Step | undefined {
    return this.steps[this.index];
  }

  update(frame: PoseFrame | null, t: number) {
    const dt = this.lastT === null ? 0 : Math.min(t - this.lastT, 200);
    this.lastT = t;
    const step = this.step;
    if (!step) return;
    if (!frame?.torso) {
      // Timers pause (don't reset) while the person isn't visible.
      this.check = null;
      return;
    }
    if (step.kind === "raise") return this.updateRaise(frame, step.side, t);

    this.check = step.kind === "quad" ? checkQuad(frame, step.side, this.cfg) : checkHamstring(frame, step.side, this.cfg);
    if (!this.check.ok) return;
    this.heldMs += dt;
    this.totalCorrectMs += dt;
    if (this.heldMs >= this.cfg[step.kind].holdSec * 1000) {
      this.holds[step.kind][step.side]++;
      this.heldMs = 0;
      this.advance(t);
    }
  }

  private updateRaise(f: PoseFrame, side: Side, t: number) {
    const r = this.cfg.sideRaise;
    const a = this.angle[side].update(legAngle(f, side));
    const otherA = this.angle[other(side)].update(legAngle(f, other(side)));
    this.lean = torsoLeanDeg(f);
    if (!this.raiseUp && a >= r.liftDeg) {
      this.raiseUp = true;
      this.peak = a;
      this.leaned = false;
    } else if (this.raiseUp) {
      this.peak = Math.max(this.peak, a);
      if (this.lean > r.maxLeanDeg) this.leaned = true;
      if (a < r.returnDeg) {
        this.raiseUp = false;
        this.peaks[side].push(this.peak);
        if (this.leaned) {
          this.leaningReps++;
          this.say("Keep your body upright, lift from the hip", t);
        } else {
          this.say(`Good: ${Math.round(this.peak)}°`, t, 1500);
        }
        this.emit("rep");
        if (this.peaks[side].length >= r.repsPerSide) this.advance(t);
      }
    }
    if (!this.raiseUp && a < -r.returnDeg) this.say("Lift your leg out to the side, not across your body", t);
    else if (!this.raiseUp && otherA >= r.liftDeg) this.say(`Lift your ${up(side)} leg`, t, 1500);
  }

  private advance(t: number) {
    const prev = this.step!;
    this.index++;
    if (prev.kind !== "raise") this.emit("rep");
    const next = this.step;
    if (!next) return;
    let msg: string;
    if (next.kind === "raise") {
      msg = next.kind === prev.kind ? `Now lift your ${up(next.side)} leg` : `Now: side leg raises. Face the camera and lift your ${up(next.side)} leg`;
    } else if (next.kind !== prev.kind) {
      msg = `Now: hamstring stretch. Stay side-on, ${up(next.side)} heel forward`;
    } else {
      msg = `Good! Relax. Next: ${next.kind === "quad" ? `bend your ${up(next.side)} knee` : `${up(next.side)} heel forward`}`;
    }
    this.raiseUp = false;
    this.say(msg, t, 5000);
  }

  protected statusMessage() {
    const step = this.step;
    if (!step) return "All stretches done!";
    if (step.kind === "raise") {
      return this.raiseUp ? "Now bring it back down slowly" : `Lift your ${up(step.side)} leg out to the side`;
    }
    if (this.check && !this.check.ok) return this.check.fix;
    if (this.check?.ok) return "Hold it there. Breathe slowly";
    return step.kind === "quad" ? `Bend your ${up(step.side)} knee, heel toward your bottom` : `Turn side-on, ${up(step.side)} heel forward`;
  }

  isComplete() {
    return this.index >= this.steps.length;
  }

  inRep() {
    const step = this.step;
    if (!step) return false;
    return step.kind === "raise" ? this.raiseUp : !!this.check?.ok;
  }

  getProgress() {
    const reps = this.cfg.sideRaise.repsPerSide;
    const holdSteps = this.steps.filter((s) => s.kind !== "raise");
    const raisesDone = this.peaks.left.length + this.peaks.right.length;
    const done = Math.min(this.index, holdSteps.length) + raisesDone;
    const target = holdSteps.length + 2 * reps;
    const step = this.step;
    const kinds = [...new Set(this.steps.map((s) => s.kind))];
    if (!step) return { done, target, label: "Done", detail: "All stretches done" };
    const which = `${kinds.indexOf(step.kind) + 1} of ${kinds.length}`;
    if (step.kind === "raise") {
      return { done, target, label: `${this.peaks[step.side].length} / ${reps}`, detail: `${NAME.raise}, ${step.side} leg (exercise ${which})` };
    }
    const ofKind = this.steps.filter((s) => s.kind === step.kind);
    const doneOfKind = this.steps.slice(0, this.index).filter((s) => s.kind === step.kind).length;
    return {
      done,
      target,
      label: `${doneOfKind} / ${ofKind.length}`,
      detail: `${NAME[step.kind]}, ${step.side} leg (exercise ${which})`,
    };
  }

  getLive() {
    const step = this.step;
    if (!step) return {};
    if (step.kind === "raise") {
      const r = this.cfg.sideRaise;
      const max = r.liftDeg * 1.5;
      return {
        bars: (["left", "right"] as const).map((s) => {
          const a = this.angle[s].value ?? 0;
          return { label: `${s === "left" ? "Left" : "Right"} leg: ${Math.max(0, Math.round(a))}°`, value: clamp(a / max, 0, 1), target: r.liftDeg / max };
        }),
      };
    }
    return {
      timer: {
        label: `${NAME[step.kind]} (${step.side} leg)${this.check?.ok ? "" : ", paused"}`,
        seconds: this.heldMs / 1000,
        target: this.cfg[step.kind].holdSec,
      },
    };
  }

  getSummary() {
    const h = this.holds;
    const p = this.peaks;
    const maxDeg = (xs: number[]) => (xs.length ? `${Math.round(Math.max(...xs))}°` : "–");
    const holdSteps = this.steps.filter((s) => s.kind !== "raise").length;
    return {
      reps: Math.min(this.index, holdSteps) + p.left.length + p.right.length,
      target: holdSteps + 2 * this.cfg.sideRaise.repsPerSide,
      metrics: [
        { label: "Quad stretch holds (left / right)", value: `${h.quad.left} / ${h.quad.right}` },
        {
          label: "Hamstring stretch holds (left / right)",
          value: this.cfg.hipPrecautions ? "Skipped (hip precautions)" : `${h.hamstring.left} / ${h.hamstring.right}`,
        },
        { label: "Side leg raises (left / right)", value: `${p.left.length} / ${p.right.length}` },
        { label: "Peak side raise, left", value: maxDeg(p.left) },
        { label: "Peak side raise, right", value: maxDeg(p.right) },
        { label: "Raises with body leaning", value: String(this.leaningReps) },
        { label: "Total time holding stretches correctly", value: sec(this.totalCorrectMs, 0) },
      ],
      data: {
        holds: h,
        raisePeaksDeg: p,
        leaningReps: this.leaningReps,
        totalCorrectMs: this.totalCorrectMs,
        hipPrecautions: this.cfg.hipPrecautions,
      },
    };
  }

  getDebug() {
    const step = this.step;
    const base: Record<string, string | number> = { step: step ? `${step.kind} / ${step.side}` : "done" };
    if (step?.kind === "raise") {
      return {
        ...base,
        "left leg°": this.angle.left.value?.toFixed(1) ?? "–",
        "right leg°": this.angle.right.value?.toFixed(1) ?? "–",
        "torso lean°": this.lean.toFixed(1),
        state: this.raiseUp ? "up" : "down",
      };
    }
    return {
      ...base,
      "pose ok": this.check ? String(this.check.ok) : "–",
      "held s": (this.heldMs / 1000).toFixed(1),
      ...(this.check?.values ?? {}),
    };
  }
}
