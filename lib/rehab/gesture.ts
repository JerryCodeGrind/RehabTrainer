// Start gestures: a thumbs-up (MediaPipe Gesture Recognizer on crops around
// each hand) or a raised hand (Pose only, reliable from far away), plus the
// hold / cooldown logic that turns noisy per-check results into one trigger.
// No runtime imports, so the Node simulation can load it.

import type { PoseFrame, RawLandmark, Side } from "./pose";
import type { Settings } from "./settings";

type Cfg = Settings["gesture"];

/** Pose landmarks for each arm. */
export const ARM = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hand: [17, 19, 21] },
  right: { shoulder: 12, elbow: 14, wrist: 16, hand: [18, 20, 22] },
} as const;

/** Square region of the camera frame, in pixels. */
export interface PixelRect {
  side: Side;
  x: number;
  y: number;
  size: number;
}

const vis = (lm: RawLandmark[], i: number, min: number) => (lm[i]?.visibility ?? 0) > min;

/**
 * Body scale for gestures, in torso lengths (height-normalized units): the real
 * torso length when the hips are visible, otherwise estimated from shoulder
 * width, so gestures work when only the upper body is in view. Null without shoulders.
 */
export function gestureScale(f: PoseFrame | null, cfg: Cfg): number | null {
  if (!f) return null;
  if (f.torso) return f.torso;
  const l = f.lm[ARM.left.shoulder];
  const r = f.lm[ARM.right.shoulder];
  if (l.v <= f.minVisibility || r.v <= f.minVisibility) return null;
  const width = Math.hypot(l.x - r.x, l.y - r.y);
  return width > 1e-3 ? width * cfg.shoulderToTorso : null;
}

/**
 * Squares around each visible hand, sized from torso length, so the recognizer
 * sees a hand that would be tiny in the full frame. Centered on the Pose hand
 * points (pinky, index, thumb), or past the wrist along the forearm if those
 * aren't visible, then shifted up to leave room for a raised thumb. Empty when
 * no wrist is visible (the caller then uses the full frame).
 */
export function handCrops(
  lm: RawLandmark[] | null,
  torso: number | null,
  frame: { width: number; height: number },
  cfg: Cfg,
  minVisibility: number,
): PixelRect[] {
  if (!lm || !torso) return [];
  const { width: W, height: H } = frame;
  // Torso is in height-normalized units, so it scales by the frame height.
  const size = Math.max(64, Math.min(W, H, cfg.cropTorso * torso * H));
  const crops: PixelRect[] = [];
  for (const side of ["left", "right"] as const) {
    const a = ARM[side];
    if (!vis(lm, a.wrist, minVisibility)) continue;
    let cx: number;
    let cy: number;
    if (a.hand.every((i) => vis(lm, i, minVisibility))) {
      cx = (a.hand.reduce((s, i) => s + lm[i].x, 0) / a.hand.length) * W;
      cy = (a.hand.reduce((s, i) => s + lm[i].y, 0) / a.hand.length) * H;
    } else {
      // Continue the elbow→wrist line (in pixels) by handOffsetTorso.
      const w = lm[a.wrist];
      const e = lm[a.elbow];
      const dx = (w.x - e.x) * W;
      const dy = (w.y - e.y) * H;
      const len = Math.hypot(dx, dy) || 1;
      const off = cfg.handOffsetTorso * torso * H;
      cx = w.x * W + (dx / len) * off;
      cy = w.y * H + (dy / len) * off;
    }
    cy -= cfg.cropRaise * size;
    crops.push({
      side,
      x: Math.min(W - size, Math.max(0, cx - size / 2)),
      y: Math.min(H - size, Math.max(0, cy - size / 2)),
      size,
    });
  }
  return crops;
}

/** Which hand is raised: wrist above its shoulder by raiseAboveTorso torso lengths. */
export function raisedHand(f: PoseFrame | null, cfg: Cfg): Side | null {
  const scale = gestureScale(f, cfg);
  if (!f || !scale) return null;
  for (const side of ["left", "right"] as const) {
    const a = ARM[side];
    if (f.lm[a.wrist].v <= f.minVisibility || f.lm[a.shoulder].v <= f.minVisibility) continue;
    if ((f.lm[a.shoulder].y - f.lm[a.wrist].y) / scale >= cfg.raiseAboveTorso) return side;
  }
  return null;
}

/** Recognizer output for one image sent to it. */
export interface HandResult {
  source: string;
  detected: boolean;
  /** Top gesture category ("None", "Thumb_Up", "Open_Palm", …) and its score. */
  top: string | null;
  topScore: number;
}

