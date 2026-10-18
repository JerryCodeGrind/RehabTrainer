import { clamp, Ema, mean, type PoseFrame } from "../pose";
import { BaseRoutine, pct, type Metric } from "./types";

/** Counting rules shared by the rep-based routines (see SETTINGS). */
export interface RepConfig {
  up: number;
  down: number;
  smoothing: number;
  minRepMs: number;
}

/** One thing that's counted separately: a side ("left arm") or both together. */
export interface ChannelSpec {
  key: string;
  label: string;
}

interface Channel extends ChannelSpec {
  ema: Ema;
  /** Smoothed progress this frame: 0 = rest, 1 = full range. */
  progress: number;
  up: boolean;
  peak: number;
  startT: number;
  peaks: number[];
  repMs: number[];
}

/**
 * Base for routines that count repetitions of one movement. Subclasses turn a
 * frame into progress (0 = rest, 1 = full range) per channel; this class does
 * the smoothing, hysteresis counting, prompts, live bars and summary.
 */
export abstract class RepRoutine extends BaseRoutine {
  protected chans: Channel[];
  protected rc: RepConfig;
  protected target: number;

  /** "Lift your arms out to the side" / "Now lower them slowly". */
  protected abstract readonly cues: { up: string; down: string };

  constructor(messageMs: number, rc: RepConfig, channels: ChannelSpec[], targetPerChannel: number) {
    super(messageMs);
    this.rc = rc;
    this.target = targetPerChannel;
    this.chans = channels.map((c) => ({ ...c, ema: new Ema(rc.smoothing), progress: 0, up: false, peak: 0, startT: 0, peaks: [], repMs: [] }));
  }

  /** Progress for one channel this frame, or null if it can't be measured. */
  protected abstract measure(f: PoseFrame, key: string): number | null;

  /** A form problem to point out. While one is reported, nothing is counted. */
  protected fault(f: PoseFrame, t: number): string | null {
    void f;
    void t;
    return null;
  }

  /** Extra summary lines and raw data, per routine. */
  protected extraMetrics(): Metric[] {
    return [];
  }
  protected extraData(): Record<string, unknown> {
    return {};
  }

  update(frame: PoseFrame | null, t: number) {
    if (!frame) return;
    const problem = this.fault(frame, t);
    if (problem) {
      if (!this.showing(t)) this.say(problem, t);
      return;
    }
    for (const c of this.chans) {
      const raw = this.measure(frame, c.key);
      if (raw === null) continue;
      const p = c.ema.update(raw);
      c.progress = p;
      if (!c.up && p >= this.rc.up) {
        c.up = true;
        c.peak = p;
        c.startT = t;
      } else if (c.up) {
        c.peak = Math.max(c.peak, p);
        if (p <= this.rc.down) {
          c.up = false;
          if (t - c.startT >= this.rc.minRepMs && c.peaks.length < this.target) {
            c.peaks.push(c.peak);
            c.repMs.push(t - c.startT);
            this.emit("rep");
            this.afterRep(c, t);
          }
        }
      }
    }
  }

  private afterRep(c: Channel, t: number) {
    const n = c.peaks.length;
    const rest = this.chans.filter((o) => o !== c && o.peaks.length < this.target);
    if (n >= this.target && rest.length) return this.say(`${c.label} done. Now your ${rest[0].label.toLowerCase()}`, t);
    if (this.chans.length === 2) {
      const [a, b] = this.chans;
      if (a.peaks.length >= 2 && b.peaks.length >= 2) {
        const gap = mean(a.peaks) - mean(b.peaks);
        if (Math.abs(gap) > 0.2) return this.say(`Try going a little further with your ${(gap > 0 ? b : a).label.toLowerCase()}`, t);
      }
    }
    this.say(`${n} of ${this.target}${this.chans.length > 1 ? ` · ${c.label.toLowerCase()}` : ""}`, t);
  }

  protected statusMessage() {
    if (this.chans.some((c) => c.up)) return this.cues.down;
    if (this.chans.length > 1) {
      const lag = this.chans.reduce((a, b) => (b.peaks.length < a.peaks.length ? b : a));
      if (this.chans.some((c) => c.peaks.length > lag.peaks.length)) return `${this.cues.up} · ${lag.label.toLowerCase()}`;
    }
    return this.cues.up;
  }

  inRep() {
    return this.chans.some((c) => c.up);
  }

  isComplete() {
    return this.chans.every((c) => c.peaks.length >= this.target);
  }

  getProgress() {
    const done = this.chans.reduce((n, c) => n + c.peaks.length, 0);
    const target = this.target * this.chans.length;
    return {
      done,
      target,
      label: `${done} / ${target}`,
      detail: this.chans.length > 1 ? this.chans.map((c) => `${c.label} ${c.peaks.length} / ${this.target}`).join(" · ") : undefined,
    };
  }

  getLive() {
    // Bars run from rest to full range; the line marks where a rep starts.
    const scale = Math.max(1, this.rc.up);
    return {
      bars: this.chans.map((c) => ({ label: c.label, value: clamp(c.progress / scale, 0, 1), target: this.rc.up / scale })),
    };
  }

  getSummary() {
    const reps = this.chans.reduce((n, c) => n + c.peaks.length, 0);
    const all = this.chans.flatMap((c) => c.peaks);
    const times = this.chans.flatMap((c) => c.repMs);
    const metrics: Metric[] = [
      ...(this.chans.length > 1 ? [{ label: "Reps", value: this.chans.map((c) => `${c.label} ${c.peaks.length}`).join(" · ") }] : []),
      { label: "Average range", value: all.length ? pct(Math.min(mean(all), 1.5)) : "–" },
      { label: "Average rep time", value: times.length ? `${(mean(times) / 1000).toFixed(1)} s` : "–" },
      ...this.extraMetrics(),
    ];
    return {
      reps,
      target: this.target * this.chans.length,
      metrics,
      data: {
        peaks: Object.fromEntries(this.chans.map((c) => [c.key, c.peaks])),
        repMs: Object.fromEntries(this.chans.map((c) => [c.key, c.repMs])),
        ...this.extraData(),
      },
    };
  }

  getDebug() {
    const d: Record<string, string | number> = {};
    for (const c of this.chans) {
      d[`${c.key} progress`] = c.progress.toFixed(2);
      d[`${c.key} state`] = c.up ? "up" : "down";
      d[`${c.key} reps`] = c.peaks.length;
    }
    return d;
  }
}

export const SIDES: ChannelSpec[] = [
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
];

/** Same as SIDES with a body part, e.g. "Left arm". */
export const sides = (part: string): ChannelSpec[] => SIDES.map((s) => ({ key: s.key, label: `${s.label} ${part}` }));
