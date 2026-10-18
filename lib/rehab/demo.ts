// Synthetic pose for the Node simulation tests (scripts/test-rehab.mjs), so the
// rep logic can be tested without a camera. Driven by key presses (DEMO_KEYS);
// produces MediaPipe-shaped landmarks (x, y in 0..1) for a 16:9 frame. The app
// itself always uses the camera.

import type { RawLandmark, Side } from "./pose";

export const DEMO_ASPECT = 16 / 9;

export const DEMO_KEYS: { key: string; action: string }[] = [
  { key: "S", action: "Sit down / stand up" },
  { key: "A / L (hold)", action: "Raise left / right knee" },
  { key: "Q / P", action: "Lift left / right foot a little" },
  { key: "W", action: "Walk away / walk back" },
  { key: "Z / M (hold)", action: "Side leg raise, left / right" },
  { key: "C / H", action: "Quad stretch / hamstring stretch (side-on)" },
  { key: "G", action: "Swap which leg the stretch uses" },
  { key: "F", action: "Make the form wrong" },
  { key: "K", action: "Camera close: hide feet, then knees too, then neither" },
  { key: "V", action: "Hide / show the whole body" },
  { key: "T (hold)", action: "Thumbs-up" },
  { key: "R (hold)", action: "Raise right hand above shoulder" },
  { key: "X / J", action: "Seated knee extension, left / right" },
  { key: "E", action: "Heel raise up / down" },
  { key: "B / N (hold)", action: "Side bend to the left / right" },
  { key: "U", action: "Side arm raise, both arms" },
  { key: "Y", action: "Bicep curl, both arms" },
  { key: "I", action: "Overhead press: hands to shoulders, then up / down" },
  { key: "O", action: "Arm openers: arms forward, then open / close" },
  { key: "8 / 9", action: "Wall push-up (side-on) / bend the elbows" },
  { key: "0", action: "Arms back down" },
];

type Vec = [number, number];

interface State {
  sit: number;
  knee: Record<Side, number>;
  foot: Record<Side, number>;
  raise: Record<Side, number>;
  far: number;
  /** Seated knee extension per leg: 0 foot on the floor, 1 leg straight out. */
  ext: Record<Side, number>;
  /** Heel raise: 0 flat, 1 up on the toes. */
  heel: number;
  /** Trunk side bend: -1 full to the right, 1 full to the left. */
  lean: number;
  /** Arm movements, 0..1: side raise, curl, overhead press, opening, wall push-up bend. */
  abduct: number;
  curl: number;
  press: number;
  open: number;
  push: number;
}

/** Eases every value toward its target at `rate` units per second. */
function approach(cur: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  return Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step;
}

const ZERO = (): State => ({
  sit: 0,
  knee: { left: 0, right: 0 },
  foot: { left: 0, right: 0 },
  raise: { left: 0, right: 0 },
  far: 0,
  ext: { left: 0, right: 0 },
  heel: 0,
  lean: 0,
  abduct: 0,
  curl: 0,
  press: 0,
  open: 0,
  push: 0,
});
const FEET_IDS = [27, 28, 29, 30, 31, 32];
const KNEE_IDS = [25, 26];
// Side leg raise angle at full key press.
const RAISE_DEG = 30;
// Arm segment lengths in frame units (torso is 0.25).
const UPPER = 0.12;
const FORE = 0.11;
const deg = (d: number) => (d * Math.PI) / 180;

export class DemoPose {
  private cur: State = ZERO();
  target: State = ZERO();
  stretch: "none" | "quad" | "hamstring" | "pushup" = "none";
  /** Which arm position the arm keys drive. */
  armMode: "rest" | "press" | "open" = "rest";
  /** The leg the stretch works: the bent knee (quad) or the front heel (hamstring). */
  stretchSide: Side = "left";
  fault = false;
  hidden = false;
  /** 0 = all visible, 1 = feet hidden, 2 = knees and feet hidden. */
  lowHidden: 0 | 1 | 2 = 0;
  /** Stands in for the gesture recognizer in demo mode. */
  thumbsUp = false;
  handUp = false;
  private lastT: number | null = null;

