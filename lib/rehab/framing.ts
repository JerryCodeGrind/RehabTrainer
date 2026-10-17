// "Follow and focus" auto-framing: picks a crop of the camera frame that keeps
// the person centered and filling the view. Only the displayed picture is
// cropped; pose detection always runs on the full frame.

import type { RawLandmark } from "./pose";
import type { Settings } from "./settings";

/** Crop in normalized frame coordinates (0..1). w and h are both 1/zoom, so the
 * crop keeps the frame's aspect ratio. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FramingHint {
  /** Auto-framing switched on by the user. */
  enabled: boolean;
  /** The routine needs the whole frame (walk out and back). */
  fullFrame: boolean;
  /** Mid-rep: keep the zoom unless the body would leave the view. */
  lock: boolean;
}

interface Target {
  cx: number;
  cy: number;
  zoom: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const FULL: Target = { cx: 0.5, cy: 0.5, zoom: 1 };

export function cropOf(t: Target): Crop {
  const w = 1 / t.zoom;
  return { x: t.cx - w / 2, y: t.cy - w / 2, w, h: w };
}

/** Maps a normalized frame point into the crop (0..1 = inside the view). */
export function toCrop(p: { x: number; y: number }, c: Crop): { x: number; y: number } {
  return { x: (p.x - c.x) / c.w, y: (p.y - c.y) / c.h };
}

export class AutoFramer {
  private cfg: Settings["framing"];
  private minVisibility: number;
  private current: Target = { ...FULL };
  private target: Target = { ...FULL };
  private history: { t: number; box: Box }[] = [];
  private lastSeen = -Infinity;

  constructor(cfg: Settings["framing"], minVisibility: number) {
    this.cfg = cfg;
    this.minVisibility = minVisibility;
  }

  get crop(): Crop {
    return cropOf(this.current);
  }

  get zoom(): number {
    return this.current.zoom;
  }

  /** `landmarks` are normalized frame coordinates (null when nobody is detected). */
  update(landmarks: RawLandmark[] | null, t: number, hint: FramingHint): Crop {
    const box = landmarks ? this.boxOf(landmarks) : null;
    if (box) {
      this.lastSeen = t;
      this.history.push({ t, box });
    }
    this.history = this.history.filter((h) => t - h.t <= this.cfg.envelopeMs);

    if (!hint.enabled || hint.fullFrame || t - this.lastSeen > this.cfg.lostResetMs) {
      this.target = { ...FULL };
      this.history = box ? [{ t, box }] : [];
    } else if (box) {
      const next = this.fit(this.envelope());
      // Mid-rep, only re-frame if the body is about to leave the current view.
      const leaving = !this.contains(cropOf(this.current), this.pad(box));
      if (leaving || (!hint.lock && this.differs(next, this.target))) this.target = next;
    }

    const e = this.cfg.ease;
    const c = this.current;
    c.zoom += e * (this.target.zoom - c.zoom);
    c.cx += e * (this.target.cx - c.cx);
    c.cy += e * (this.target.cy - c.cy);
    this.clampCenter(c);
    return this.crop;
  }

  private boxOf(lm: RawLandmark[]): Box | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of lm) {
      if (p.visibility <= this.minVisibility) continue;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null;
  }

  /** Union of recent boxes: everywhere the body has been lately, i.e. its range of motion. */
  private envelope(): Box {
    return this.history.reduce(
      (u, { box: b }) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }),
      { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
    );
  }

  private pad(b: Box): Box {
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const p = this.cfg.padding;
    return { x0: b.x0 - p * w, x1: b.x1 + p * w, y0: b.y0 - (p + this.cfg.headPadding) * h, y1: b.y1 + p * h };
  }

  private fit(b: Box): Target {
    const p = this.pad(b);
    const zoom = Math.max(1, Math.min(this.cfg.maxZoom, 1 / (p.x1 - p.x0), 1 / (p.y1 - p.y0)));
    const t = { cx: (p.x0 + p.x1) / 2, cy: (p.y0 + p.y1) / 2, zoom };
    this.clampCenter(t);
    return t;
  }

  /** Keep the crop inside the frame. */
  private clampCenter(t: Target) {
    const half = 1 / t.zoom / 2;
    t.cx = Math.min(1 - half, Math.max(half, t.cx));
    t.cy = Math.min(1 - half, Math.max(half, t.cy));
  }

  private contains(c: Crop, b: Box): boolean {
    const m = 1e-3;
    return b.x0 >= c.x - m && b.y0 >= c.y - m && b.x1 <= c.x + c.w + m && b.y1 <= c.y + c.h + m;
  }

  /** Re-frame only for a meaningful change, so small movements don't make the view drift. */
  private differs(a: Target, b: Target): boolean {
    const size = 1 / b.zoom;
    const d = this.cfg.deadband;
    return Math.abs(a.cx - b.cx) > d * size || Math.abs(a.cy - b.cy) > d * size || Math.abs(a.zoom - b.zoom) / b.zoom > d;
  }
}
