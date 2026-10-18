// "Health" muscle map: scores each muscle group 0..1 from recent sessions.
// Each finished routine gives a score to the muscles it works; a muscle's
// score is the recency-weighted mean of those over the last WINDOW_DAYS. A
// side clearly behind the other is flagged and never shown as strong, since a
// left/right gap is what a therapist would want to catch.
// Keep this file free of runtime imports except settings (the rehab test loads it).

import { SETTINGS } from "./settings";
import type { RoutineId } from "./routines/types";
import type { SessionRecord } from "./storage";

export type Side = "left" | "right";
/** Groups measured separately for each side. */
export type SidedGroup = "hipFlexors" | "quads" | "glutes" | "abductors" | "hamstrings" | "calves";
/** Groups no routine measures yet; shown as outlines only. */
export type UntrackedGroup = "shoulders" | "chest" | "arms" | "upperBack";
export type Group = SidedGroup | "core" | UntrackedGroup;
export type MuscleId = `${SidedGroup}-${Side}` | "core" | UntrackedGroup;
export type Level = "good" | "fair" | "weak" | "none";

export interface GroupInfo {
  name: string;
  /** What it does, in plain words. */
  role: string;
  /** How to work it, for the "How to improve" panel. */
  tip: string;
  /** Routines that work it, best first. */
  routines: RoutineId[];
}

export const GROUPS: Record<Group, GroupInfo> = {
  hipFlexors: {
    name: "hip flexors",
    role: "Lift your knee: walking, stairs, getting into a car.",
    tip: "Marching in place: lift each knee slowly toward hip height and lower it with control. Aim for the same height on both sides.",
    routines: ["marching"],
  },
  quads: {
    name: "quads",
    role: "Front of the thigh. Straighten the knee to stand up and climb stairs.",
    tip: "Sit-to-stand: stand up tall, then sit down slowly, taking 2 seconds or more. The quad stretch keeps them flexible.",
    routines: ["sitToStand", "stretches"],
  },
  glutes: {
    name: "glutes",
    role: "Power standing up from a chair and keep your hips level.",
    tip: "Sit-to-stand: push through your heels and squeeze your glutes as you stand all the way up.",
    routines: ["sitToStand"],
  },
  abductors: {
    name: "outer hip",
    role: "Keep you steady on one leg and stop the hip dropping when you walk.",
    tip: "Side leg raises: lift sideways without leaning your body. Single-leg stance works them too; hold a counter for safety.",
    routines: ["stretches", "singleLeg"],
  },
  hamstrings: {
    name: "hamstrings",
    role: "Back of the thigh. Bend the knee and control your stride.",
    tip: "Hamstring stretch: keep the front knee straight, hinge at the hips with a flat back, and hold steady.",
    routines: ["stretches"],
  },
  calves: {
    name: "calves and ankles",
    role: "Push off when you walk and make small corrections for balance.",
    tip: "Single-leg stance trains the ankle to keep you steady; walking builds endurance. Stand near a counter for safety.",
    routines: ["singleLeg", "walk"],
  },
  core: {
    name: "Core and balance",
    role: "Keep your trunk steady and upright, so you sway less.",
    tip: "Single-leg stance: stand tall and keep your hips level. Walking with good posture helps too.",
    routines: ["singleLeg", "walk"],
  },
  shoulders: { name: "Shoulders", role: "Reach and lift.", tip: "", routines: [] },
  chest: { name: "Chest", role: "Push and carry.", tip: "", routines: [] },
  arms: { name: "Arms", role: "Grip, lift and push up from a chair.", tip: "", routines: [] },
  upperBack: { name: "Upper back", role: "Posture and pulling.", tip: "", routines: [] },
};

