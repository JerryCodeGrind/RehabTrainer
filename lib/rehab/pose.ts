// Shared pose processing: landmark indices, smoothing, torso normalization and
// geometry helpers. No runtime imports, so the Node simulation can load it.

import type { Settings } from "./settings";

/** MediaPipe Pose landmark indices. Left/right are the person's own sides. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export const JOINT_NAMES: Record<number, string> = {
  11: "Left shoulder",
  12: "Right shoulder",
  13: "Left elbow",
  14: "Right elbow",
  15: "Left wrist",
  16: "Right wrist",
  23: "Left hip",
  24: "Right hip",
  25: "Left knee",
  26: "Right knee",
  27: "Left ankle",
  28: "Right ankle",
  29: "Left heel",
  30: "Right heel",
  31: "Left foot",
  32: "Right foot",
};

export const TORSO = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
export const LEGS = [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];
export const FEET = [LM.leftHeel, LM.rightHeel, LM.leftFootIndex, LM.rightFootIndex];
export const ARMS = [LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist];

export type Side = "left" | "right";

/** Same shape as MediaPipe's NormalizedLandmark: x, y in 0..1 of the image. */
export interface RawLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface Point {
  x: number;
  y: number;
  z: number;
  /** Smoothed visibility, 0..1. */
  v: number;
}

export interface PoseFrame {
  /** performance.now() timestamp in ms. */
  t: number;
  /** Smoothed landmarks in aspect-corrected units: x and z are multiplied by
   * width/height so one unit is the same length on both axes. y grows downward. */
  lm: Point[];
  /** Smoothed landmarks in MediaPipe's normalized image space, for drawing. */
  draw: RawLandmark[];
  /** Smoothed torso length (shoulder midpoint to hip midpoint), or null when
   * the shoulders and hips aren't all visible. */
  torso: number | null;
  minVisibility: number;
}

/** Exponential moving average of one value. */
export class Ema {
  value: number | null = null;
  private alpha: number;
  constructor(alpha: number) {
    this.alpha = alpha;
  }
  update(x: number): number {
    this.value = this.value === null ? x : this.value + this.alpha * (x - this.value);
    return this.value;
  }
  reset() {
    this.value = null;
  }
}

/** Turns raw MediaPipe landmarks into smoothed, aspect-corrected PoseFrames. */
export class PoseSmoother {
  private prev: Point[] | null = null;
  private torso: Ema;
  private lastSeen = -Infinity;
  private cfg: Settings["pose"];

  constructor(cfg: Settings["pose"]) {
    this.cfg = cfg;
    this.torso = new Ema(cfg.torsoSmoothing);
  }

  /** `raw` is null when no person was detected in this frame. */
  process(raw: RawLandmark[] | null, aspect: number, t: number): PoseFrame | null {
    if (!raw || raw.length < 33) {
      if (t - this.lastSeen > this.cfg.resetAfterMs) this.reset();
      return null;
    }
    if (t - this.lastSeen > this.cfg.resetAfterMs) this.reset();
    this.lastSeen = t;

    const a = this.cfg.landmarkSmoothing;
    const lm = raw.map((r, i): Point => {
      const cur = { x: r.x * aspect, y: r.y, z: r.z * aspect, v: r.visibility ?? 0 };
      const p = this.prev?.[i];
      if (!p) return cur;
      return {
        x: p.x + a * (cur.x - p.x),
        y: p.y + a * (cur.y - p.y),
        z: p.z + a * (cur.z - p.z),
        v: p.v + a * (cur.v - p.v),
      };
    });
    this.prev = lm;

    const frame: PoseFrame = {
      t,
      lm,
      draw: lm.map((p) => ({ x: p.x / aspect, y: p.y, z: p.z / aspect, visibility: p.v })),
      torso: null,
      minVisibility: this.cfg.minVisibility,
    };
    if (visible(frame, TORSO)) {
      const len = dist(midpoint(lm[LM.leftShoulder], lm[LM.rightShoulder]), midpoint(lm[LM.leftHip], lm[LM.rightHip]));
      if (len > 1e-3) frame.torso = this.torso.update(len);
    }
    return frame;
  }

  reset() {
    this.prev = null;
    this.torso.reset();
  }
}

/** True when every listed landmark is visible enough to trust. */
export function visible(frame: PoseFrame, ids: readonly number[]): boolean {
  return ids.every((i) => (frame.lm[i]?.v ?? 0) > frame.minVisibility);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, v: Math.min(a.v, b.v) };
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Angle in degrees at joint `b` formed by a-b-c (e.g. hip-knee-ankle), in the image plane. */
export function jointAngle(a: Point, b: Point, c: Point): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n < 1e-9) return 180;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function hipMid(f: PoseFrame): Point {
  return midpoint(f.lm[LM.leftHip], f.lm[LM.rightHip]);
}

export function shoulderMid(f: PoseFrame): Point {
  return midpoint(f.lm[LM.leftShoulder], f.lm[LM.rightShoulder]);
}

/** Landmark indices for one side's leg. */
export function leg(side: Side) {
  return side === "left"
    ? { hip: LM.leftHip, knee: LM.leftKnee, ankle: LM.leftAnkle, heel: LM.leftHeel, toe: LM.leftFootIndex }
    : { hip: LM.rightHip, knee: LM.rightKnee, ankle: LM.rightAnkle, heel: LM.rightHeel, toe: LM.rightFootIndex };
}

/** Landmark indices for one side's arm. */
export function arm(side: Side) {
  return side === "left"
    ? { shoulder: LM.leftShoulder, elbow: LM.leftElbow, wrist: LM.leftWrist, hip: LM.leftHip }
    : { shoulder: LM.rightShoulder, elbow: LM.rightElbow, wrist: LM.rightWrist, hip: LM.rightHip };
}

/** Torso tilt from vertical in degrees, positive toward the person's left. 0 = upright. */
export function trunkLean(f: PoseFrame): number {
  const s = shoulderMid(f);
  const h = hipMid(f);
  const deg = (Math.atan2(s.x - h.x, h.y - s.y) * 180) / Math.PI;
  // The person's left shoulder is on the image's right when facing the camera; follow it either way.
  return Math.sign(f.lm[LM.leftShoulder].x - f.lm[LM.rightShoulder].x || 1) * deg;
}

export function other(side: Side): Side {
  return side === "left" ? "right" : "left";
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Middle value; used for calibration so a brief movement doesn't skew the baseline. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