  /** Returns true if the key was a demo key. */
  keyDown(key: string): boolean {
    const t = this.target;
    switch (key.toLowerCase()) {
      case "s": t.sit = t.sit ? 0 : 1; break;
      case "a": t.knee.left = 0.75; break;
      case "l": t.knee.right = 0.75; break;
      case "q": t.foot.left = t.foot.left ? 0 : 1; break;
      case "p": t.foot.right = t.foot.right ? 0 : 1; break;
      case "z": t.raise.left = 1; break;
      case "m": t.raise.right = 1; break;
      case "w": t.far = t.far ? 0 : 1; break;
      case "c": this.stretch = this.stretch === "quad" ? "none" : "quad"; break;
      case "h": this.stretch = this.stretch === "hamstring" ? "none" : "hamstring"; break;
      case "g": this.stretchSide = this.stretchSide === "left" ? "right" : "left"; break;
      case "f": this.fault = !this.fault; break;
      case "k": this.lowHidden = ((this.lowHidden + 1) % 3) as 0 | 1 | 2; break;
      case "v": this.hidden = !this.hidden; break;
      case "x": t.ext.left = t.ext.left ? 0 : 1; break;
      case "j": t.ext.right = t.ext.right ? 0 : 1; break;
      case "e": t.heel = t.heel ? 0 : 1; break;
      case "b": t.lean = 1; break;
      case "n": t.lean = -1; break;
      case "u": this.armMode = "rest"; t.abduct = t.abduct ? 0 : 1; break;
      case "y": this.armMode = "rest"; t.curl = t.curl ? 0 : 1; break;
      case "i":
        if (this.armMode !== "press") { this.armMode = "press"; t.press = 0; this.cur.press = 0; } else t.press = t.press ? 0 : 1;
        break;
      case "o":
        if (this.armMode !== "open") { this.armMode = "open"; t.open = 0; this.cur.open = 0; } else t.open = t.open ? 0 : 1;
        break;
      case "8": this.stretch = this.stretch === "pushup" ? "none" : "pushup"; t.push = 0; break;
      case "9": t.push = t.push ? 0 : 1; break;
      case "0": this.armMode = "rest"; t.abduct = 0; t.curl = 0; t.press = 0; t.open = 0; break;
      case "t": this.thumbsUp = true; break;
      case "r": this.handUp = true; break;
      default: return false;
    }
    return true;
  }

  keyUp(key: string) {
    const k = key.toLowerCase();
    if (k === "a") this.target.knee.left = 0;
    if (k === "l") this.target.knee.right = 0;
    if (k === "z") this.target.raise.left = 0;
    if (k === "m") this.target.raise.right = 0;
    if (k === "b" || k === "n") this.target.lean = 0;
    if (k === "t") this.thumbsUp = false;
    if (k === "r") this.handUp = false;
  }

  frame(t: number): RawLandmark[] {
    const dt = this.lastT === null ? 0 : Math.min((t - this.lastT) / 1000, 0.1);
    this.lastT = t;
    const c = this.cur;
    const g = this.target;
    // Sit-down speed is slow on purpose (about 2 s) so it isn't flagged as too fast.
    c.sit = approach(c.sit, g.sit, 0.6, dt);
    c.far = approach(c.far, g.far, 0.4, dt);
    for (const s of ["left", "right"] as const) {
      c.knee[s] = approach(c.knee[s], g.knee[s], 3, dt);
      c.foot[s] = approach(c.foot[s], g.foot[s], 4, dt);
      c.raise[s] = approach(c.raise[s], g.raise[s], 2.5, dt);
      c.ext[s] = approach(c.ext[s], g.ext[s], 2, dt);
    }
    for (const k of ["heel", "lean", "abduct", "curl", "press", "open", "push"] as const) c[k] = approach(c[k], g[k], 1.5, dt);
    const pts = this.stretch === "none" ? this.frontal() : this.sideOn();
    return pts.map(([u, v], i) => ({
      x: u / DEMO_ASPECT,
      y: v,
      z: 0,
      visibility:
        this.hidden || (this.lowHidden >= 1 && FEET_IDS.includes(i)) || (this.lowHidden === 2 && KNEE_IDS.includes(i)) ? 0.1 : 0.95,
    }));
  }

