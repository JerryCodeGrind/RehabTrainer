// Rule-based fall detection on MediaPipe Pose landmarks (no trained fall model).
// Someone has fallen when they end up down (on the floor, or gone out through
// the bottom of the frame) and stay there: a few seconds after a fast drop, or
// longer if they went down slowly (sliding down a wall, a slow collapse).
// "On the floor" is measured against their standing height, in torso lengths,
// so it works at any distance from the camera.
// Keep this file free of runtime imports so scripts/test-fall-detector.mjs can
// load it with Node's type stripping.

export const FALL_CONFIG = {
  /** A pose counts as a person only if its shoulders are at least this visible (MediaPipe's 0-1 visibility)... */
  minVisibility: 0.5,
  /** ...and once it has been seen this long (ms) without a gap, which filters flickering false detections... */
  minPresentMs: 400,
  /** ...where, until then, missing it for this long (ms) counts as a gap. */
  maxNewGapMs: 100,
  /** Torso position is the median of this many recent frames, smoothing jitter and one-frame glitches. */
  smoothFrames: 5,
  /** A fast drop: the torso center falls this many torso lengths... */
  dropTorsoLengths: 0.9,
  /** ...within this long (ms). */
  dropWindowMs: 1000,
  /** A fast drop this recently (ms) before going down makes it a fast fall. */
  fastWindowMs: 3000,
  /** On the floor: torso center at least this many torso lengths below standing height. */
  lowTorsoLengths: 1.5,
  /** Standing height is the highest torso position seen in this long (ms). */
  standingMemoryMs: 10 * 60_000,
  /** Down this long (ms) after a fast drop counts as a fall... */
  confirmFastMs: 3000,
  /** ...and this long (ms) after going down slowly. */
  confirmSlowMs: 15_000,
  /** A person missing this long (ms) counts as gone, not a tracking blip. */
  lostMs: 300,
  /** Gone through the bottom: last seen with the hips at least this far down the frame (0-1)... */
  bottomEdge: 0.75,
  /** ...and at least this many torso lengths below standing height. */
  exitBelowTorsoLengths: 0.4,
};

export type FallConfig = typeof FALL_CONFIG;

/** watching → down (counting) → fallen (stayed down; latched until a new detector is made). */
export type FallPhase = "watching" | "down" | "fallen";
export type FallReason = "on-floor" | "out-of-frame";

export interface FallStatus {
  phase: FallPhase;
  /** How the person is down; null while watching. */
  reason: FallReason | null;
  /** Whether a person (a steady, visible pose) is in view. */
  personInView: boolean;
}

/** A MediaPipe NormalizedLandmark (x, y in 0-1 of the frame, y pointing down). */
export interface PoseLandmark {
  x: number;
  y: number;
  /** Likelihood (0-1) that the landmark is visible; treated as 1 when absent. */
  visibility?: number;
}

// MediaPipe Pose landmark indices.
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

interface Sample {
  t: number;
  /** Torso center height (midpoint of shoulders and hips), normalized to the frame. */
  y: number;
  /** Hip midpoint height; can exceed 1 when MediaPipe extrapolates below the frame. */
  hipY: number;
  /** Shoulder-to-hip length, in frame heights. */
  torso: number;
}

interface Down {
  reason: FallReason;
  fast: boolean;
}