const SIDED: SidedGroup[] = ["hipFlexors", "quads", "glutes", "abductors", "hamstrings", "calves"];
const UNTRACKED: UntrackedGroup[] = ["shoulders", "chest", "arms", "upperBack"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export interface Muscle {
  id: MuscleId;
  group: Group;
  side: Side | null;
  name: string;
}

export const MUSCLES: Muscle[] = [
  { id: "core", group: "core", side: null, name: GROUPS.core.name },
  ...SIDED.flatMap((group) =>
    (["left", "right"] as const).map((side): Muscle => ({ id: `${group}-${side}`, group, side, name: `${cap(side)} ${GROUPS[group].name}` })),
  ),
  ...UNTRACKED.map((group): Muscle => ({ id: group, group, side: null, name: GROUPS[group].name })),
];

/** The muscle a drawn shape belongs to: sided groups per side, the rest shared. */
export const muscleId = (group: Group, side: Side): MuscleId =>
  (SIDED as Group[]).includes(group) ? (`${group}-${side}` as MuscleId) : (group as MuscleId);

export interface MuscleHealth extends Muscle {
  /** 0..1, or null with no sessions for this muscle in the window. */
  score: number | null;
  level: Level;
  /** This week compared with the weeks before, when both have sessions. */
  trend: "up" | "down" | null;
  /** False for groups no routine measures yet. */
  tracked: boolean;
  /** Plain-language findings, most important first. */
  notes: string[];
}

export const HEALTH = {
  windowDays: 30,
  /** "This week" for the trend. */
  recentDays: 7,
  /** A session this many days old counts half as much as one from today. */
  halfLifeDays: 7,
  good: 0.75,
  fair: 0.5,
  /** A side this far below the other is flagged as the weaker side. */
  imbalance: 0.15,
  /** Change in score between this week and before that counts as a trend. */
  trend: 0.1,
  /** Marching knee height (0 resting, 1 level with the hip) that scores full marks. */
  fullKneeLift: 0.7,
  /** Side-raise angle that scores full marks. */
  fullSideRaiseDeg: 40,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => num(x) !== null) : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const ratio = (done: number, target: number) => (target > 0 ? clamp01(done / target) : 0);

/** Mean of the parts that were measured; null if none were. */
function blend(...parts: [number | null, number][]): number | null {
  let sum = 0;
  let weight = 0;
  for (const [score, w] of parts) {
    if (score === null) continue;
    sum += score * w;
    weight += w;
  }
  return weight ? sum / weight : null;
}

interface Signal {
  muscle: MuscleId;
  score: number;
  /** What was measured, e.g. "balance holds". */
  what: string;
  /** Measured for this side on its own (not shared by both sides, like sit-to-stands). */
  sided: boolean;
}

/** What one finished routine says about each muscle it works. */
export function sessionSignals(s: SessionRecord): Signal[] {
  const d = rec(s.data);
  const out: Signal[] = [];
  const add = (muscle: MuscleId, score: number | null, what: string, sided = false) => {
    if (score !== null) out.push({ muscle, score: clamp01(score), what, sided });
  };
  const both = (group: SidedGroup, score: number | null, what: string) => {
    add(`${group}-left`, score, what);
    add(`${group}-right`, score, what);
  };
  const completion = ratio(s.reps, s.target);

  switch (s.routineId) {
    case "sitToStand": {
      // Sitting down slowly is the controlled part; minDescentSec or slower is full marks.
      const descent = num(d.avgDescentSec);
      const control = descent === null ? null : clamp01(descent / SETTINGS.sitToStand.minDescentSec);
      const score = blend([completion, 0.6], [control, 0.4]);
      both("quads", score, "sit-to-stands");
      both("glutes", score, "sit-to-stands");
      break;
    }
    case "marching": {
      const target = SETTINGS.marching.targetLiftsPerSide;
      for (const [side, peaks] of [
        ["left", nums(d.peaksLeft)],
        ["right", nums(d.peaksRight)],
      ] as const) {
        const height = mean(peaks);
        add(
          `hipFlexors-${side}`,
          blend([ratio(peaks.length, target), 0.3], [height === null ? null : height / HEALTH.fullKneeLift, 0.7]),
          "knee lifts",
          true,
        );
      }
      break;
    }
    case "walk":
      both("calves", completion, "walking");
      add("core", completion, "walking");
      break;
    case "singleLeg": {
      const cfg = SETTINGS.singleLeg;
      const { swaySome, swayHigh } = cfg;
      const sides = { left: rec(d.left), right: rec(d.right) };
      const steadiness: number[] = [];
      // Stats are keyed by the lifted foot, so the leg doing the balancing is the other one.
      for (const [lifted, standing] of [
        ["left", "right"],
        ["right", "left"],
      ] as const) {
        const side = sides[lifted];
        const longest = num(side.longestMs);
        const sway = mean(nums(side.sway));
        const steady = sway === null ? null : 1 - clamp01((sway - swaySome) / (swayHigh - swaySome));
        if (steady !== null) steadiness.push(steady);
        const score = blend(
          [ratio(num(side.holds) ?? 0, cfg.holdsPerSide), 0.3],
          [longest === null ? null : longest / (cfg.holdSec * 1000), 0.4],
          [steady, 0.3],
        );
        add(`calves-${standing}`, score, "balance holds", true);
        add(`abductors-${standing}`, score, "balance holds", true);
      }
      add("core", mean(steadiness), "balance holds");
      break;
    }
    case "stretches": {
      const cfg = SETTINGS.stretches;
      const holds = rec(d.holds);
      const quad = rec(holds.quad);
      const hamstring = rec(holds.hamstring);
      const peaks = rec(d.raisePeaksDeg);
      for (const side of ["left", "right"] as const) {
        const quadHolds = num(quad[side]);
        if (quadHolds !== null) add(`quads-${side}`, ratio(quadHolds, cfg.quad.holdsPerSide), "stretches", true);
        const hamHolds = num(hamstring[side]);
        if (hamHolds !== null && d.hipPrecautions !== true) {
          add(`hamstrings-${side}`, ratio(hamHolds, cfg.hamstring.holdsPerSide), "stretches", true);
        }
        if (Array.isArray(peaks[side])) {
          const raises = nums(peaks[side]);
          const best = raises.length ? Math.max(...raises) / HEALTH.fullSideRaiseDeg : 0;
          add(`abductors-${side}`, blend([ratio(raises.length, cfg.sideRaise.repsPerSide), 0.5], [best, 0.5]), "side leg raises", true);
        }
      }
      break;
    }
  }
  return out;
}

function levelOf(score: number | null): Level {
  if (score === null) return "none";
  return score >= HEALTH.good ? "good" : score >= HEALTH.fair ? "fair" : "weak";
}

interface Found {
  score: number;
  /** Days since the session. */
  age: number;
  what: string;
  sided: boolean;
}

/** Recency-weighted mean score; null for an empty list. */
function weighted(list: Found[]): number | null {
  if (!list.length) return null;
  const weights = list.map((x) => 0.5 ** (x.age / HEALTH.halfLifeDays));
  return list.reduce((sum, x, i) => sum + x.score * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
}

/** Every muscle's health from the session history, as of `now`. */
export function bodyHealth(sessions: SessionRecord[], now = new Date()): MuscleHealth[] {
  const found = new Map<MuscleId, Found[]>();
  for (const s of sessions) {
    const age = (now.getTime() - new Date(s.finishedAt).getTime()) / DAY_MS;
    if (!(age >= 0 && age <= HEALTH.windowDays)) continue;
    for (const sig of sessionSignals(s)) {
      const list = found.get(sig.muscle) ?? [];
      list.push({ ...sig, age });
      found.set(sig.muscle, list);
    }
  }

  const muscles = MUSCLES.map((m): MuscleHealth => {
    const tracked = GROUPS[m.group].routines.length > 0;
    const list = found.get(m.id) ?? [];
    const score = weighted(list);
    let trend: MuscleHealth["trend"] = null;
    if (list.length) {
      const recent = mean(list.filter((x) => x.age < HEALTH.recentDays).map((x) => x.score));
      const before = mean(list.filter((x) => x.age >= HEALTH.recentDays).map((x) => x.score));
      if (recent !== null && before !== null && Math.abs(recent - before) >= HEALTH.trend) trend = recent > before ? "up" : "down";
    }
    const notes: string[] = [];
    if (trend === "down") notes.push("Weaker this week than the weeks before.");
    if (trend === "up") notes.push("Getting stronger this week.");
    if (list.length) {
      const whats = [...new Set(list.map((x) => x.what))];
      notes.push(`Based on ${whats.join(" and ")} (${list.length} in the last ${HEALTH.windowDays} days).`);
    } else if (tracked) {
      notes.push(`No exercises for this muscle in the last ${HEALTH.windowDays} days.`);
    } else {
      notes.push("None of your exercises work this area yet.");
    }
    return { ...m, score, level: levelOf(score), trend, tracked, notes };
  });

  // Flag the weaker side of each pair, and never show it as strong. Only
  // per-side measurements count: shared ones (sit-to-stands, walking) add the
  // same to both sides and would hide the gap.
  const byId = new Map(muscles.map((m) => [m.id, m]));
  const sidedScore = (id: MuscleId) => weighted((found.get(id) ?? []).filter((x) => x.sided));
  for (const group of SIDED) {
    const sl = sidedScore(`${group}-left`);
    const sr = sidedScore(`${group}-right`);
    if (sl === null || sr === null || Math.abs(sl - sr) < HEALTH.imbalance) continue;
    const [weak, other] = sl < sr ? (["left", "right"] as const) : (["right", "left"] as const);
    const m = byId.get(`${group}-${weak}`)!;
    m.notes.unshift(`Weaker than your ${other} side.`);
    if (m.level === "good") m.level = "fair";
  }
  return muscles;
}

/** The best-scoring strong muscle, for the "strongest" highlight; null if none is strong. */
export function strongestMuscle(muscles: MuscleHealth[]): MuscleHealth | null {
  return muscles.reduce<MuscleHealth | null>(
    (best, m) => (m.score !== null && m.level === "good" && (best?.score ?? -1) < m.score ? m : best),
    null,
  );
}

/** Muscles that need work, weakest first. */
export function needsWork(muscles: MuscleHealth[]): MuscleHealth[] {
  return muscles.filter((m) => m.level === "fair" || m.level === "weak").sort((a, b) => a.score! - b.score!);
}