  /** Facing the camera. The person's left side is on the image's right. */
  private frontal(): Vec[] {
    const cx = DEMO_ASPECT / 2;
    const c = this.cur;
    const drop = 0.12 * c.sit; // hips and shoulders lower when seated
    const hipV = 0.5 + drop;
    const p: Vec[] = new Array(33);
    const dir = (s: Side) => (s === "left" ? 1 : -1);
    // Side raises with bad form: the body leans away from the lifting leg.
    const leaning = this.fault ? (c.raise.left - c.raise.right) * -0.07 : 0;

    for (let i = 0; i <= 10; i++) p[i] = [cx + leaning + (i % 2 ? 0.02 : -0.02) * (i ? 1 : 0), 0.14 + drop + (i > 8 ? 0.04 : 0)];
    for (const s of ["left", "right"] as const) {
      const d = dir(s);
      const o = s === "left" ? 0 : 1;
      const kneeStand = 0.72 - 0.06 * c.sit; // seated: knees just below the hips
      const knee = kneeStand + c.knee[s] * (hipV - kneeStand) - 0.04 * c.foot[s];
      const lift = 0.2 * c.knee[s] + 0.05 * c.foot[s];
      const hipU = cx + 0.06 * d;
      const sh: Vec = [cx + leaning + 0.09 * d, 0.25 + drop];
      p[11 + o] = sh;
      const [elbow, wrist] = this.armPose(sh, d);
      p[13 + o] = elbow;
      p[15 + o] = wrist;
      // Hand points just past the wrist: below it when hanging, above it when the hand is raised.
      const handUp = s === "right" && this.handUp;
      p[17 + o] = p[19 + o] = p[21 + o] = [wrist[0], wrist[1] + (handUp ? -0.04 : 0.02)];
      if (s === "right" && this.handUp) {
        p[13 + o] = [cx + 0.15 * d, 0.2 + drop];
        p[15 + o] = [cx + 0.15 * d, 0.1 + drop];
        p[17 + o] = p[19 + o] = p[21 + o] = [cx + 0.15 * d, 0.06 + drop];
      }
      p[23 + o] = [hipU, hipV];
      if (c.raise[s] > 0) {
        // Straight leg swung out to the side about the hip.
        const a = (c.raise[s] * RAISE_DEG * Math.PI) / 180;
        const at = (len: number): Vec => [hipU + d * Math.sin(a) * len, hipV + Math.cos(a) * len];
        p[25 + o] = at(0.22);
        p[27 + o] = p[29 + o] = at(0.4);
        p[31 + o] = at(0.42);
      } else {
        // Seated knee extension: the foot swings forward and up, so the ankle rises toward the knee.
        const ext = c.ext[s] * c.sit * (0.9 - lift - knee - 0.02);
        p[25 + o] = [hipU, knee];
        p[27 + o] = [hipU, 0.9 - lift - ext];
        p[29 + o] = [hipU, 0.92 - lift - ext];
        p[31 + o] = [cx + 0.07 * d, 0.93 - lift - ext];
      }
    }
    // Side bend: the upper body tips about the hips, toward the person's left (image right) when positive.
    if (c.lean) {
      const a = deg(20 * c.lean);
      for (let i = 0; i <= 22; i++) {
        const [u, v] = p[i];
        const du = u - cx;
        const dv = v - hipV;
        p[i] = [cx + du * Math.cos(a) - dv * Math.sin(a), hipV + du * Math.sin(a) + dv * Math.cos(a)];
      }
    }
    // Heel raise: everything but the toes rises.
    const rise = 0.03 * c.heel;
    for (let i = 0; i < 31; i++) p[i] = [p[i][0], p[i][1] - rise];
    // Walking away: everything shrinks toward a point near the horizon.
    const scale = 1 - 0.6 * c.far;
    return p.map(([u, v]) => [cx + (u - cx) * scale, 0.2 + (v - 0.2) * scale]);
  }

  /** Elbow and wrist for one arm (d = 1 for the image's right), from the arm keys. */
  private armPose(sh: Vec, d: number): [Vec, Vec] {
    const c = this.cur;
    const lerp = (a: Vec, b: Vec, k: number): Vec => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    if (this.handUp && d < 0) return [[sh[0] + 0.06 * d, sh[1] - 0.05], [sh[0] + 0.06 * d, sh[1] - 0.15]];
    if (this.armMode === "press") {
      // Goalpost (elbow out at shoulder height, forearm up) to straight overhead.
      const e0: Vec = [sh[0] + d * UPPER, sh[1]];
      const w0: Vec = [sh[0] + d * UPPER, sh[1] - FORE];
      const e1: Vec = [sh[0] + d * 0.02, sh[1] - UPPER];
      const w1: Vec = [sh[0] + d * 0.03, sh[1] - UPPER - FORE];
      return [lerp(e0, e1, c.press), lerp(w0, w1, c.press)];
    }
    if (this.armMode === "open") {
      // Straight forward at shoulder height (foreshortened, hands together) to straight out to the side.
      const cx = DEMO_ASPECT / 2;
      const e0: Vec = [sh[0] - d * 0.03, sh[1] + 0.02];
      const w0: Vec = [cx + d * 0.03, sh[1] + 0.03];
      const e1: Vec = [sh[0] + d * UPPER, sh[1]];
      const w1: Vec = [sh[0] + d * (UPPER + FORE), sh[1]];
      return [lerp(e0, e1, c.open), lerp(w0, w1, c.open)];
    }
    // Hanging arm, swung out to the side (abduction) about the shoulder.
    const th = deg(10 + 80 * c.abduct);
    const elbow: Vec = [sh[0] + d * Math.sin(th) * UPPER, sh[1] + Math.cos(th) * UPPER];
    if (c.curl > 0 && c.abduct === 0) {
      // Curl: the forearm swings up from the elbow toward the shoulder.
      const phi = deg(150 * c.curl);
      return [elbow, [elbow[0] - d * Math.sin(phi) * FORE * 0.3, elbow[1] + Math.cos(phi) * FORE]];
    }
    return [elbow, [sh[0] + d * Math.sin(th) * (UPPER + FORE), sh[1] + Math.cos(th) * (UPPER + FORE)]];
  }

