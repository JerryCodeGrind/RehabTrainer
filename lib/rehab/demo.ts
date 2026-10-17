// Keyboard-driven synthetic pose, so the screens and rep logic can be tested
// without a camera. Produces MediaPipe-shaped landmarks (x, y in 0..1) for a
// 16:9 frame. Also used by the Node simulation test.

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
];

type Vec = [number, number];

interface State {
  sit: number;
  knee: Record<Side, number>;
  foot: Record<Side, number>;
  raise: Record<Side, number>;
  far: number;
}

/** Eases every value toward its target at `rate` units per second. */
function approach(cur: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  return Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step;
}

const ZERO = (): State => ({ sit: 0, knee: { left: 0, right: 0 }, foot: { left: 0, right: 0 }, raise: { left: 0, right: 0 }, far: 0 });
const FEET_IDS = [27, 28, 29, 30, 31, 32];
const KNEE_IDS = [25, 26];
// Side leg raise angle at full key press.
const RAISE_DEG = 30;

export class DemoPose {
  private cur: State = ZERO();
  target: State = ZERO();
  stretch: "none" | "quad" | "hamstring" = "none";
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
    }
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
      p[11 + o] = [cx + leaning + 0.09 * d, 0.25 + drop];
      p[13 + o] = [cx + leaning + 0.11 * d, 0.37 + drop];
      p[15 + o] = [cx + leaning + 0.12 * d, 0.48 + drop];
      p[17 + o] = p[19 + o] = p[21 + o] = [cx + leaning + 0.12 * d, 0.5 + drop];
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
        p[25 + o] = [hipU, knee];
        p[27 + o] = [hipU, 0.9 - lift];
        p[29 + o] = [hipU, 0.92 - lift];
        p[31 + o] = [cx + 0.07 * d, 0.93 - lift];
      }
    }
    // Walking away: everything shrinks toward a point near the horizon.
    const scale = 1 - 0.6 * c.far;
    return p.map(([u, v]) => [cx + (u - cx) * scale, 0.2 + (v - 0.2) * scale]);
  }

  /** Side-on, facing the image's right, for the quad and hamstring stretches. */
  private sideOn(): Vec[] {
    const cx = DEMO_ASPECT / 2;
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
}