export interface GestureSample {
  /** One entry per image checked; empty when the recognizer didn't run. */
  hands: HandResult[];
  raised: Side | null;
}

export interface GestureState {
  /** 0..1 progress of whichever hold is further along. */
  progress: number;
  handVisible: boolean;
  /** True on the one update where a hold completes. */
  fired: boolean;
  /** Which gesture completed (or is furthest along). */
  kind: "thumb" | "raise" | null;
}

export interface TriggerDebug {
  thumbProgress: number;
  raiseProgress: number;
  /** Time left before a gap in detection resets the thumbs-up hold, or null when no gap. */
  graceLeftMs: number | null;
  softStreak: number;
  cooldownLeftMs: number;
}

/** A condition that must stay true for `holdMs`; gaps under `graceMs` are forgiven. */
class Hold {
  start: number | null = null;
  lastGood = -Infinity;
  private holdMs: number;
  private graceMs: number;

  constructor(holdMs: number, graceMs: number) {
    this.holdMs = holdMs;
    this.graceMs = graceMs;
  }

  /** `since` backdates the start (e.g. to the first of several weak detections). */
  update(active: boolean, t: number, since = t): number {
    if (active) {
      this.start ??= since;
      this.lastGood = t;
    } else if (t - this.lastGood > this.graceMs) {
      this.start = null;
    }
    return this.start === null ? 0 : Math.min(1, (t - this.start) / this.holdMs);
  }

  graceLeft(t: number): number | null {
    if (this.start === null || this.lastGood === t) return null;
    return Math.max(0, this.graceMs - (t - this.lastGood));
  }

  reset() {
    this.start = null;
  }
}

export class StartGestureTrigger {
  private cfg: Cfg;
  private thumb: Hold;
  private raise: Hold;
  private softStreak = 0;
  private softSince = 0;
  private cooldownUntil = -Infinity;
  private last: { thumb: number; raise: number; t: number } = { thumb: 0, raise: 0, t: 0 };

  constructor(cfg: Cfg) {
    this.cfg = cfg;
    this.thumb = new Hold(cfg.holdMs, cfg.graceMs);
    this.raise = new Hold(cfg.raiseHoldMs, cfg.graceMs);
  }

  /** Call with each check's results. */
  update(sample: GestureSample, t: number): GestureState {
    const handVisible = sample.hands.some((h) => h.detected) || sample.raised !== null;
    this.last.t = t;
    if (t < this.cooldownUntil) {
      this.reset();
      return { progress: 0, handVisible, fired: false, kind: null };
    }

    // Strong: Thumb_Up scores at least minScore on any hand.
    const thumbScore = Math.max(0, ...sample.hands.filter((h) => h.top === "Thumb_Up").map((h) => h.topScore));
    const strong = thumbScore >= this.cfg.minScore;
    // Weak: Thumb_Up is the top category above softMinScore for several checks in a row.
    if (thumbScore >= this.cfg.softMinScore) {
      if (this.softStreak === 0) this.softSince = t;
      this.softStreak++;
    } else {
      this.softStreak = 0;
    }
    const weak = this.softStreak >= this.cfg.softConsecutive;
    const thumb = this.thumb.update(strong || weak, t, weak && !strong ? this.softSince : t);
    const raise = this.raise.update(sample.raised !== null, t);
    this.last.thumb = thumb;
    this.last.raise = raise;

    const kind = thumb === 0 && raise === 0 ? null : thumb >= raise ? "thumb" : "raise";
    const progress = Math.max(thumb, raise);
    if (progress >= 1) {
      this.cooldownUntil = t + this.cfg.cooldownMs;
      this.reset();
      return { progress: 1, handVisible, fired: true, kind };
    }
    return { progress, handVisible, fired: false, kind };
  }

  debug(): TriggerDebug {
    const t = this.last.t;
    return {
      thumbProgress: this.last.thumb,
      raiseProgress: this.last.raise,
      graceLeftMs: this.thumb.graceLeft(t),
      softStreak: this.softStreak,
      cooldownLeftMs: Math.max(0, this.cooldownUntil - t),
    };
  }

  /** Drop any hold in progress (e.g. recognition switched off); the cooldown stays. */
  reset() {
    this.thumb.reset();
    this.raise.reset();
    this.softStreak = 0;
    this.last.thumb = 0;
    this.last.raise = 0;
  }
}