  /** Side-on, facing the image's right, for the quad and hamstring stretches. */
  private sideOn(): Vec[] {
    const cx = DEMO_ASPECT / 2;
    if (this.stretch === "pushup") return this.pushup();
    const quad = this.stretch === "quad";
    const hipV = quad ? 0.5 : 0.52;
    // Quad: upright (leaning forward when faulty). Hamstring: hinged forward at the hips.
    const shoulder: Vec = quad ? [cx + (this.fault ? 0.12 : 0), 0.25] : [cx + 0.12, 0.3];
    let main: [Vec, Vec]; // the stretched leg: knee, ankle
    let support: [Vec, Vec];
    if (quad) {
      // Bent knee stays under the hip; the heel comes up behind toward the buttock.
      main = [[cx, 0.72], [cx - 0.15, 0.58]];
      support = [[cx, 0.72], [cx, 0.9]];
    } else {
      // Front heel forward with a straight knee (bent when faulty); back knee soft.
      main = this.fault ? [[cx + 0.11, 0.7], [cx + 0.08, 0.9]] : [[cx + 0.08, 0.71], [cx + 0.16, 0.9]];
      support = [[cx - 0.03, 0.71], [cx - 0.02, 0.9]];
    }

    const p: Vec[] = new Array(33);
    for (let i = 0; i <= 10; i++) p[i] = [shoulder[0] + 0.04, shoulder[1] - 0.1];
    for (const s of ["left", "right"] as const) {
      const o = s === "left" ? 0 : 1;
      const [knee, ankle] = s === this.stretchSide ? main : support;
      p[11 + o] = [shoulder[0] + (o ? -0.01 : 0.01), shoulder[1]];
      p[13 + o] = [shoulder[0] + 0.1, shoulder[1] + 0.05];
      p[15 + o] = p[17 + o] = p[19 + o] = p[21 + o] = [shoulder[0] + 0.2, shoulder[1] + 0.05];
      p[23 + o] = [cx + (o ? -0.01 : 0.01), hipV];
      p[25 + o] = knee;
      p[27 + o] = ankle;
      p[29 + o] = [ankle[0] - 0.02, ankle[1] + 0.02];
      p[31 + o] = [ankle[0] + 0.05, ankle[1] + 0.01];
    }
    return p;
  }

  /** Side-on, facing a wall on the image's right: hands fixed on the wall, elbows bending as the body leans in. */
  private pushup(): Vec[] {
    const cx = DEMO_ASPECT / 2;
    const b = this.cur.push;
    const wall = cx + 0.24;
    const sh: Vec = [cx + 0.02 + 0.1 * b, 0.27];
    const hand: Vec = [wall, 0.28];
    // Elbow from the two segment lengths and the shoulder-to-hand distance (law of cosines), bending downward.
    const dx = hand[0] - sh[0];
    const dy = hand[1] - sh[1];
    const D = Math.min(Math.hypot(dx, dy), UPPER + FORE - 1e-4);
    const base = Math.atan2(dy, dx);
    const beta = Math.acos((UPPER * UPPER + D * D - FORE * FORE) / (2 * UPPER * D));
    const elbow: Vec = [sh[0] + UPPER * Math.cos(base + beta), sh[1] + UPPER * Math.sin(base + beta)];
    const hip: Vec = [cx + 0.05 * b, 0.52];
    const p: Vec[] = new Array(33);
    for (let i = 0; i <= 10; i++) p[i] = [sh[0] + 0.04, sh[1] - 0.1];
    for (const o of [0, 1]) {
      p[11 + o] = [sh[0] + (o ? -0.01 : 0.01), sh[1]];
      p[13 + o] = elbow;
      p[15 + o] = p[17 + o] = p[19 + o] = p[21 + o] = hand;
      p[23 + o] = [hip[0] + (o ? -0.01 : 0.01), hip[1]];
      p[25 + o] = [cx - 0.02, 0.71];
      p[27 + o] = [cx - 0.08, 0.9];
      p[29 + o] = [cx - 0.1, 0.92];
      p[31 + o] = [cx - 0.03, 0.92];
    }
    return p;
  }
}