function toSample(
  t: number,
  landmarks: readonly PoseLandmark[],
  aspect: number,
  minVisibility: number,
): Sample | null {
  const ls = landmarks[LEFT_SHOULDER];
  const rs = landmarks[RIGHT_SHOULDER];
  const lh = landmarks[LEFT_HIP];
  const rh = landmarks[RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return null;
  // Only the shoulders: the hips are often legitimately out of frame.
  if (((ls.visibility ?? 1) + (rs.visibility ?? 1)) / 2 < minVisibility) return null;
  const sy = (ls.y + rs.y) / 2;
  const hy = (lh.y + rh.y) / 2;
  // Hip-to-shoulder vector in frame heights.
  const dx = ((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2) * aspect;
  return { t, y: (sy + hy) / 2, hipY: hy, torso: Math.hypot(dx, sy - hy) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Feed it one pose per video frame; it reports when someone falls and stays down. */
export class FallDetector {
  private readonly aspect: number;
  private readonly config: FallConfig;
  /** The person's poses within the drop window, for spotting fast drops. */
  private history: Sample[] = [];
  /** Poses that could still be the standing height (a sliding-window minimum of y). */
  private standing: Sample[] = [];
  /** Raw poses since this one appeared, for debouncing and smoothing. */
  private recent: Sample[] = [];
  private rawLastAt: number | null = null;
  private presentSince = 0;
  /** When a person was last confirmed in view. */
  private lastSeenAt: number | null = null;
  private lastFastDropAt: number | null = null;
  /** How the person would be down if they vanished now. */
  private ifLost: Down | null = null;
  private phase: FallPhase = "watching";
  private reason: FallReason | null = null;
  private downSince: number | null = null;
  private downFast = false;

  /** `aspect` is the video's width / height, needed to measure the torso. */
  constructor(aspect = 16 / 9, config: Partial<FallConfig> = {}) {
    this.aspect = aspect;
    this.config = { ...FALL_CONFIG, ...config };
  }

  /** `t` in ms (e.g. performance.now()); `landmarks` is the first pose, or null if none. */
  update(t: number, landmarks: readonly PoseLandmark[] | null | undefined): FallStatus {
    const c = this.config;
    const raw = landmarks ? toSample(t, landmarks, this.aspect, c.minVisibility) : null;
    const sample = raw ? this.confirm(raw) : null;
    const status = () => ({ phase: this.phase, reason: this.reason, personInView: sample !== null });
    if (this.phase === "fallen") return status();

    let down: Down | null;
    if (sample) down = this.observe(sample);
    else if (this.lastSeenAt !== null && t - this.lastSeenAt >= c.lostMs) down = this.ifLost;
    else return status(); // Brief tracking blip: no new information.

    if (!down) {
      this.phase = "watching";
      this.reason = null;
      this.downSince = null;
      return status();
    }
    if (this.downSince === null) {
      this.downSince = t;
      this.downFast = down.fast;
    }
    this.reason = down.reason;
    const confirmMs = this.downFast ? c.confirmFastMs : c.confirmSlowMs;
    this.phase = t - this.downSince >= confirmMs ? "fallen" : "down";
    return status();
  }

  /** The smoothed pose once it has been present long enough to be a person; null until then. */
  private confirm(raw: Sample): Sample | null {
    const c = this.config;
    // Tolerate short tracking blips for a person, but not for a pose that hasn't proven itself yet.
    const confirmed = this.rawLastAt !== null && this.rawLastAt - this.presentSince >= c.minPresentMs;
    const maxGap = confirmed ? c.lostMs : c.maxNewGapMs;
    if (this.rawLastAt === null || raw.t - this.rawLastAt >= maxGap) {
      this.presentSince = raw.t;
      this.recent = [];
      // Someone (or something) newly in view: learn their standing height afresh,
      // so a pose that shows up low (a person sitting, or a false detection) isn't
      // compared with whoever stood here before. Not mid-fall: they may be
      // reappearing on the floor.
      if (this.downSince === null) {
        this.history = [];
        this.standing = [];
        this.lastFastDropAt = null;
      }
    }
    this.rawLastAt = raw.t;
    this.recent.push(raw);
    if (this.recent.length > c.smoothFrames) this.recent.shift();
    if (raw.t - this.presentSince < c.minPresentMs) return null;
    return {
      t: raw.t,
      y: median(this.recent.map((s) => s.y)),
      hipY: median(this.recent.map((s) => s.hipY)),
      torso: median(this.recent.map((s) => s.torso)),
    };
  }

  /** Record a person's pose and say whether they are down. */
  private observe(sample: Sample): Down | null {
    const c = this.config;
    const t = sample.t;
    this.lastSeenAt = t;
    this.history.push(sample);
    while (t - this.history[0].t > c.dropWindowMs) this.history.shift();

    while (this.standing.length > 0 && this.standing.at(-1)!.y >= sample.y) this.standing.pop();
    this.standing.push(sample);
    while (t - this.standing[0].t > c.standingMemoryMs) this.standing.shift();

    if (this.drop(sample) >= c.dropTorsoLengths) this.lastFastDropAt = t;
    const fast = this.lastFastDropAt !== null && t - this.lastFastDropAt <= c.fastWindowMs;

    const standing = this.standing[0];
    const below = (sample.y - standing.y) / standing.torso;
    if (below >= c.lowTorsoLengths) {
      this.ifLost = { reason: "on-floor", fast };
      return this.ifLost;
    }
    // Low in the view and below standing height: vanishing now means they went
    // down below what the camera can see.
    this.ifLost =
      sample.hipY >= c.bottomEdge && below >= c.exitBelowTorsoLengths
        ? { reason: "out-of-frame", fast: fast || this.drop(sample) >= c.exitBelowTorsoLengths }
        : null;
    return null;
  }

  /** How far `cur` is below the highest point of the drop window, in torso lengths. */
  private drop(cur: Sample): number {
    // The largest torso in the window: it foreshortens as the person tips over.
    const torso = Math.max(...this.history.map((s) => s.torso));
    const top = Math.min(...this.history.map((s) => s.y));
    return torso > 0 ? (cur.y - top) / torso : 0;
  }
}
